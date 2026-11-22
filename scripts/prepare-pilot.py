"""Fetch fixed review workspaces without executing any target project code."""
import concurrent.futures
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
manifest = json.loads((ROOT / 'evals/reviewbench-pilot.json').read_text())

def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo), *args], stderr=subprocess.DEVNULL, text=True, timeout=180).strip()

def prepare(case):
    repo = ROOT / '.local/eval-repos' / case['nwo'].replace('/', '_')
    if not repo.exists():
        repo.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(['git', 'clone', '--filter=blob:none', '--no-checkout', case['mirror'], str(repo)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180)
    elif git(repo, 'status', '--porcelain'):
        raise RuntimeError(f'Refusing to alter dirty evaluation workspace: {repo}')
    for sha in [case['base'], case['head']]:
        try:
            git(repo, 'cat-file', '-e', sha + '^{commit}')
        except subprocess.CalledProcessError:
            git(repo, 'fetch', 'origin', sha)
    git(repo, 'checkout', '--detach', case['head'])
    return case['nwo']

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
    for future in concurrent.futures.as_completed([executor.submit(prepare, c) for c in manifest['cases']]):
        print('Ready', future.result(), flush=True)
