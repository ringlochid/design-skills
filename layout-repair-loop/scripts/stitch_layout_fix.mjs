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
} from './stitch_common.mjs';

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
const stitchRoot = paths.stitchRoot || (stateFile ? path.dirname(stateFile) : (outdir ? path.dirname(outdir) : null));

if (!htmlPath || !outdir || !stitchRoot) {
  console.error('usage: stitch_layout_fix.mjs --html-file <path> [--project-root <dir> --page <page-key> | --outdir <dir>] [--theme <theme-slug>] [--device-type MOBILE|TABLET|DESKTOP|AGNOSTIC] [--state-file <file>] [--pre-approval-lock-file <file>] [--copy-lock-file <file>] [--output-lock-file <file>] [--diagnostics-file <file>] [--responsive-plan-file <file>] [--responsive-map-file <legacy-file>] [--attempt 1|2] [--in-place true|false] [--confirm-in-place true] [--keep-attempts true|false] [--backup-original true|false]');
  process.exit(1);
}

const diagnosticsFile = args['diagnostics-file'] || path.join(outdir, `${artifactStem}.layout-diagnostics.json`);
let diagnostics = await readJsonIfExists(diagnosticsFile, null);
if (!diagnostics) {
  const diagnosed = await diagnoseLocalHtmlLayout({
    htmlPath,
    outdir,
    deviceType,
    stateFile,
    preApprovalLockFile: args['pre-approval-lock-file'] || null,
    copyLockFile: args['copy-lock-file'] || null,
    outputLockFile: args['output-lock-file'] || null,
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
    decision: 'contract-fix-first',
    legacyDecision: 'blocked',
    reason: (diagnostics.blockers || []).join(', ') || 'unknown blocker',
    diagnosticsFile,
  }, null, 2) + '\n');
  process.exit(0);
}

const fixesRoot = path.join(stitchRoot, 'layout-fixes', artifactStem);
const attemptDir = keepAttempts ? path.join(fixesRoot, `attempt-${attempt}`) : path.join(fixesRoot, 'current');
await ensureDir(fixesRoot);
if (!inPlace) await ensureDir(attemptDir);
const sourceBackupPath = path.join(fixesRoot, 'source-before-layout-fix.html');
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

const layoutRepairPath = path.join(fixesRoot, 'layout-repair.md');
await fs.writeFile(layoutRepairPath, `# Layout repair\n\n- Breakpoint: ${breakpoint}\n- Attempt: ${attempt}\n- Source html: ${path.resolve(htmlPath)}\n- Diagnostics file: ${path.resolve(diagnosticsFile)}\n- Selected strategies: ${(diagnostics.recommendedStrategies || []).join(', ') || 'none'}\n- Auto-fix allowed: ${diagnostics.safeToAutoFix ? 'yes' : 'no'}\n- Guardrail: preserve semantics and copy locks\n`);
await writeJson(path.join(fixesRoot, 'layout-diagnostics.json'), diagnostics);

const reviewOutdir = inPlace ? outdir : attemptDir;
const reviewed = await diagnoseLocalHtmlLayout({
  htmlPath: fixedHtmlPath,
  outdir: reviewOutdir,
  deviceType,
  stateFile,
  preApprovalLockFile: args['pre-approval-lock-file'] || null,
  copyLockFile: args['copy-lock-file'] || null,
  outputLockFile: args['output-lock-file'] || null,
  responsiveMapFile: args['responsive-plan-file'] || args['responsive-map-file'] || (paths.pageDir ? path.join(paths.pageDir, 'responsive-plan.md') : null),
  sourceLabel: `layout-fix-attempt-${attempt}`,
  viewport,
  localPatchApplied: true,
  localPatchStrategy: (diagnostics.recommendedStrategies || []).join(', ') || 'layout-fix-auto',
  pageKey: paths.pageKey,
  theme,
});

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
  diagnosticsFile: path.join(fixesRoot, 'layout-diagnostics.json'),
  reviewed,
  restoredAfterFailedReview,
}, null, 2) + '\n');
