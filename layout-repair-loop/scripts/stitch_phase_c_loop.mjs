#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  parseArgs,
  resolveDesignPaths,
  viewportOptionsFromArgs,
  ensureDir,
  diagnoseLocalHtmlLayout,
  applyAutomatedLayoutFix,
  breakpointForDeviceType,
  writeJson,
} from './stitch_common.mjs';

function parseBooleanFlag(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (value === true) return true;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function legacyStatusFor(status) {
  if (status === 'clean') return 'accept';
  if (status === 'remap-required') return 'accept-with-debt';
  if (status === 'manual-polish-recommended') return 'manual-review-required';
  if (status === 'contract-fix-first') return 'blocked';
  if (status === 'running') return 'running';
  return status;
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function assessDiagnostics(diagnostics, deviceType, { stage = 'attempt' } = {}) {
  const findings = diagnostics?.findings || [];
  const highFindings = findings.filter((item) => item.severity === 'high');
  const mediumFindings = findings.filter((item) => item.severity === 'medium');
  const widthRatio = Number(diagnostics?.metrics?.widthRatio || 0);
  const strategies = diagnostics?.recommendedStrategies || [];
  const normalizedDevice = String(deviceType || 'DESKTOP').toUpperCase();

  if (!diagnostics?.safeToAutoFix) {
    return {
      status: 'contract-fix-first',
      reason: (diagnostics?.blockers || []).join(', ') || 'diagnostics-blocked',
    };
  }

  if (!highFindings.length && !mediumFindings.length && !strategies.length) {
    return { status: 'clean', reason: 'no remaining high-risk findings or repair strategies' };
  }

  if (
    normalizedDevice === 'DESKTOP'
    && !highFindings.length
    && !mediumFindings.length
    && widthRatio >= 0.9
    && strategies.length > 0
    && strategies.every((item) => item === 'desktop-adaptive-remap')
  ) {
    return { status: 'clean', reason: 'desktop breakpoint already satisfies the adaptive remap intent without remaining concrete findings' };
  }

  if (stage === 'source') {
    return {
      status: 'retry',
      reason: highFindings.length ? 'high-severity findings remain' : 'layout debt still visible before repair',
    };
  }

  if (normalizedDevice === 'DESKTOP' && !highFindings.length && widthRatio >= 0.82 && mediumFindings.length <= 1) {
    return { status: 'remap-required', reason: `desktop width ratio ${widthRatio} is serviceable after repair` };
  }

  if (normalizedDevice === 'TABLET' && !highFindings.length && mediumFindings.length <= 1) {
    return { status: 'remap-required', reason: 'tablet layout is serviceable after repair' };
  }

  return {
    status: 'retry',
    reason: highFindings.length ? 'high-severity findings remain' : 'layout debt still visible after repair',
  };
}

const args = parseArgs(process.argv);
const htmlPath = args['html-file'] || args.html || null;
const deviceType = args['device-type'] || 'DESKTOP';
const maxAttempts = Math.max(1, Math.min(2, Number(args['max-attempts'] || 2)));
const inPlace = parseBooleanFlag(args['in-place'], false);
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
const stitchRoot = paths.stitchRoot || (stateFile ? path.dirname(stateFile) : (outdir ? path.dirname(outdir) : null));
const viewport = viewportOptionsFromArgs(args, deviceType);
const responsiveMapFile = args['responsive-map-file'] || (stitchRoot ? path.join(stitchRoot, 'responsive-map.md') : null);
const preApprovalLockFile = args['pre-approval-lock-file'] || null;
const copyLockFile = args['copy-lock-file'] || null;
const outputLockFile = args['output-lock-file'] || null;

if (!htmlPath || !outdir || !stitchRoot) {
  console.error('usage: stitch_phase_c_loop.mjs --html-file <path> [--project-root <dir> --page <page-key> | --outdir <dir>] [--device-type MOBILE|TABLET|DESKTOP|AGNOSTIC] [--state-file <file>] [--pre-approval-lock-file <file>] [--copy-lock-file <file>] [--output-lock-file <file>] [--responsive-map-file <file>] [--max-attempts 1|2] [--in-place true|false] [--keep-attempts true|false] [--backup-original true|false]');
  process.exit(1);
}

const fixesRoot = path.join(stitchRoot, 'layout-fixes', breakpoint);
await ensureDir(fixesRoot);

const summaryPath = path.join(fixesRoot, 'phase-c-summary.json');
const sourceBackupPath = path.join(fixesRoot, 'source-before-phase-c.html');

async function flushSummary(summary) {
  await writeJson(summaryPath, summary);
  process.stdout.write(JSON.stringify({ ...summary, summaryPath }, null, 2) + '\n');
}

const sourceReview = await diagnoseLocalHtmlLayout({
  htmlPath,
  outdir,
  deviceType,
  stateFile,
  preApprovalLockFile,
  copyLockFile,
  outputLockFile,
  responsiveMapFile,
  sourceLabel: 'phase-c-loop-source',
  viewport,
  localPatchApplied: false,
});

const sourceAssessment = assessDiagnostics(sourceReview.diagnostics, deviceType, { stage: 'source' });
const summary = {
  status: sourceAssessment.status === 'contract-fix-first' ? 'contract-fix-first' : (sourceAssessment.status === 'clean' ? 'clean' : 'running'),
  legacyStatus: legacyStatusFor(sourceAssessment.status === 'retry' ? 'running' : sourceAssessment.status),
  breakpoint,
  mode: inPlace ? 'in-place' : (keepAttempts ? 'attempt-dirs' : 'candidate-dir'),
  keepAttempts,
  sourceHtmlPath: path.resolve(htmlPath),
  sourceBackupPath: null,
  sourceDiagnostics: sourceReview.diagnostics,
  sourceAssessment,
  attempts: [],
  final: null,
};

if (sourceAssessment.status === 'contract-fix-first') {
  summary.final = {
    decision: 'contract-fix-first',
    legacyDecision: 'blocked',
    reason: sourceAssessment.reason,
    nextStep: 'tighten semantic/copy/pre-approval assumptions or repo contract before more layout repair',
  };
  await flushSummary(summary);
  process.exit(0);
}

if (sourceAssessment.status === 'clean') {
  summary.final = {
    decision: 'clean',
    legacyDecision: 'accept',
    reason: sourceAssessment.reason,
    candidateHtmlPath: path.resolve(htmlPath),
    nextStep: 'no repair needed; keep the current exported breakpoint',
  };
  await flushSummary(summary);
  process.exit(0);
}

let currentHtmlPath = path.resolve(htmlPath);
let currentDiagnostics = sourceReview.diagnostics;

if (inPlace && backupOriginal && !await fileExists(sourceBackupPath)) {
  await fs.copyFile(currentHtmlPath, sourceBackupPath).catch(() => {});
  summary.sourceBackupPath = await fileExists(sourceBackupPath) ? sourceBackupPath : null;
}

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  const attemptDir = keepAttempts ? path.join(fixesRoot, `attempt-${attempt}`) : path.join(fixesRoot, 'current');
  if (!inPlace) await ensureDir(attemptDir);
  const sourceHtml = await fs.readFile(currentHtmlPath, 'utf8');
  const fixedHtml = applyAutomatedLayoutFix({
    html: sourceHtml,
    deviceType,
    diagnostics: currentDiagnostics,
    attempt,
  });
  const fixedHtmlPath = inPlace ? currentHtmlPath : path.join(attemptDir, 'screen.html');
  await fs.writeFile(fixedHtmlPath, fixedHtml);

  const reviewOutdir = inPlace ? outdir : attemptDir;

  const reviewed = await diagnoseLocalHtmlLayout({
    htmlPath: fixedHtmlPath,
    outdir: reviewOutdir,
    deviceType,
    stateFile,
    preApprovalLockFile,
    copyLockFile,
    outputLockFile,
    responsiveMapFile,
    sourceLabel: `phase-c-loop-attempt-${attempt}`,
    viewport,
    localPatchApplied: true,
    localPatchStrategy: (currentDiagnostics?.recommendedStrategies || []).join(', ') || 'phase-c-auto-fix',
  });
  const assessment = assessDiagnostics(reviewed.diagnostics, deviceType, { stage: 'attempt' });
  summary.attempts.push({
    attempt,
    mode: inPlace ? 'in-place' : (keepAttempts ? 'attempt-dir' : 'candidate-dir'),
    attemptDir: inPlace ? null : attemptDir,
    reviewOutdir,
    fixedHtmlPath,
    diagnostics: reviewed.diagnostics,
    assessment,
  });

  if (assessment.status === 'clean' || assessment.status === 'remap-required') {
    summary.status = assessment.status;
    summary.legacyStatus = legacyStatusFor(assessment.status);
    summary.final = {
      decision: assessment.status,
      legacyDecision: legacyStatusFor(assessment.status),
      reason: assessment.reason,
      candidateHtmlPath: fixedHtmlPath,
      candidateDir: inPlace ? null : reviewOutdir,
      nextStep: assessment.status === 'clean'
        ? 'keep the current exported breakpoint and continue'
        : 'keep breakpoint debt explicit or do one optional bounded polish pass',
    };
    await flushSummary(summary);
    process.exit(0);
  }

  currentHtmlPath = fixedHtmlPath;
  currentDiagnostics = reviewed.diagnostics;
}

summary.status = 'manual-polish-recommended';
summary.legacyStatus = 'manual-review-required';
summary.final = {
  decision: 'manual-polish-recommended',
  legacyDecision: 'manual-review-required',
  reason: 'deterministic repair attempts did not produce a clean/serviceable candidate within 2 passes',
  candidateHtmlPath: currentHtmlPath,
  nextStep: 'do one bounded human polish pass, tighten the contract, or refresh from Stitch reference before retrying',
};
await flushSummary(summary);
