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
function readJson(rel) {
  try { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); }
  catch { return null; }
}
function fileSize(rel) {
  try { return fs.statSync(path.join(root, rel)).size; }
  catch { return 0; }
}
function requirePng(rel) {
  requirePath(rel);
  if (exists(rel) && fileSize(rel) < 100) { console.log(`SUSPICIOUS_SMALL_PNG ${rel}`); ok = false; }
}
function acceptedReviewText(text) {
  return /promotion_eligible\s*:\s*true/i.test(text) || /verdict\s*:\s*\*?\*?(accept|accepted|pass)\b/i.test(text);
}
function handoffCandidates(pageKey) { return [`06-handoff/${pageKey}-handoff.md`, `06-handoff/${pageKey}.md`].filter(exists); }
function requireAcceptedReview(pageKey) {
  const reviewRel = `05-review/${pageKey}-review.md`;
  requirePath(reviewRel);
  if (exists(reviewRel)) {
    const text = fs.readFileSync(path.join(root, reviewRel), 'utf8');
    if (!acceptedReviewText(text)) { console.log(`REVIEW_NOT_ACCEPTED ${reviewRel}`); ok = false; }
  }
}
function requireHandoffLinks(pageKey, breakpointName) {
  const candidates = handoffCandidates(pageKey);
  if (!candidates.length) { console.log(`MISSING_HANDOFF 06-handoff/${pageKey}-handoff.md or 06-handoff/${pageKey}.md`); ok = false; return; }
  const text = candidates.map((rel) => fs.readFileSync(path.join(root, rel), 'utf8')).join('\n');
  for (const rel of [
    `../04-generated/stitch/${pageKey}/${breakpointName}.html`,
    `../04-generated/stitch/${pageKey}/${breakpointName}.png`,
    `../04-generated/stitch/${pageKey}/${breakpointName}.local.png`,
    `../04-generated/stitch/${pageKey}/${breakpointName}.local.full.png`,
  ]) {
    if (!text.includes(rel)) { console.log(`HANDOFF_LINK_MISSING ${rel}`); ok = false; }
  }
  if (!text.includes(`![`) || !text.includes(`${breakpointName}.local`)) { console.log(`HANDOFF_PREVIEW_MISSING ${breakpointName}`); ok = false; }
}
function validateMetaAndState(pageKey, breakpointName, requireApproved = false) {
  const metaRel = `04-generated/stitch/${pageKey}/runtime/${breakpointName}.meta.json`;
  const meta = readJson(metaRel);
  if (!meta) { console.log(`BAD_META_JSON ${metaRel}`); ok = false; return; }
  if (!meta.screenshotSource) { console.log(`META_SCREENSHOT_SOURCE_MISSING ${metaRel}`); ok = false; }
  if (meta.screenshotSource === 'local-html-full-access-fallback' && meta.screenshotFallback?.releaseQuality !== false) {
    console.log(`META_FALLBACK_NOT_DEGRADED ${metaRel}`); ok = false;
  }
  if (meta.renderedPreview && meta.renderedPreview.networkAccess !== 'full') {
    console.log(`META_LOCAL_RENDER_NOT_FULL_NETWORK ${metaRel}`); ok = false;
  }
  for (const [key, suffix] of Object.entries({ htmlPath: '.html', imagePath: '.png', localImagePath: '.local.png', localFullImagePath: '.local.full.png' })) {
    const value = key === 'htmlPath' ? meta.htmlPath : (key === 'imagePath' ? (meta.stitchCanvasScreenshot?.imagePath || meta.screenshotFallback?.imagePath || meta.imagePath) : meta.localHtmlRender?.[key === 'localImagePath' ? 'imagePath' : 'fullImagePath']);
    if (value && !String(value).endsWith(`${breakpointName}${suffix}`)) { console.log(`META_TRIPLET_MISMATCH ${key} ${value}`); ok = false; }
  }
  const state = readJson(`04-generated/stitch/${pageKey}/runtime/state.json`);
  if (!state) { console.log(`BAD_STATE_JSON 04-generated/stitch/${pageKey}/runtime/state.json`); ok = false; return; }
  if (requireApproved) {
    const approved = state.approved?.[breakpointName];
    if (!approved) { console.log(`STATE_APPROVED_MISSING ${pageKey}/${breakpointName}`); ok = false; return; }
    const expectedOutdir = path.join(root, '04-generated/stitch', pageKey);
    const approvedOutdir = approved.outdir ? path.resolve(approved.outdir) : null;
    if (approvedOutdir && approvedOutdir !== expectedOutdir) { console.log(`STATE_APPROVED_OUTDIR_MISMATCH ${pageKey}/${breakpointName}`); ok = false; }
    if (!approved.metaPath || path.resolve(approved.metaPath) !== path.join(root, metaRel)) { console.log(`STATE_APPROVED_META_MISMATCH ${pageKey}/${breakpointName}`); ok = false; }
    const metaScreen = meta.outputScreenId || meta.screenId || meta.inputScreenId || null;
    if ((approved.screenId || null) !== (metaScreen || null)) { console.log(`STATE_APPROVED_SCREEN_MISMATCH ${pageKey}/${breakpointName}`); ok = false; }
    if ((approved.projectId || null) !== (meta.projectId || state.projectId || null)) { console.log(`STATE_APPROVED_PROJECT_MISMATCH ${pageKey}/${breakpointName}`); ok = false; }
    if (!approved.reviewFile || !exists(path.relative(root, path.resolve(approved.reviewFile)))) { console.log(`STATE_APPROVED_REVIEW_MISSING ${pageKey}/${breakpointName}`); ok = false; }
    const lifecycle = readJson(`04-generated/stitch/${pageKey}/runtime/lifecycle.json`);
    const event = lifecycle?.events?.find((item) => item.state === 'accepted-promoted' && item.breakpoint === breakpointName && (item.screenId || null) === (approved.screenId || null));
    if (!event) { console.log(`LIFECYCLE_ACCEPTED_PROMOTED_MISSING ${pageKey}/${breakpointName}`); ok = false; }
  }
}

function forbidPath(rel, hint = '') {
  if (exists(rel)) {
    console.log(`REDUNDANT ${rel}${hint ? ` ${hint}` : ''}`);
    ok = false;
  }
}
function forbidGeneratedPageClutter(pageKey, breakpointName) {
  const pageRoot = path.join('04-generated/stitch', pageKey);
  if (!exists(pageRoot)) return;
  forbidPath(path.join(pageRoot, `${breakpointName}.full.png`), 'move local full-page render to runtime/diagnostics/');
  forbidPath(path.join(pageRoot, `${breakpointName}.layout-diagnostics.json`), 'move layout diagnostics to runtime/diagnostics/');
  forbidPath(path.join(pageRoot, 'diagnostics'), 'move diagnostics under runtime/diagnostics/');
  forbidPath(path.join(pageRoot, `${breakpointName}.meta.json`), 'move metadata JSON to runtime/');
  forbidPath(path.join(pageRoot, 'state.json'), 'move state JSON to runtime/');
  forbidPath(path.join(pageRoot, `${breakpointName}-edit.prompt.md`), 'move edit/retry prompt into attempts/<label>/');
  forbidPath(path.join(pageRoot, 'layout-fixes'), 'use attempts/<label>/ plus runtime/ for repair artifacts');
  forbidPath(path.join(pageRoot, 'locks/output-lock.md'), 'deprecated; visual quality belongs to review gate');
  for (const rel of ['project.json', 'stitch-project-screens.json', 'stitch-sessions.json', 'design-system.json']) forbidPath(path.join(pageRoot, rel), 'move runtime JSON under runtime/');

}


function forbidGeneratedRootRuntimeClutter() {
  for (const rel of [
    '04-generated/stitch/project.json',
    '04-generated/stitch/stitch-project-screens.json',
    '04-generated/stitch/stitch-sessions.json',
  ]) forbidPath(rel, 'move generated runtime JSON under 04-generated/stitch/<page>/runtime/');
}

for (const dir of ['00-product','01-system','02-pages','03-references','04-generated','05-review','06-handoff']) requireDir(dir);
forbidGeneratedRootRuntimeClutter();
for (const d of ['04-generated','05-review','06-handoff']) {
  if (exists(path.join(d,'.source-truth'))) { console.log(`BAD_SOURCE_TRUTH_MARKER ${d}/.source-truth`); ok = false; }
}
if (stage === 'generation' || stage === 'repair' || stage === 'handoff') {
  requirePath('00-product/brief.md');
  requirePath('01-system/DESIGN.md');
  if (!page) { console.log('MISSING_ARG --page=<page>'); ok = false; }
  else {
    forbidGeneratedPageClutter(page, breakpoint);
    requirePath(`02-pages/${page}/spec.md`);
    requirePath(`04-generated/stitch/${page}/${breakpoint}.prompt.md`);
    requirePath(`04-generated/stitch/${page}/locks/pre-approval-lock.md`);
    requirePath(`04-generated/stitch/${page}/locks/copy-lock.md`);
  }
}
if (stage === 'repair' || stage === 'handoff') {
  if (page) {
    requirePath(`02-pages/${page}/responsive-plan.md`);
    requirePath(`04-generated/stitch/${page}/${breakpoint}.html`);
    requirePng(`04-generated/stitch/${page}/${breakpoint}.png`);
    requirePng(`04-generated/stitch/${page}/${breakpoint}.local.png`);
    requirePng(`04-generated/stitch/${page}/${breakpoint}.local.full.png`);
    requirePath(`04-generated/stitch/${page}/runtime/${breakpoint}.meta.json`);
    requirePath(`04-generated/stitch/${page}/runtime/state.json`);
    validateMetaAndState(page, breakpoint, stage === 'handoff');
  }
}
if (stage === 'handoff') {
  if (page) {
    requireAcceptedReview(page);
    requireHandoffLinks(page, breakpoint);
  }
}
process.exit(ok ? 0 : 1);
