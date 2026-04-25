#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { parseArgs, ensureDir } from '../../stitch-adapter/scripts/stitch_common.mjs';

const args = parseArgs(process.argv);
const projectRoot = path.resolve(args['project-root'] || process.cwd());
const page = String(args.page || args['page-key'] || '').trim();
if (!page) {
  console.error('usage: design_repo_bootstrap_page.mjs --page <page-key> [--project-root <dir>]');
  process.exit(1);
}
const pageKey = page.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'page';
const pageDir = path.join(projectRoot, '02-pages', pageKey);
await ensureDir(pageDir);
async function writeIfMissing(name, content) {
  const target = path.join(pageDir, name);
  try { await fs.access(target); return false; } catch {}
  await fs.writeFile(target, content);
  return true;
}
const created = [];
if (await writeIfMissing('spec.md', `# ${pageKey} Page Spec\n\n## Page goal\n\nTODO\n\n## Primary user journey\n\nTODO\n\n## Sections\n\nTODO\n\n## Data/actions\n\nTODO\n\n## Constraints\n\nTODO\n`)) created.push('spec.md');
if (await writeIfMissing('content.md', `# ${pageKey} Content\n\nTODO\n`)) created.push('content.md');
if (await writeIfMissing('states.md', `# ${pageKey} States\n\n- Loading\n- Empty\n- Error\n- Permission\n- Success\n`)) created.push('states.md');
if (await writeIfMissing('responsive-plan.md', `# ${pageKey} Responsive Plan\n\n## Intent\n\nTODO\n\n## Breakpoint contracts\n\n### mobile\n\nTODO\n\n### tablet\n\nTODO\n\n### desktop\n\nTODO\n\n## Repair eligibility\n\nTarget shell must exist before layout repair.\n`)) created.push('responsive-plan.md');
console.log(JSON.stringify({ pageKey, pageDir, created }, null, 2));
