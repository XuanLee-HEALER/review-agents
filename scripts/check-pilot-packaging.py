"""Probe the disputed npm exclusion claim without running reviewed code or scripts."""
import json
import argparse
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--npm-cli', help='Optional downloaded npm bin/npm-cli.js; no auto-install')
args = parser.parse_args()
command = ['node', str(Path(args.npm_cli).resolve())] if args.npm_cli else ['npm']
source = ROOT / '.local/eval-repos/UniverseCitiz3n_msgraph-kb-mcp'
with tempfile.TemporaryDirectory(prefix='review-pack-probe-') as directory:
    root = Path(directory)
    package = json.loads((source / 'package.json').read_text())
    package.pop('scripts', None)  # isolate packaging rules; older npm can run prepare despite --ignore-scripts
    (root / 'package.json').write_text(json.dumps(package))
    (root / '.gitignore').write_bytes((source / '.gitignore').read_bytes())
    (root / 'dist/tools').mkdir(parents=True)
    for name in ['index.js', 'loader.js', 'tools/get_api_details.js']:
        (root / 'dist' / name).write_text('// inert packaging probe\n')
    process = subprocess.run(command + ['pack', '--dry-run', '--ignore-scripts', '--json'], cwd=root,
                             check=True, capture_output=True, text=True)
    result = {'npm': subprocess.check_output(command + ['--version'], text=True).strip(),
              'node': subprocess.check_output(['node', '--version'], text=True).strip(),
              'files': [f['path'] for f in json.loads(process.stdout)[0]['files']]}
    assert {'dist/index.js', 'dist/loader.js', 'dist/tools/get_api_details.js'} <= set(result['files']), result
    print(json.dumps(result, indent=2))
