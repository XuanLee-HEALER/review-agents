"""Verify fixed Quality cases and preserve every real CLI attempt."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import contextlib
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
PRIOR = ROOT / "evals/quality-comments-20261118"
sys.path.insert(0, str(PRIOR / "quality"))
from replay import BUN, CFG, checkout, git, verify_targets

CASES = json.loads((PRIOR / "quality/expectations.json").read_text())["cases"]
EXPECTED_SYNTHETIC = {
    "guide-before": ("74f88b377667c30f908eb3f7ae8171a453d3325c", "38d72cf761b235e41dc1a285e8eae666619c55a0"),
    "guide-revised": ("74f88b377667c30f908eb3f7ae8171a453d3325c", "18743033c06a7f036124c45d54c0edd8b3a99fcb"),
    "wording": ("74f88b377667c30f908eb3f7ae8171a453d3325c", "1e2c1a645f36f29088330f680960de7f186b5ecf"),
    "archive-first": ("8fe0dba1b84fbe8d3184073f34d864b7e5618aa1", "674bd524c1f2db7fc0e1ec1961405e64e5bfd549"),
    "archive-second": ("8fe0dba1b84fbe8d3184073f34d864b7e5618aa1", "d246516de1235f89cc18c4b189056acb64c8c0ca"),
}
EXPECTATIONS_SHA = "b00b0a5bee0d2e7738ca29222d6a0afc3ccc35649faeb14077062d128714663e"
ARCHIVE_FIXTURE_SHA = "3e2f70fd449e940a0ce8d91b4230958c3ddd750e696940af60a4112a01f5e8f7"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


@contextlib.contextmanager
def fixed_workspace(case, source, private):
    path = Path(tempfile.mkdtemp(dir=private / "input"))
    checkout(source, path, case["head"])
    try:
        yield path
    finally:
        git(source, "worktree", "remove", str(path))


def prepare(private):
    if digest(HERE / "expectations.md") != EXPECTATIONS_SHA:
        raise RuntimeError("Frozen Quality expectations changed")
    if digest(HERE / "prepare-archive.sh") != ARCHIVE_FIXTURE_SHA:
        raise RuntimeError("Frozen audit archive fixture changed")
    (private / "input").mkdir()
    (private / "results").mkdir()
    directory = private / "advisory"
    notifications = private / "notifications"
    archive = private / "archive"
    for script, target in (
        (ROOT / "evals/fixtures/advisory-replay-20261118.sh", directory),
        (PRIOR / "comments/prepare-fixtures.sh", notifications),
        (HERE / "prepare-archive.sh", archive),
    ):
        subprocess.run(["bash", str(script), str(target)], check=True)
    sources = {
        "Imageomics_catalog": ROOT / ".local/eval-repos/Imageomics_catalog",
        "Tzeusy_butlers": ROOT / ".local/eval-repos/Tzeusy_butlers",
        "catalog-performance": ROOT / ".local/eval-controls/catalog-performance",
        "catalog-quality": ROOT / ".local/eval-controls/catalog-quality",
        "report-positive": directory / "report-positive",
        "report-negative": directory / "report-negative",
    }
    cases = list(CASES)
    for target in (notifications, archive):
        for row in (target / "cases.tsv").read_text().splitlines():
            key, source, base, head = row.split("\t")
            if (base, head) != EXPECTED_SYNTHETIC[key]:
                raise RuntimeError(f"Synthetic fixture SHA changed: {key}")
            sources[key] = Path(source)
            cases.append({"id": key, "repo": key, "base": base, "head": head})
    for case in cases:
        for ref in (case["base"], case["head"]):
            git(sources[case["repo"]], "cat-file", "-e", ref + "^{commit}")
    return cases, sources, notifications


def verify(private, cases, sources, notifications):
    archive = {case["id"]: case for case in cases if case["id"].startswith("archive-")}
    first = archive["archive-first"]
    base = {**first, "id": "archive-base", "head": first["base"]}
    for case, loss in ((base, 0), (first, 50), (archive["archive-second"], 0)):
        with fixed_workspace(case, sources[case["repo"]], private) as workspace:
            with (private / f"{case['id']}-tests.log").open("w") as out:
                subprocess.run([BUN, "test"], cwd=workspace, stdout=out, stderr=out, check=True)
            with (private / f"{case['id']}-probe.json").open("w") as out:
                subprocess.run([BUN, str(HERE / "verify-archive.mjs"), str(workspace), str(loss)],
                               stdout=out, check=True)
    with (private / "notifications-probe.jsonl").open("w") as out:
        subprocess.run([BUN, str(PRIOR / "comments/verify-examples.mjs"), str(notifications / "cases.tsv")],
                       stdout=out, check=True)
    with (private / "butlers-probe.log").open("w") as out, contextlib.redirect_stdout(out):
        verify_targets(private, sources)
    with (private / "catalog-browser-probe.jsonl").open("w") as out:
        subprocess.run([BUN, str(HERE / "probe-catalog-details.js")], cwd=ROOT, stdout=out, check=True)


def freeze_runtime(private):
    sources = [*sorted((ROOT / "src").glob("*.ts")), ROOT / "package.json", ROOT / "bun.lock"]
    source_hashes = {str(path.relative_to(ROOT)): digest(path) for path in sources}
    subprocess.run([BUN, "run", "build"], cwd=ROOT, check=True)
    if source_hashes != {str(path.relative_to(ROOT)): digest(path) for path in sources}:
        raise RuntimeError("CLI source changed during build")
    runtime = private / "runtime"
    for name in ("bin/review-quality", "dist/quality.js", "prompts/quality.md", "package.json"):
        (runtime / name).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / name, runtime / name)
    (runtime / "node_modules").symlink_to(ROOT / "node_modules", target_is_directory=True)
    launch_files = ("bin/review-quality", "dist/quality.js", "prompts/quality.md", "package.json")
    launch_hashes = {name: digest(runtime / name) for name in launch_files}
    if launch_hashes != {name: digest(ROOT / name) for name in launch_files}:
        raise RuntimeError("Built launcher or prompt changed during snapshot")
    write_json(private / "runtime-hashes.json", {**source_hashes, **launch_hashes})
    return runtime, source_hashes, launch_hashes


def review(case, source, private, runtime, prompt):
    key = case["id"]
    dest = private / "results" / key
    dest.mkdir()
    report = dest / "report.json"
    state_path = dest / "task"
    with fixed_workspace(case, source, private) as workspace:
        tool_sets = CFG["toolSets"] if key not in EXPECTED_SYNTHETIC else "snapshot,workspace"
        cmd = [str(runtime / "bin/review-quality"), "--repo", str(workspace), "--base", case["base"],
               "--head", case["head"], "--model", CFG["model"], "--effort", CFG["effort"],
               "--max-turns", str(CFG["maxTurns"]), "--compact-threshold", str(CFG["compactThreshold"]),
               "--tool-sets", tool_sets, "--task", str(state_path), "--out", str(report)]
        if os.environ.get("REVIEW_CONFIG"):
            cmd += ["--config", str(Path(os.environ["REVIEW_CONFIG"]).resolve())]
        start = time.monotonic()
        with (dest / "progress.log").open("w") as log:
            run = subprocess.run(cmd, cwd=workspace, stderr=log, stdout=subprocess.DEVNULL,
                                 env={**os.environ, "BUN_BIN": BUN})
        elapsed_ms = round((time.monotonic() - start) * 1000)
        clean = git(workspace, "rev-parse", "HEAD") == case["head"] and not git(workspace, "status", "--porcelain")
        model_report = json.loads(report.read_text()) if report.exists() else {}
        state_file = state_path / "state.json"
        state = json.loads(state_file.read_text()) if state_file.exists() else {}
        configuration_matched = all(state.get(field) == value for field, value in {
            "role": "quality", "base": case["base"], "head": case["head"], "model": CFG["model"],
            "effort": CFG["effort"], "sets": tool_sets.split(","), "maxTurns": CFG["maxTurns"],
            "threshold": CFG["compactThreshold"],
        }.items()) and state.get("instructions", "").startswith(prompt + "\n")
        evidence_ok = (clean and configuration_matched and model_report.get("actualModels") == [CFG["model"]]
                       and model_report.get("coverage", {}).get("unreadDiff") == []
                       and {"findings": 1, "pass": 0}.get(model_report.get("status")) == run.returncode)
        outcome = {
            "case": key, "base": case["base"], "head": case["head"], "exitCode": run.returncode,
            "durationMs": elapsed_ms, "cleanHeadAfter": clean, "configurationMatched": configuration_matched,
            "reportSha256": digest(report) if report.exists() else None, "completedEvidence": evidence_ok,
        }
        for field in ("requestedModel", "effort", "actualModels", "maxTurns", "toolSets", "status", "errorCode",
                      "summary", "findings", "checked", "limitations", "turns", "compactions", "totalTokens", "coverage"):
            if field in model_report:
                outcome[field] = model_report[field]
        # Keep full output under the private run directory. Strip local filesystem paths from the portable copy.
        local_paths = [str(workspace), str(private), str(ROOT), str(Path.home())]
        serialized = json.dumps(outcome, ensure_ascii=False)
        for local in local_paths:
            serialized = serialized.replace(local, "[local]")
        outcome = json.loads(serialized)
        write_json(dest / "evidence.json", outcome)
        print(f"{key}: exit {run.returncode}, {elapsed_ms} ms, complete evidence={evidence_ok}", flush=True)
        return outcome


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--cases", nargs="+")
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    private = args.output.resolve()
    os.umask(0o077)
    private.mkdir(mode=0o700)
    cases, sources, notifications = prepare(private)
    verify(private, cases, sources, notifications)
    if args.verify_only:
        return 0
    if args.cases:
        unknown = set(args.cases) - {case["id"] for case in cases}
        if unknown:
            parser.error(f"Unknown case(s): {', '.join(sorted(unknown))}")
        cases = [case for case in cases if case["id"] in args.cases]
    runtime, source_hashes, launch_hashes = freeze_runtime(private)
    prompt = (runtime / "prompts/quality.md").read_text()
    long_cases = ("catalog", "catalog-quality-repaired", "wellness-repaired", "wellness", "catalog-performance-repaired")
    priorities = {key: index for index, key in enumerate(long_cases)}
    scheduled = sorted(cases, key=lambda case: priorities.get(case["id"], len(priorities)))
    with ThreadPoolExecutor(max_workers=4) as pool:
        pending = {case["id"]: pool.submit(review, case, sources[case["repo"]], private, runtime, prompt)
                   for case in scheduled}
        results = [pending[case["id"]].result() for case in cases]
    unchanged = launch_hashes == {path: digest(runtime / path) for path in launch_hashes}
    write_json(private / "evidence.json", {"expectationsSha256": EXPECTATIONS_SHA,
                                          "hashes": {**source_hashes, **launch_hashes},
                                          "runtimeUnchanged": unchanged, "runs": results})
    return 0 if unchanged and all(result["completedEvidence"] for result in results) else 2


if __name__ == "__main__":
    raise SystemExit(main())
