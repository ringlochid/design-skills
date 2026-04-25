#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  parseArgs,
  resolveDesignPaths,
  viewportOptionsFromArgs,
  readJsonIfExists,
  writeJson,
  ensureDir,
  diagnoseLocalHtmlLayout,
  applyAutomatedLayoutFix,
  breakpointForDeviceType,
  artifactStemForOutdir,
} from '../../stitch-adapter/scripts/stitch_common.mjs';

function parseBooleanFlag(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (value === true) return true;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
function requiredNounMisses(check) {
  return (check?.hardMissing || []).filter((item) => item?.kind === 'requiredNoun' || /requirednoun/i.test(String(item?.kind || '')));
}

function stitchScreenIdFromMeta(meta = {}) {
  return meta.outputScreenId || meta.screenId || meta.inputScreenId || meta.derivedFromScreenId || meta.sourceStitchScreenId || null;
}

async function readSourceMetaForHtml({ htmlPath, outdir, artifactStem }) {
  const htmlDir = path.dirname(path.resolve(htmlPath));
  const candidates = [
    path.join(htmlDir, 'runtime', `${artifactStem}.meta.json`),
    path.join(path.resolve(outdir), 'runtime', `${artifactStem}.meta.json`),
  ];
  for (const candidate of candidates) {
    const meta = await readJsonIfExists(candidate, null);
    if (meta) return { path: candidate, meta };
  }
  return { path: null, meta: {} };
}

function canonicalOutdirForRepair({ outdir, htmlPath, sourceMeta = {} }) {
  if (sourceMeta.canonicalOutdir) return path.resolve(sourceMeta.canonicalOutdir);
  const resolvedOutdir = path.resolve(outdir);
  const marker = `${path.sep}attempts${path.sep}`;
  const fromOutdir = resolvedOutdir.indexOf(marker);
  if (fromOutdir !== -1) return resolvedOutdir.slice(0, fromOutdir);
  const resolvedHtml = path.resolve(htmlPath);
  const fromHtml = resolvedHtml.indexOf(marker);
  if (fromHtml !== -1) return resolvedHtml.slice(0, fromHtml);
  return resolvedOutdir;
}

const args = parseArgs(process.argv);
const htmlPath = args['html-file'] || args.html || null;
const deviceType = args['device-type'] || 'DESKTOP';
const attempt = Math.max(1, Number(args.attempt || 1));
const inPlace = parseBooleanFlag(args['in-place'], false);
const confirmInPlace = parseBooleanFlag(args['confirm-in-place'], false);
if (inPlace && !confirmInPlace) {
  console.error('Refusing --in-place true without --confirm-in-place true. Use candidate mode by default and promote only after review.');
  process.exit(1);
}
const keepAttempts = parseBooleanFlag(args['keep-attempts'], false);
const backupOriginal = parseBooleanFlag(args['backup-original'], true);
const paths = await resolveDesignPaths({
  projectRoot: args['project-root'] || null,
  configFile: args['config-file'] || null,
  page: args.page || null,
  outdir: args.outdir || null,
  stateFile: args['state-file'] || null,
  deviceType,
});
const outdir = paths.outdir;
const stateFile = paths.stateFile;
const breakpoint = breakpointForDeviceType(deviceType);
const theme = args.theme || args['theme-name'] || null;
const artifactStem = artifactStemForOutdir(outdir || process.cwd(), { deviceType, breakpoint, pageKey: paths.pageKey, theme }, { stateFile, pageKey: paths.pageKey, theme });
const viewport = viewportOptionsFromArgs(args, deviceType);
if (!htmlPath || !outdir) {
  console.error('usage: stitch_layout_fix.mjs --html-file <path> [--project-root <dir> --page <page-key> | --outdir <dir>] [--theme <theme-slug>] [--device-type MOBILE|TABLET|DESKTOP|AGNOSTIC] [--state-file <file>] [--pre-approval-lock-file <file>] [--copy-lock-file <file>] [--diagnostics-file <file>] [--responsive-plan-file <file>] [--responsive-map-file <legacy-file>] [--attempt 1|2] [--in-place true|false] [--confirm-in-place true] [--keep-attempts true|false] [--backup-original true|false]');
  process.exit(1);
}

const sourceMetaRecord = await readSourceMetaForHtml({ htmlPath, outdir, artifactStem });
const sourceMeta = sourceMetaRecord.meta || {};
const canonicalOutdir = canonicalOutdirForRepair({ outdir, htmlPath, sourceMeta });
const diagnosticsDir = path.join(canonicalOutdir, 'runtime', 'diagnostics');
await ensureDir(diagnosticsDir);
const diagnosticsFile = args['diagnostics-file'] || path.join(diagnosticsDir, `${artifactStem}.layout-diagnostics.json`);
let diagnostics = await readJsonIfExists(diagnosticsFile, null);
if (!diagnostics) {
  const diagnosed = await diagnoseLocalHtmlLayout({
    htmlPath,
    outdir: canonicalOutdir,
    deviceType,
    stateFile,
    preApprovalLockFile: args['pre-approval-lock-file'] || null,
    copyLockFile: args['copy-lock-file'] || null,
      responsiveMapFile: args['responsive-plan-file'] || args['responsive-map-file'] || (paths.pageDir ? path.join(paths.pageDir, 'responsive-plan.md') : null),
    sourceLabel: 'layout-fix-pre-diagnose',
    viewport,
    localPatchApplied: false,
    pageKey: paths.pageKey,
    theme,
  });
  diagnostics = diagnosed.diagnostics;
}

if (!diagnostics.safeToAutoFix) {
  process.stdout.write(JSON.stringify({
    breakpoint,
    attempt,
    decision: 'needs-source',
    legacyDecision: 'blocked',
    reason: (diagnostics.blockers || []).join(', ') || 'unknown blocker',
    diagnosticsFile,
  }, null, 2) + '\n');
  process.exit(0);
}

const attemptsRoot = path.join(canonicalOutdir, 'attempts');
const attemptStamp = new Date().toISOString().replace(/[:.]/g, '-');
const attemptLabel = keepAttempts ? `layout-fix-${breakpoint}-${attempt}` : `layout-fix-${breakpoint}-${attempt}-${attemptStamp}-${process.hrtime.bigint().toString()}`;
const attemptDir = path.join(attemptsRoot, attemptLabel);
const attemptRuntimeDir = path.join(attemptDir, 'runtime');
await ensureDir(attemptsRoot);
if (!inPlace) {
  await ensureDir(attemptDir);
  await ensureDir(attemptRuntimeDir);
}
const sourceBackupPath = path.join(diagnosticsDir, `${artifactStem}.source-before-layout-fix.html`);
const originalHtml = await fs.readFile(htmlPath, 'utf8');
const fixedHtml = applyAutomatedLayoutFix({ html: originalHtml, deviceType, diagnostics, attempt });
if (inPlace && backupOriginal && !await fileExists(sourceBackupPath)) {
  await fs.copyFile(htmlPath, sourceBackupPath).catch(() => {});
}
const fixedHtmlPath = inPlace ? path.resolve(htmlPath) : path.join(attemptDir, `${artifactStem}.html`);
await fs.writeFile(fixedHtmlPath, fixedHtml);
async function restoreInPlaceOnFailure() {
  if (inPlace && await fileExists(sourceBackupPath)) {
    await fs.copyFile(sourceBackupPath, path.resolve(htmlPath)).catch(() => {});
    return true;
  }
  return false;
}

const layoutRepairPath = path.join(inPlace ? diagnosticsDir : attemptDir, 'layout-repair.md');
await fs.writeFile(layoutRepairPath, `# Layout repair\n\n- Breakpoint: ${breakpoint}\n- Attempt: ${attempt}\n- Source html: ${path.resolve(htmlPath)}\n- Diagnostics file: ${path.resolve(diagnosticsFile)}\n- Selected strategies: ${(diagnostics.recommendedStrategies || []).join(', ') || 'none'}\n- Auto-fix allowed: ${diagnostics.safeToAutoFix ? 'yes' : 'no'}\n- Guardrail: preserve semantics and copy locks\n`);
await writeJson(path.join(inPlace ? diagnosticsDir : attemptRuntimeDir, 'layout-diagnostics.json'), diagnostics);

const reviewOutdir = inPlace ? canonicalOutdir : attemptDir;
const sourceScreenId = stitchScreenIdFromMeta(sourceMeta);
const reviewed = await diagnoseLocalHtmlLayout({
  htmlPath: fixedHtmlPath,
  outdir: reviewOutdir,
  deviceType,
  stateFile,
  preApprovalLockFile: args['pre-approval-lock-file'] || null,
  copyLockFile: args['copy-lock-file'] || null,
  responsiveMapFile: args['responsive-plan-file'] || args['responsive-map-file'] || (paths.pageDir ? path.join(paths.pageDir, 'responsive-plan.md') : null),
  sourceLabel: `layout-fix-attempt-${attempt}`,
  viewport,
  localPatchApplied: true,
  localPatchStrategy: (diagnostics.recommendedStrategies || []).join(', ') || 'layout-fix-auto',
  derivedFromScreenId: sourceScreenId,
  pageKey: paths.pageKey,
  theme,
});


if (!inPlace) {
  const candidateLocalPath = path.join(attemptDir, `${artifactStem}.local.png`);
  const candidateFullPath = path.join(attemptDir, `${artifactStem}.local.full.png`);
  const candidateIntentPath = path.join(attemptDir, `${artifactStem}.png`);
  if (reviewed.imagePath && await fileExists(reviewed.imagePath)) await fs.copyFile(reviewed.imagePath, candidateLocalPath);
  if (reviewed.fullImagePath && await fileExists(reviewed.fullImagePath)) await fs.copyFile(reviewed.fullImagePath, candidateFullPath);
  const sourceIntentPath = path.join(canonicalOutdir, `${artifactStem}.png`);
  if (await fileExists(sourceIntentPath)) await fs.copyFile(sourceIntentPath, candidateIntentPath);
  else if (await fileExists(candidateLocalPath)) await fs.copyFile(candidateLocalPath, candidateIntentPath);
  const metaPath = path.join(attemptRuntimeDir, `${artifactStem}.meta.json`);
  const meta = await readJsonIfExists(metaPath, {});
  const nounMisses = [
    ...requiredNounMisses(meta.preApprovalLockCheck),
    ...requiredNounMisses(meta.copyLockCheck),
  ];
  const traceScreenId = stitchScreenIdFromMeta(meta) || sourceScreenId;
  await writeJson(metaPath, {
    ...meta,
    projectId: meta.projectId || sourceMeta.projectId || null,
    screenId: meta.screenId || traceScreenId || null,
    inputScreenId: meta.inputScreenId || sourceMeta.inputScreenId || sourceMeta.screenId || sourceMeta.outputScreenId || null,
    derivedFromScreenId: meta.derivedFromScreenId || traceScreenId || null,
    sourceStitchScreenId: meta.sourceStitchScreenId || sourceScreenId || null,
    sourceMetaPath: meta.sourceMetaPath || sourceMetaRecord.path || null,
    lifecycleState: 'candidate-ready',
    screenshotSource: 'local-html-full-access-fallback',
    screenshotFallback: {
      reason: await fileExists(sourceIntentPath) ? 'layout-repair-derived-from-existing-intent-screenshot' : 'layout-repair-local-browser-fallback',
      releaseQuality: false,
      imagePath: candidateIntentPath,
      capturedAt: new Date().toISOString(),
    },
    htmlPath: fixedHtmlPath,
    localHtmlRender: {
      imagePath: candidateLocalPath,
      fullImagePath: candidateFullPath,
      source: 'full-access-local-html-render',
    },
    localPatchApplied: true,
    localPatchStrategy: (diagnostics.recommendedStrategies || []).join(', ') || 'layout-fix-auto',
    derivedFromScreenId: meta.derivedFromScreenId || traceScreenId || null,
    postExportRequiredNounCheck: {
      passed: nounMisses.length === 0,
      hardMissing: nounMisses,
      checkedAt: new Date().toISOString(),
      evidence: 'layout repair candidate local HTML lock checks',
    },
  });
}

const restoredAfterFailedReview = reviewed?.diagnostics?.safeToAutoFix === false ? await restoreInPlaceOnFailure() : false;

process.stdout.write(JSON.stringify({
  breakpoint,
  attempt,
  mode: inPlace ? 'in-place' : (keepAttempts ? 'attempt-dir' : 'candidate-dir'),
  attemptDir: inPlace ? null : attemptDir,
  reviewOutdir,
  sourceBackupPath: await fileExists(sourceBackupPath) ? sourceBackupPath : null,
  fixedHtmlPath,
  layoutRepairPath,
  diagnosticsFile: path.join(inPlace ? diagnosticsDir : attemptRuntimeDir, 'layout-diagnostics.json'),
  reviewed,
  restoredAfterFailedReview,
}, null, 2) + '\n');
