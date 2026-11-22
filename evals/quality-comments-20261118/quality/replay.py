"""Verify frozen inputs, then call rebuilt advisory launchers with fresh tasks."""

import asyncio
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time

from probe_wellness import verify

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
MANIFEST = json.loads((HERE / "expectations.json").read_text())
REFERENCE = ROOT / "evals/advisory-replay-20261118.json"
BUN = os.environ.get("BUN_BIN") or shutil.which("bun") or str(Path.home() / ".bun/bin/bun")
CFG = MANIFEST["configuration"]


def git(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args], text=True).strip()


def verify_hashes():
    prior = json.loads(REFERENCE.read_text())
    hashes = {
        **prior["runtimeHashes"],
        "evals/fixtures/advisory-replay-20261118.sh": prior["fixtureScriptSha256"],
        **{f"prompts/{role}.md": sha for role, sha in MANIFEST["promptHashes"].items()},
    }
    for path, expected in hashes.items():
        if hashlib.sha256((ROOT / path).read_bytes()).hexdigest() != expected:
            raise RuntimeError(f"Frozen runtime or fixture changed: {path}")


def checkout(source, path, head):
    git(source, "worktree", "add", "--quiet", "--detach", str(path), head)
    if git(path, "rev-parse", "HEAD") != head or git(path, "status", "--porcelain"):
        raise RuntimeError("Review workspace is not the clean fixed head")


def review(case, role, source, private):
    checkout_dir = Path(tempfile.mkdtemp(dir=private / "input"))
    result_dir = private / "results" / f"{case['id']}-{role}"
    result_dir.mkdir()
    report = result_dir / "report.json"
    task = Path(tempfile.mkdtemp(dir=private / "tasks")) / "state"
    checkout(source, checkout_dir, case["head"])
    cmd = [
        str(ROOT / "bin" / f"review-{role}"),
        "--repo", str(checkout_dir), "--base", case["base"], "--head", case["head"],
        "--model", CFG["model"], "--effort", CFG["effort"], "--max-turns", str(CFG["maxTurns"]),
        "--compact-threshold", str(CFG["compactThreshold"]), "--tool-sets", CFG["toolSets"],
        "--task", str(task), "--out", str(report),
    ]
    if os.environ.get("REVIEW_CONFIG"):
        cmd += ["--config", str(Path(os.environ["REVIEW_CONFIG"]).resolve())]
    start = time.monotonic()
    try:
        with (result_dir / "progress.log").open("w") as log:
            proc = subprocess.run(cmd, cwd=checkout_dir, env={**os.environ, "BUN_BIN": BUN},
                                  stdout=subprocess.DEVNULL, stderr=log)
        elapsed_ms = round((time.monotonic() - start) * 1000)
        after_clean = git(checkout_dir, "rev-parse", "HEAD") == case["head"] and not git(
            checkout_dir, "status", "--porcelain"
        )
        record = {"exitCode": proc.returncode, "durationMs": elapsed_ms, "cleanHeadAfter": after_clean}
        (result_dir / "process.json").write_text(json.dumps(record, indent=2) + "\n")
        print(f"{case['id']} / {role}: exit {proc.returncode}, {elapsed_ms} ms", flush=True)
        return proc.returncode in (0, 1) and after_clean and report.is_file()
    finally:
        git(source, "worktree", "remove", str(checkout_dir))


def verify_targets(private, sources):
    wellness = next(case for case in MANIFEST["cases"] if case["id"] == "wellness")
    repaired = next(case for case in MANIFEST["cases"] if case["id"] == "wellness-repaired")
    asyncio.run(verify(str(sources[wellness["repo"]]), wellness["base"], wellness["head"], repaired["head"]))
    catalogs = [case for case in MANIFEST["cases"] if case["id"].startswith("catalog")]
    catalog_refs = [value for case in catalogs for value in (str(sources[case["repo"]]), case["head"])]
    with (private / "catalog-probe.jsonl").open("w") as out:
        subprocess.run([BUN, str(HERE / "probe_catalog.ts"), *catalog_refs], stdout=out, check=True)
    for sample, code in (("report-positive", 1), ("report-negative", 0)):
        repo = sources[sample]
        run = subprocess.run([BUN, "test"], cwd=repo, capture_output=True, text=True)
        (private / f"{sample}-probe.log").write_text(run.stdout + run.stderr)
        if run.returncode != code or (code == 1 and "directory quota exhausted" not in run.stderr):
            raise RuntimeError(f"Frozen directory fixture failed its expected behavior check: {sample}")


def main(private):
    os.umask(0o077)
    verify_hashes()
    private.mkdir(mode=0o700)
    for folder in ("input", "results", "tasks"):
        (private / folder).mkdir()
    subprocess.run([BUN, "run", "build"], cwd=ROOT, check=True)
    fixtures = private / "fixtures"
    subprocess.run(["bash", str(ROOT / "evals/fixtures/advisory-replay-20261118.sh"), str(fixtures)], check=True)
    sources = {
        "Imageomics_catalog": ROOT / ".local/eval-repos/Imageomics_catalog",
        "Tzeusy_butlers": ROOT / ".local/eval-repos/Tzeusy_butlers",
        "catalog-performance": ROOT / ".local/eval-controls/catalog-performance",
        "catalog-quality": ROOT / ".local/eval-controls/catalog-quality",
        "report-positive": fixtures / "report-positive",
        "report-negative": fixtures / "report-negative",
    }
    for case in MANIFEST["cases"]:
        source = sources[case["repo"]]
        for sha in (case["base"], case["head"]):
            git(source, "cat-file", "-e", sha + "^{commit}")
    verify_targets(private, sources)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        results = [pool.submit(review, case, role, sources[case["repo"]], private)
                   for case in MANIFEST["cases"] for role in case["roles"]]
        if not all([result.result() for result in results]):
            return 2
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(f"Usage: {sys.argv[0]} NEW_PRIVATE_OUTPUT_DIRECTORY")
    raise SystemExit(main(Path(sys.argv[1]).resolve()))
