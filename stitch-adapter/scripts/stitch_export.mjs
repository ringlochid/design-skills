#!/usr/bin/env node
import process from 'node:process';
import { parseArgs, withKeyFallback, exportScreenArtifacts, viewportOptionsFromArgs, persistProjectContext, patchJson, resolveStitchSelectionFromState, resolveDesignPaths, assertPhaseZeroReady, normalizeStitchModelId } from './stitch_common.mjs';

const args = parseArgs(process.argv);
const projectId = args['project-id'];
const screenId = args['screen-id'];
const sourcePromptFile = args['source-prompt-file'] || null;
const deviceType = args['device-type'] || 'MOBILE';
const modelId = args['model-id'] ? normalizeStitchModelId(args['model-id']) : null;
const stateUpdate = args['state-update'] || 'current';
const sourcePreference = args['source-preference'] || 'auto';
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
const primaryBreakpoint = args['primary-breakpoint'] || paths.primaryBreakpoint;
const viewport = viewportOptionsFromArgs(args, deviceType);

if (!outdir || (!projectId && !stateFile) || (!screenId && !stateFile)) {
  console.error('usage: stitch_export.mjs [--project-id <id>] [--screen-id <id>] [--project-root <dir> --page <page-key> | --outdir <dir>] [--source-prompt-file <file>] [--device-type MOBILE|TABLET|DESKTOP|AGNOSTIC] [--model-id GEMINI_3_PRO|GEMINI_3_FLASH] [--state-file <file>] [--state-update current|none] [--primary-breakpoint mobile|desktop] [--source-preference auto|approved-primary|current-primary|approved-mobile|current-mobile] [--viewport-width <px>] [--viewport-height <px>] [--device-scale-factor <n>] [--render-delay-ms <ms>]');
  process.exit(1);
}

await assertPhaseZeroReady({
  projectRoot: paths.projectRoot,
  configFile: args['config-file'] || null,
  startPath: outdir,
  requireRepoContext: true,
});

const result = await withKeyFallback(async (stitch) => {
  const selection = await resolveStitchSelectionFromState({ outdir, stateFile, projectId, screenId, deviceType, mode: 'export', sourcePreference, primaryBreakpoint });
  const project = stitch.project(selection.projectId);
  const screen = await project.getScreen(selection.screenId);
  const artifacts = await exportScreenArtifacts(screen, outdir, {
    mode: 'export',
    projectId: selection.projectId,
    inputScreenId: selection.screenId,
    inputScreenSource: selection.source,
    sourcePreference,
    stateUpdate,
    deviceType,
    modelId,
    sourcePromptFile,
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
    sourcePromptFile,
  });
  await patchJson(artifacts.metaPath, {
    statePath: persisted.statePath,
    designSystem: persisted.designSystem,
  });
  return {
    ...artifacts,
    projectId: selection.projectId,
    screenId: selection.screenId,
    inputScreenSource: selection.source,
    sourcePreference,
    stateUpdate,
    statePath: persisted.statePath,
    sessionIndexPath: persisted.sessionIndexPath,
    designSystem: persisted.designSystem,
    deviceType,
    modelId,
  };
});

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
