#!/usr/bin/env python3
import re, sys, yaml
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
    if lines > 170:
        errs.append(f'{fp}: too long ({lines} lines)')
    skills.append((fm.get('name'), fp, lines))

names=[s[0] for s in skills]
for n in sorted(set(names)):
    if names.count(n)>1: errs.append(f'duplicate skill name: {n}')

# Check referenced scripts/references in markdown backticks roughly
for name, fp, lines in skills:
    text=fp.read_text(errors='replace')
    base=fp.parent
    for rel in re.findall(r'`((?:scripts|references)/[^`]+?)`', text):
        rel=rel.strip().rstrip('.,)')
        if not (base/rel).exists():
            errs.append(f'{fp}: missing referenced {rel}')

print(f'skills={len(skills)}')
for name, fp, lines in skills:
    print(f'{lines:3} {name:32} {fp.relative_to(root)}')
if errs:
    print('\nERRORS:', file=sys.stderr)
    for e in errs: print('-', e, file=sys.stderr)
    sys.exit(1)
