#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const root = path.resolve(args.find((arg) => !arg.startsWith('--')) || process.cwd());
const stageArg = args.find((arg) => arg.startsWith('--stage='));
const stage = stageArg ? stageArg.split('=')[1] : 'structure';
const pageArg = args.find((arg) => arg.startsWith('--page='));
const page = pageArg ? pageArg.split('=')[1] : null;
const breakpointArg = args.find((arg) => arg.startsWith('--breakpoint='));
const breakpoint = breakpointArg ? breakpointArg.split('=')[1] : 'mobile';
let ok = true;
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function requirePath(rel) { if (!exists(rel)) { console.log(`MISSING ${rel}`); ok = false; } }
function requireDir(rel) { if (!exists(rel) || !fs.statSync(path.join(root, rel)).isDirectory()) { console.log(`MISSING_DIR ${rel}`); ok = false; } }

for (const dir of ['00-product','01-system','02-pages','03-references','04-generated','05-review','06-handoff']) requireDir(dir);
for (const d of ['04-generated','05-review','06-handoff']) {
  if (exists(path.join(d,'.source-truth'))) { console.log(`BAD_SOURCE_TRUTH_MARKER ${d}/.source-truth`); ok = false; }
}
if (stage === 'generation' || stage === 'repair' || stage === 'handoff') {
  requirePath('00-product/brief.md');
  requirePath('01-system/DESIGN.md');
  if (!page) { console.log('MISSING_ARG --page=<page>'); ok = false; }
  else {
    requirePath(`02-pages/${page}/spec.md`);
    requirePath(`04-generated/stitch/${page}/${page}.${breakpoint}.prompt.md`);
    requirePath(`04-generated/stitch/${page}/locks/pre-approval-lock.md`);
    requirePath(`04-generated/stitch/${page}/locks/copy-lock.md`);
    requirePath(`04-generated/stitch/${page}/locks/output-lock.md`);
  }
}
if (stage === 'repair' || stage === 'handoff') {
  if (page) {
    requirePath(`02-pages/${page}/responsive-plan.md`);
    requirePath(`04-generated/stitch/${page}/${page}.${breakpoint}.html`);
    requirePath(`04-generated/stitch/${page}/${page}.${breakpoint}.png`);
    requirePath(`04-generated/stitch/${page}/${page}.${breakpoint}.meta.json`);
  }
}
if (stage === 'handoff') {
  if (page) requirePath(`05-review/${page}-review.md`);
}
process.exit(ok ? 0 : 1);
