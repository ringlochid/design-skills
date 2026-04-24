#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { parseArgs, ensureDir, writeJson } from './stitch_common.mjs';

const args = parseArgs(process.argv);
const projectRoot = path.resolve(args['project-root'] || process.cwd());
const productName = args['product-name'] || path.basename(projectRoot);
const dirs = [
  '00-product',
  '01-system/themes',
  '02-pages',
  '03-references/screenshots',
  '03-references/figma',
  '03-references/architecture',
  '03-references/backend',
  '03-references/generated-assets',
  '04-generated/stitch',
  '04-generated/html',
  '04-generated/images',
  '04-generated/screenshots',
  '05-review',
  '06-handoff',
];
for (const dir of dirs) await ensureDir(path.join(projectRoot, dir));

async function writeIfMissing(rel, content) {
  const target = path.join(projectRoot, rel);
  try { await fs.access(target); return false; } catch {}
  await ensureDir(path.dirname(target));
  await fs.writeFile(target, content);
  return true;
}

const created = [];
if (await writeIfMissing('00-product/source-inventory.md', `# Source Inventory\n\nProduct: ${productName}\n\n## Evidence\n\n- Created by design repo bootstrap. Replace with product docs, architecture notes, backend/API sources, screenshots, and references as they are reviewed.\n\n## Gaps\n\n- Source inventory needs human/agent review before production generation.\n`)) created.push('00-product/source-inventory.md');
if (await writeIfMissing('00-product/brief.md', `# Product Brief\n\n## Product goal\n\nDraft required before generation.\n\n## Target users\n\nDraft required before generation.\n\n## Core workflows\n\nDraft required before generation.\n\n## Constraints\n\nDraft required before generation.\n\n## Assumptions / open questions\n\nDraft required before generation.\n`)) created.push('00-product/brief.md');
if (await writeIfMissing('00-product/design-policy.md', `# Design Policy\n\n- Breakpoint strategy: ${args['primary-breakpoint'] || 'mobile'}-first\n- Theme strategy: single-theme\n- Repo-awareness mode: inspect-only\n- Design-system source: create-new\n`)) created.push('00-product/design-policy.md');
if (await writeIfMissing('00-product/repo-context.json', JSON.stringify({ version: 1, mode: 'inspect-only', evidence: [], gaps: ['source inventory requires review'], updatedAt: new Date().toISOString() }, null, 2) + '\n')) created.push('00-product/repo-context.json');
if (await writeIfMissing('01-system/DESIGN.md', `# Design System\n\n## Visual principles\n\nDraft required before generation.\n\n## Layout and spacing\n\nDraft required before generation.\n\n## Color and typography\n\nDraft required before generation.\n\n## Components\n\nDraft required before generation.\n`)) created.push('01-system/DESIGN.md');
await writeJson(path.join(projectRoot, '00-product/design-config.json'), {
  version: 2,
  productName,
  primaryBreakpoint: args['primary-breakpoint'] || 'mobile',
  enabledBreakpoints: ['mobile', 'tablet', 'desktop'],
  themeStrategy: 'single-theme',
  repoAwarenessMode: 'inspect-only',
  designSystemMode: 'create-new',
  paths: {
    productDir: '00-product',
    designSystemDir: '01-system',
    pagesDir: '02-pages',
    referencesDir: '03-references',
    generatedDir: '04-generated',
    reviewDir: '05-review',
    handoffDir: '06-handoff'
  },
  stitch: {
    generatedRoot: '04-generated/stitch',
    projectRuntime: '04-generated/stitch/project.json',
    globalSessionIndex: '04-generated/stitch/stitch-sessions.json'
  }
});
created.push('00-product/design-config.json');
console.log(JSON.stringify({ projectRoot, created }, null, 2));
