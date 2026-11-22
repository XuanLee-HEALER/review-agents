"""Materialize isolated repaired snapshots; never alter baseline workspaces."""
import json, pathlib, subprocess
ROOT = pathlib.Path(__file__).resolve().parent.parent
manifest = json.loads((ROOT / 'evals/reviewbench-pilot.json').read_text())
controls = []
def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo), *args], stderr=subprocess.DEVNULL, text=True).strip()
for control in manifest['controls']:
    case = next(c for c in manifest['cases'] if c['nwo'] == control['nwo'])
    source = ROOT / '.local/eval-repos' / case['nwo'].replace('/', '_')
    repo = ROOT / '.local/eval-controls' / control['id']
    if repo.exists():
        raise RuntimeError(f'Control already exists: {repo}; keep its recorded SHA or use a new run directory')
    repo.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['git', 'clone', '--shared', '--no-checkout', str(source), str(repo)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    git(repo, 'checkout', '--detach', case['head'])
    changed=[]
    def edit(path, transform):
        p=repo/path; before=p.read_text(); after=transform(before)
        assert before!=after, path
        p.write_text(after);changed.append(path)
    if control['id']=='catalog-quality':
        def patch(s):
            a=s.index('    // Fetch additional HF repos');b=s.index("    if (repoType === 'models')", a)
            section=s[a:b];assert section.count('.catch(() => null)')==1
            section=section.replace('.catch(() => null)', '.catch(err => {\n                        console.warn(`Failed to fetch additional HF repo "${entry.repo}":`, err);\n                        return null;\n                    })')
            return s[:a]+section+s[b:]
        edit('scripts/export-tags.js',patch)
    elif control['id']=='catalog-performance':
        for path,array in [('main.js','hfItems'),('scripts/export-tags.js','items')]:
            def patch(s,array=array):
                a=s.index('// Fetch additional HF repos');b=s.index("if (repoType === 'models')",a)
                s=s[:a]+'const additionalFullIds = new Set();\n        '+s[a:]
                marker=f'{array} = [...{array}, ...fetched.filter(item => item && !existingIds.has(item.id))];'
                assert marker in s
                s=s.replace(marker,'for (const item of fetched) {\n                if (item && !existingIds.has(item.id)) additionalFullIds.add(item.id);\n            }\n            '+marker)
                marker=f'{array}.map(item =>\n'
                pos=s.index(marker,s.index("if (repoType === 'models')",a))
                end=pos+len(marker)
                return s[:end]+'                additionalFullIds.has(item.id) ? Promise.resolve(item) :\n'+s[end:]
            edit(path,patch)
    elif control['id']=='wallet-simplify':
        def patch(s):
            s=s.replace('zap.ByteString("auth_data_hex", []byte(fmt.Sprintf("%x", attObj.RawAuthData)))','zap.String("auth_data_hex", fmt.Sprintf("%x", attObj.RawAuthData))')
            return s.replace('zap.ByteString("hex_preview", []byte(fmt.Sprintf("%x", v[:min(64, len(v))])))','zap.String("hex_preview", fmt.Sprintf("%x", v[:min(64, len(v))]))')
        edit('internal/service/webauthn.go',patch)
    elif control['id']=='mcp-comments':
        edit('README.md',lambda s:s.replace('If the clone fails the server still starts — tools will return a descriptive error until data is available.', 'If the clone fails the server still starts with an empty index. It does not retry automatically; restart the server to attempt loading the data again.'))
    git(repo,'add','--',*changed)
    git(repo,'-c','user.name=Evaluation fixture','-c','user.email=fixture@example.invalid','commit','-m','Snapshot revision')
    controls.append({**control,'repo':str(repo.relative_to(ROOT)),'base':case['base'],'originalHead':case['head'],'head':git(repo,'rev-parse','HEAD'),'changed':changed})
(ROOT/'evals/pilot-controls.json').write_text(json.dumps(controls,indent=2)+'\n')
print('Prepared',len(controls),'isolated controls')
