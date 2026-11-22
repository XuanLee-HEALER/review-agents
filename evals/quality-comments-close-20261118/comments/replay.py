"""Run fresh Comments tasks on prepared, isolated fixed heads."""

from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time


ROOT = Path(__file__).resolve().parents[3]
BUN = os.environ.get("BUN_BIN") or shutil.which("bun") or str(Path.home() / ".bun/bin/bun")
LAUNCHER = ROOT / "bin" / "review-comments"


def git(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args], text=True).strip()


def verify_checkout(repo, head):
    if git(repo, "rev-parse", "HEAD") != head or git(repo, "status", "--porcelain"):
        raise RuntimeError("Review workspace is not the clean fixed head")


def replay(row, output):
    case, repo, base, head = row.split("\t")
    repo = Path(repo).resolve()
    if output.is_relative_to(repo):
        raise RuntimeError("Review output must be outside the reviewed repository")
    verify_checkout(repo, head)
    out = output / case
    out.mkdir()
    task = out / "task"
    tools, rounds = "snapshot,workspace", 10
    if case.startswith("mcp-"):
        tools, rounds = tools + ",web", 16
    elif case == "comments-wellness":
        tools, rounds = tools + ",web", 30
    args = [
        str(LAUNCHER), "--repo", ".", "--base", base, "--head", head,
        "--model", "gpt-6.2-sol", "--effort", "high", "--tool-sets", tools,
        "--max-turns", str(rounds), "--task", str(task), "--out", str(out / "report.json"),
    ]
    if os.environ.get("REVIEW_CONFIG"):
        args.extend(["--config", str(Path(os.environ["REVIEW_CONFIG"]).resolve())])
    env = {**os.environ, "BUN_BIN": BUN}
    start = time.monotonic()
    with (out / "stdout.json").open("w") as stdout, (out / "stderr.log").open("w") as stderr:
        run = subprocess.run(args, cwd=repo, env=env, stdout=stdout, stderr=stderr)
    record = {"exitCode": run.returncode, "durationMs": round((time.monotonic() - start) * 1000)}
    (out / "process.json").write_text(json.dumps(record, indent=2) + "\n")
    if (task / "state.json").is_file():
        with (out / "status.json").open("w") as status:
            subprocess.run([str(LAUNCHER), "--status", str(task)], env=env, stdout=status, check=True)
    verify_checkout(repo, head)
    print(f"{case}: exit {run.returncode} in {record['durationMs']} ms", flush=True)
    return run.returncode in (0, 1)


def main(cases, output, selected):
    os.umask(0o077)
    output.mkdir()
    paths = ("prompts/comments.md", "dist/comments.js", "bin/review-comments")
    hashes = {path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest() for path in paths}
    (output / "hashes.json").write_text(json.dumps(hashes, indent=2) + "\n")
    rows = cases.read_text().splitlines()
    if selected:
        available = {row.split("\t", 1)[0] for row in rows}
        if not set(selected).issubset(available):
            raise ValueError("Unknown case selection")
        rows = [row for row in rows if row.split("\t", 1)[0] in selected]
    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(lambda row: replay(row, output), rows))
    return 0 if all(results) else 2


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit(f"Usage: {sys.argv[0]} CASES_TSV NEW_PRIVATE_OUTPUT_DIRECTORY [CASE ...]")
    raise SystemExit(main(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve(), sys.argv[3:]))
