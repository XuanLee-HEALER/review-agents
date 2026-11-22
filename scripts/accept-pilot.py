"""Apply the predeclared candidate gate; consumes independently adjudicated reports."""
import hashlib
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
version = sys.argv[1] if len(sys.argv) > 1 else 'v3'
manifest = json.loads((root / f'evals/reviewbench-pilot-{version}.json').read_text())
archive = json.loads((root / f'evals/pilot-{version}-adjudication.json').read_text())
metrics = json.loads((root / f'evals/pilot-{version}-metrics.json').read_text())
runs = archive['runs']
checks = {}
checks['all_21_runs_complete'] = len(runs) == 21 and all(r['exit_code'] in [0, 1] and r['report']['status'] in ['pass', 'findings'] for r in runs)
checks['full_diff_coverage'] = all(r['report'].get('coverage', {}).get('unreadDiff') == [] for r in runs)
checks['all_findings_adjudicated'] = all([j['index'] for j in r['judgments']] == list(range(len(r['report']['findings']))) for r in runs)
checks['no_confirmed_incorrect_findings'] = all(j['classification'] != 'unsupported_incorrect' for r in runs for j in r['judgments'])
checks['overall_recall_at_least_9_of_11'] = metrics['baseline']['matched_references'] >= 9 and metrics['baseline']['eligible_references'] == 11
checks['simplify_2_of_2'] = metrics['by_role']['simplify']['matched_references'] == 2
checks['comments_3_of_3'] = metrics['by_role']['comments']['matched_references'] == 3
checks['no_repaired_target_recurrence'] = len(metrics['controls']) == 4 and all(not c['target_repeated_after'] for c in metrics['controls'])
checks['no_packaging_false_claim'] = all(j['cause'] != 'npm-dist-exclusion' for r in runs for j in r['judgments'])
checks['sdk_diagnostic_has_no_speculative_abstraction'] = not next(r for r in runs if r['phase'] == 'baseline' and r['nwo'] == 'rulecom/rule-io-sdk')['judgments']
checks['repeat_targets_retained'] = True
for r in runs:
    if r['phase'] not in ['repeat', 'targeted-repeat'] or r['id'] == 'mcp-comments':
        continue
    baseline = next(b for b in runs if b['phase'] == 'baseline' and b['id'] == r['id'])
    targets = {j['reference'] for j in baseline['judgments'] if j['reference']}
    repeated = {j['reference'] for j in r['judgments'] if j['reference']}
    checks['repeat_targets_retained'] &= targets <= repeated
checks['runtime_matches_frozen_candidate'] = all(hashlib.sha256((root / p).read_bytes()).hexdigest() == h for p, h in manifest['runtime_hashes'].items())
checks['stored_role_prompts_match'] = all(r.get('role_prompt_sha256') == hashlib.sha256((root / 'prompts' / (r['report']['role'] + '.md')).read_bytes()).hexdigest() for r in runs)
checks['actual_model_and_tools'] = all(r['report']['actualModels'] == [manifest['configuration']['model']] and r['report']['toolSets'] == manifest['configuration']['tool_sets'].split(',') for r in runs)
result = {'candidate': version, 'passed': all(checks.values()), 'checks': checks,
          'unresolved_findings': sum(j['classification'] == 'unresolved' for r in runs for j in r['judgments']),
          'scope': 'Known-set advisory regression gate. Engineering tests and skill-link smoke checks are recorded separately; not a general production guarantee.'}
(root / f'evals/pilot-{version}-acceptance.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
sys.exit(0 if result['passed'] else 1)
