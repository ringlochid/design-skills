#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { parseArgs, writeJson, ensureDir } from '../../stitch-adapter/scripts/stitch_common.mjs';

const args = parseArgs(process.argv);
const projectRoot = path.resolve(args['project-root'] || process.cwd());
const requiredDirs = ['00-product', '01-system', '02-pages', '03-references', '04-generated', '05-review', '06-handoff'];
const requiredFiles = ['00-product/brief.md', '01-system/DESIGN.md', '00-product/design-policy.md', '00-product/source-inventory.md'];
const status = { projectRoot, missingDirs: [], missingFiles: [], ready: false, checkedAt: new Date().toISOString() };
for (const dir of requiredDirs) {
  try { if (!(await fs.stat(path.join(projectRoot, dir))).isDirectory()) status.missingDirs.push(dir); }
  catch { status.missingDirs.push(dir); }
}
for (const file of requiredFiles) {
  try {
    const text = await fs.readFile(path.join(projectRoot, file), 'utf8');
    if (!text.trim() || /\bTODO\b/i.test(text) || /Draft required before generation/i.test(text)) status.missingFiles.push(file);
  } catch { status.missingFiles.push(file); }
}
status.ready = status.missingDirs.length === 0 && status.missingFiles.length === 0;
await ensureDir(path.join(projectRoot, '00-product'));
await writeJson(path.join(projectRoot, '00-product', 'repo-status.json'), status);
const sourceInventoryPath = path.join(projectRoot, '00-product', 'source-inventory.md');
try { await fs.access(sourceInventoryPath); } catch { await fs.writeFile(sourceInventoryPath, `# Source Inventory\n\n## Evidence\n\n- Preflight created this placeholder. Add product docs, architecture notes, backend/API sources, screenshots, and references.\n\n## Gaps\n\n- Source inventory needs review before generation.\n`); }
const repoContextPath = path.join(projectRoot, '00-product', 'repo-context.json');
try { await fs.access(repoContextPath); } catch { await writeJson(repoContextPath, { version: 1, mode: 'inspect-only', evidence: [], gaps: ['preflight placeholder'], updatedAt: new Date().toISOString() }); }
console.log(JSON.stringify(status, null, 2));
process.exit(status.ready ? 0 : 1);
