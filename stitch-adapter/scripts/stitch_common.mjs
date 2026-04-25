#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadStitchSdk } from './stitch_sdk.mjs';
import { parseArgs, slugifyPageToken, pathExists, ensureDir, fetchToFile, readJsonIfExists, writeJson, patchJson } from './file_utils.mjs';
import { renderHtmlPreview } from './render_local.mjs';
import { normalizeDeviceType, breakpointForDeviceType, defaultViewportForDeviceType, viewportOptionsFromArgs } from './device_viewport.mjs';
import { buildLayoutDiagnostics, applyAutomatedLayoutFix } from './layout_diagnostics.mjs';
export { buildLayoutDiagnostics, applyAutomatedLayoutFix } from './layout_diagnostics.mjs';
export { normalizeDeviceType, breakpointForDeviceType, defaultViewportForDeviceType, viewportOptionsFromArgs } from './device_viewport.mjs';
export { renderHtmlPreview } from './render_local.mjs';
export { parseArgs, slugifyPageToken, workspaceRoot, pathExists, ensureDir, fetchToFile, readJsonIfExists, writeJson, patchJson } from './file_utils.mjs';
export { loadStitchSdk, availableApiKeys, createSdk, isRateLimitLikeError, withKeyFallback, normalizeStitchModelId, createOrOpenStitchProject } from './stitch_sdk.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizeOptionalPath(root, value) {
  if (!value) return null;
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(root, value);
}

export function normalizeBreakpointName(value, fallback = 'mobile') {
  if (!value) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['mobile', 'tablet', 'desktop', 'agnostic'].includes(normalized)) return normalized;
  return breakpointForDeviceType(normalized || fallback);
}

export async function discoverDesignProjectRoot({ projectRoot = null, configFile = null, startPath = null } = {}) {
  if (projectRoot) return path.resolve(projectRoot);
  if (configFile) return path.resolve(path.dirname(configFile), '..');
  const candidates = [startPath, process.cwd()].filter(Boolean).map((value) => path.resolve(value));
  for (const candidate of candidates) {
    let current = candidate;
    try {
      const stat = await fs.stat(candidate);
      if (!stat.isDirectory()) current = path.dirname(candidate);
    } catch {
      current = path.dirname(candidate);
    }
    while (true) {
      const v2ConfigPath = path.join(current, '00-product', 'design-config.json');
      const v2BriefPath = path.join(current, '00-product', 'brief.md');
      const v2SystemPath = path.join(current, '01-system', 'DESIGN.md');
      if (await pathExists(v2ConfigPath)) return current;
      if (await pathExists(v2BriefPath) || await pathExists(v2SystemPath)) return current;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return null;
}

export async function loadDesignProjectConfig({ projectRoot = null, configFile = null, startPath = null } = {}) {
  const resolvedProjectRoot = await discoverDesignProjectRoot({ projectRoot, configFile, startPath });
  const resolvedConfigFile = configFile
    ? path.resolve(configFile)
    : (resolvedProjectRoot ? path.join(resolvedProjectRoot, '00-product', 'design-config.json') : null);
  const defaults = {
    version: 2,
    projectRoot: resolvedProjectRoot,
    productDir: '00-product',
    metaDir: '00-product',
    pagesDir: '02-pages',
    referencesDir: '03-references',
    generatedDir: '04-generated',
    reviewDir: '05-review',
    handoffDir: '06-handoff',
    policyFile: '00-product/design-policy.md',
    runtimeDir: '04-generated/stitch',
    designSystemDir: '01-system',
    primaryBreakpoint: 'mobile',
    enabledBreakpoints: ['mobile', 'tablet', 'desktop'],
    themeStrategy: 'single-theme',
    repoAwarenessMode: 'inspect-only',
    designSystemMode: 'create-new',
    stitch: {
      globalSessionIndex: null,
      projectRuntime: null,
      generatedRoot: '04-generated/stitch',
    },
    repoAware: {
      repoRoot: null,
      frontendRoot: null,
      routesPath: [],
      componentRoots: [],
      designSystemPaths: [],
      tokenFiles: [],
    },
  };
  let loaded = {};
  if (resolvedConfigFile && await pathExists(resolvedConfigFile)) {
    loaded = JSON.parse(await fs.readFile(resolvedConfigFile, 'utf8'));
  }
  const finalProjectRoot = resolvedProjectRoot || loaded.projectRoot || null;
  const metaDir = loaded.metaDir || defaults.metaDir;
  const pagesDir = loaded.pagesDir || defaults.pagesDir;
  const policyFile = loaded.policyFile || defaults.policyFile;
  const runtimeDir = loaded.runtimeDir || defaults.runtimeDir;
  const designSystemDir = loaded.designSystemDir || defaults.designSystemDir;
  const repoAware = {
    ...defaults.repoAware,
    ...(loaded.repoAware || {}),
  };
  const stitch = {
    ...defaults.stitch,
    ...(loaded.stitch || {}),
  };
  const config = {
    ...defaults,
    ...loaded,
    projectRoot: finalProjectRoot,
    metaDir,
    pagesDir,
    policyFile,
    runtimeDir,
    designSystemDir,
    primaryBreakpoint: normalizeBreakpointName(loaded.primaryBreakpoint || defaults.primaryBreakpoint, defaults.primaryBreakpoint),
    enabledBreakpoints: Array.isArray(loaded.enabledBreakpoints) && loaded.enabledBreakpoints.length
      ? loaded.enabledBreakpoints.map((value) => normalizeBreakpointName(value)).filter(Boolean)
      : defaults.enabledBreakpoints,
    themeStrategy: loaded.themeStrategy || defaults.themeStrategy,
    repoAwarenessMode: loaded.repoAwarenessMode || defaults.repoAwarenessMode,
    designSystemMode: loaded.designSystemMode || defaults.designSystemMode,
    stitch,
    repoAware,
  };
  config.configFile = resolvedConfigFile;
  config.metaRoot = finalProjectRoot ? path.join(finalProjectRoot, metaDir) : null;
  config.pagesRoot = finalProjectRoot ? path.join(finalProjectRoot, pagesDir) : null;
  config.policyFilePath = finalProjectRoot ? normalizeOptionalPath(finalProjectRoot, policyFile) : null;
  config.runtimeRoot = finalProjectRoot ? normalizeOptionalPath(finalProjectRoot, runtimeDir) : null;
  config.designSystemRoot = finalProjectRoot ? normalizeOptionalPath(finalProjectRoot, designSystemDir) : null;
  config.stitch.globalSessionIndexPath = finalProjectRoot
    ? normalizeOptionalPath(finalProjectRoot, stitch.globalSessionIndex)
    : null;
  config.stitch.projectRuntimePath = finalProjectRoot
    ? normalizeOptionalPath(finalProjectRoot, stitch.projectRuntime)
    : null;
  config.repoAware.repoRootPath = finalProjectRoot
    ? normalizeOptionalPath(finalProjectRoot, repoAware.repoRoot)
    : null;
  config.repoAware.frontendRootPath = finalProjectRoot
    ? normalizeOptionalPath(finalProjectRoot, repoAware.frontendRoot)
    : null;
  config.repoAware.routesPaths = (repoAware.routesPath || []).map((value) => normalizeOptionalPath(finalProjectRoot, value)).filter(Boolean);
  config.repoAware.componentRootPaths = (repoAware.componentRoots || []).map((value) => normalizeOptionalPath(finalProjectRoot, value)).filter(Boolean);
  config.repoAware.designSystemPathList = (repoAware.designSystemPaths || []).map((value) => normalizeOptionalPath(finalProjectRoot, value)).filter(Boolean);
  config.repoAware.tokenFilePaths = (repoAware.tokenFiles || []).map((value) => normalizeOptionalPath(finalProjectRoot, value)).filter(Boolean);
  return config;
}

export async function resolvePageDirectory({ projectRoot = null, config = null, page = null } = {}) {
  if (!page) return null;
  const activeConfig = config || await loadDesignProjectConfig({ projectRoot });
  const pagesRoot = activeConfig?.pagesRoot;
  if (path.isAbsolute(page) && await pathExists(page)) {
    const resolved = path.resolve(page);
    const normalizedPagesRoot = pagesRoot ? `${path.resolve(pagesRoot)}${path.sep}` : null;
    if (!normalizedPagesRoot || !resolved.startsWith(normalizedPagesRoot)) {
      throw new Error(`Refusing to use absolute page path outside configured pages root: ${resolved}`);
    }
    return {
      pageKey: path.basename(resolved),
      pageSlug: slugifyPageToken(path.basename(resolved).replace(/^\d+-/, '')),
      pageDir: resolved,
    };
  }
  if (!pagesRoot || !await pathExists(pagesRoot)) {
    throw new Error(`Unable to resolve page directory because pages root is missing: ${pagesRoot || '(unknown)'}`);
  }
  const requested = String(page).trim();
  const requestedSlug = slugifyPageToken(requested.replace(/^\d+-/, ''));
  const entries = await fs.readdir(pagesRoot, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const directMatch = dirs.find((entry) => entry === requested);
  const slugMatch = dirs.find((entry) => slugifyPageToken(entry.replace(/^\d+-/, '')) === requestedSlug);
  const match = directMatch || slugMatch;
  if (!match) {
    throw new Error(`Unable to resolve page "${page}" under ${pagesRoot}`);
  }
  return {
    pageKey: match,
    pageSlug: slugifyPageToken(match.replace(/^\d+-/, '')),
    pageDir: path.join(pagesRoot, match),
  };
}

export function inferPageKeyFromStatePath(statePath, pagesDirName = '02-pages') {
  if (!statePath) return null;
  const resolved = path.resolve(statePath);
  const parts = resolved.split(path.sep).filter(Boolean);
  const pageRootName = path.basename(pagesDirName);
  const pageIndex = parts.findIndex((part) => part === pageRootName);
  if (pageIndex >= 0 && parts[pageIndex + 1]) return parts[pageIndex + 1];
  const generatedIndex = parts.findIndex((part, index) => part === 'stitch' && parts[index - 1] === '04-generated');
  if (generatedIndex >= 0 && parts[generatedIndex + 1]) return parts[generatedIndex + 1];
  return null;
}

export async function resolveDesignPaths({ projectRoot = null, configFile = null, page = null, outdir = null, stateFile = null, deviceType = 'MOBILE', startPath = null } = {}) {
  const config = await loadDesignProjectConfig({ projectRoot, configFile, startPath: startPath || outdir || stateFile || process.cwd() });
  const resolvedPage = page ? await resolvePageDirectory({ projectRoot: config.projectRoot, config, page }) : null;
  const breakpoint = breakpointForDeviceType(deviceType);
  const generatedRoot = config.projectRoot ? normalizeOptionalPath(config.projectRoot, config.stitch?.generatedRoot || '04-generated/stitch') : null;
  const stitchRoot = resolvedPage && generatedRoot ? path.join(generatedRoot, resolvedPage.pageKey) : null;
  const resolvedStateFile = stateFile
    ? path.resolve(stateFile)
    : (stitchRoot ? path.join(stitchRoot, 'runtime', 'state.json') : (outdir ? inferStatePath({ outdir }) : null));
  const resolvedOutdir = outdir
    ? path.resolve(outdir)
    : stitchRoot;
  return {
    config,
    projectRoot: config.projectRoot,
    primaryBreakpoint: config.primaryBreakpoint,
    enabledBreakpoints: config.enabledBreakpoints,
    pageKey: resolvedPage?.pageKey || inferPageKeyFromStatePath(resolvedStateFile, config.pagesDir),
    pageSlug: resolvedPage?.pageSlug || null,
    pageDir: resolvedPage?.pageDir || null,
    stitchRoot,
    outdir: resolvedOutdir,
    stateFile: resolvedStateFile,
    globalSessionIndexPath: null,
  };
}

export async function loadProjectRuntime({ projectRoot = null, config = null, startPath = null } = {}) {
  const activeConfig = config || await loadDesignProjectConfig({ projectRoot, startPath });
  const startProjectRoot = startPath ? findLikelyStitchRoot(startPath) : null;
  const pageRuntimePath = startProjectRoot ? path.join(startProjectRoot, 'runtime', 'project.json') : null;
  const runtimePath = pageRuntimePath
    || activeConfig?.stitch?.projectRuntimePath
    || (activeConfig?.runtimeRoot ? path.join(activeConfig.runtimeRoot, 'runtime', 'project.json') : null);
  const current = runtimePath ? await readJsonIfExists(runtimePath, {}) : {};
  return {
    runtimePath,
    runtime: {
      version: current?.version || 1,
      projectId: current?.projectId || null,
      designSystem: current?.designSystem || null,
      updatedAt: current?.updatedAt || null,
    },
    config: activeConfig,
  };
}

export async function saveProjectRuntime(runtimePath, runtime) {
  if (!runtimePath) return;
  await writeJson(runtimePath, {
    version: 1,
    projectId: runtime?.projectId || null,
    designSystem: runtime?.designSystem || null,
    updatedAt: new Date().toISOString(),
  });
}

async function refreshRepoStatusIfPossible(config, repoStatusPath) {
  if (!config?.projectRoot || !repoStatusPath) return null;
  const requiredDirs = ['00-product', '01-system', '02-pages', '03-references', '04-generated', '05-review', '06-handoff'];
  const requiredFiles = ['00-product/brief.md', '01-system/DESIGN.md', '00-product/design-policy.md', '00-product/source-inventory.md'];
  const status = {
    projectRoot: config.projectRoot,
    missingDirs: [],
    missingFiles: [],
    ready: false,
    designWorkspaceSignals: { designWorkspaceReady: true },
    checkedAt: new Date().toISOString(),
    refreshedBy: 'assertPhaseZeroReady',
  };
  for (const rel of requiredDirs) {
    const target = path.join(config.projectRoot, rel);
    try {
      const stat = await fs.stat(target);
      if (!stat.isDirectory()) status.missingDirs.push(rel);
    } catch {
      status.missingDirs.push(rel);
    }
  }
  for (const rel of requiredFiles) {
    const target = path.join(config.projectRoot, rel);
    try {
      const text = await fs.readFile(target, 'utf8');
      if (!text.trim() || /\bTODO\b/i.test(text) || /Draft required before generation/i.test(text)) status.missingFiles.push(rel);
    } catch {
      status.missingFiles.push(rel);
    }
  }
  status.ready = status.missingDirs.length === 0 && status.missingFiles.length === 0;
  if (status.ready) await writeJson(repoStatusPath, status);
  return status;
}

export async function assertPhaseZeroReady({ projectRoot = null, configFile = null, startPath = null, requireRepoContext = true } = {}) {
  const config = await loadDesignProjectConfig({ projectRoot, configFile, startPath });
  if (!config.projectRoot) {
    throw new Error('Unable to resolve design project root for Phase 0 context. Provide --project-root or run from inside a design workspace.');
  }

  const warnings = [];
  if (!config.configFile || !await pathExists(config.configFile)) warnings.push(config.configFile || '00-product/design-config.json');
  if (!config.policyFilePath || !await pathExists(config.policyFilePath)) warnings.push(config.policyFilePath || '00-product/design-policy.md');

  const repoStatusPath = config.metaRoot ? path.join(config.metaRoot, 'repo-status.json') : null;
  const repoContextPath = config.metaRoot ? path.join(config.metaRoot, 'repo-context.json') : null;
  const shouldRequireRepoOutputs = requireRepoContext && config.repoAwarenessMode !== 'ignore-repo';
  if (shouldRequireRepoOutputs) {
    if (!repoStatusPath || !await pathExists(repoStatusPath)) warnings.push(repoStatusPath || '00-product/repo-status.json');
    if (!repoContextPath || !await pathExists(repoContextPath)) warnings.push(repoContextPath || '00-product/source-inventory.md');
  }

  let repoStatus = repoStatusPath ? await readJsonIfExists(repoStatusPath, null) : null;
  if (requireRepoContext && repoStatus && repoStatus.ready !== true) {
    const refreshed = await refreshRepoStatusIfPossible(config, repoStatusPath);
    if (refreshed?.ready === true) repoStatus = refreshed;
  }
  if (requireRepoContext && repoStatus && repoStatus.ready !== true) {
    const missing = [
      ...(repoStatus.missingDirs || []),
      ...(repoStatus.missingFiles || []),
    ];
    throw new Error(`Phase 0 repo preflight is not ready${missing.length ? `: ${missing.join(', ')}` : ''}`);
  }

  const designWorkspaceReady = Boolean(
    repoStatus?.designWorkspaceSignals?.designWorkspaceReady
    || repoStatus?.designWorkspace?.ready
    || (config.pagesRoot && await pathExists(config.pagesRoot))
    || (config.projectRoot && await pathExists(path.join(config.projectRoot, 'ROADMAP.md')))
  );

  if (config.repoAwarenessMode === 'init-required' && !designWorkspaceReady) {
    throw new Error('Phase 0 currently marks repoAwarenessMode=init-required and no usable design workspace scaffold was detected. Add ROADMAP/pages structure or switch to a softer repo-awareness mode.');
  }
  if (repoStatus?.recommendedMode === 'init-required' && config.repoAwarenessMode !== 'ignore-repo' && !designWorkspaceReady) {
    throw new Error('Repo preflight still says init is required and no usable design workspace scaffold was detected. Add ROADMAP/pages structure or refresh repo-awareness settings.');
  }
  if (warnings.length && requireRepoContext) {
    throw new Error(`Phase 0 context incomplete: ${warnings.join(', ')}`);
  }
  return { config, repoStatus, warnings };
}

export async function syncGlobalStitchSessionIndex({ projectRoot = null, globalSessionIndexPath = null, statePath, state, primaryBreakpoint = null, designSystem = null } = {}) {
  const resolvedProjectRoot = projectRoot || await discoverDesignProjectRoot({ startPath: statePath });
  if (!resolvedProjectRoot) return null;
  const config = await loadDesignProjectConfig({ projectRoot: resolvedProjectRoot, startPath: statePath }).catch(() => null);
  const { runtime } = await loadProjectRuntime({ projectRoot: resolvedProjectRoot, config, startPath: statePath }).catch(() => ({ runtime: null }));
  const pageRuntimeDir = statePath ? path.dirname(path.resolve(statePath)) : null;
  const indexPath = globalSessionIndexPath || (pageRuntimeDir ? path.join(pageRuntimeDir, 'stitch-sessions.json') : config?.stitch?.globalSessionIndexPath || path.join(resolvedProjectRoot, '04-generated', 'stitch', 'runtime', 'stitch-sessions.json'));
  const current = await readJsonIfExists(indexPath, {
    version: 1,
    projectRoot: resolvedProjectRoot,
    pages: {},
    updatedAt: null,
  });
  const pageKey = inferPageKeyFromStatePath(statePath, config?.pagesDir || '02-pages');
  if (!pageKey) return indexPath;
  current.pages = current.pages || {};
  current.pages[pageKey] = {
    statePath: path.resolve(statePath),
    primaryBreakpoint: normalizeBreakpointName(primaryBreakpoint || config?.primaryBreakpoint || 'mobile', 'mobile'),
    projectId: state.projectId || runtime?.projectId || null,
    designSystem: designSystem || runtime?.designSystem || null,
    current: state.current || {},
    approved: state.approved || {},
    updatedAt: new Date().toISOString(),
  };
  current.updatedAt = new Date().toISOString();
  await writeJson(indexPath, current);
  return indexPath;
}

export async function readPrompt(promptFile) {
  return await fs.readFile(promptFile, 'utf8');
}

function promptIncludesEvery(prompt, requiredSnippets = []) {
  const lower = String(prompt || '').toLowerCase();
  return requiredSnippets.filter((snippet) => !lower.includes(String(snippet || '').toLowerCase()));
}

export async function assertPromptPacketReadyForStitch({
  promptFile,
  prompt = null,
  outdir,
  stateFile = null,
  mode = 'generate',
  promptStage = 'generic',
  preApprovalLockFile = null,
  copyLockFile = null,
} = {}) {
  const promptText = String(prompt || '').trim();
  const stage = String(promptStage || mode || 'generic').trim().toLowerCase();
  const errors = [];

  if (!promptFile || !await pathExists(promptFile)) {
    errors.push(`prompt file missing: ${promptFile || '[none]'}`);
  }
  if (!promptText) {
    errors.push('prompt is empty');
  }

  const requiredSnippets = [];
  if (stage.includes('generate')) {
    requiredSnippets.push('design the', 'non-negotiables:', 'responsive intent:', 'visual direction:', 'layout and semantic requirements:', 'exact visible copy and labels:');
  }
  if (stage.includes('repair')) {
    if (stage.includes('remap') || stage.includes('edit')) {
      requiredSnippets.push('page-specific product rules:', 'theme system rules:');
    } else {
      requiredSnippets.push('page-specific guardrails:');
    }
  }
  if (stage.includes('remap')) {
    requiredSnippets.push('responsive rules:', 'page-specific product rules:', 'theme system rules:');
  }
  const missingSnippets = promptIncludesEvery(promptText, requiredSnippets);
  if (missingSnippets.length) {
    errors.push(`prompt missing required sections: ${missingSnippets.join(', ')}`);
  }
  if (!/theme strategy:/i.test(promptText)) {
    errors.push('prompt missing explicit theme strategy line');
  }
  if (!/role access:/i.test(promptText)) {
    errors.push('prompt missing explicit role access line');
  }
  if (!/route candidate:/i.test(promptText)) {
    errors.push('prompt missing explicit route candidate line');
  }
  if (/^#\s*stitch prompt/im.test(promptText) || /copy locks:/i.test(promptText)) {
    errors.push('prompt contains internal Stitch packet/debug scaffolding; send a clean design prompt instead');
  }

  const preApproval = await loadPreApprovalLock({ outdir, stateFile, preApprovalLockFile });
  const copy = await loadCopyLock({ outdir, stateFile, copyLockFile });
  if (stage.includes('generate') && !preApproval.preApprovalLock) {
    errors.push(`missing pre-approval lock: ${preApproval.preApprovalLockPath}`);
  }
  if (stage.includes('generate') && !copy.copyLock) {
    errors.push(`missing copy lock: ${copy.copyLockPath}`);
  }
  if (stage.includes('remap') && !copy.copyLock) {
    errors.push(`missing copy lock: ${copy.copyLockPath}`);
  }
  if ((stage.includes('edit') || stage.includes('repair')) && !copy.copyLock) {
    errors.push(`missing copy lock: ${copy.copyLockPath}`);
  }
  if ((stage.includes('remap') || stage.includes('repair')) && outdir) {
    const responsivePlanPath = path.join(path.dirname(path.dirname(path.resolve(outdir))), '02-pages', path.basename(path.resolve(outdir)), 'responsive-plan.md');
    const inferredRoot = await discoverDesignProjectRoot({ startPath: outdir }).catch(() => null);
    const inferredPageKey = path.basename(path.resolve(outdir));
    const planPath = inferredRoot ? path.join(inferredRoot, '02-pages', inferredPageKey, 'responsive-plan.md') : responsivePlanPath;
    if (!await pathExists(planPath)) errors.push(`missing responsive plan for remap/repair: ${planPath}`);
  }
  const lockSource = copy.copyLock || preApproval.preApprovalLock || null;
  if (lockSource?.siteTitle && !new RegExp(lockSource.siteTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(promptText)) {
    errors.push(`prompt missing locked site title: ${lockSource.siteTitle}`);
  }
  if (lockSource?.pageTitle && !new RegExp(lockSource.pageTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(promptText)) {
    errors.push(`prompt missing locked page title: ${lockSource.pageTitle}`);
  }

  if (errors.length) {
    throw new Error(`Prompt packet failed pre-Stitch gate (${stage}): ${errors.join(' | ')}`);
  }

  return {
    ok: true,
    promptFile: path.resolve(promptFile),
    promptStage: stage,
    preApprovalLockPath: preApproval.preApprovalLockPath || null,
    copyLockPath: copy.copyLockPath || null,
  };
}

function stripMarkdownFence(markdown) {
  if (!markdown) return '';
  const trimmed = String(markdown).trim();
  const match = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  return match ? match[1].trim() : trimmed;
}

const DEFAULT_SEMANTIC_DRIFT_TERMS = [
  'archive',
  'archival',
  'curator',
  'curated sanctuary',
  'monograph',
  'monographs',
  'bibliography',
  'monolith',
  'monoliths',
  'follow the threads',
  'scholarly',
  'private archival library',
];

function extractMarkdownSections(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const sections = [];
  let current = { heading: null, lines: [] };
  const pushCurrent = () => {
    if (current.heading || current.lines.some((line) => line.trim())) {
      sections.push(current);
    }
  };
  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line)) {
      pushCurrent();
      current = { heading: line.replace(/^#{1,6}\s+/, '').trim(), lines: [line] };
      continue;
    }
    current.lines.push(line);
  }
  pushCurrent();
  return sections;
}

function filterSemanticDriftLines(lines, bannedTerms = DEFAULT_SEMANTIC_DRIFT_TERMS) {
  return lines.filter((line) => {
    const lower = line.toLowerCase();
    return !bannedTerms.some((term) => lower.includes(term));
  });
}

function extractStyleOnlyMarkdown(markdown) {
  const clean = stripMarkdownFence(markdown);
  const sections = extractMarkdownSections(clean);
  const allowedHeading = /(color|typography|spacing|surface|elevation|depth|component|button|input|card|collection|metadata|layout|shadow|interaction|texture|do's and don'ts|dos and don'ts)/i;
  const blockedHeading = /(overview|creative north star|voice|tone|brand story|narrative)/i;
  const kept = sections
    .filter((section) => {
      if (!section.heading) return false;
      if (blockedHeading.test(section.heading)) return false;
      return allowedHeading.test(section.heading);
    })
    .map((section) => ({
      ...section,
      lines: filterSemanticDriftLines(section.lines),
    }))
    .filter((section) => section.lines.some((line) => line.trim()));
  if (!kept.length) {
    return filterSemanticDriftLines(clean.split(/\r?\n/)).join('\n').trim();
  }
  return kept.map((section) => section.lines.join('\n').trim()).filter(Boolean).join('\n\n').trim();
}

function findLikelyStitchRoot(targetPath) {
  const resolved = path.resolve(targetPath);
  const parts = resolved.split(path.sep).filter(Boolean);
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    const next = parts[i + 1];
    // v2 repo structure only: .../04-generated/stitch/<page>[/artifact]
    if (part === 'stitch' && parts[i - 1] === '04-generated' && parts[i + 1]) {
      return `${path.sep}${path.join(...parts.slice(0, i + 2))}`;
    }
  }
  return null;
}

export function stitchRootForOutdir({ outdir, stateFile } = {}) {
  if (outdir) {
    const found = findLikelyStitchRoot(outdir);
    if (found) return found;
  }
  if (stateFile) {
    const resolved = path.resolve(stateFile);
    const dir = path.dirname(resolved);
    return path.basename(dir) === 'runtime' ? path.dirname(dir) : dir;
  }
  return path.dirname(path.dirname(inferStatePath({ outdir, stateFile })));
}

export function semanticRulesPathForOutdir({ outdir, stateFile } = {}) {
  return path.join(runtimeDirForOutdir(stitchRootForOutdir({ outdir, stateFile })), 'semantic-rules.json');
}

export function preApprovalLockPathForOutdir({ outdir, stateFile, preApprovalLockFile } = {}) {
  if (preApprovalLockFile) return path.resolve(preApprovalLockFile);
  return path.join(stitchRootForOutdir({ outdir, stateFile }), 'locks', 'pre-approval-lock.md');
}

export function copyLockPathForOutdir({ outdir, stateFile, copyLockFile } = {}) {
  if (copyLockFile) return path.resolve(copyLockFile);
  return path.join(stitchRootForOutdir({ outdir, stateFile }), 'locks', 'copy-lock.md');
}

export function inferStatePath({ outdir, stateFile } = {}) {
  if (stateFile) return path.resolve(stateFile);
  if (!outdir) throw new Error('inferStatePath requires outdir or stateFile.');
  const stitchRoot = findLikelyStitchRoot(outdir);
  if (stitchRoot) return path.join(runtimeDirForOutdir(stitchRoot), 'state.json');
  const resolved = path.resolve(outdir);
  const base = path.basename(resolved).toLowerCase();
  const parent = path.dirname(resolved);
  const parentBase = path.basename(parent).toLowerCase();
  const breakpointDirs = new Set(['mobile', 'tablet', 'desktop', 'agnostic']);
  if (breakpointDirs.has(base)) return path.join(runtimeDirForOutdir(parent), 'state.json');
  if (base === 'variants' && breakpointDirs.has(parentBase)) return path.join(runtimeDirForOutdir(path.dirname(parent)), 'state.json');
  if (/^variant-\d+$/.test(base) && parentBase === 'variants') {
    const breakpointDir = path.dirname(parent);
    if (breakpointDirs.has(path.basename(breakpointDir).toLowerCase())) {
      return path.join(runtimeDirForOutdir(path.dirname(breakpointDir)), 'state.json');
    }
  }
  return path.join(runtimeDirForOutdir(resolved), 'state.json');
}

export function compactProjectScreenRecord(screen, fallback = {}) {
  if (!screen && !fallback?.screenId) return null;
  const source = screen?.screen || screen;
  const index = Number.isFinite(screen?.index)
    ? screen.index
    : (Number.isFinite(fallback?.index) ? fallback.index : null);
  const screenId = screen?.screenId
    || screen?.id
    || source?.screenId
    || source?.id
    || fallback?.screenId
    || null;
  if (!screenId) return null;
  return {
    index,
    screenId,
    title: screen?.title ?? source?.data?.title ?? fallback?.title ?? null,
    deviceType: normalizeDeviceType(screen?.deviceType ?? source?.data?.deviceType ?? fallback?.deviceType ?? 'DEVICE_TYPE_UNSPECIFIED'),
    width: Number(screen?.width ?? source?.data?.width ?? fallback?.width ?? 0) || null,
    height: Number(screen?.height ?? source?.data?.height ?? fallback?.height ?? 0) || null,
  };
}

export async function writeProjectScreenInventory({ inventoryPath, projectId, screens = [], mergeScreens = [] } = {}) {
  if (!inventoryPath || !projectId) return null;
  const current = await readJsonIfExists(inventoryPath, { version: 1, projectId, screens: [] });
  const byId = new Map();

  const upsert = (item, fallback = {}) => {
    const record = compactProjectScreenRecord(item, fallback);
    if (!record?.screenId) return;
    const previous = byId.get(record.screenId) || null;
    byId.set(record.screenId, {
      index: record.index ?? previous?.index ?? null,
      screenId: record.screenId,
      title: record.title ?? previous?.title ?? null,
      deviceType: record.deviceType ?? previous?.deviceType ?? null,
      width: record.width ?? previous?.width ?? null,
      height: record.height ?? previous?.height ?? null,
    });
  };

  for (const item of current?.screens || []) upsert(item);
  for (const item of screens || []) upsert(item);
  for (const item of mergeScreens || []) upsert(item);

  const payload = {
    version: 1,
    projectId,
    updatedAt: new Date().toISOString(),
    screens: [...byId.values()].sort((a, b) => {
      const aIndex = Number.isFinite(a.index) ? a.index : Number.POSITIVE_INFINITY;
      const bIndex = Number.isFinite(b.index) ? b.index : Number.POSITIVE_INFINITY;
      if (aIndex !== bIndex) return aIndex - bIndex;
      const titleOrder = String(a.title || '').localeCompare(String(b.title || ''));
      if (titleOrder !== 0) return titleOrder;
      return String(a.screenId || '').localeCompare(String(b.screenId || ''));
    }),
  };
  await writeJson(inventoryPath, payload);
  return payload;
}

export async function loadStitchState({ outdir, stateFile } = {}) {
  const statePath = inferStatePath({ outdir, stateFile });
  const current = await readJsonIfExists(statePath, {});
  return {
    statePath,
    state: {
      version: current?.version || 3,
      projectId: current?.projectId || null,
      current: current?.current || {},
      approved: current?.approved || {},
      updatedAt: current?.updatedAt || null,
    },
  };
}

export async function saveStitchState(statePath, state) {
  await writeJson(statePath, {
    version: 3,
    projectId: state.projectId || null,
    current: state.current || {},
    approved: state.approved || {},
    updatedAt: new Date().toISOString(),
  });
}

export async function resolveStitchSelectionFromState({ outdir, stateFile, projectId = null, screenId = null, deviceType = 'MOBILE', mode = 'edit', sourcePreference = 'auto', primaryBreakpoint = null } = {}) {
  if (projectId && screenId) {
    return { projectId, screenId, source: 'explicit', statePath: inferStatePath({ outdir, stateFile }) };
  }
  const { statePath, state } = await loadStitchState({ outdir, stateFile });
  const breakpoint = breakpointForDeviceType(deviceType);
  const current = state.current || {};
  const approved = state.approved || {};
  const normalizedSourcePreference = String(sourcePreference || 'auto').trim().toLowerCase();
  const primary = normalizeBreakpointName(primaryBreakpoint || 'mobile', 'mobile');

  const lookupFromPreference = (preference) => {
    if (!preference || preference === 'auto') return null;
    if (preference === 'approved-primary') return approved[primary]?.screenId ? { chosen: approved[primary], source: `state.approved.${primary}` } : null;
    if (preference === 'current-primary') return current[primary]?.screenId ? { chosen: current[primary], source: `state.current.${primary}` } : null;
    if (preference.startsWith('approved-')) {
      const bp = normalizeBreakpointName(preference.slice('approved-'.length), primary);
      return approved[bp]?.screenId ? { chosen: approved[bp], source: `state.approved.${bp}` } : null;
    }
    if (preference.startsWith('current-')) {
      const bp = normalizeBreakpointName(preference.slice('current-'.length), primary);
      return current[bp]?.screenId ? { chosen: current[bp], source: `state.current.${bp}` } : null;
    }
    if (preference === 'approved-mobile' && approved.mobile?.screenId) return { chosen: approved.mobile, source: 'state.approved.mobile' };
    if (preference === 'current-mobile' && current.mobile?.screenId) return { chosen: current.mobile, source: 'state.current.mobile' };
    return null;
  };

  let chosen = null;
  let source = null;
  if (screenId) {
    chosen = { projectId: projectId || state.projectId || null, screenId };
    source = 'explicit-screen-id';
  } else {
    const explicitPreference = lookupFromPreference(normalizedSourcePreference);
    if (explicitPreference) {
      chosen = explicitPreference.chosen;
      source = explicitPreference.source;
    }
  }

  if (!chosen && mode === 'edit' && breakpoint !== primary) {
    if (approved[primary]?.screenId) {
      chosen = approved[primary];
      source = `state.approved.${primary}`;
    } else if (current[primary]?.screenId) {
      chosen = current[primary];
      source = `state.current.${primary}`;
    }
  }

  if (!chosen && mode === 'export') {
    if (current[breakpoint]?.screenId) {
      chosen = current[breakpoint];
      source = `state.current.${breakpoint}`;
    } else if (approved[breakpoint]?.screenId) {
      chosen = approved[breakpoint];
      source = `state.approved.${breakpoint}`;
    }
  }

  if (!chosen) {
    if (current[breakpoint]?.screenId) {
      chosen = current[breakpoint];
      source = `state.current.${breakpoint}`;
    } else if (approved[breakpoint]?.screenId) {
      chosen = approved[breakpoint];
      source = `state.approved.${breakpoint}`;
    } else if (breakpoint !== primary && current[primary]?.screenId) {
      chosen = current[primary];
      source = `state.current.${primary}`;
    } else if (approved[primary]?.screenId) {
      chosen = approved[primary];
      source = `state.approved.${primary}`;
    }
  }

  const resolvedProjectId = projectId || chosen?.projectId || state.projectId || null;
  const resolvedScreenId = chosen?.screenId || screenId || null;
  if (!resolvedProjectId || !resolvedScreenId) {
    throw new Error(`Unable to resolve Stitch ${mode} target from state. Provide --project-id and --screen-id or ensure state.json has the needed approved/current breakpoint.`);
  }
  if (chosen?.metaPath) {
    const chosenMeta = await readJsonIfExists(chosen.metaPath, null).catch(() => null);
    if (chosenMeta?.localPatchApplied) {
      const origin = chosenMeta.derivedFromScreenId || chosen.screenId || resolvedScreenId;
      throw new Error(`Refusing to anchor Stitch ${mode} from ${source || 'state'} because it points at a locally patched artifact derived from screen ${origin}. Re-export/rebase from Stitch first or pass an explicit --screen-id.`);
    }
  }
  return {
    projectId: resolvedProjectId,
    screenId: resolvedScreenId,
    source: source || 'state',
    statePath,
  };
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function normalizeComparableText(text) {
  return decodeHtmlEntities(String(text || ''))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractHtmlTitle(html) {
  const match = String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return decodeHtmlEntities(match?.[1] || '').replace(/\s+/g, ' ').trim();
}

function isCopyLockPlaceholderValue(value) {
  const normalized = normalizeComparableText(value);
  return [
    'not visible',
    'not shown',
    'none',
    'n/a',
    'na',
    'not applicable',
    'not present',
    'absent',
  ].includes(normalized);
}

function normalizeCopyLockValue(value) {
  const cleaned = String(value || '').trim();
  if (!cleaned) return null;
  if (/^\[.*\]$/.test(cleaned)) return null;
  if (isCopyLockPlaceholderValue(cleaned)) return null;
  return cleaned;
}

function pushCopyLockListValue(target, value) {
  const normalized = normalizeCopyLockValue(value);
  if (normalized) target.push(normalized);
}

function uniqueLockValues(values = []) {
  return [...new Set((values || []).map((item) => String(item || '').trim()).filter(Boolean))];
}

function buildLockMarkdown({
  title = 'Copy lock',
  siteTitle = null,
  pageTitle = null,
  primaryNavLabels = [],
  searchPlaceholder = null,
  keySectionHeadings = [],
  keyCtaLinkLabels = [],
  footerTagline = null,
  footerLinks = [],
  requiredNouns = [],
  bannedDriftWords = [],
} = {}) {
  const normalizedTitle = String(title || '').toLowerCase();
  const authorityLines = normalizedTitle.includes('pre-approval')
    ? [
      '- Stage owner: primary source approval before broad layout refinement.',
      '- Use this to block semantic drift before the first source is accepted.',
    ]
    : normalizedTitle.includes('output')
      ? [
        '- Stage owner: final rendered output review across any breakpoint.',
        '- Use this to confirm the exported screen still matches approved visible truth.',
      ]
      : [
        '- Stage owner: copy/remap/edit review after a source already exists.',
        '- Use this to keep wording and labels stable during remap and repair.',
      ];
  const lines = [
    `# ${title}`,
    '',
    '## Authority',
    ...authorityLines,
    '',
    '## Exact labels to preserve',
    `- Site title: ${siteTitle || '[none]'}`,
    `- Page title: ${pageTitle || '[none]'}`,
    '- Primary nav labels:',
    ...uniqueLockValues(primaryNavLabels).map((item) => `  - ${item}`),
    `- Search placeholder: ${searchPlaceholder || '[none]'}`,
    '- Key section headings:',
    ...uniqueLockValues(keySectionHeadings).map((item) => `  - ${item}`),
    '- Key cta / link labels:',
    ...uniqueLockValues(keyCtaLinkLabels).map((item) => `  - ${item}`),
    `- Footer tagline: ${footerTagline || '[none]'}`,
    '- Footer links:',
    ...uniqueLockValues(footerLinks).map((item) => `  - ${item}`),
    '',
    '## Required visible labels',
    ...uniqueLockValues(requiredNouns).map((item) => `- ${item}`),
    '',
    '## Banned drift words',
    ...uniqueLockValues(bannedDriftWords).map((item) => `- ${item}`),
  ];
  return `${lines.join('\n').trim()}\n`;
}

export function buildPreApprovalLockMarkdown(guidance = {}) {
  return buildLockMarkdown({
    title: 'Pre-approval lock',
    siteTitle: guidance.siteTitle ?? null,
    pageTitle: guidance.pageTitle || guidance.pageName || null,
    primaryNavLabels: guidance.navLabels || [],
    searchPlaceholder: guidance.searchPlaceholder || null,
    keySectionHeadings: guidance.coreHeadings || [],
    keyCtaLinkLabels: guidance.preApprovalCtas || [],
    requiredNouns: guidance.requiredNouns || [],
    bannedDriftWords: guidance.banned || [],
  });
}

export function buildCopyLockMarkdown(guidance = {}) {
  return buildLockMarkdown({
    title: 'Copy lock',
    siteTitle: guidance.siteTitle ?? null,
    pageTitle: guidance.pageTitle || guidance.pageName || null,
    primaryNavLabels: guidance.navLabels || [],
    searchPlaceholder: guidance.searchPlaceholder || null,
    keySectionHeadings: guidance.coreHeadings || [],
    keyCtaLinkLabels: guidance.ctaLabels || [],
    requiredNouns: guidance.requiredNouns || [],
    bannedDriftWords: guidance.banned || [],
  });
}

function parseCopyLockMarkdown(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const result = {
    siteTitle: null,
    pageTitle: null,
    primaryNavLabels: [],
    searchPlaceholder: null,
    keySectionHeadings: [],
    keyCtaLinkLabels: [],
    footerTagline: null,
    footerLinks: [],
    requiredNouns: [],
    bannedDriftWords: [],
  };

  let currentSection = null;
  let currentList = null;

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.*)$/);
    if (headingMatch) {
      currentSection = headingMatch[1].trim().toLowerCase();
      currentList = null;
      continue;
    }

    const fieldMatch = line.match(/^\s*-\s+([^:]+):\s*(.*)$/);
    if (fieldMatch && currentSection === 'exact labels to preserve') {
      const field = fieldMatch[1].trim().toLowerCase();
      const value = fieldMatch[2].trim();
      currentList = null;
      if (field === 'site title') result.siteTitle = normalizeCopyLockValue(value);
      else if (field === 'page title') result.pageTitle = normalizeCopyLockValue(value);
      else if (field === 'primary nav labels') currentList = result.primaryNavLabels;
      else if (field === 'search placeholder') result.searchPlaceholder = normalizeCopyLockValue(value);
      else if (field === 'key section headings') currentList = result.keySectionHeadings;
      else if (field === 'key cta / link labels') currentList = result.keyCtaLinkLabels;
      else if (field === 'footer tagline') result.footerTagline = normalizeCopyLockValue(value);
      else if (field === 'footer links') currentList = result.footerLinks;
      continue;
    }

    const bulletMatch = line.match(/^\s*-\s+(.*)$/);
    if (bulletMatch && currentList) {
      pushCopyLockListValue(currentList, bulletMatch[1]);
      continue;
    }

    if ((currentSection === 'required nouns' || currentSection === 'required visible labels') && bulletMatch) {
      pushCopyLockListValue(result.requiredNouns, bulletMatch[1]);
      continue;
    }

    if (currentSection === 'banned drift words' && bulletMatch) {
      pushCopyLockListValue(result.bannedDriftWords, bulletMatch[1]);
      continue;
    }

    if (!line.trim()) currentList = null;
  }

  return result;
}

function deviceRank(deviceType = 'DESKTOP') {
  const normalized = String(deviceType || 'DESKTOP').toUpperCase();
  if (normalized === 'MOBILE') return 0;
  if (normalized === 'TABLET') return 2;
  return 3;
}

function responsivePrefixRank(prefix) {
  return {
    sm: 1,
    md: 2,
    lg: 3,
    xl: 4,
    '2xl': 5,
  }[String(prefix || '').toLowerCase()] ?? null;
}

function isDisplayVisibleToken(token = '') {
  const value = String(token || '').trim().toLowerCase();
  return new Set(['block', 'inline', 'inline-block', 'inline-flex', 'flex', 'grid', 'table', 'contents', 'list-item', 'flow-root']).has(value);
}

function extractAttributeValue(attributes = '', name = '') {
  const escaped = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = String(attributes || '').match(pattern);
  return match ? (match[1] || match[2] || match[3] || '') : '';
}

function isElementHiddenAtDevice(attributes = '', deviceType = 'DESKTOP') {
  const attrs = String(attributes || '');
  if (/\bhidden(?:\s|>|$)/i.test(attrs)) return true;
  if (/\baria-hidden\s*=\s*(?:"true"|'true'|true)/i.test(attrs)) return true;
  const style = extractAttributeValue(attrs, 'style').toLowerCase();
  if (/display\s*:\s*none/.test(style) || /visibility\s*:\s*hidden/.test(style)) return true;

  const classValue = extractAttributeValue(attrs, 'class');
  if (!classValue) return false;
  const tokens = classValue.split(/\s+/).map((item) => item.trim()).filter(Boolean);
  const rank = deviceRank(deviceType);
  let hidden = null;

  for (const token of tokens) {
    if (token === 'sr-only' || token === 'hidden' || token === 'invisible') hidden = true;
    else if (isDisplayVisibleToken(token)) hidden = false;
  }

  const responsiveTokens = [];
  for (const token of tokens) {
    const match = token.match(/^(sm|md|lg|xl|2xl):(.*)$/i);
    if (!match) continue;
    const bpRank = responsivePrefixRank(match[1]);
    if (bpRank === null || bpRank > rank) continue;
    responsiveTokens.push({ bpRank, value: match[2].trim().toLowerCase() });
  }
  responsiveTokens.sort((a, b) => a.bpRank - b.bpRank);
  for (const token of responsiveTokens) {
    if (token.value === 'hidden' || token.value === 'sr-only' || token.value === 'invisible') hidden = true;
    else if (isDisplayVisibleToken(token.value)) hidden = false;
  }

  return hidden === true;
}

function stripProbablyHiddenHtml(html, deviceType = 'DESKTOP') {
  let current = String(html || '');
  const blockPattern = /<([a-zA-Z][\w:-]*)\b([^>]*)>([\s\S]*?)<\/\1>/g;
  for (let index = 0; index < 4; index += 1) {
    const next = current.replace(blockPattern, (full, tagName, attrs) => {
      if (isElementHiddenAtDevice(attrs, deviceType)) return ' ';
      return full;
    });
    if (next === current) break;
    current = next;
  }
  return current.replace(/<([a-zA-Z][\w:-]*)\b([^>]*)\/>/g, (full, tagName, attrs) => (isElementHiddenAtDevice(attrs, deviceType) ? ' ' : full));
}

function htmlToVisibleText(html, { deviceType = 'DESKTOP' } = {}) {
  const source = stripProbablyHiddenHtml(stripNonUserFacingHtmlTextArtifacts(html), deviceType);
  return decodeHtmlEntities(
    String(source || '')
      .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, ' ')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--([\s\S]*?)-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function extractUserFacingAttributeText(html, { deviceType = 'DESKTOP' } = {}) {
  const source = stripProbablyHiddenHtml(stripNonUserFacingHtmlTextArtifacts(html), deviceType);
  const values = [];
  const patterns = [
    /\bplaceholder\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,
    /\baria-label\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,
    /\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,
    /\bvalue\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      const value = normalizeCopyLockValue(match[1] || match[2] || '');
      if (value) values.push(value);
    }
  }

  return values.join('\n');
}

function stripNonUserFacingHtmlTextArtifacts(html) {
  return String(html || '')
    .replace(/<(span|i)\b[^>]*class\s*=\s*(["'])[^"']*(?:material-symbols(?:-[a-z-]+)?|material-icons(?:-[a-z-]+)?)\b[^"']*\2[^>]*>[\s\S]*?<\/\1>/gi, ' ');
}

function extractUnexpectedTopFramingCandidates(html, lock = {}) {
  const source = stripNonUserFacingHtmlTextArtifacts(html)
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/i, ' ');
  const keySectionHeadings = (lock?.keySectionHeadings || []).map((item) => String(item || '').trim()).filter(Boolean);
  const framingAnchors = [lock?.siteTitle, ...(lock?.primaryNavLabels || [])].map((item) => String(item || '').trim()).filter(Boolean);
  if (!keySectionHeadings.length || !framingAnchors.length) return [];
  const lowerSource = source.toLowerCase();
  const boundaryIndex = keySectionHeadings
    .map((heading) => lowerSource.indexOf(heading.toLowerCase()))
    .filter((idx) => idx >= 0)
    .sort((a, b) => a - b)[0];
  const prefix = source.slice(0, boundaryIndex > 0 ? boundaryIndex : Math.min(source.length, 2500));
  const withBreaks = prefix
    .replace(/<(br|hr)\b[^>]*\/?>/gi, '\n')
    .replace(/<\/(p|div|span|a|button|label|li|h1|h2|h3|h4|h5|h6|header|nav|section)>/gi, '\n');
  const visibleLines = decodeHtmlEntities(
    withBreaks
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--([\s\S]*?)-->/g, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const allowed = new Set([
    lock?.siteTitle,
    lock?.pageTitle,
    lock?.searchPlaceholder,
    lock?.footerTagline,
    ...(lock?.primaryNavLabels || []),
    ...(lock?.keySectionHeadings || []),
    ...(lock?.keyCtaLinkLabels || []),
    ...(lock?.footerLinks || []),
  ].map((item) => normalizeComparableText(item)).filter(Boolean));

  const seen = new Set();
  const candidates = [];
  for (const line of visibleLines) {
    const normalized = normalizeComparableText(line);
    if (!normalized || seen.has(normalized) || allowed.has(normalized)) continue;
    seen.add(normalized);
    const wordCount = normalized.split(/\s+/).length;
    if (wordCount < 2 || wordCount > 4) continue;
    if (/[.!?]/.test(line)) continue;
    if (!/[A-Za-z]/.test(line)) continue;
    if (!/^(?:[A-Z][a-z'’-]*|[A-Z]{2,}|of|the|and|for|to|your|my)(?:\s+(?:[A-Z][a-z'’-]*|[A-Z]{2,}|of|the|and|for|to|your|my)){1,3}$/.test(line.trim())) continue;
    candidates.push(line.trim());
  }
  return candidates;
}

function countTermMatches(text, term, { caseSensitive = false } = {}) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(?<!\\w)${escaped}(?!\\w)`, caseSensitive ? 'g' : 'gi');
  let count = 0;
  while (regex.exec(text)) count += 1;
  return count;
}

function extractFirstDesignScreenFromToolOutput(raw) {
  const components = raw?.outputComponents || raw?.output_components || [];
  if (!Array.isArray(components)) return null;
  for (const component of components) {
    const screens = component?.design?.screens;
    if (Array.isArray(screens) && screens[0]) return screens[0];
  }
  return null;
}

function projectedScreenId(projected) {
  if (!projected || typeof projected !== 'object') return null;
  if (projected.screenId) return projected.screenId;
  if (projected.id) return projected.id;
  if (typeof projected.name === 'string') {
    const parts = projected.name.split('/screens/');
    if (parts.length === 2) return parts[1];
  }
  return null;
}

export async function loadSemanticRules({ outdir, stateFile } = {}) {
  const rulesPath = semanticRulesPathForOutdir({ outdir, stateFile });
  const rules = await readJsonIfExists(rulesPath, null);
  return { rulesPath, rules };
}

export async function loadPreApprovalLock({ outdir, stateFile, preApprovalLockFile } = {}) {
  const preApprovalLockPath = preApprovalLockPathForOutdir({ outdir, stateFile, preApprovalLockFile });
  try {
    const markdown = await fs.readFile(preApprovalLockPath, 'utf8');
    return { preApprovalLockPath, preApprovalLock: parseCopyLockMarkdown(markdown) };
  } catch (error) {
    if (error?.code === 'ENOENT') return { preApprovalLockPath, preApprovalLock: null };
    throw error;
  }
}

export async function loadCopyLock({ outdir, stateFile, copyLockFile } = {}) {
  const copyLockPath = copyLockPathForOutdir({ outdir, stateFile, copyLockFile });
  try {
    const markdown = await fs.readFile(copyLockPath, 'utf8');
    return { copyLockPath, copyLock: parseCopyLockMarkdown(markdown) };
  } catch (error) {
    if (error?.code === 'ENOENT') return { copyLockPath, copyLock: null };
    throw error;
  }
}

function getLockSeverityProfile(mode = 'default') {
  const profiles = {
    preapproval: {
      hard: new Set(['siteTitle', 'pageTitle', 'requiredNoun', 'primaryNavLabel']),
      soft: new Set(['keySectionHeading', 'keyCtaLinkLabel', 'footerLink', 'footerTagline']),
    },
    preapprovallock: {
      hard: new Set(['siteTitle', 'pageTitle', 'requiredNoun', 'primaryNavLabel']),
      soft: new Set(['keySectionHeading', 'keyCtaLinkLabel', 'footerLink', 'footerTagline']),
    },
    copy: {
      hard: new Set(['siteTitle', 'pageTitle', 'requiredNoun']),
      soft: new Set(['primaryNavLabel', 'keySectionHeading', 'keyCtaLinkLabel', 'footerLink', 'footerTagline']),
    },
    copylock: {
      hard: new Set(['siteTitle', 'pageTitle', 'requiredNoun']),
      soft: new Set(['primaryNavLabel', 'keySectionHeading', 'keyCtaLinkLabel', 'footerLink', 'footerTagline']),
    },
    output: {
      hard: new Set(['siteTitle', 'pageTitle', 'requiredNoun']),
      soft: new Set(['primaryNavLabel', 'keySectionHeading', 'keyCtaLinkLabel', 'footerLink', 'footerTagline']),
    },
    outputlock: {
      hard: new Set(['siteTitle', 'pageTitle', 'requiredNoun']),
      soft: new Set(['primaryNavLabel', 'keySectionHeading', 'keyCtaLinkLabel', 'footerLink', 'footerTagline']),
    },
  };
  const normalizedMode = String(mode || 'default').toLowerCase().replace(/[^a-z]/g, '');
  const profile = profiles[normalizedMode] || {
    hard: new Set(['siteTitle', 'pageTitle', 'requiredNoun']),
    soft: new Set(['primaryNavLabel', 'keySectionHeading', 'keyCtaLinkLabel', 'footerLink', 'footerTagline']),
  };
  return profile;
}

function evaluateParsedLockAgainstHtml(lock, lockPathKey, lockPath, html, options = {}) {
  const deviceType = options.deviceType || 'DESKTOP';
  const visibleText = htmlToVisibleText(html, { deviceType });
  const visibleCorpus = visibleText.replace(/\s+/g, ' ').trim();
  const combinedCorpus = visibleCorpus.toLowerCase();
  const unexpectedTopFraming = extractUnexpectedTopFramingCandidates(stripProbablyHiddenHtml(html, deviceType), lock);
  const severityProfile = getLockSeverityProfile(options.mode || options.type || 'default');

  const checks = [];
  const addLabelCheck = (kind, expected, severity = 'soft', matchMode = 'sensitive') => {
    const normalizedExpected = normalizeCopyLockValue(expected);
    if (!normalizedExpected) return;
    const matchedCaseSensitive = countTermMatches(visibleCorpus, normalizedExpected, { caseSensitive: true }) > 0;
    const matchedCaseInsensitive = countTermMatches(combinedCorpus, normalizedExpected.toLowerCase()) > 0;
    const useCaseInsensitive = matchMode === 'insensitive';
    checks.push({
      kind,
      expected: normalizedExpected,
      matched: useCaseInsensitive ? matchedCaseInsensitive : matchedCaseSensitive,
      caseMismatch: !useCaseInsensitive && !matchedCaseSensitive && matchedCaseInsensitive,
      severity: String(severity || 'soft').toLowerCase() === 'hard' ? 'hard' : 'soft',
    });
  };

  const classify = (kind, defaultSeverity = 'soft') => (severityProfile.hard?.has?.(kind) ? 'hard' : defaultSeverity);

  addLabelCheck('siteTitle', lock.siteTitle, classify('siteTitle', 'hard'));
  addLabelCheck('footerTagline', lock.footerTagline, classify('footerTagline', 'soft'));
  for (const label of lock.primaryNavLabels || []) addLabelCheck('primaryNavLabel', label, classify('primaryNavLabel', 'soft'));
  for (const label of lock.keySectionHeadings || []) addLabelCheck('keySectionHeading', label, classify('keySectionHeading', 'soft'));
  for (const label of lock.keyCtaLinkLabels || []) addLabelCheck('keyCtaLinkLabel', label, classify('keyCtaLinkLabel', 'soft'));
  for (const label of lock.footerLinks || []) addLabelCheck('footerLink', label, classify('footerLink', 'soft'));
  for (const label of lock.requiredNouns || []) addLabelCheck('requiredNoun', label, classify('requiredNoun', 'hard'), 'insensitive');

  const pageTitleExpected = normalizeCopyLockValue(lock.pageTitle);
  const pageTitleVisible = pageTitleExpected ? countTermMatches(visibleCorpus, pageTitleExpected, { caseSensitive: true }) > 0 : false;
  const pageTitleCaseMismatch = pageTitleExpected && !pageTitleVisible
    ? countTermMatches(combinedCorpus, pageTitleExpected.toLowerCase()) > 0
    : false;
  const pageTitleCheck = pageTitleExpected
    ? {
      expected: pageTitleExpected,
      actual: pageTitleVisible ? pageTitleExpected : '',
      actualSource: pageTitleVisible ? 'visible-text' : null,
      matched: pageTitleVisible,
      caseMismatch: pageTitleCaseMismatch,
      severity: classify('pageTitle', 'hard'),
    }
    : null;
  if (pageTitleCheck) {
    checks.push({
      kind: 'pageTitle',
      expected: pageTitleCheck.expected,
      matched: pageTitleVisible,
      severity: pageTitleCheck.severity,
    });
  }

  const hardMissing = checks.filter((item) => item.severity === 'hard' && !item.matched);
  const softMissing = checks.filter((item) => item.severity === 'soft' && !item.matched);
  const caseMismatches = checks.filter((item) => item.caseMismatch).map((item) => ({ kind: item.kind, expected: item.expected }));
  const missing = checks.filter((item) => !item.matched).map((item) => ({ kind: item.kind, expected: item.expected }));
  if (pageTitleCheck && !pageTitleCheck.matched) {
    missing.push({ kind: 'pageTitle', expected: pageTitleCheck.expected, actual: pageTitleCheck.actual });
    if (pageTitleCheck.caseMismatch) caseMismatches.push({ kind: 'pageTitle', expected: pageTitleCheck.expected });
  }

  const bannedFound = (lock.bannedDriftWords || [])
    .map((term) => ({ term, count: countTermMatches(combinedCorpus, String(term).toLowerCase()) }))
    .filter((item) => item.count > 0);

  return {
    [lockPathKey]: lockPath,
    passed: hardMissing.length === 0 && bannedFound.length === 0 && unexpectedTopFraming.length === 0,
    pageTitle: pageTitleCheck,
    missing,
    hardMissing,
    softMissing,
    blockedByHard: hardMissing.length > 0,
    blockedByUnexpectedFraming: unexpectedTopFraming.length > 0,
    bannedFound,
    caseMismatches,
    unexpectedTopFraming,
    matched: checks.filter((item) => item.matched).map((item) => ({ kind: item.kind, expected: item.expected })),
  };
}

export async function evaluateSemanticRulesForHtml({ htmlPath, outdir, stateFile, deviceType = 'DESKTOP' } = {}) {
  const { rulesPath, rules } = await loadSemanticRules({ outdir, stateFile });
  if (!rules) return null;
  const html = await fs.readFile(htmlPath, 'utf8');
  const text = htmlToVisibleText(html, { deviceType }).toLowerCase();
  const banned = (rules.banned || []).map((term) => ({ term, count: countTermMatches(text, String(term).toLowerCase()) })).filter((item) => item.count > 0);
  const requiredAllMissing = (rules.requiredAll || []).filter((term) => countTermMatches(text, String(term).toLowerCase()) === 0);
  const requiredAny = rules.requiredAny || [];
  const requiredAnyFound = requiredAny.filter((term) => countTermMatches(text, String(term).toLowerCase()) > 0);
  const requiredAnyGroups = Array.isArray(rules.requiredAnyGroups) ? rules.requiredAnyGroups : [];
  const requiredAnyGroupResults = requiredAnyGroups.map((group, index) => {
    const label = String(group?.label || `group-${index + 1}`).trim();
    const any = (group?.any || group?.terms || [])
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    const found = any.filter((term) => countTermMatches(text, term.toLowerCase()) > 0);
    return {
      label,
      any,
      found,
      passed: found.length > 0,
    };
  });
  const missingRequiredAnyGroups = requiredAnyGroupResults.filter((group) => !group.passed);
  const preferred = (rules.preferred || []).map((term) => ({ term, count: countTermMatches(text, String(term).toLowerCase()) })).filter((item) => item.count > 0);
  const passed = !banned.length && !requiredAllMissing.length && (!requiredAny.length || requiredAnyFound.length > 0) && missingRequiredAnyGroups.length === 0;
  return {
    rulesPath,
    passed,
    bannedFound: banned,
    missingRequiredAll: requiredAllMissing,
    requiredAny,
    requiredAnyFound,
    requiredAnyGroups: requiredAnyGroupResults,
    missingRequiredAnyGroups,
    preferredFound: preferred,
  };
}

export async function evaluatePreApprovalLockForHtml({ htmlPath, outdir, stateFile, preApprovalLockFile, deviceType = 'DESKTOP' } = {}) {
  const { preApprovalLockPath, preApprovalLock } = await loadPreApprovalLock({ outdir, stateFile, preApprovalLockFile });
  if (!preApprovalLock) return null;
  const html = await fs.readFile(htmlPath, 'utf8');
  return evaluateParsedLockAgainstHtml(preApprovalLock, 'preApprovalLockPath', preApprovalLockPath, html, { mode: 'pre-approval', deviceType });
}

export async function evaluateCopyLockForHtml({ htmlPath, outdir, stateFile, copyLockFile, deviceType = 'DESKTOP' } = {}) {
  const { copyLockPath, copyLock } = await loadCopyLock({ outdir, stateFile, copyLockFile });
  if (!copyLock) return null;
  const html = await fs.readFile(htmlPath, 'utf8');
  return evaluateParsedLockAgainstHtml(copyLock, 'copyLockPath', copyLockPath, html, { mode: 'copy', deviceType });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function shouldAttemptScreenRecovery(error) {
  const message = (error?.message || String(error || '')).toLowerCase();
  return [
    'incomplete api response',
    'connection error',
    'connection reset',
    'failed to fetch',
    'deadline exceeded',
    'timed out',
    'timeout',
    'socket hang up',
    'network error',
  ].some((token) => message.includes(token));
}

export async function listProjectScreens(project) {
  const screens = await project.screens();
  return screens.map((screen, index) => ({
    screen,
    index,
    screenId: screen.screenId || screen.id || null,
    title: screen.data?.title || null,
    deviceType: normalizeDeviceType(screen.data?.deviceType || 'DEVICE_TYPE_UNSPECIFIED'),
    width: Number(screen.data?.width || 0) || null,
    height: Number(screen.data?.height || 0) || null,
    htmlUrl: screen.data?.htmlCode?.downloadUrl || null,
    imageUrl: screen.data?.screenshot?.downloadUrl || null,
  }));
}

export function slugifyScreenTitle(value, fallback = 'screen') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

export function pickProjectScreenByQuery(screens, { query = null, deviceType = null, excludeScreenIds = [] } = {}) {
  const normalizedQuery = normalizeComparableText(query);
  if (!normalizedQuery) return null;
  const excluded = new Set((excludeScreenIds || []).filter(Boolean));
  const normalizedDeviceType = deviceType ? normalizeDeviceType(deviceType) : null;
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  let best = null;

  for (const candidate of screens || []) {
    if (!candidate?.screenId || excluded.has(candidate.screenId)) continue;
    const title = normalizeComparableText(candidate.title || '');
    let score = 0;
    if (title === normalizedQuery) score += 320;
    if (title.includes(normalizedQuery)) score += 180;
    for (const token of tokens) {
      if (title.includes(token)) score += 35;
    }
    if (normalizedDeviceType && candidate.deviceType === normalizedDeviceType) score += 80;
    if (normalizedDeviceType === 'DESKTOP' && candidate.width && candidate.width >= 1200) score += 15;
    if (normalizedDeviceType === 'TABLET' && candidate.width && candidate.width >= 900 && candidate.width < 1400) score += 15;
    if (normalizedDeviceType === 'MOBILE' && candidate.width && candidate.width <= 900) score += 15;
    score += Math.max(0, 20 - Number(candidate.index || 0));
    if (!best || score > best.score) best = { ...candidate, score, query };
  }

  return best && best.score >= 60 ? best : null;
}

function isRetriableGetScreenError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return [
    'service is currently unavailable',
    'temporarily unavailable',
    'deadline exceeded',
    'timed out',
    'timeout',
    'connection error',
    'network error',
  ].some((token) => message.includes(token));
}

export async function loadProjectScreenRecord(project, screenId, { retries = 3, delayMs = 1500 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const screen = await project.getScreen(screenId);
      return compactProjectScreenRecord(screen, { screenId });
    } catch (error) {
      lastError = error;
      if (!isRetriableGetScreenError(error) || attempt >= retries) throw error;
      await sleep(delayMs * attempt);
    }
  }
  throw lastError || new Error(`Unable to load Stitch screen ${screenId}`);
}

function scoreRecoveredScreen(candidate, { breakpointHint, deviceType }) {
  let score = 0;
  const breakpoint = breakpointHint || breakpointForDeviceType(deviceType);
  const title = String(candidate.title || '').toLowerCase();
  if (breakpoint === 'mobile') {
    if (candidate.width && candidate.width <= 900) score += 60;
    if (candidate.deviceType === 'MOBILE') score += 60;
  }
  if (breakpoint === 'tablet') {
    if (title.includes('tablet')) score += 120;
    if (candidate.deviceType === 'TABLET') score += 80;
    if (candidate.width && candidate.width >= 1000) score += 20;
  }
  if (breakpoint === 'desktop') {
    if (title.includes('desktop')) score += 120;
    if (candidate.deviceType === 'DESKTOP') score += 80;
    if (candidate.width && candidate.width >= 1400) score += 20;
  }
  score += Math.max(0, 25 - candidate.index);
  return score;
}

function pickRecoveredScreen(beforeScreens, afterScreens, { breakpointHint, deviceType }) {
  const beforeIds = new Set(beforeScreens.map((item) => item.screenId).filter(Boolean));
  const candidates = afterScreens.filter((item) => item.screenId && !beforeIds.has(item.screenId));
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => scoreRecoveredScreen(b, { breakpointHint, deviceType }) - scoreRecoveredScreen(a, { breakpointHint, deviceType }))[0] || null;
}

export async function runScreenActionWithRecovery({ project, deviceType, breakpointHint, run }) {
  const beforeScreens = await listProjectScreens(project).catch(() => []);
  try {
    const screen = await run(project);
    return { screen, recovery: null };
  } catch (error) {
    if (!shouldAttemptScreenRecovery(error)) throw error;
    const maxAttempts = 4;
    const delayMs = 2000;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (attempt > 1) await sleep(delayMs);
      const afterScreens = await listProjectScreens(project).catch(() => []);
      const recovered = pickRecoveredScreen(beforeScreens, afterScreens, { breakpointHint, deviceType });
      if (!recovered) continue;
      return {
        screen: recovered.screen,
        recovery: {
          strategy: 'screen-list-diff',
          triggerError: error.message || String(error),
          recoveredScreenId: recovered.screenId,
          recoveredTitle: recovered.title,
          recoveredDeviceType: recovered.deviceType,
          recoveryAttempt: attempt,
          recoveryDelayMs: attempt > 1 ? delayMs : 0,
        },
      };
    }
    throw error;
  }
}

export async function editScreenWithSdkProjectionFallback(sourceScreen, prompt, deviceType, modelId) {
  if (!sourceScreen?.client || !sourceScreen?.projectId || !sourceScreen?.screenId) {
    throw new Error('editScreenWithSdkProjectionFallback requires a loaded Stitch screen with client, projectId, and screenId.');
  }

  const raw = await sourceScreen.client.callTool('edit_screens', {
    projectId: sourceScreen.projectId,
    selectedScreenIds: [sourceScreen.screenId],
    prompt,
    deviceType,
    modelId,
  });

  const projected = extractFirstDesignScreenFromToolOutput(raw);
  if (!projected) {
    throw new Error('Incomplete API response from edit_screens: expected object at projection path');
  }

  const ScreenCtor = sourceScreen.constructor;
  return new ScreenCtor(sourceScreen.client, { ...projected, projectId: sourceScreen.projectId });
}

export async function generateScreenWithSdkProjectionFallback(project, prompt, deviceType, modelId) {
  try {
    return await project.generate(prompt, deviceType, modelId);
  } catch (error) {
    const message = error?.message || String(error || '');
    if (!message.toLowerCase().includes('incomplete api response')) throw error;
  }

  const raw = await project.client.callTool('generate_screen_from_text', {
    projectId: project.projectId,
    prompt,
    deviceType,
    modelId,
  });
  const projected = extractFirstDesignScreenFromToolOutput(raw);
  if (!projected) {
    throw new Error('Incomplete API response from generate_screen_from_text: expected object at projection path');
  }

  const screenId = projectedScreenId(projected);
  if (screenId) {
    return await project.getScreen(screenId).catch(async () => {
      const sdk = await loadStitchSdk();
      return new sdk.Screen(project.client, { ...projected, projectId: project.projectId });
    });
  }

  const sdk = await loadStitchSdk();
  return new sdk.Screen(project.client, { ...projected, projectId: project.projectId });
}

export async function exportPrimaryDesignSystem({ stitch, projectId, outdir, stateFile, projectRoot = null, config = null } = {}) {
  if (!stitch || !projectId) {
    return { designSystem: null, designSystemJsonPath: null, designSystemMdPath: null, designStyleMdPath: null, statePath: inferStatePath({ outdir, stateFile }) };
  }
  const statePath = inferStatePath({ outdir, stateFile });
  const activeConfig = config || await loadDesignProjectConfig({ projectRoot, startPath: statePath }).catch(() => null);
  const generatedRoot = activeConfig?.projectRoot ? normalizeOptionalPath(activeConfig.projectRoot, activeConfig.stitch?.generatedRoot || '04-generated/stitch') : path.dirname(statePath);
  const exportedRoot = path.join(generatedRoot, 'design-system-exported');
  const stateDir = path.dirname(statePath);
  const pageRootForRuntime = path.basename(stateDir) === 'runtime' ? path.dirname(stateDir) : stateDir;
  const runtimeRoot = runtimeDirForOutdir(pageRootForRuntime);
  const project = stitch.project(projectId);
  const systems = await project.listDesignSystems().catch(() => []);
  const primary = systems[0];
  if (!primary) {
    return { designSystem: null, designSystemJsonPath: null, designSystemMdPath: null, designStyleMdPath: null, statePath };
  }
  const designSystemJsonPath = path.join(runtimeRoot, 'design-system.json');
  const designSystemMdPath = path.join(exportedRoot, 'DESIGN.md');
  const designStyleMdPath = path.join(exportedRoot, 'design-style.md');
  await writeJson(designSystemJsonPath, primary.data || {});
  const rawMd = primary.data?.designSystem?.theme?.designMd || '';
  await ensureDir(path.dirname(designSystemMdPath));
  const cleanMd = stripMarkdownFence(rawMd);
  await fs.writeFile(designSystemMdPath, `${cleanMd}\n`);
  await fs.writeFile(designStyleMdPath, `${extractStyleOnlyMarkdown(cleanMd)}\n`);
  return {
    statePath,
    designSystem: {
      assetId: primary.assetId || primary.id || null,
      displayName: primary.data?.designSystem?.displayName || null,
    },
    designSystemJsonPath,
    designSystemMdPath,
    designStyleMdPath,
  };
}

export async function persistProjectContext({ stitch, projectId, outdir, stateFile, deviceType, screenId, metaPath, updateState = 'current', recovery = null, projectRoot = null, pageKey = null, primaryBreakpoint = null, sourcePromptFile = null } = {}) {
  const { statePath, state } = await loadStitchState({ outdir, stateFile });
  const config = await loadDesignProjectConfig({ projectRoot, startPath: statePath }).catch(() => null);
  const activeProjectRoot = projectRoot || config?.projectRoot || await discoverDesignProjectRoot({ startPath: statePath });
  const activePrimaryBreakpoint = normalizeBreakpointName(primaryBreakpoint || config?.primaryBreakpoint || 'mobile', 'mobile');
  const { runtimePath, runtime } = await loadProjectRuntime({ projectRoot: activeProjectRoot, config, startPath: statePath }).catch(() => ({ runtimePath: null, runtime: { projectId: null, designSystem: null } }));

  state.projectId = projectId || state.projectId || runtime.projectId || null;
  const design = await exportPrimaryDesignSystem({
    stitch,
    projectId: state.projectId,
    outdir,
    stateFile: statePath,
    projectRoot: activeProjectRoot,
    config,
  }).catch(() => ({ statePath, designSystem: null, designSystemJsonPath: null, designSystemMdPath: null, designStyleMdPath: null }));

  if (design.designSystem) {
    runtime.designSystem = {
      ...design.designSystem,
      jsonPath: design.designSystemJsonPath,
      mdPath: design.designSystemMdPath,
      stylePath: design.designStyleMdPath,
      updatedAt: new Date().toISOString(),
    };
  }
  if (state.projectId) runtime.projectId = state.projectId;
  if (runtimePath) await saveProjectRuntime(runtimePath, runtime);

  const inventoryPath = outdir ? path.join(runtimeDirForOutdir(outdir), 'stitch-project-screens.json') : null;
  if (stitch && state.projectId && screenId && inventoryPath) {
    try {
      const inventoryScreen = await stitch.project(state.projectId).getScreen(screenId);
      await writeProjectScreenInventory({
        inventoryPath,
        projectId: state.projectId,
        mergeScreens: [inventoryScreen],
      });
    } catch {
      // Inventory freshness is helpful but non-critical; keep context persistence resilient.
    }
  }

  const breakpoint = breakpointForDeviceType(deviceType);
  if (updateState !== 'none' && breakpoint !== 'agnostic' && screenId) {
    state[updateState] = state[updateState] || {};
    state[updateState][breakpoint] = {
      projectId: state.projectId,
      screenId,
      deviceType: normalizeDeviceType(deviceType),
      outdir: path.resolve(outdir),
      metaPath: metaPath ? path.resolve(metaPath) : null,
      recovery,
      sourcePromptFile: sourcePromptFile ? path.resolve(sourcePromptFile) : null,
      updatedAt: new Date().toISOString(),
    };
  }
  await saveStitchState(statePath, state);
  const sessionIndexPath = await syncGlobalStitchSessionIndex({
    projectRoot: activeProjectRoot,
    globalSessionIndexPath: null,
    statePath,
    state,
    primaryBreakpoint: activePrimaryBreakpoint,
    designSystem: runtime.designSystem || null,
  }).catch(() => null);
  return {
    statePath,
    sessionIndexPath,
    projectRuntimePath: runtimePath,
    designSystem: runtime.designSystem || null,
  };
}

export function artifactStemForOutdir(outdir, meta = {}, options = {}) {
  const breakpoint = normalizeBreakpointName(meta.breakpoint || breakpointForDeviceType(meta.deviceType || 'DESKTOP'), 'agnostic');
  const theme = slugifyPageToken(options.theme || meta.theme || meta.themeName || '');
  const themePart = theme && !['default', 'single', 'single-theme'].includes(theme) ? `${theme}.` : '';
  return `${themePart}${breakpoint}`;
}

export function runtimeDirForOutdir(outdir) {
  return path.join(path.resolve(outdir), 'runtime');
}

export function metaPathForOutdir(outdir, stem) {
  return path.join(runtimeDirForOutdir(outdir), `${stem}.meta.json`);
}

export function candidateOutdirForOperation(outdir, meta = {}, options = {}) {
  if (options.acceptedRoot === true || options.candidate === false) return path.resolve(outdir);
  const stem = artifactStemForOutdir(outdir, meta, options);
  const op = slugifyPageToken(options.attemptOperation || meta.mode || 'candidate') || 'candidate';
  const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.hrtime.bigint().toString()}`;
  const label = slugifyPageToken(options.attemptLabel || `${op}-${stem}-${stamp}`);
  return path.join(path.resolve(outdir), 'attempts', label);
}


async function pngDimensionsFromFile(filePath) {
  try {
    const handle = await fs.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(24);
      await handle.read(buffer, 0, 24, 0);
      if (buffer.readUInt32BE(0) !== 0x89504e47 || buffer.toString('ascii', 1, 4) !== 'PNG') return null;
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

function assessStitchScreenshotDimensions(dimensions, viewport = {}) {
  const findings = [];
  const width = Number(dimensions?.width || 0);
  const height = Number(dimensions?.height || 0);
  const expectedWidth = Number(viewport?.width || 0);
  const expectedHeight = Number(viewport?.height || 0);
  if (!width || !height) findings.push('missing-image-dimensions');
  if (width > 0 && width < 240) findings.push('too-narrow');
  if (height > 0 && height < 300) findings.push('too-short');
  if (expectedWidth && width > 0 && width < expectedWidth * 0.25) findings.push('far-smaller-than-viewport-width');
  if (expectedHeight && height > 0 && height < Math.min(420, expectedHeight * 0.35)) findings.push('far-smaller-than-viewport-height');
  return { passed: findings.length === 0, findings, width, height, expectedWidth, expectedHeight };
}

function hardRequiredNounMisses(check) {
  return (check?.hardMissing || []).filter((item) => item?.kind === 'requiredNoun' || /requirednoun/i.test(String(item?.kind || '')));
}

export async function reviewLocalHtmlArtifacts({ htmlPath, outdir, meta = {}, viewport = defaultViewportForDeviceType(meta.deviceType), options = {} }) {
  await ensureDir(outdir);
  const resolvedOutdir = path.resolve(outdir);
  const localRenderDir = options.localRenderDir ? path.resolve(options.localRenderDir) : resolvedOutdir;
  await ensureDir(localRenderDir);
  const resolvedHtmlPath = path.resolve(htmlPath);
  const stem = artifactStemForOutdir(outdir, meta, options);
  const finalHtmlPath = path.join(resolvedOutdir, `${stem}.html`);
  if (resolvedHtmlPath !== finalHtmlPath) {
    await fs.copyFile(resolvedHtmlPath, finalHtmlPath);
  }
  const safeEvaluate = async (label, fn) => {
    try {
      return await fn();
    } catch (error) {
      return {
        passed: false,
        evaluation: label,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };
  const localRenderSuffix = options.localRenderSuffix ? `.${slugifyPageToken(options.localRenderSuffix)}` : '';
  const imagePath = path.join(localRenderDir, `${stem}${localRenderSuffix}.png`);
  const fullImagePath = path.join(localRenderDir, `${stem}${localRenderSuffix}.full.png`);
  const renderNetworkAccess = options.localRenderNetworkAccess || options.networkAccess || 'full';
  const renderMeta = await renderHtmlPreview({ htmlPath: finalHtmlPath, outPath: imagePath, fullOutPath: fullImagePath, viewport, networkAccess: renderNetworkAccess });
  const deviceType = meta.deviceType || 'DESKTOP';
  const semanticCheck = await safeEvaluate('semantic-check', () => evaluateSemanticRulesForHtml({ htmlPath: finalHtmlPath, outdir, stateFile: options.stateFile || null, deviceType }));
  const preApprovalLockCheck = await safeEvaluate('pre-approval-lock-check', () => evaluatePreApprovalLockForHtml({ htmlPath: finalHtmlPath, outdir, stateFile: options.stateFile || null, preApprovalLockFile: options.preApprovalLockFile || null, deviceType }));
  const copyLockCheck = await safeEvaluate('copy-lock-check', () => evaluateCopyLockForHtml({ htmlPath: finalHtmlPath, outdir, stateFile: options.stateFile || null, copyLockFile: options.copyLockFile || null, deviceType }));
  const metaPath = metaPathForOutdir(resolvedOutdir, stem);
  await ensureDir(path.dirname(metaPath));
  const existingMeta = await readJsonIfExists(metaPath, {});
  const localPatchApplied = Boolean(options.localPatchApplied || existingMeta.localPatchApplied);
  const derivedFromScreenId = localPatchApplied
    ? (options.derivedFromScreenId || existingMeta.outputScreenId || existingMeta.inputScreenId || existingMeta.derivedFromScreenId || null)
    : (existingMeta.derivedFromScreenId || null);
  const payload = {
    ...existingMeta,
    ...meta,
    localPatchApplied,
    localPatchStrategy: options.localPatchStrategy || existingMeta.localPatchStrategy || null,
    derivedFromScreenId,
    renderedPreview: {
      ...renderMeta,
      networkAccess: renderNetworkAccess,
    },
    semanticCheck,
    preApprovalLockCheck,
    copyLockCheck,
    reviewedAt: new Date().toISOString(),
  };
  await writeJson(metaPath, payload);
  return { htmlPath: finalHtmlPath, imagePath, fullImagePath, metaPath };
}

export async function diagnoseLocalHtmlLayout({ htmlPath, outdir, deviceType = 'DESKTOP', stateFile = null, preApprovalLockFile = null, copyLockFile = null, responsiveMapFile = null, sourceLabel = 'layout-diagnose', viewport = defaultViewportForDeviceType(deviceType), localPatchApplied = false, localPatchStrategy = null, derivedFromScreenId = null, pageKey = null, theme = null } = {}) {
  const canonicalOutdir = path.resolve(outdir);
  const candidateAttemptDir = attemptDirForHtml(canonicalOutdir, htmlPath);
  const diagnosticOutdir = candidateAttemptDir || canonicalOutdir;
  const diagnosticsDir = path.join(runtimeDirForOutdir(diagnosticOutdir), 'diagnostics');
  await ensureDir(diagnosticsDir);
  const effectivePreApprovalLockFile = preApprovalLockFile || defaultLockFile(canonicalOutdir, 'pre-approval-lock.md');
  const effectiveCopyLockFile = copyLockFile || defaultLockFile(canonicalOutdir, 'copy-lock.md');
  const artifacts = await reviewLocalHtmlArtifacts({
    htmlPath,
    outdir: diagnosticOutdir,
    meta: {
      mode: 'layout-diagnose',
      sourceLabel,
      deviceType,
      breakpoint: breakpointForDeviceType(deviceType),
      htmlSourcePath: path.resolve(htmlPath),
      pageKey,
      theme,
    },
    viewport,
    options: {
      stateFile,
      pageKey,
      theme,
      preApprovalLockFile: effectivePreApprovalLockFile,
      copyLockFile: effectiveCopyLockFile,
      localPatchApplied,
      localPatchStrategy,
      derivedFromScreenId,
      localRenderDir: diagnosticsDir,
      localRenderSuffix: 'local',
    },
  });
  const html = await fs.readFile(artifacts.htmlPath, 'utf8');
  const meta = await readJsonIfExists(artifacts.metaPath, {});
  const responsiveMapText = responsiveMapFile && await pathExists(responsiveMapFile)
    ? await fs.readFile(responsiveMapFile, 'utf8')
    : '';
  const diagnostics = buildLayoutDiagnostics({
    html,
    deviceType,
    viewport,
    renderMeta: meta.renderedPreview || {},
    semanticCheck: meta.semanticCheck || null,
    preApprovalLockCheck: meta.preApprovalLockCheck || null,
    copyLockCheck: meta.copyLockCheck || null,
    responsiveMapText,
  });
  const diagnosticsStem = artifactStemForOutdir(canonicalOutdir, { deviceType, breakpoint: breakpointForDeviceType(deviceType), pageKey, theme }, { stateFile, pageKey, theme });
  const diagnosticsPath = path.join(diagnosticsDir, `${diagnosticsStem}.layout-diagnostics.json`);
  await writeJson(diagnosticsPath, diagnostics);
  await patchJson(artifacts.metaPath, {
    diagnosticsPath,
    layoutDiagnostics: diagnostics,
  });
  return {
    ...artifacts,
    diagnosticsPath,
    diagnostics,
  };
}


function pathWithin(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function attemptDirForHtml(canonicalOutdir, htmlPath) {
  const attemptsRoot = path.join(path.resolve(canonicalOutdir), 'attempts');
  const resolvedHtml = path.resolve(htmlPath);
  if (!pathWithin(attemptsRoot, resolvedHtml)) return null;
  const rel = path.relative(attemptsRoot, resolvedHtml).split(path.sep);
  return rel[0] ? path.join(attemptsRoot, rel[0]) : null;
}

function defaultLockFile(canonicalOutdir, name) {
  return path.join(path.resolve(canonicalOutdir), 'locks', name);
}

function normalizeStitchImageResult(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value.downloadUrl) return value.downloadUrl;
  if (value.url) return value.url;
  if (value.imageUrl) return value.imageUrl;
  if (value.screenshot?.downloadUrl) return value.screenshot.downloadUrl;
  if (value.data?.screenshot?.downloadUrl) return value.data.screenshot.downloadUrl;
  return null;
}

async function stitchCanvasImageUrlForScreen(screen) {
  if (!screen) return null;
  if (typeof screen.getImage === 'function') {
    try {
      const result = await screen.getImage();
      const url = normalizeStitchImageResult(result);
      if (url) return url;
    } catch {
      // fall back to screen metadata
    }
  }
  return normalizeStitchImageResult(screen);
}

export async function exportScreenArtifacts(screen, outdir, meta = {}, viewport = defaultViewportForDeviceType(meta.deviceType), options = {}) {
  const htmlUrl = await screen.getHtml();
  const canonicalOutdir = path.resolve(outdir);
  const targetOutdir = options.candidate === true ? candidateOutdirForOperation(canonicalOutdir, meta, options) : canonicalOutdir;
  await ensureDir(targetOutdir);
  const stem = artifactStemForOutdir(canonicalOutdir, meta, options);
  const htmlPath = path.join(targetOutdir, `${stem}.html`);
  await fetchToFile(htmlUrl, htmlPath);
  const metaPath = metaPathForOutdir(targetOutdir, stem);
  await ensureDir(path.dirname(metaPath));
  const outputScreenId = screen.screenId || screen.id || null;
  const sourceStitchScreenId = meta.sourceStitchScreenId || meta.inputScreenId || null;
  const derivedFromScreenId = meta.derivedFromScreenId || meta.inputScreenId || null;
  await patchJson(metaPath, {
    ...meta,
    htmlUrl,
    outputScreenId,
    sourceStitchScreenId,
    derivedFromScreenId,
    exportedAt: new Date().toISOString(),
    canonicalOutdir,
    candidateOutdir: targetOutdir !== canonicalOutdir ? targetOutdir : null,
    lifecycleState: targetOutdir !== canonicalOutdir ? 'candidate-ready' : 'accepted-root-export',
  });

  let localHtmlRender = null;
  if (options.renderLocalDiagnostic !== false && options.renderLocalDiagnostic !== 'false') {
    const diagnosticsDir = options.localRenderDir ? path.resolve(options.localRenderDir) : path.resolve(targetOutdir);
    await ensureDir(diagnosticsDir);
    const reviewed = await reviewLocalHtmlArtifacts({
      htmlPath,
      outdir: targetOutdir,
      meta: {
        ...meta,
        htmlUrl,
        outputScreenId,
        sourceStitchScreenId,
        derivedFromScreenId,
        exportedAt: new Date().toISOString(),
      },
      viewport,
      options: {
        ...options,
        localRenderDir: diagnosticsDir,
        localRenderSuffix: 'local',
      },
    });
    localHtmlRender = {
      imagePath: reviewed.imagePath,
      fullImagePath: reviewed.fullImagePath,
      source: 'full-access-local-html-render',
    };
  }

  let postExportRequiredNounCheck = null;
  if (localHtmlRender) {
    const checkedMeta = await readJsonIfExists(metaPath, {});
    const requiredNounMisses = [
      ...hardRequiredNounMisses(checkedMeta.preApprovalLockCheck),
      ...hardRequiredNounMisses(checkedMeta.copyLockCheck),
    ];
    postExportRequiredNounCheck = {
      passed: requiredNounMisses.length === 0,
      hardMissing: requiredNounMisses,
      checkedAt: new Date().toISOString(),
      evidence: 'full-access local HTML render and exported HTML lock checks',
    };
    await patchJson(metaPath, { postExportRequiredNounCheck });
  }

  const throwPostExportIfFailed = () => {
    if (postExportRequiredNounCheck && !postExportRequiredNounCheck.passed) {
      throw new Error(`Post-export required visible label check failed: ${postExportRequiredNounCheck.hardMissing.map((item) => item.expected || item.kind).join(', ')}`);
    }
  };

  const stitchImageUrl = await stitchCanvasImageUrlForScreen(screen);
  if (!stitchImageUrl) {
    const fallbackImagePath = path.join(targetOutdir, `${stem}.png`);
    if (localHtmlRender?.imagePath) await fs.copyFile(localHtmlRender.imagePath, fallbackImagePath);
    const fallbackDimensions = await pngDimensionsFromFile(fallbackImagePath);
    await patchJson(metaPath, {
      screenshotSource: localHtmlRender ? 'local-html-full-access-fallback' : 'none',
      screenshotFallback: {
        reason: 'stitch-canvas-image-unavailable',
        releaseQuality: false,
        imagePath: localHtmlRender?.imagePath ? fallbackImagePath : null,
        dimensions: fallbackDimensions,
        capturedAt: new Date().toISOString(),
      },
      localHtmlRender,
    });
    throwPostExportIfFailed();
    return {
      htmlPath,
      imagePath: localHtmlRender?.imagePath ? fallbackImagePath : null,
      fullImagePath: localHtmlRender?.fullImagePath || null,
      metaPath,
      localImagePath: localHtmlRender?.imagePath || null,
      localFullImagePath: localHtmlRender?.fullImagePath || null,
      screenshotSource: localHtmlRender ? 'local-html-full-access-fallback' : 'none',
      degradedScreenshot: true,
    };
  }

  const canvasImagePath = path.join(targetOutdir, `${stem}.png`);
  await fetchToFile(stitchImageUrl, canvasImagePath);
  const stitchDimensions = await pngDimensionsFromFile(canvasImagePath);
  const stitchScreenshotSanity = assessStitchScreenshotDimensions(stitchDimensions, viewport);
  await patchJson(metaPath, {
    screenshotSource: 'stitch-canvas',
    stitchCanvasScreenshot: {
      imagePath: canvasImagePath,
      imageUrl: stitchImageUrl,
      capturedAt: new Date().toISOString(),
      dimensions: stitchDimensions,
      sanity: stitchScreenshotSanity,
    },
    localHtmlRender,
  });
  throwPostExportIfFailed();
  return {
    htmlPath,
    imagePath: canvasImagePath,
    fullImagePath: null,
    metaPath,
    localImagePath: localHtmlRender?.imagePath || null,
    localFullImagePath: localHtmlRender?.fullImagePath || null,
    screenshotSource: 'stitch-canvas',
    stitchCanvasImageUrl: stitchImageUrl,
    canonicalOutdir,
    candidateOutdir: targetOutdir !== canonicalOutdir ? targetOutdir : null,
  };
}
