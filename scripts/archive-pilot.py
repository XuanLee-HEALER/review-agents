"""Archive reports with explicit manual judgments; never infer correctness from titles."""
import argparse
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('annotations', help='JSON list of phase/id/raw_report_path/judgments')
parser.add_argument('output')
args = parser.parse_args()
entries = json.loads((root / args.annotations).read_text())
runs = []
for entry in entries:
    path = root / entry['raw_report_path']
    raw = path.read_bytes()
    report = json.loads(raw)
    state = json.loads((path.parent / 'task/state.json').read_text())
    role_prompt = state['instructions'].split('\nYou are an advisory code reviewer.', 1)[0]
    run = json.loads((path.parent / 'run.json').read_text())
    assert [j['index'] for j in entry['judgments']] == list(range(len(report['findings']))), str(path)
    runs.append({**entry, 'nwo': run['nwo'], 'duration_ms': run['durationMs'],
                 'exit_code': run['exitCode'], 'role_prompt_sha256': hashlib.sha256(role_prompt.encode()).hexdigest(), 'raw_report_sha256': hashlib.sha256(raw).hexdigest(),
                 'report': {k: v for k, v in report.items() if k not in ['task', 'cwd', 'repo']}})
previous = json.loads((root / 'evals/pilot-adjudication.json').read_text())
archive = {'version': 2, 'evaluation_date': '2026-11-11',
           'method': 'Single evaluator source inspection and focused experiments; known-set regression, no independent human adjudicator.',
           'classifications': previous['classifications'], 'runs': runs,
           'controls': previous['controls'], 'experiments': previous['experiments']}
(root / args.output).write_text(json.dumps(archive, ensure_ascii=False, indent=2) + '\n')
print(f'Archived {len(runs)} runs and {sum(len(r["judgments"]) for r in runs)} judgments')
