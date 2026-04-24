#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { parseArgs, loadDesignProjectConfig, ensureDir, writeJson } from './stitch_common.mjs';

const args = parseArgs(process.argv);
const maxFiles = Number(args['max-files'] || 200);
const config = await loadDesignProjectConfig({
  projectRoot: args['project-root'] || null,
  configFile: args['config-file'] || null,
  startPath: process.cwd(),
});

if (!config.projectRoot) {
  console.error('usage: design_repo_preflight.mjs --project-root <dir> [--config-file <file>]');
  process.exit(1);
}

const projectRoot = config.projectRoot;
const repoRoot = config.repoAware?.repoRootPath || projectRoot;
const frontendRoot = config.repoAware?.frontendRootPath || (await pathExists(path.join(repoRoot, 'frontend')) ? path.join(repoRoot, 'frontend') : repoRoot);
const metaRoot = config.metaRoot || path.join(projectRoot, '00-meta');
const pagesRoot = path.join(projectRoot, config.pagesDir || '03-pages');

async function collectImmediateDirectories(rootDir) {
  if (!rootDir || !await pathExists(rootDir)) return [];
  const entries = await fs.readdir(rootDir, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(rootDir, entry.name)).sort();
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(rootDir, { exts = ['.ts', '.tsx', '.js', '.jsx', '.css'], limit = maxFiles } = {}) {
  const results = [];
  if (!rootDir || !await pathExists(rootDir)) return results;
  const queue = [rootDir];
  while (queue.length && results.length < limit) {
    const current = queue.shift();
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (results.length >= limit) break;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'build', '.next', '.turbo', '.venv'].includes(entry.name)) continue;
        queue.push(fullPath);
        continue;
      }
      if (exts.includes(path.extname(entry.name).toLowerCase())) results.push(fullPath);
    }
  }
  return results.sort();
}

async function readFileSafe(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

function rel(filePath) {
  return path.relative(projectRoot, filePath) || '.';
}

function resolveRepoPath(value) {
  if (!value || typeof value !== 'string') return value;
  return path.isAbsolute(value) ? path.resolve(value) : path.join(repoRoot, value);
}

function componentNameFromPath(filePath) {
  return path.basename(filePath).replace(/\.[^.]+$/, '');
}

function extractRouteSignals(content) {
  const matches = [];
  const patterns = [
    /path\s*:\s*['"`]([^'"`]+)['"`]/g,
    /route\(['"`]([^'"`]+)['"`]/g,
    /href=['"`]([^'"`]+)['"`]/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) matches.push(match[1]);
  }
  return Array.from(new Set(matches)).slice(0, 20);
}

function extractExportNames(content) {
  const names = [];
  const patterns = [
    /export\s+default\s+function\s+([A-Z][A-Za-z0-9_]*)/g,
    /export\s+function\s+([A-Z][A-Za-z0-9_]*)/g,
    /export\s+const\s+([A-Z][A-Za-z0-9_]*)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) names.push(match[1]);
  }
  return Array.from(new Set(names)).slice(0, 10);
}

const routeRoots =
  (config.repoAware?.routesPath?.length
    ? config.repoAware.routesPath
    : config.repoAware?.routesPaths?.length
      ? config.repoAware.routesPaths
      : config.repoAware?.routes?.length
        ? config.repoAware.routes
        : [frontendRoot]);
const resolvedRouteRoots = routeRoots.map((entry) => resolveRepoPath(entry));
const componentRoots =
  (config.repoAware?.componentRoots?.length
    ? config.repoAware.componentRoots
    : config.repoAware?.componentRootPaths?.length
      ? config.repoAware.componentRootPaths
      : config.repoAware?.components?.length
        ? config.repoAware.components
        : [path.join(frontendRoot, 'src', 'components')]);
const resolvedComponentRoots = componentRoots.map((entry) => resolveRepoPath(entry));
const routeFiles = (await Promise.all(resolvedRouteRoots.map((root) => collectFiles(root, { limit: Math.ceil(maxFiles / Math.max(resolvedRouteRoots.length, 1)) })))).flat();
const componentFiles = (await Promise.all(resolvedComponentRoots.map((root) => collectFiles(root, { limit: Math.ceil(maxFiles / Math.max(resolvedComponentRoots.length, 1)) })))).flat();

const routeEntries = [];
for (const file of routeFiles.slice(0, maxFiles)) {
  const content = await readFileSafe(file);
  routeEntries.push({
    path: rel(file),
    routes: extractRouteSignals(content),
    exports: extractExportNames(content),
  });
}

const componentEntries = [];
for (const file of componentFiles.slice(0, maxFiles)) {
  const content = await readFileSafe(file);
  componentEntries.push({
    path: rel(file),
    componentName: componentNameFromPath(file),
    exports: extractExportNames(content),
    signals: {
      shell: /shell|layout|sidebar|navbar|header|footer/i.test(file),
      card: /card/i.test(file),
      list: /list|table/i.test(file),
      form: /form|input|field|modal/i.test(file),
    },
  });
}

const designSystemFiles = [];
const designSignals = [
  ...(config.repoAware?.designSystemPaths || []),
  ...(config.repoAware?.designSystemPathList || []),
  ...(config.repoAware?.designPaths || []),
  ...(config.repoAware?.designSystemPath || []),
  ...(config.repoAware?.designSystemFiles || []),
  ...(config.repoAware?.tokenFiles || []),
  ...(config.repoAware?.tokenFilePaths || []),
];
for (const filePath of designSignals.map((entry) => resolveRepoPath(entry))) {
  if (filePath && await pathExists(filePath)) designSystemFiles.push(rel(filePath));
}

const repoExists = await pathExists(repoRoot);
const frontendExists = await pathExists(frontendRoot);
const gitExists = await pathExists(path.join(repoRoot, '.git'));
const repoPackageJson = await pathExists(path.join(repoRoot, 'package.json'));
const frontendPackageJson = frontendRoot !== repoRoot ? await pathExists(path.join(frontendRoot, 'package.json')) : repoPackageJson;
const frontendReady = Boolean(routeEntries.length || componentEntries.length || designSystemFiles.length || frontendPackageJson);
const existingDesignSignals = Boolean(designSystemFiles.length || routeEntries.length || componentEntries.length);
const designConfigExists = await pathExists(path.join(metaRoot, 'design-config.json'));
const roadmapExists = await pathExists(path.join(projectRoot, 'ROADMAP.md'));
const foundationsDirExists = await pathExists(path.join(projectRoot, '02-foundations'));
const flowsDirExists = await pathExists(path.join(projectRoot, '04-flows'));
const assetsDirExists = await pathExists(path.join(projectRoot, '05-assets'));
const pageDirectories = await collectImmediateDirectories(pagesRoot);
const designWorkspaceReady = Boolean(
  await pathExists(pagesRoot)
  && (pageDirectories.length || roadmapExists || foundationsDirExists || flowsDirExists || assetsDirExists)
);

let recommendedMode = 'inspect-only';
let nextAction = 'Policy can reuse repo findings after human review.';
if (existingDesignSignals) {
  recommendedMode = 'reuse-existing-system';
  nextAction = 'Prefer reusing local design-system/page truth and any repo structure before asking Stitch to invent them.';
} else if (designWorkspaceReady) {
  recommendedMode = config.repoAwarenessMode === 'ignore-repo' ? 'ignore-repo' : 'inspect-only';
  nextAction = 'Design workspace structure is sufficient for a design-first lane. Continue with Phase 1 using roadmap/page artifacts as the initialized substrate; do not require a frontend shell first.';
} else if (!repoExists || (!gitExists && !repoPackageJson && !frontendPackageJson && !frontendReady)) {
  recommendedMode = 'init-required';
  nextAction = 'Initialize either a usable frontend/app shell or a design workspace scaffold (ROADMAP.md + 03-pages + foundations/meta structure), then refresh Phase 0 context.';
}

const repoContext = {
  generatedAt: new Date().toISOString(),
  projectRoot,
  repoRoot,
  frontendRoot,
  routeRoots: resolvedRouteRoots.map((value) => rel(value)),
  componentRoots: resolvedComponentRoots.map((value) => rel(value)),
  designSystemFiles,
  routeEntries,
  componentEntries,
  designWorkspace: {
    designConfigExists,
    roadmapExists,
    pagesRoot: rel(pagesRoot),
    pageTemplateCount: pageDirectories.length,
    pageTemplates: pageDirectories.slice(0, 40).map((value) => rel(value)),
    foundationsDirExists,
    flowsDirExists,
    assetsDirExists,
    ready: designWorkspaceReady,
  },
};

const repoStatus = {
  generatedAt: new Date().toISOString(),
  projectRoot,
  repoRoot,
  frontendRoot,
  phaseZero: {
    primaryBreakpoint: config.primaryBreakpoint,
    themeStrategy: config.themeStrategy,
    repoAwarenessMode: config.repoAwarenessMode,
    designSystemMode: config.designSystemMode,
  },
  exists: {
    repoRoot: repoExists,
    frontendRoot: frontendExists,
    gitRoot: gitExists,
  },
  appSignals: {
    repoPackageJson,
    frontendPackageJson,
    routeFileCount: routeEntries.length,
    componentFileCount: componentEntries.length,
    designSystemFileCount: designSystemFiles.length,
    frontendReady,
  },
  designWorkspaceSignals: {
    designConfigExists,
    roadmapExists,
    pagesDirExists: await pathExists(pagesRoot),
    pageTemplateCount: pageDirectories.length,
    foundationsDirExists,
    flowsDirExists,
    assetsDirExists,
    designWorkspaceReady,
  },
  recommendedMode,
  nextAction,
};

await ensureDir(metaRoot);
const repoContextJsonPath = path.join(metaRoot, 'repo-context.json');
const repoContextMdPath = path.join(metaRoot, 'repo-context.md');
const repoStatusPath = path.join(metaRoot, 'repo-status.json');
const designSystemInventoryPath = path.join(metaRoot, 'design-system-inventory.md');
const designPolicyPath = path.join(metaRoot, 'design-policy.md');
await writeJson(repoContextJsonPath, repoContext);
await writeJson(repoStatusPath, repoStatus);
if (args['write-policy'] || args['ensure-policy']) {
  const breakpointStrategy = config.primaryBreakpoint === 'desktop' ? 'desktop-first' : 'mobile-first';
  const policyBody = `# Design policy\n\n## Phase 0 decisions\n- Breakpoint strategy: ${breakpointStrategy}\n- Theme strategy: ${config.themeStrategy}\n- Repo-awareness mode: ${recommendedMode}\n- Design-system source: ${config.designSystemMode}\n\n## Repository mode\n- Repo root: ${repoRoot}\n- Frontend root: ${frontendRoot}\n- Recommended next action: ${nextAction}\n\n## Responsive policy\n- Primary breakpoint: ${config.primaryBreakpoint}\n- Secondary breakpoints: ${config.enabledBreakpoints.join(', ')}\n\n## Workflow note\n- Use repo-context.md, repo-status.json, and design-policy.md as guidance for better consistency; refresh them when stale, but do not turn them into workflow bureaucracy.\n`;
  await fs.writeFile(designPolicyPath, policyBody);
}

const shellComponents = componentEntries.filter((item) => item.signals.shell).map((item) => `- ${item.path}`).join('\n') || '- none found';
const cardComponents = componentEntries.filter((item) => item.signals.card || item.signals.list).map((item) => `- ${item.path}`).join('\n') || '- none found';
const formComponents = componentEntries.filter((item) => item.signals.form).map((item) => `- ${item.path}`).join('\n') || '- none found';
const routeSummary = routeEntries.slice(0, 20).map((item) => `- ${item.path}${item.routes.length ? ` → ${item.routes.join(', ')}` : ''}`).join('\n') || '- none found';

await fs.writeFile(repoContextMdPath, `# Repo context\n\n## Status\n- Recommended mode: ${recommendedMode}\n- Next action: ${nextAction}\n\n## Roots\n- Repo root: ${repoRoot}\n- Frontend root: ${frontendRoot}\n\n## Design workspace signals\n- Design config present: ${designConfigExists}\n- ROADMAP present: ${roadmapExists}\n- Pages root: ${rel(pagesRoot)}\n- Page templates discovered: ${pageDirectories.length}\n- Foundations dir present: ${foundationsDirExists}\n- Flows dir present: ${flowsDirExists}\n- Assets dir present: ${assetsDirExists}\n- Design-first workspace ready: ${designWorkspaceReady}\n\n## Route files\n${routeSummary}\n\n## Shell/layout components\n${shellComponents}\n\n## Card/list components\n${cardComponents}\n\n## Form/modal components\n${formComponents}\n\n## Design system / token files\n${designSystemFiles.length ? designSystemFiles.map((item) => `- ${item}`).join('\n') : '- none found'}\n`);

await fs.writeFile(designSystemInventoryPath, `# Design system inventory\n\n## Existing signals\n- Design system / token files: ${designSystemFiles.length}\n- Routes discovered: ${routeEntries.length}\n- Components discovered: ${componentEntries.length}\n\n## Design system / token files\n${designSystemFiles.length ? designSystemFiles.map((item) => `- ${item}`).join('\n') : '- none found'}\n`);

process.stdout.write(JSON.stringify({
  repoContextJsonPath,
  repoContextMdPath,
  repoStatusPath,
  designSystemInventoryPath,
  recommendedMode,
  nextAction,
  routeFileCount: routeEntries.length,
  componentFileCount: componentEntries.length,
}, null, 2) + '\n');
