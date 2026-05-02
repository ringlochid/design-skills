#!/usr/bin/env python3
from pathlib import Path
import re, sys
root=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parents[2]
errors=[]
expected={
'backend-capability-reader','design-direction-brainstorm','design-handoff-release','design-patch-workflow','design-repo-init','design-repo-router','design-review-gate','design-source-patcher','design-system-writer','design-workflow','generation-pack-builder','layout-repair-loop','page-spec-writer','product-brief-writer','product-source-reader','reference-research','responsive-plan-writer','stitch-adapter','visual-asset-generator'
}
skills={p.parent.name for p in root.glob('*/SKILL.md') if p.parent.name!='design-repo-common'}
missing=expected-skills; extra=skills-expected
if missing: errors.append(f'missing skills: {sorted(missing)}')
if extra: errors.append(f'extra skills: {sorted(extra)}')
if (root/'design-repo-common'/'SKILL.md').exists(): errors.append('design-repo-common must not contain SKILL.md')
ref=root/'design-repo-common'/'references'/'orchestrator-workflows.md'
if not ref.exists(): errors.append('missing orchestrator-workflows.md')
else:
    txt=ref.read_text()
    for term in ['New full design','Existing artifact patch','Review-only','Handoff refresh','Degraded complete output','Gate proof rule','Screenshot feedback','Missing breakpoint','Layout-only repair','Semantic/content/theme/source-truth patch','Post-acceptance handoff refresh','promote_or_stop','design-promote','Stitch generate/edit/export']:
        if term not in txt: errors.append(f'orchestrator-workflows.md missing {term}')
for skill in ['design-workflow','design-patch-workflow','design-repo-router']:
    p=root/skill/'SKILL.md'
    if not p.exists(): continue
    txt=p.read_text()
    if 'orchestrator-workflows.md' not in txt: errors.append(f'{skill} missing orchestrator workflow ref')
    for link in re.findall(r'`\.\./design-repo-common/references/([^`]+\.md)`', txt):
        if not (root/'design-repo-common'/'references'/link).exists(): errors.append(f'{skill} references missing {link}')
for p in root.rglob('SKILL.md'):
    if '.git' in p.parts: continue
    if p.parent.name in expected and p != root/p.parent.name/'SKILL.md': errors.append(f'nested duplicate SKILL.md: {p.relative_to(root)}')
if errors:
    print('FAIL')
    for e in errors: print('-',e)
    sys.exit(1)
print(f'OK: {len(skills)} skills, orchestrator workflows ref present')
