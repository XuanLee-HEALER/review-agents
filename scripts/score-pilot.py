"""Recompute pilot metrics from frozen reports and explicit per-finding adjudication."""
import hashlib
import json
import os
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
manifest = json.loads((ROOT / os.getenv('PILOT_MANIFEST', 'evals/reviewbench-pilot.json')).read_text())
data = json.loads((ROOT / os.getenv('PILOT_ADJUDICATION', 'evals/pilot-adjudication.json')).read_text())
valid = {'supported_actionable', 'supported_optional'}
cases = {c['nwo']: c for c in manifest['cases']}
expected = {(c['nwo'].replace('/', '_') + '-' + role) for c in cases.values()
            for role in c['candidate_reference_indices']}
runs = data['runs']
assert len({(r['phase'], r['id']) for r in runs}) == len(runs)
assert {r['id'] for r in runs if r['phase'] == 'baseline'} == expected
assert {r['id'] for r in runs if r['phase'] == 'controls'} == {c['id'] for c in data['controls']}
assert {r['nwo'] for r in runs if r['phase'] == 'repeat'} == {'AA-Factory/aafactory-prototype', 'UniverseCitiz3n/msgraph-kb-mcp'}
for r in runs:
    assert [j['index'] for j in r['judgments']] == list(range(len(r['report']['findings'])))
    assert all(j['classification'] in data['classifications'] for j in r['judgments'])
    allowed = {ref['id'] for ref in cases[r['nwo']]['references'] if ref['role'] == r['report']['role']}
    assert all(j['reference'] is None or j['reference'] in allowed for j in r['judgments'])
    raw = ROOT / r.get('raw_report_path', str(Path(os.getenv('PILOT_OUTPUT', '.local/eval-results/pilot-v1')) / r['phase'] / r['id'] / 'report.json'))
    if raw.exists():
        assert hashlib.sha256(raw.read_bytes()).hexdigest() == r['raw_report_sha256'], str(raw)


def summarize(selected):
    counts = Counter(j['classification'] for r in selected for j in r['judgments'])
    refs = {(r['nwo'], r['report']['role'], ref['id']) for r in selected
            for ref in cases[r['nwo']]['references'] if ref['role'] == r['report']['role']}
    found = {(r['nwo'], r['report']['role'], j['reference']) for r in selected
             for j in r['judgments'] if j['reference'] and j['classification'] in valid}
    return {'runs': len(selected), 'completed': sum(r['report']['status'] in ['pass', 'findings'] and r['exit_code'] in [0, 1] for r in selected),
            'findings': sum(counts.values()), 'classification_counts': dict(counts),
            'supported': sum(counts[k] for k in valid), 'matched_references': len(found), 'eligible_references': len(refs),
            'missed_references': sorted([list(x) for x in refs - found]),
            'within_report_duplicate_findings': sum(len(r['judgments']) - len({j['cause'] for j in r['judgments']}) for r in selected),
            'total_tokens': sum(r['report']['totalTokens'] for r in selected),
            'summed_run_seconds': round(sum(r['duration_ms'] for r in selected) / 1000, 1),
            'compactions': sum(r['report']['compactions'] for r in selected)}

baseline = [r for r in runs if r['phase'] == 'baseline']
result = {'baseline': summarize(baseline),
          'by_role': {role: summarize([r for r in baseline if r['report']['role'] == role]) for role in ['quality', 'performance', 'simplify', 'comments']},
          'by_split': {split: summarize([r for r in baseline if cases[r['nwo']]['split'] == split]) for split in ['development', 'holdout']},
          'all_runs': {'count': len(runs), 'total_tokens': sum(r['report']['totalTokens'] for r in runs)},
          'controls': [], 'repeats': []}
for c in data['controls']:
    before = next(r for r in baseline if r['nwo'] == c['nwo'] and r['report']['role'] == c['role'])
    after = next(r for r in runs if r['phase'] == 'controls' and r['id'] == c['id'])
    detected = any(j['reference'] == c['target'] and j['classification'] in valid for j in before['judgments'])
    recurrence = any(j['cause'] == c['target'] for j in after['judgments'])
    result['controls'].append({'id': c['id'], 'target_detected_before': detected, 'target_repeated_after': recurrence,
                               'diagnostic_pair': detected, 'findings_after': len(after['judgments'])})
for repeat in [r for r in runs if r['phase'] == 'repeat']:
    before = next(r for r in baseline if r['id'] == repeat['id'])
    a = {j['cause'] for j in before['judgments']}; b = {j['cause'] for j in repeat['judgments']}
    result['repeats'].append({'id': repeat['id'], 'intersection': len(a & b), 'union': len(a | b), 'same_root_causes': a == b})
(ROOT / os.getenv('PILOT_METRICS', 'evals/pilot-metrics.json')).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(result, ensure_ascii=False, indent=2))
