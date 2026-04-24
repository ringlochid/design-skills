#!/usr/bin/env python3
import re, sys, yaml, subprocess
from pathlib import Path
root=Path(__file__).resolve().parent
errs=[]
skills=[]
for fp in sorted(root.glob('*/SKILL.md')):
    text=fp.read_text(errors='replace')
    m=re.match(r'^---\n(.*?)\n---\n', text, re.S)
    if not m:
        errs.append(f'{fp}: missing YAML frontmatter')
        continue
    try:
        fm=yaml.safe_load(m.group(1)) or {}
    except Exception as e:
        errs.append(f'{fp}: YAML parse error: {e}')
        continue
    for k in ['name','description']:
        if not fm.get(k): errs.append(f'{fp}: missing {k}')
    lines=text.count('\n')+1
    if lines > 180:
        errs.append(f'{fp}: too long ({lines} lines)')
    skills.append((fm.get('name'), fp, lines))

names=[s[0] for s in skills]
for n in sorted(set(names)):
    if names.count(n)>1: errs.append(f'duplicate skill name: {n}')

for name, fp, lines in skills:
    text=fp.read_text(errors='replace')
    base=fp.parent
    for rel in re.findall(r'`((?:scripts|references)/[^`]+?)`', text):
        rel=rel.strip().rstrip('.,)')
        if not (base/rel).exists():
            errs.append(f'{fp}: missing referenced {rel}')

for script in sorted(root.glob('*/scripts/*')):
    if script.name.startswith('.'): continue
    if script.suffix == '.mjs':
        res=subprocess.run(['node','--check',str(script)], cwd=root, text=True, capture_output=True)
        if res.returncode != 0:
            errs.append(f'{script}: node --check failed: {res.stderr.strip() or res.stdout.strip()}')
    if script.suffix == '.py':
        try:
            source = script.read_text(errors='replace')
            compile(source, str(script), 'exec')
        except Exception as e:
            errs.append(f'{script}: python compile failed: {e}')
    if script.suffix in {'.mjs','.py','.sh'} and not (script.stat().st_mode & 0o111):
        errs.append(f'{script}: script is not executable')

for bad in list(root.rglob('__pycache__')) + list(root.rglob('*.pyc')):
    errs.append(f'{bad}: generated cache file should not be committed')

smoke = root / 'tests' / 'validate_runtime_smoke.mjs'
if smoke.exists():
    res=subprocess.run(['node', str(smoke)], cwd=root, text=True, capture_output=True)
    if res.returncode != 0:
        errs.append(f'{smoke}: runtime smoke failed: {res.stderr.strip() or res.stdout.strip()}')


allowed_legacy = {'PATCH_PLAN.md','REVIEW_NOTES_LOCAL.md','design-repo-common/references/legacy-design-flow-migration.md','validate_skill_pack.py','stitch-adapter/scripts/stitch_common.mjs'}
legacy_tokens = ['00-meta', '03-pages', 'exports/stitch']
for fp in sorted(root.rglob('*')):
    if not fp.is_file() or '.git' in fp.parts: continue
    rel=str(fp.relative_to(root))
    if rel in allowed_legacy or rel.startswith('design-repo-init/scripts/design_flow_'):
        continue
    try: text=fp.read_text(errors='ignore')
    except Exception: continue
    for token in legacy_tokens:
        if token in text:
            errs.append(f'{rel}: legacy token outside allowed migration/legacy helper: {token}')
            break

print(f'skills={len(skills)}')
for name, fp, lines in skills:
    print(f'{lines:3} {name:32} {fp.relative_to(root)}')
if errs:
    print('\nERRORS:', file=sys.stderr)
    for e in errs: print('-', e, file=sys.stderr)
    sys.exit(1)
