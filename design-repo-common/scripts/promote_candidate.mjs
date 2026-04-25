#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) { args[key] = next; i += 1; }
    else args[key] = true;
  }
  return args;
}
function safeToken(value, label) {
  const raw = String(value || '').trim();
  if (!raw || raw.includes('/') || raw.includes('\\') || raw.includes('..') || !/^[a-z0-9][a-z0-9.-]*$/i.test(raw)) {
    throw new Error(`Unsafe ${label}: ${value || '[empty]'}`);
  }
  return raw;
}
function isWithin(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}
async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
async function ensureDir(dir) { await fs.mkdir(dir, { recursive: true }); }
async function readJson(file, fallback = {}) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; } }
async function writeJson(file, payload) {
  await ensureDir(path.dirname(file));
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2) + '\n');
  await fs.rename(tmp, file);
}
function acceptedReview(text) {
  return /promotion_eligible\s*:\s*true/i.test(text) || /verdict\s*:\s*\*?\*?(accept|accepted|pass)\b/i.test(text);
}
function checkPassed(check) {
  return Boolean(check)
    && check.passed !== false
    && !(Array.isArray(check.hardMissing) && check.hardMissing.length)
    && !(Array.isArray(check.errors) && check.errors.length);
}
function hardLocksPass(meta) {
  return checkPassed(meta.preApprovalLockCheck)
    && checkPassed(meta.copyLockCheck)
    && checkPassed(meta.postExportRequiredNounCheck);
}
function screenIdFromMeta(meta) { return meta.outputScreenId || meta.screenId || meta.inputScreenId || null; }

let args;
let page;
let breakpoint;
try {
  args = parseArgs(process.argv);
  page = safeToken(args.page, 'page');
  breakpoint = safeToken(args.breakpoint || 'mobile', 'breakpoint');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const projectRoot = path.resolve(args['project-root'] || process.cwd());
const candidateDir = args['candidate-dir'] ? path.resolve(args['candidate-dir']) : null;
const reviewFile = args['review-file'] ? path.resolve(args['review-file']) : path.join(projectRoot, '05-review', `${page}-review.md`);
if (!candidateDir) {
  console.error('usage: promote_candidate.mjs --project-root <dir> --page <page> --breakpoint <bp> --candidate-dir <dir> [--review-file <file>]');
  process.exit(1);
}
const pageRoot = path.join(projectRoot, '04-generated/stitch', page);
const attemptsRoot = path.join(pageRoot, 'attempts');
const runtimeRoot = path.join(pageRoot, 'runtime');
const candidateRuntime = path.join(candidateDir, 'runtime');
if (!isWithin(attemptsRoot, candidateDir)) {
  console.log(`CANDIDATE_OUTSIDE_ATTEMPTS ${candidateDir}`);
  process.exit(1);
}
const required = [`${breakpoint}.html`, `${breakpoint}.png`, `${breakpoint}.local.png`, `${breakpoint}.local.full.png`];
let ok = true;
for (const name of required) {
  const file = path.join(candidateDir, name);
  if (!await exists(file)) { console.log(`MISSING_CANDIDATE ${file}`); ok = false; }
}
const metaPath = path.join(candidateRuntime, `${breakpoint}.meta.json`);
if (!await exists(metaPath)) { console.log(`MISSING_CANDIDATE_META ${metaPath}`); ok = false; }
if (!await exists(reviewFile)) { console.log(`MISSING_REVIEW ${reviewFile}`); ok = false; }
if (!ok) process.exit(1);
const reviewText = await fs.readFile(reviewFile, 'utf8');
if (!acceptedReview(reviewText)) {
  console.log(`REVIEW_NOT_ACCEPTED ${reviewFile}`);
  process.exit(1);
}
const meta = await readJson(metaPath, {});
if (!hardLocksPass(meta)) {
  console.log(`LOCKS_NOT_PROMOTION_ELIGIBLE ${metaPath}`);
  process.exit(1);
}
const expectedPaths = {
  htmlPath: path.join(candidateDir, `${breakpoint}.html`),
  screenshot: path.join(candidateDir, `${breakpoint}.png`),
  local: path.join(candidateDir, `${breakpoint}.local.png`),
  full: path.join(candidateDir, `${breakpoint}.local.full.png`),
};
const metaPaths = [
  meta.htmlPath,
  meta.stitchCanvasScreenshot?.imagePath || meta.screenshotFallback?.imagePath || meta.imagePath,
  meta.localHtmlRender?.imagePath,
  meta.localHtmlRender?.fullImagePath,
].filter(Boolean).map((value) => path.resolve(value));
for (const expected of Object.values(expectedPaths)) {
  if (!metaPaths.some((value) => value === path.resolve(expected))) {
    console.log(`META_DOES_NOT_REFERENCE_CANDIDATE ${expected}`);
    ok = false;
  }
}
for (const name of required.filter((name) => name.endsWith('.png'))) {
  const stat = await fs.stat(path.join(candidateDir, name));
  if (stat.size < 100) { console.log(`SUSPICIOUS_SMALL_PNG ${path.join(candidateDir, name)}`); ok = false; }
}
if (!ok) process.exit(1);

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const archiveDir = path.join(runtimeRoot, 'archive', `${breakpoint}-${stamp}`);
await ensureDir(archiveDir);
for (const name of [...required, `${breakpoint}.prompt.md`]) {
  const dest = path.join(pageRoot, name);
  if (await exists(dest)) await fs.copyFile(dest, path.join(archiveDir, name));
  if (await exists(path.join(candidateDir, name))) await fs.copyFile(path.join(candidateDir, name), dest);
}
await ensureDir(runtimeRoot);
const promotedMetaPath = path.join(runtimeRoot, `${breakpoint}.meta.json`);
const promotedMeta = {
  ...meta,
  lifecycleState: 'accepted-promoted',
  promotedFromCandidateDir: candidateDir,
  promotedAt: new Date().toISOString(),
  htmlPath: path.join(pageRoot, `${breakpoint}.html`),
  promotedRootTriplet: {
    screenshot: path.join(pageRoot, `${breakpoint}.png`),
    localViewport: path.join(pageRoot, `${breakpoint}.local.png`),
    localFullPage: path.join(pageRoot, `${breakpoint}.local.full.png`),
  },
};
await writeJson(promotedMetaPath, promotedMeta);
const statePath = path.join(runtimeRoot, 'state.json');
const state = await readJson(statePath, { current: {}, approved: {} });
state.projectId = promotedMeta.projectId || state.projectId || null;
state.approved = state.approved || {};
state.approved[breakpoint] = {
  projectId: promotedMeta.projectId || state.projectId || state.current?.[breakpoint]?.projectId || null,
  screenId: screenIdFromMeta(promotedMeta) || state.current?.[breakpoint]?.screenId || null,
  breakpoint,
  outdir: pageRoot,
  candidateDir,
  metaPath: promotedMetaPath,
  reviewFile,
  promotedAt: promotedMeta.promotedAt,
};
state.updatedAt = new Date().toISOString();
await writeJson(statePath, state);
const lifecyclePath = path.join(runtimeRoot, 'lifecycle.json');
const lifecycle = await readJson(lifecyclePath, { events: [] });
lifecycle.events = lifecycle.events || [];
lifecycle.events.push({
  state: 'accepted-promoted',
  page,
  breakpoint,
  projectId: state.approved[breakpoint].projectId,
  screenId: state.approved[breakpoint].screenId,
  candidateDir,
  metaPath: promotedMetaPath,
  reviewFile,
  promotedAt: promotedMeta.promotedAt,
});
await writeJson(lifecyclePath, lifecycle);
process.stdout.write(JSON.stringify({ ok: true, pageRoot, breakpoint, candidateDir, reviewFile, statePath, lifecyclePath, metaPath: promotedMetaPath }, null, 2) + '\n');
