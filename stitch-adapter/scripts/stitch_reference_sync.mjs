#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import {
  parseArgs,
  withKeyFallback,
  exportScreenArtifacts,
  viewportOptionsFromArgs,
  persistProjectContext,
  patchJson,
  resolveStitchSelectionFromState,
  resolveDesignPaths,
  assertPhaseZeroReady,
  breakpointForDeviceType,
  normalizeStitchModelId,
  loadProjectRuntime,
  listProjectScreens,
  pickProjectScreenByQuery,
  writeProjectScreenInventory,
  compactProjectScreenRecord,
  loadProjectScreenRecord,
  slugifyScreenTitle,
} from './stitch_common.mjs';

function slugifyToken(value, fallback = 'reference') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

const args = parseArgs(process.argv);
const deviceType = args['device-type'] || 'DESKTOP';
const modelId = args['model-id'] ? normalizeStitchModelId(args['model-id']) : null;
const sourcePreference = args['source-preference'] || 'current-primary';
const explicitScreenId = args['screen-id'] || null;
const screenQuery = args['screen-query'] || null;
const stateUpdate = args['state-update'] || 'none';
const referenceName = slugifyToken(args['reference-name'] || explicitScreenId || screenQuery || `${sourcePreference}-${breakpointForDeviceType(deviceType)}`);
const paths = await resolveDesignPaths({
  projectRoot: args['project-root'] || null,
  configFile: args['config-file'] || null,
  page: args.page || null,
  outdir: args.outdir || null,
  stateFile: args['state-file'] || null,
  deviceType,
});
const stateFile = paths.stateFile;
const primaryBreakpoint = args['primary-breakpoint'] || paths.primaryBreakpoint;
const stitchRoot = paths.stitchRoot;
const outdir = args.outdir
  ? path.resolve(args.outdir)
  : (stitchRoot ? path.join(stitchRoot, 'references', referenceName) : null);
const viewport = viewportOptionsFromArgs(args, deviceType);
const inventoryPath = paths.config?.runtimeRoot
  ? path.join(paths.config.runtimeRoot, 'stitch-project-screens.json')
  : null;

if (!outdir || (!args['project-id'] && !stateFile) || (!explicitScreenId && !screenQuery && !stateFile)) {
  console.error('usage: stitch_reference_sync.mjs [--project-id <id>] [--screen-id <id> | --screen-query <text>] [--project-root <dir> --page <page-key> | --outdir <dir>] [--source-preference current-primary|approved-primary|current-mobile|approved-mobile|current-desktop|approved-desktop] [--reference-name <slug>] [--device-type MOBILE|TABLET|DESKTOP|AGNOSTIC] [--state-file <file>] [--state-update none|current] [--primary-breakpoint mobile|desktop] [--model-id GEMINI_3_PRO|GEMINI_3_FLASH] [--viewport-width <px>] [--viewport-height <px>] [--device-scale-factor <n>] [--render-delay-ms <ms>]');
  process.exit(1);
}

await assertPhaseZeroReady({
  projectRoot: paths.projectRoot,
  configFile: args['config-file'] || null,
  startPath: outdir,
  requireRepoContext: true,
});

const result = await withKeyFallback(async (stitch) => {
  let selection;
  let matchedScreen = null;
  let projectScreens = [];
  if (screenQuery || explicitScreenId) {
    const { runtime } = await loadProjectRuntime({ projectRoot: paths.projectRoot, config: paths.config, startPath: stateFile }).catch(() => ({ runtime: null }));
    const projectId = args['project-id'] || runtime?.projectId || null;
    if (!projectId) {
      throw new Error('Unable to resolve shared Stitch project for explicit reference sync. Provide --project-id or ensure 00-meta/runtime/stitch-project.json exists.');
    }
    const project = stitch.project(projectId);
    projectScreens = await listProjectScreens(project).catch(() => []);
    if (explicitScreenId) {
      matchedScreen = projectScreens.find((item) => item.screenId === explicitScreenId) || (await loadProjectScreenRecord(project, explicitScreenId));
    } else {
      matchedScreen = pickProjectScreenByQuery(projectScreens, { query: screenQuery, deviceType });
    }
    if (inventoryPath) {
      const payload = await writeProjectScreenInventory({
        inventoryPath,
        projectId,
        screens: projectScreens,
        mergeScreens: matchedScreen ? [matchedScreen] : [],
      });
      projectScreens = payload?.screens || projectScreens;
      if (!matchedScreen && screenQuery) {
        matchedScreen = pickProjectScreenByQuery(projectScreens, { query: screenQuery, deviceType });
      }
    }
    if (!matchedScreen) {
      if (explicitScreenId) {
        throw new Error(`Unable to resolve Stitch project screen id ${explicitScreenId} in project ${projectId}.`);
      }
      throw new Error(`Unable to resolve Stitch project screen for query "${screenQuery}" in project ${projectId}. Check 00-meta/runtime/stitch-project-screens.json for available screen titles.`);
    }
    selection = {
      projectId,
      screenId: matchedScreen.screenId,
      source: explicitScreenId ? `project.screen-id:${explicitScreenId}` : `project.screen-query:${screenQuery}`,
      statePath: stateFile,
    };
  } else {
    selection = await resolveStitchSelectionFromState({
      outdir,
      stateFile,
      projectId: args['project-id'] || null,
      screenId: args['screen-id'] || null,
      deviceType,
      mode: 'export',
      sourcePreference,
      primaryBreakpoint,
    });
  }
  const project = stitch.project(selection.projectId);
  const screen = await project.getScreen(selection.screenId);
  const artifacts = await exportScreenArtifacts(screen, outdir, {
    mode: 'reference-sync',
    projectId: selection.projectId,
    inputScreenId: selection.screenId,
    inputScreenSource: selection.source,
    sourcePreference,
    stateUpdate,
    referenceName,
    deviceType,
    modelId,
  }, viewport, { stateFile: selection.statePath || stateFile });
  const persisted = await persistProjectContext({
    stitch,
    projectId: selection.projectId,
    outdir,
    stateFile,
    deviceType,
    screenId: selection.screenId,
    metaPath: artifacts.metaPath,
    updateState: stateUpdate === 'none' ? 'none' : 'current',
    projectRoot: paths.projectRoot,
    pageKey: paths.pageKey,
    primaryBreakpoint,
  });
  await patchJson(artifacts.metaPath, {
    statePath: persisted.statePath,
    designSystem: persisted.designSystem,
    referenceName,
    referenceSourcePreference: sourcePreference,
    referenceScreenQuery: screenQuery,
    matchedProjectScreen: matchedScreen ? {
      screenId: matchedScreen.screenId,
      title: matchedScreen.title,
      deviceType: matchedScreen.deviceType,
      width: matchedScreen.width,
      height: matchedScreen.height,
    } : null,
    sharedProjectPolicy: 'one-workspace-one-project',
  });
  return {
    ...artifacts,
    projectId: selection.projectId,
    screenId: selection.screenId,
    inputScreenSource: selection.source,
    sourcePreference,
    screenQuery,
    matchedProjectScreen: matchedScreen ? {
      screenId: matchedScreen.screenId,
      title: matchedScreen.title,
      deviceType: matchedScreen.deviceType,
      width: matchedScreen.width,
      height: matchedScreen.height,
      referenceSlug: slugifyScreenTitle(matchedScreen.title),
    } : null,
    referenceName,
    stateUpdate,
    statePath: persisted.statePath,
    sessionIndexPath: persisted.sessionIndexPath,
    projectScreenInventoryPath: inventoryPath,
    designSystem: persisted.designSystem,
    deviceType,
    modelId,
  };
});

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
