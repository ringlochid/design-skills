#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    args[key.slice(2)] = value;
  }
  return args;
}

export function workspaceRoot() {
  return path.resolve(__dirname, '../../..');
}

function slugifyPageToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

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
      const configPath = path.join(current, '00-meta', 'design-config.json');
      const roadmapPath = path.join(current, 'ROADMAP.md');
      if (await pathExists(configPath)) return current;
      if (await pathExists(roadmapPath)) return current;
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
    : (resolvedProjectRoot ? path.join(resolvedProjectRoot, '00-meta', 'design-config.json') : null);
  const defaults = {
    version: 2,
    projectRoot: resolvedProjectRoot,
    metaDir: '00-meta',
    pagesDir: '03-pages',
    policyFile: '00-meta/design-policy.md',
    runtimeDir: '00-meta/runtime',
    designSystemDir: '00-meta/design-system',
    primaryBreakpoint: 'mobile',
    enabledBreakpoints: ['mobile', 'tablet', 'desktop'],
    themeStrategy: 'single-theme',
    repoAwarenessMode: 'inspect-only',
    designSystemMode: 'create-new',
    stitch: {
      globalSessionIndex: '00-meta/runtime/stitch-sessions.json',
      projectRuntime: '00-meta/runtime/stitch-project.json',
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

export function inferPageKeyFromStatePath(statePath, pagesDirName = '03-pages') {
  if (!statePath) return null;
  const resolved = path.resolve(statePath);
  const parts = resolved.split(path.sep).filter(Boolean);
  const pageRootName = path.basename(pagesDirName);
  const index = parts.findIndex((part) => part === pageRootName);
  if (index >= 0 && parts[index + 1]) return parts[index + 1];
  return null;
}

export async function resolveDesignPaths({ projectRoot = null, configFile = null, page = null, outdir = null, stateFile = null, deviceType = 'MOBILE', startPath = null } = {}) {
  const config = await loadDesignProjectConfig({ projectRoot, configFile, startPath: startPath || outdir || stateFile || process.cwd() });
  const resolvedPage = page ? await resolvePageDirectory({ projectRoot: config.projectRoot, config, page }) : null;
  const breakpoint = breakpointForDeviceType(deviceType);
  const stitchRoot = resolvedPage ? path.join(resolvedPage.pageDir, 'exports', 'stitch') : null;
  const resolvedStateFile = stateFile
    ? path.resolve(stateFile)
    : (stitchRoot ? path.join(stitchRoot, 'state.json') : (outdir ? inferStatePath({ outdir }) : null));
  const resolvedOutdir = outdir
    ? path.resolve(outdir)
    : (stitchRoot ? path.join(stitchRoot, breakpoint) : null);
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
    globalSessionIndexPath: config.stitch?.globalSessionIndexPath || null,
  };
}

export async function loadProjectRuntime({ projectRoot = null, config = null, startPath = null } = {}) {
  const activeConfig = config || await loadDesignProjectConfig({ projectRoot, startPath });
  const runtimePath = activeConfig?.stitch?.projectRuntimePath
    || (activeConfig?.runtimeRoot ? path.join(activeConfig.runtimeRoot, 'stitch-project.json') : null);
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

export async function assertPhaseZeroReady({ projectRoot = null, configFile = null, startPath = null, requireRepoContext = true } = {}) {
  const config = await loadDesignProjectConfig({ projectRoot, configFile, startPath });
  if (!config.projectRoot) {
    throw new Error('Unable to resolve design project root for Phase 0 context. Provide --project-root or run from inside a design workspace.');
  }

  const warnings = [];
  if (!config.configFile || !await pathExists(config.configFile)) warnings.push(config.configFile || '00-meta/design-config.json');
  if (!config.policyFilePath || !await pathExists(config.policyFilePath)) warnings.push(config.policyFilePath || '00-meta/design-policy.md');

  const repoStatusPath = config.metaRoot ? path.join(config.metaRoot, 'repo-status.json') : null;
  const repoContextPath = config.metaRoot ? path.join(config.metaRoot, 'repo-context.json') : null;
  const shouldRequireRepoOutputs = requireRepoContext && config.repoAwarenessMode !== 'ignore-repo';
  if (shouldRequireRepoOutputs) {
    if (!repoStatusPath || !await pathExists(repoStatusPath)) warnings.push(repoStatusPath || '00-meta/repo-status.json');
    if (!repoContextPath || !await pathExists(repoContextPath)) warnings.push(repoContextPath || '00-meta/repo-context.json');
  }

  const repoStatus = repoStatusPath ? await readJsonIfExists(repoStatusPath, null) : null;

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
  return { config, repoStatus, warnings };
}

export async function syncGlobalStitchSessionIndex({ projectRoot = null, globalSessionIndexPath = null, statePath, state, primaryBreakpoint = null, designSystem = null } = {}) {
  const resolvedProjectRoot = projectRoot || await discoverDesignProjectRoot({ startPath: statePath });
  if (!resolvedProjectRoot) return null;
  const config = await loadDesignProjectConfig({ projectRoot: resolvedProjectRoot, startPath: statePath }).catch(() => null);
  const { runtime } = await loadProjectRuntime({ projectRoot: resolvedProjectRoot, config, startPath: statePath }).catch(() => ({ runtime: null }));
  const indexPath = globalSessionIndexPath || config?.stitch?.globalSessionIndexPath || path.join(resolvedProjectRoot, '00-meta', 'runtime', 'stitch-sessions.json');
  const current = await readJsonIfExists(indexPath, {
    version: 1,
    projectRoot: resolvedProjectRoot,
    pages: {},
    updatedAt: null,
  });
  const pageKey = inferPageKeyFromStatePath(statePath, config?.pagesDir || '03-pages');
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

export async function loadStitchSdk() {
  try {
    return await import('@google/stitch-sdk');
  } catch {
    const candidates = [];
    if (process.env.STITCH_SDK_NODE_MODULES) {
      candidates.push(path.join(process.env.STITCH_SDK_NODE_MODULES, '@google/stitch-sdk/dist/src/index.js'));
    }
    candidates.push(path.join(workspaceRoot(), 'tmp/stitch-sdk-exp/node_modules/@google/stitch-sdk/dist/src/index.js'));
    for (const candidate of candidates) {
      try {
        return await import(pathToFileURL(candidate).href);
      } catch {
        // try next
      }
    }
    throw new Error('Unable to load @google/stitch-sdk. Install it or set STITCH_SDK_NODE_MODULES.');
  }
}

export function availableApiKeys() {
  return [process.env.STITCH_API_KEY, process.env.STITCH_API_KEY_1].filter(Boolean);
}

export async function createSdk(apiKey) {
  const sdk = await loadStitchSdk();
  if (!sdk.Stitch || !sdk.StitchToolClient) {
    throw new Error('Loaded Stitch SDK is missing Stitch or StitchToolClient exports.');
  }
  const client = new sdk.StitchToolClient({ apiKey, timeout: 300_000 });
  const instance = new sdk.Stitch(client);
  return { sdk, client, stitch: instance };
}

export function isRateLimitLikeError(error) {
  const message = (error?.message || String(error || '')).toLowerCase();
  return [
    '429',
    'rate limit',
    'rate-limit',
    'too many requests',
    'quota',
    'resource_exhausted',
    'exhausted',
    'capacity',
  ].some(token => message.includes(token));
}

export async function withKeyFallback(runFn) {
  const keys = availableApiKeys();
  if (!keys.length) {
    throw new Error('No Stitch API key found in environment. Expected STITCH_API_KEY or STITCH_API_KEY_1.');
  }
  const errors = [];
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    let ctx;
    try {
      ctx = await createSdk(key);
      const result = await runFn(ctx.stitch, ctx.sdk);
      await ctx.client.close().catch(() => {});
      return result;
    } catch (error) {
      if (ctx?.client) await ctx.client.close().catch(() => {});
      const message = error.message || String(error);
      errors.push(message);
      const hasAnotherKey = i < keys.length - 1;
      if (!hasAnotherKey) break;
      if (!isRateLimitLikeError(error)) {
        throw error;
      }
    }
  }
  throw new Error(errors.join(' | '));
}

export function normalizeStitchModelId(modelId = null, fallback = 'GEMINI_3_PRO') {
  const value = String(modelId || fallback).trim().toUpperCase();
  if (value === 'GEMINI_3_1_PRO') return 'GEMINI_3_PRO';
  if (value === 'GEMINI_3_PRO') return 'GEMINI_3_PRO';
  if (value === 'GEMINI_3_FLASH') return 'GEMINI_3_FLASH';
  return fallback;
}

export async function createOrOpenStitchProject(stitch, { title, projectId } = {}) {
  const asProject = (candidate) => {
    if (!candidate) return null;
    if (typeof candidate === 'object' && typeof candidate.generate === 'function' && typeof candidate.getScreen === 'function') {
      return candidate;
    }
    const resolvedProjectId = candidate?.projectId || candidate?.id || candidate;
    if (resolvedProjectId && typeof stitch?.project === 'function') {
      return stitch.project(resolvedProjectId);
    }
    return null;
  };
  if (projectId) return stitch.project(projectId);
  if (typeof stitch?.createProject === 'function') {
    const created = await stitch.createProject(title);
    const wrapped = asProject(created);
    if (wrapped) return wrapped;
  }
  if (typeof stitch?.callTool === 'function') {
    const created = await stitch.callTool('create_project', { title });
    const wrapped = asProject(created)
      || asProject(created?.project)
      || asProject(created?.projectId)
      || asProject(created?.id)
      || asProject(created?.project?.projectId)
      || asProject(created?.project?.id);
    if (wrapped) return wrapped;
  }
  throw new Error('Unable to create a Stitch project with the current SDK surface.');
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
  outputLockFile = null,
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

  const requiredSnippets = ['# stitch prompt', 'copy locks:'];
  if (stage.includes('generate')) {
    requiredSnippets.push('goal:', 'responsive intent:', 'theme intent:', 'semantic focus:', 'page-specific guardrails:', 'use this exact visible copy:');
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

  const preApproval = await loadPreApprovalLock({ outdir, stateFile, preApprovalLockFile });
  const copy = await loadCopyLock({ outdir, stateFile, copyLockFile });
  const output = await loadOutputLock({ outdir, stateFile, outputLockFile });

  if (stage.includes('generate') && !preApproval.preApprovalLock) {
    errors.push(`missing pre-approval lock: ${preApproval.preApprovalLockPath}`);
  }
  if (stage.includes('remap') && !copy.copyLock) {
    errors.push(`missing copy lock: ${copy.copyLockPath}`);
  }
  if ((stage.includes('edit') || stage.includes('repair')) && !copy.copyLock && !preApproval.preApprovalLock) {
    errors.push(`missing copy lock: ${copy.copyLockPath}`);
  }
  if (!output.outputLock) {
    errors.push(`missing output lock: ${output.outputLockPath}`);
  }

  const lockSource = output.outputLock || copy.copyLock || preApproval.preApprovalLock || null;
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
    outputLockPath: output.outputLockPath || null,
  };
}

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function fetchToFile(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  const ab = await res.arrayBuffer();
  await fs.writeFile(outPath, Buffer.from(ab));
  return res.headers.get('content-type') || '';
}

export function normalizeDeviceType(deviceType = 'DESKTOP') {
  return String(deviceType || 'DESKTOP').trim().toUpperCase();
}

export function breakpointForDeviceType(deviceType = 'DESKTOP') {
  const normalized = normalizeDeviceType(deviceType);
  if (normalized === 'MOBILE') return 'mobile';
  if (normalized === 'TABLET') return 'tablet';
  if (normalized === 'DESKTOP') return 'desktop';
  return 'agnostic';
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
    // legacy path: design-work/stitch
    if (part === 'design-work' && next === 'stitch') {
      return `${path.sep}${path.join(...parts.slice(0, i + 2))}`;
    }
    // new repo structure: .../03-pages/.../exports/stitch/<breakpoint>
    if (part === 'stitch' && parts[i - 1] === 'exports') {
      return `${path.sep}${path.join(...parts.slice(0, i + 1))}`;
    }
    if (part === 'stitch') {
      return `${path.sep}${path.join(...parts.slice(0, i + 1))}`;
    }
  }
  return null;
}

export function stitchRootForOutdir({ outdir, stateFile } = {}) {
  return path.dirname(inferStatePath({ outdir, stateFile }));
}

export function semanticRulesPathForOutdir({ outdir, stateFile } = {}) {
  return path.join(stitchRootForOutdir({ outdir, stateFile }), 'semantic-rules.json');
}

export function preApprovalLockPathForOutdir({ outdir, stateFile, preApprovalLockFile } = {}) {
  if (preApprovalLockFile) return path.resolve(preApprovalLockFile);
  return path.join(stitchRootForOutdir({ outdir, stateFile }), 'pre-approval-lock.md');
}

export function copyLockPathForOutdir({ outdir, stateFile, copyLockFile } = {}) {
  if (copyLockFile) return path.resolve(copyLockFile);
  return path.join(stitchRootForOutdir({ outdir, stateFile }), 'copy-lock.md');
}

export function outputLockPathForOutdir({ outdir, stateFile, outputLockFile } = {}) {
  if (outputLockFile) return path.resolve(outputLockFile);
  return path.join(stitchRootForOutdir({ outdir, stateFile }), 'output-lock.md');
}

export function inferStatePath({ outdir, stateFile } = {}) {
  if (stateFile) return path.resolve(stateFile);
  if (!outdir) throw new Error('inferStatePath requires outdir or stateFile.');
  const stitchRoot = findLikelyStitchRoot(outdir);
  if (stitchRoot) return path.join(stitchRoot, 'state.json');
  const resolved = path.resolve(outdir);
  const base = path.basename(resolved).toLowerCase();
  const parent = path.dirname(resolved);
  const parentBase = path.basename(parent).toLowerCase();
  const breakpointDirs = new Set(['mobile', 'tablet', 'desktop', 'agnostic']);
  if (breakpointDirs.has(base)) return path.join(parent, 'state.json');
  if (base === 'variants' && breakpointDirs.has(parentBase)) return path.join(path.dirname(parent), 'state.json');
  if (/^variant-\d+$/.test(base) && parentBase === 'variants') {
    const breakpointDir = path.dirname(parent);
    if (breakpointDirs.has(path.basename(breakpointDir).toLowerCase())) {
      return path.join(path.dirname(breakpointDir), 'state.json');
    }
  }
  return path.join(resolved, 'state.json');
}

export async function readJsonIfExists(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

export async function writeJson(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2));
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

export async function patchJson(filePath, patch) {
  const current = await readJsonIfExists(filePath, {});
  await writeJson(filePath, { ...(current || {}), ...patch });
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
    '## Required nouns',
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
    siteTitle: guidance.siteTitle || 'Product',
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
    siteTitle: guidance.siteTitle || 'Product',
    pageTitle: guidance.pageTitle || guidance.pageName || null,
    primaryNavLabels: guidance.navLabels || [],
    searchPlaceholder: guidance.searchPlaceholder || null,
    keySectionHeadings: guidance.coreHeadings || [],
    keyCtaLinkLabels: guidance.ctaLabels || [],
    requiredNouns: guidance.requiredNouns || [],
    bannedDriftWords: guidance.banned || [],
  });
}

export function buildOutputLockMarkdown(guidance = {}) {
  return buildLockMarkdown({
    title: 'Output lock',
    siteTitle: guidance.siteTitle || 'Product',
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

    if (currentSection === 'required nouns' && bulletMatch) {
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
  if (!keySectionHeadings.length) return [];
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

export async function loadOutputLock({ outdir, stateFile, outputLockFile } = {}) {
  const outputLockPath = outputLockPathForOutdir({ outdir, stateFile, outputLockFile });
  try {
    const markdown = await fs.readFile(outputLockPath, 'utf8');
    return { outputLockPath, outputLock: parseCopyLockMarkdown(markdown) };
  } catch (error) {
    if (error?.code === 'ENOENT') return { outputLockPath, outputLock: null };
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

export async function evaluateOutputLockForHtml({ htmlPath, outdir, stateFile, outputLockFile, deviceType = 'DESKTOP' } = {}) {
  const { outputLockPath, outputLock } = await loadOutputLock({ outdir, stateFile, outputLockFile });
  if (!outputLock) return null;
  const html = await fs.readFile(htmlPath, 'utf8');
  return evaluateParsedLockAgainstHtml(outputLock, 'outputLockPath', outputLockPath, html, { mode: 'output', deviceType });
}

export function defaultViewportForDeviceType(deviceType = 'DESKTOP') {
  const normalized = String(deviceType || 'DESKTOP').toUpperCase();
  if (normalized === 'MOBILE') {
    return { width: 390, height: 844, deviceScaleFactor: 2, delayMs: 1500 };
  }
  if (normalized === 'TABLET') {
    return { width: 1024, height: 1366, deviceScaleFactor: 2, delayMs: 1500 };
  }
  return { width: 1440, height: 900, deviceScaleFactor: 2, delayMs: 1500 };
}

export function viewportOptionsFromArgs(args = {}, deviceType = 'DESKTOP') {
  const defaults = defaultViewportForDeviceType(deviceType);
  return {
    width: args['viewport-width'] ? Number(args['viewport-width']) : defaults.width,
    height: args['viewport-height'] ? Number(args['viewport-height']) : defaults.height,
    deviceScaleFactor: args['device-scale-factor'] ? Number(args['device-scale-factor']) : defaults.deviceScaleFactor,
    delayMs: args['render-delay-ms'] ? Number(args['render-delay-ms']) : defaults.delayMs,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

function contentTypeForFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
  }[ext] || 'application/octet-stream';
}

async function startStaticServer(rootDir, defaultFile) {
  const resolvedRoot = path.resolve(rootDir);
  const server = createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      let requestPath = decodeURIComponent(url.pathname || '/');
      if (requestPath === '/') requestPath = `/${defaultFile}`;
      const candidate = path.resolve(resolvedRoot, `.${requestPath}`);
      if (candidate !== resolvedRoot && !candidate.startsWith(`${resolvedRoot}${path.sep}`)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }
      const content = await fs.readFile(candidate);
      res.writeHead(200, { 'Content-Type': contentTypeForFile(candidate) });
      res.end(content);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(error.message || String(error));
    }
  });

  await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
    close: async () => {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}

async function commandWorks(command, args = ['--version']) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve(false);
    }, 5000);
    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

async function findChromiumBinary() {
  const candidates = [
    process.env.CHROMIUM_BIN,
    '/snap/bin/chromium',
    'chromium',
    'chromium-browser',
    '/usr/bin/chromium-browser',
    'google-chrome',
    'google-chrome-stable',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await commandWorks(candidate)) return candidate;
  }
  throw new Error('Unable to find a Chromium binary for rendered preview capture. Set CHROMIUM_BIN if needed.');
}

async function waitForJsonVersion(debugPort, timeoutMs = 15000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (res.ok) return await res.json();
      lastError = new Error(`Debugger endpoint returned ${res.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(200);
  }
  throw lastError || new Error('Timed out waiting for Chromium remote debugging endpoint.');
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
  const designSystemRoot = activeConfig?.designSystemRoot || path.join(path.dirname(statePath), 'design-system');
  const exportedRoot = path.join(designSystemRoot, 'exported');
  const project = stitch.project(projectId);
  const systems = await project.listDesignSystems().catch(() => []);
  const primary = systems[0];
  if (!primary) {
    return { designSystem: null, designSystemJsonPath: null, designSystemMdPath: null, designStyleMdPath: null, statePath };
  }
  const designSystemJsonPath = path.join(exportedRoot, 'design-system.json');
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

  const inventoryPath = config?.runtimeRoot ? path.join(config.runtimeRoot, 'stitch-project-screens.json') : null;
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
    globalSessionIndexPath: config?.stitch?.globalSessionIndexPath || null,
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

class CdpConnection {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.eventWaiters = [];
  }

  static async connect(wsUrl) {
    const connection = new CdpConnection(wsUrl);
    await connection.open();
    return connection;
  }

  async open() {
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', (event) => reject(event.error || new Error('WebSocket open failed')));
      ws.addEventListener('message', (event) => this.onMessage(event));
      ws.addEventListener('close', () => {
        for (const { reject } of this.pending.values()) {
          reject(new Error('CDP WebSocket closed'));
        }
        this.pending.clear();
      });
    });
  }

  onMessage(event) {
    const message = JSON.parse(event.data);
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else pending.resolve(message.result || {});
      return;
    }
    for (let i = 0; i < this.eventWaiters.length; i += 1) {
      const waiter = this.eventWaiters[i];
      if (waiter.method !== message.method) continue;
      if (waiter.sessionId && waiter.sessionId !== message.sessionId) continue;
      this.eventWaiters.splice(i, 1);
      waiter.resolve(message);
      return;
    }
  }

  async send(method, params = {}, sessionId) {
    const id = this.nextId += 1;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.ws.send(JSON.stringify(payload));
    return await promise;
  }

  async waitForEvent(method, sessionId, timeoutMs = 30000) {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.eventWaiters.findIndex((waiter) => waiter.resolve === resolve);
        if (index >= 0) this.eventWaiters.splice(index, 1);
        reject(new Error(`Timed out waiting for event ${method}`));
      }, timeoutMs);
      this.eventWaiters.push({
        method,
        sessionId,
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
        reject,
      });
    });
  }

  async close() {
    if (!this.ws) return;
    this.ws.close();
    this.ws = null;
  }
}

function pngDimensionsFromBuffer(buffer) {
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') {
    throw new Error('Rendered preview is not a PNG.');
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

export async function renderHtmlPreview({ htmlPath, outPath, fullOutPath, viewport }) {
  const resolvedHtmlPath = path.resolve(htmlPath);
  const rootDir = path.dirname(resolvedHtmlPath);
  const defaultFile = path.basename(resolvedHtmlPath);
  const staticServer = await startStaticServer(rootDir, defaultFile);
  await ensureDir(path.dirname(outPath));
  if (fullOutPath) await ensureDir(path.dirname(fullOutPath));
  const homedirTmp = path.join(os.homedir(), 'tmp');
  await ensureDir(homedirTmp);
  const userDataDir = await fs.mkdtemp(path.join(homedirTmp, 'openclaw-stitch-render-'));
  const chromium = await findChromiumBinary();
  const debugPort = await getFreePort();
  const browser = spawn(chromium, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-dev-shm-usage',
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], {
    stdio: 'ignore',
  });

  let cdp;
  let targetId;
  try {
    const version = await waitForJsonVersion(debugPort, 20000);
    cdp = await CdpConnection.connect(version.webSocketDebuggerUrl);
    const created = await cdp.send('Target.createTarget', { url: 'about:blank', newWindow: false });
    targetId = created.targetId;
    const attached = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const sessionId = attached.sessionId;

    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.deviceScaleFactor,
      mobile: false,
      screenWidth: viewport.width,
      screenHeight: viewport.height,
      positionX: 0,
      positionY: 0,
      dontSetVisibleSize: false,
    }, sessionId);

    const targetUrl = `${staticServer.baseUrl}/${encodeURIComponent(defaultFile)}`;
    await cdp.send('Page.navigate', { url: targetUrl }, sessionId);
    await cdp.waitForEvent('Page.loadEventFired', sessionId, 30000);
    await cdp.send('Runtime.evaluate', {
      expression: `(async () => {
        try {
          if (document.fonts?.ready) await document.fonts.ready;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, ${viewport.delayMs}));
        return true;
      })()`,
      awaitPromise: true,
      returnByValue: true,
    }, sessionId);

    const layout = await cdp.send('Page.getLayoutMetrics', {}, sessionId);
    const evaluated = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const de = document.documentElement;
        const body = document.body;
        const attrs = ['aria-label', 'placeholder', 'alt', 'value', 'title'];
        const meaningfulTags = new Set(['IMG', 'SVG', 'CANVAS', 'VIDEO', 'PICTURE', 'INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'A']);
        const meaningfulElements = Array.from(body?.querySelectorAll('*') || []).filter((el) => {
          const tag = (el.tagName || '').toUpperCase();
          if (!tag || ['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'HEAD'].includes(tag)) return false;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) === 0) return false;
          const rect = el.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) return false;
          const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
          const directText = Array.from(el.childNodes || []).some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent || '').replace(/\s+/g, ' ').trim().length > 0);
          const hasText = directText || (el.children.length === 0 && text.length > 0);
          const hasAttrText = attrs.some((attr) => {
            const value = el.getAttribute?.(attr);
            return !!(value && value.trim());
          });
          const hasBackgroundImage = style.backgroundImage && style.backgroundImage !== 'none';
          return hasText || hasAttrText || meaningfulTags.has(tag) || hasBackgroundImage;
        });

        let contentBottom = 0;
        let contentRight = 0;
        for (const el of meaningfulElements) {
          const rect = el.getBoundingClientRect();
          contentBottom = Math.max(contentBottom, rect.bottom + window.scrollY);
          contentRight = Math.max(contentRight, rect.right + window.scrollX);
        }

        const fixedBottomCandidates = Array.from(body?.querySelectorAll('*') || []).filter((el) => {
          const tag = (el.tagName || '').toUpperCase();
          if (!tag || ['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'HEAD'].includes(tag)) return false;
          const style = window.getComputedStyle(el);
          if (!['fixed', 'sticky'].includes(String(style.position || '').toLowerCase())) return false;
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) === 0) return false;
          const rect = el.getBoundingClientRect();
          if (rect.width < window.innerWidth * 0.55 || rect.height < 36) return false;
          if (rect.top < window.innerHeight * 0.55) return false;
          if (rect.bottom < window.innerHeight - 4) return false;
          return true;
        });

        let fixedBottomBar = null;
        if (fixedBottomCandidates.length) {
          const bar = fixedBottomCandidates
            .map((el) => ({ el, rect: el.getBoundingClientRect() }))
            .sort((a, b) => (b.rect.height * b.rect.width) - (a.rect.height * a.rect.width))[0];

          const overlapping = meaningfulElements
            .filter((el) => el !== bar.el && !bar.el.contains(el) && !el.contains(bar.el))
            .map((el) => {
              const rect = el.getBoundingClientRect();
              const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
              const directText = Array.from(el.childNodes || []).some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent || '').replace(/\s+/g, ' ').trim().length > 0);
              return { el, rect, text, directText };
            })
            .filter(({ el, rect, text, directText }) => {
              const tag = (el.tagName || '').toUpperCase();
              const style = window.getComputedStyle(el);
              if (style.position === 'fixed' || style.position === 'sticky') return false;
              if (rect.width < 12 || rect.height < 12) return false;
              if (rect.bottom <= 0 || rect.top >= window.innerHeight) return false;
              if (rect.bottom <= bar.rect.top + 2) return false;
              if (rect.top >= bar.rect.bottom - 2) return false;
              const hasUsefulContent = directText || meaningfulTags.has(tag) || (text && text.length > 0) || (style.backgroundImage && style.backgroundImage !== 'none');
              return hasUsefulContent;
            });

          fixedBottomBar = {
            top: Math.round(bar.rect.top),
            bottom: Math.round(bar.rect.bottom),
            height: Math.round(bar.rect.height),
            width: Math.round(bar.rect.width),
            overlapCount: overlapping.length,
            overlapSamples: overlapping.slice(0, 6).map(({ el, text, rect }) => ({
              tag: (el.tagName || '').toUpperCase(),
              text: String(text || '').slice(0, 80),
              top: Math.round(rect.top),
              bottom: Math.round(rect.bottom),
            })),
          };
        }

        return {
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
            dpr: window.devicePixelRatio,
          },
          fullWidth: Math.max(de.scrollWidth, body?.scrollWidth || 0, de.clientWidth, body?.clientWidth || 0),
          fullHeight: Math.max(de.scrollHeight, body?.scrollHeight || 0, de.clientHeight, body?.clientHeight || 0),
          meaningfulWidth: Math.max(contentRight, 0),
          meaningfulHeight: Math.max(contentBottom, 0),
          meaningfulElementCount: meaningfulElements.length,
          fixedBottomBar,
        };
      })()`,
      returnByValue: true,
    }, sessionId);

    const measured = evaluated.result?.value || {};
    const layoutWidth = Math.ceil(layout.contentSize?.width || 0);
    const layoutHeight = Math.ceil(layout.contentSize?.height || 0);
    const domFullWidth = Math.ceil(measured.fullWidth || 0);
    const domFullHeight = Math.ceil(measured.fullHeight || 0);
    const meaningfulWidth = Math.ceil(measured.meaningfulWidth || 0);
    const meaningfulHeight = Math.ceil(measured.meaningfulHeight || 0);

    const fullWidth = Math.ceil(Math.max(layoutWidth, domFullWidth, meaningfulWidth, viewport.width));
    const rawFullHeight = Math.ceil(Math.max(layoutHeight, domFullHeight, viewport.height));
    const croppedHeight = meaningfulHeight ? Math.min(Math.max(meaningfulHeight + 32, 240), rawFullHeight) : rawFullHeight;
    const fullHeight = Math.max(1, croppedHeight);
    const viewportShot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
      clip: {
        x: 0,
        y: 0,
        width: viewport.width,
        height: viewport.height,
        scale: 1,
      },
    }, sessionId);

    const viewportBuffer = Buffer.from(viewportShot.data, 'base64');
    await fs.writeFile(outPath, viewportBuffer);
    const viewportImageSize = pngDimensionsFromBuffer(viewportBuffer);

    const screenshot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
      clip: {
        x: 0,
        y: 0,
        width: fullWidth,
        height: fullHeight,
        scale: 1,
      },
    }, sessionId);

    const buffer = Buffer.from(screenshot.data, 'base64');
    const fullPagePath = fullOutPath || outPath;
    await fs.writeFile(fullPagePath, buffer);
    const fullPageImageSize = pngDimensionsFromBuffer(buffer);

    await cdp.send('Target.closeTarget', { targetId });
    return {
      previewPath: outPath,
      fullPagePath,
      viewport: {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.deviceScaleFactor,
        delayMs: viewport.delayMs,
      },
      renderedCssSize: {
        width: viewport.width,
        height: viewport.height,
      },
      fullPageRenderedCssSize: {
        width: fullWidth,
        height: fullHeight,
      },
      viewportCapture: {
        previewPath: outPath,
        renderedCssSize: {
          width: viewport.width,
          height: viewport.height,
        },
        imageSize: viewportImageSize,
      },
      fullPageCapture: {
        previewPath: fullPagePath,
        renderedCssSize: {
          width: fullWidth,
          height: fullHeight,
        },
        imageSize: fullPageImageSize,
      },
      contentMetrics: {
        layoutWidth,
        domFullWidth,
        meaningfulWidth,
        layoutHeight,
        domFullHeight,
        meaningfulHeight,
        meaningfulElementCount: Number(measured.meaningfulElementCount || 0),
        fixedBottomBar: measured.fixedBottomBar || null,
      },
      imageSize: viewportImageSize,
      fullPageImageSize,
    };
  } finally {
    if (cdp) await cdp.close().catch(() => {});
    if (browser.pid && !browser.killed) browser.kill('SIGTERM');
    await staticServer.close().catch(() => {});
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function reviewLocalHtmlArtifacts({ htmlPath, outdir, meta = {}, viewport = defaultViewportForDeviceType(meta.deviceType), options = {} }) {
  await ensureDir(outdir);
  const resolvedHtmlPath = path.resolve(htmlPath);
  const finalHtmlPath = path.join(path.resolve(outdir), 'screen.html');
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
  const imagePath = path.join(outdir, 'screen.png');
  const fullImagePath = path.join(outdir, 'screen-full.png');
  const renderMeta = await renderHtmlPreview({ htmlPath: finalHtmlPath, outPath: imagePath, fullOutPath: fullImagePath, viewport });
  const deviceType = meta.deviceType || 'DESKTOP';
  const semanticCheck = await safeEvaluate('semantic-check', () => evaluateSemanticRulesForHtml({ htmlPath: finalHtmlPath, outdir, stateFile: options.stateFile || null, deviceType }));
  const preApprovalLockCheck = await safeEvaluate('pre-approval-lock-check', () => evaluatePreApprovalLockForHtml({ htmlPath: finalHtmlPath, outdir, stateFile: options.stateFile || null, preApprovalLockFile: options.preApprovalLockFile || null, deviceType }));
  const copyLockCheck = await safeEvaluate('copy-lock-check', () => evaluateCopyLockForHtml({ htmlPath: finalHtmlPath, outdir, stateFile: options.stateFile || null, copyLockFile: options.copyLockFile || null, deviceType }));
  const outputLockCheck = await safeEvaluate('output-lock-check', () => evaluateOutputLockForHtml({ htmlPath: finalHtmlPath, outdir, stateFile: options.stateFile || null, outputLockFile: options.outputLockFile || null, deviceType }));
  const metaPath = path.join(outdir, 'meta.json');
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
    renderedPreview: renderMeta,
    semanticCheck,
    preApprovalLockCheck,
    copyLockCheck,
    outputLockCheck,
    reviewedAt: new Date().toISOString(),
  };
  await fs.writeFile(metaPath, JSON.stringify(payload, null, 2));
  return { htmlPath: finalHtmlPath, imagePath, fullImagePath, metaPath };
}

export function buildLayoutDiagnostics({ html = '', deviceType = 'DESKTOP', viewport = defaultViewportForDeviceType(deviceType), renderMeta = {}, semanticCheck = null, preApprovalLockCheck = null, copyLockCheck = null, outputLockCheck = null, responsiveMapText = '' } = {}) {
  const normalizedDeviceType = normalizeDeviceType(deviceType);
  const contentMetrics = renderMeta.contentMetrics || {};
  const viewportWidth = Number(renderMeta.renderedCssSize?.width || viewport.width || 0);
  const fullWidth = Number(renderMeta.fullPageRenderedCssSize?.width || 0);
  const meaningfulWidth = Number(contentMetrics.meaningfulWidth || 0);
  const domFullWidth = Number(contentMetrics.domFullWidth || 0);
  const widthRatio = viewportWidth > 0 && meaningfulWidth > 0 ? Number((meaningfulWidth / viewportWidth).toFixed(3)) : null;
  const fixedBottomBar = contentMetrics.fixedBottomBar || null;
  const lowerHtml = String(html || '').toLowerCase();
  const lowerResponsiveMap = String(responsiveMapText || '').toLowerCase();
  const findings = [];
  const recommendedStrategies = [];
  const blockers = [];

  const addStrategy = (value) => {
    if (value && !recommendedStrategies.includes(value)) recommendedStrategies.push(value);
  };
  const addFinding = (severity, code, detail) => findings.push({ severity, code, detail });

  const semanticPassed = semanticCheck ? semanticCheck.passed === true : true;
  const preApprovalPassed = preApprovalLockCheck ? preApprovalLockCheck.passed === true : true;
  const copyPassed = copyLockCheck ? copyLockCheck.passed === true : true;
  const outputPassed = outputLockCheck ? outputLockCheck.passed === true : true;

  if (!semanticPassed) blockers.push('semantic-check-failed');
  if (!preApprovalPassed) blockers.push('pre-approval-lock-failed');
  if (!copyPassed) blockers.push('copy-lock-failed');
  if (!outputPassed) blockers.push('output-lock-failed');
  if (semanticCheck?.error) blockers.push('semantic-check-error');
  if (preApprovalLockCheck?.error) blockers.push('pre-approval-lock-error');
  if (copyLockCheck?.error) blockers.push('copy-lock-error');
  if (outputLockCheck?.error) blockers.push('output-lock-error');

  const overflowX = fullWidth > viewportWidth + 24 || domFullWidth > viewportWidth + 24;
  if (overflowX) {
    addFinding('high', 'overflow-x', `Rendered width ${fullWidth || domFullWidth}px exceeds viewport ${viewportWidth}px.`);
    addStrategy('overflow-containment');
  }

  if (normalizedDeviceType === 'MOBILE' && Number(fixedBottomBar?.height || 0) >= 36 && Number(fixedBottomBar?.overlapCount || 0) > 0) {
    addFinding('high', 'mobile-bottom-nav-overlap', `Fixed bottom navigation overlaps ${fixedBottomBar.overlapCount} meaningful elements in the initial viewport.`);
    addStrategy('mobile-bottom-safe-area');
  }

  if (/design-flow-auto-layout-fix/.test(lowerHtml) && /position\s*:\s*static\s*!important/.test(lowerHtml)) {
    addFinding('medium', 'behavior-changing-auto-fix', 'Local auto-fix changed shell behavior; keep this as explicit debt until a cleaner source/remap exists.');
  }

  const bottomNavRisk = normalizedDeviceType === 'DESKTOP'
    && (/(bottom\s*:\s*0|bottom-0)/i.test(html) && /nav/i.test(html));
  if (bottomNavRisk) {
    addFinding('medium', 'desktop-bottom-nav-risk', 'Desktop render still appears to use a bottom-anchored nav pattern.');
    addStrategy('desktop-nav-remap');
  }

  const fixedWidthRisk = normalizedDeviceType === 'DESKTOP'
    && /(max-width\s*:\s*(3\d\d|4\d\d|5\d\d)px|min-width\s*:\s*(3\d\d|4\d\d|5\d\d)px)/i.test(html);
  if (fixedWidthRisk) {
    addFinding('medium', 'fixed-width-shell', 'Desktop layout contains a narrow fixed-width shell hint.');
    addStrategy('widen-main-shell');
  }

  if (normalizedDeviceType === 'DESKTOP' && widthRatio !== null && widthRatio < 0.72) {
    addFinding('medium', 'narrow-desktop-canvas', `Meaningful content width ratio is ${widthRatio}.`);
    addStrategy(lowerResponsiveMap.includes('rail') ? 'desktop-rail-layout' : 'widen-main-shell');
  }

  if (normalizedDeviceType === 'TABLET' && /grid|card|table/i.test(html) && widthRatio !== null && widthRatio > 0.96) {
    addFinding('medium', 'tablet-density-risk', `Tablet content width ratio is ${widthRatio}; grid density likely needs rebalancing.`);
    addStrategy('tablet-grid-rebalance');
  }

  if (normalizedDeviceType === 'DESKTOP' && lowerResponsiveMap.includes('adaptive remap')) {
    addStrategy('desktop-adaptive-remap');
  }

  if (!recommendedStrategies.length && normalizedDeviceType === 'DESKTOP' && widthRatio !== null && widthRatio < 0.84) {
    addStrategy('widen-main-shell');
  }
  if (!recommendedStrategies.length && overflowX) {
    addStrategy('overflow-containment');
  }

  return {
    safeToAutoFix: blockers.length === 0,
    deviceType: normalizedDeviceType,
    metrics: {
      viewportWidth,
      fullWidth,
      domFullWidth,
      meaningfulWidth,
      widthRatio,
      fixedBottomBar,
    },
    blockers,
    findings,
    recommendedStrategies,
  };
}

function injectAutoFixStyle(html, css) {
  const styleTag = `\n<style id="design-flow-auto-layout-fix">\n${css.trim()}\n</style>\n`;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${styleTag}</head>`);
  if (/<body[^>]*>/i.test(html)) return html.replace(/<body[^>]*>/i, (match) => `${match}${styleTag}`);
  return `${styleTag}${html}`;
}

export function applyAutomatedLayoutFix({ html = '', deviceType = 'DESKTOP', diagnostics = null, attempt = 1 } = {}) {
  const strategies = diagnostics?.recommendedStrategies || [];
  const normalizedDeviceType = normalizeDeviceType(deviceType);
  const cssChunks = [
    '* { box-sizing: border-box; }',
    'img, svg, canvas, video, table, pre { max-width: 100%; }',
  ];

  if (strategies.includes('overflow-containment')) {
    cssChunks.push('html, body { overflow-x: hidden; }');
  }

  if (normalizedDeviceType === 'TABLET' && strategies.includes('tablet-grid-rebalance')) {
    cssChunks.push(`@media (min-width: 768px) and (max-width: 1199px) {
  main, [role="main"], .main, .page, .page-shell, .content, .content-shell {
    width: min(960px, calc(100vw - 40px));
    margin-left: auto;
    margin-right: auto;
  }
  [class*="grid"], .grid {
    gap: 20px !important;
  }
}`);
  }

  if (normalizedDeviceType === 'MOBILE' && strategies.includes('mobile-bottom-safe-area')) {
    cssChunks.push(`@media (max-width: 767px) {
  nav.fixed.bottom-0,
  .bottom-nav,
  [class*="bottom-nav"],
  [class*="fixed"][class*="bottom-0"][class*="w-full"] {
    position: static !important;
    inset: auto !important;
    width: 100% !important;
    min-height: 56px !important;
    margin-top: 12px !important;
    padding-top: 6px !important;
    padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 8px) !important;
    border-top-left-radius: 12px !important;
    border-top-right-radius: 12px !important;
  }
  main, [role="main"], .main, .page, .page-shell, .content, .content-shell {
    padding-top: 16px !important;
    padding-bottom: 24px !important;
  }
  main > section {
    margin-bottom: 28px !important;
  }
  main > section:first-of-type {
    margin-bottom: 20px !important;
  }
  .space-y-8 {
    margin-bottom: 16px !important;
  }
  h1, [class*="text-5xl"], [class*="text-6xl"], [class*="text-7xl"] {
    line-height: 0.94 !important;
  }
  [class*="grid"][class*="grid-cols-2"], .grid.grid-cols-2 {
    gap: 14px !important;
  }
  [class*="aspect-[3/4"] {
    max-height: 180px !important;
  }
  [class*="aspect-[2/3"] {
    max-height: 140px !important;
  }
}`);
  }

  if (normalizedDeviceType === 'DESKTOP' && (strategies.includes('widen-main-shell') || strategies.includes('desktop-rail-layout') || strategies.includes('desktop-adaptive-remap'))) {
    cssChunks.push(`@media (min-width: 1200px) {
  main, [role="main"], .main, .page, .page-shell, .content, .content-shell, .layout-shell {
    width: min(${attempt >= 2 ? '1440px' : '1280px'}, calc(100vw - ${attempt >= 2 ? '40px' : '64px'}));
    margin-left: auto;
    margin-right: auto;
  }
  [class*="grid"], .grid {
    gap: ${attempt >= 2 ? '28px' : '24px'} !important;
  }
}`);
  }

  if (normalizedDeviceType === 'DESKTOP' && strategies.includes('desktop-nav-remap')) {
    cssChunks.push(`@media (min-width: 1200px) {
  nav[style*="bottom"], .bottom-nav, [class*="bottom-nav"] {
    position: static !important;
    inset: auto !important;
    width: auto !important;
    border-top: 0 !important;
  }
}`);
  }

  if (attempt >= 2 && normalizedDeviceType === 'DESKTOP') {
    cssChunks.push(`@media (min-width: 1200px) {
  body > div, body > main, .app, .app-shell, .shell, .shell-layout, .workspace, .workspace-shell {
    width: min(1440px, calc(100vw - 32px));
    margin-left: auto;
    margin-right: auto;
  }
  [class*="sidebar"], [class*="rail"] {
    flex-shrink: 0;
  }
}`);
  }

  if (!cssChunks.length) return html;
  return injectAutoFixStyle(html, cssChunks.join('\n\n'));
}

export async function diagnoseLocalHtmlLayout({ htmlPath, outdir, deviceType = 'DESKTOP', stateFile = null, preApprovalLockFile = null, copyLockFile = null, outputLockFile = null, responsiveMapFile = null, sourceLabel = 'layout-diagnose', viewport = defaultViewportForDeviceType(deviceType), localPatchApplied = false, localPatchStrategy = null, derivedFromScreenId = null } = {}) {
  const artifacts = await reviewLocalHtmlArtifacts({
    htmlPath,
    outdir,
    meta: {
      mode: 'layout-diagnose',
      sourceLabel,
      deviceType,
      breakpoint: breakpointForDeviceType(deviceType),
      htmlSourcePath: path.resolve(htmlPath),
    },
    viewport,
    options: {
      stateFile,
      preApprovalLockFile,
      copyLockFile,
      outputLockFile,
      localPatchApplied,
      localPatchStrategy,
      derivedFromScreenId,
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
    outputLockCheck: meta.outputLockCheck || null,
    responsiveMapText,
  });
  const diagnosticsPath = path.join(outdir, 'layout-diagnostics.json');
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

export async function exportScreenArtifacts(screen, outdir, meta = {}, viewport = defaultViewportForDeviceType(meta.deviceType), options = {}) {
  const htmlUrl = await screen.getHtml();
  await ensureDir(outdir);
  const htmlPath = path.join(outdir, 'screen.html');
  await fetchToFile(htmlUrl, htmlPath);
  return await reviewLocalHtmlArtifacts({
    htmlPath,
    outdir,
    meta: {
      ...meta,
      htmlUrl,
      outputScreenId: screen.screenId || screen.id || null,
      exportedAt: new Date().toISOString(),
    },
    viewport,
    options,
  });
}
