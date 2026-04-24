#!/usr/bin/env node
import process from 'node:process';
import { parseArgs, readPrompt, withKeyFallback, exportScreenArtifacts, viewportOptionsFromArgs, runScreenActionWithRecovery, persistProjectContext, patchJson, resolveStitchSelectionFromState, editScreenWithSdkProjectionFallback, resolveDesignPaths, assertPhaseZeroReady, normalizeStitchModelId, assertPromptPacketReadyForStitch } from './stitch_common.mjs';

const args = parseArgs(process.argv);
const promptFile = args['prompt-file'];
const projectId = args['project-id'];
const screenId = args['screen-id'];
const deviceType = args['device-type'] || 'MOBILE';
const modelId = normalizeStitchModelId(args['model-id'] || 'GEMINI_3_PRO');
const stateUpdate = args['state-update'] || 'current';
const promptStage = args['prompt-stage'] || 'edit';
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

const confirmExternalWrite = ['1', 'true', 'yes'].includes(String(args['confirm-external-write'] || '').toLowerCase());
if (!confirmExternalWrite) {
  console.error('Refusing Stitch edit: external Stitch mutations require --confirm-external-write true after explicit user approval.');
  process.exit(1);
}

if (!promptFile || !outdir || (!projectId && !stateFile) || (!screenId && !stateFile)) {
  console.error('usage: stitch_edit.mjs [--project-id <id>] [--screen-id <id>] --prompt-file <file> [--project-root <dir> --page <page-key> | --outdir <dir>] [--device-type MOBILE|TABLET|DESKTOP|AGNOSTIC] [--model-id GEMINI_3_PRO|GEMINI_3_FLASH] [--state-file <file>] [--state-update current|none] [--primary-breakpoint mobile|desktop] [--prompt-stage <stage>] [--pre-approval-lock-file <file>] [--copy-lock-file <file>] [--output-lock-file <file>] [--confirm-external-write true] [--viewport-width <px>] [--viewport-height <px>] [--device-scale-factor <n>] [--render-delay-ms <ms>]');
  process.exit(1);
}

await assertPhaseZeroReady({
  projectRoot: paths.projectRoot,
  configFile: args['config-file'] || null,
  startPath: outdir,
  requireRepoContext: true,
});

const prompt = await readPrompt(promptFile);
await assertPromptPacketReadyForStitch({
  promptFile,
  prompt,
  outdir,
  stateFile,
  mode: 'edit',
  promptStage,
  preApprovalLockFile: args['pre-approval-lock-file'] || null,
  copyLockFile: args['copy-lock-file'] || null,
  outputLockFile: args['output-lock-file'] || null,
});
const result = await withKeyFallback(async (stitch) => {
  const selection = await resolveStitchSelectionFromState({ outdir, stateFile, projectId, screenId, deviceType, mode: 'edit', primaryBreakpoint });
  const project = stitch.project(selection.projectId);
  const sourceScreen = await project.getScreen(selection.screenId);
  const { screen: edited, recovery } = await runScreenActionWithRecovery({
    project,
    deviceType,
    run: () => editScreenWithSdkProjectionFallback(sourceScreen, prompt, deviceType, modelId),
  });
  const artifacts = await exportScreenArtifacts(edited, outdir, {
    mode: 'edit',
    promptStage,
    projectId: selection.projectId,
    inputScreenId: selection.screenId,
    inputScreenSource: selection.source,
    stateUpdate,
    deviceType,
    modelId,
    sourcePromptFile: promptFile,
    preApprovalLockFile: args['pre-approval-lock-file'] || null,
    copyLockFile: args['copy-lock-file'] || null,
    outputLockFile: args['output-lock-file'] || null,
  }, viewport, { stateFile: selection.statePath || stateFile });
  const persisted = await persistProjectContext({
    stitch,
    projectId: selection.projectId,
    outdir,
    stateFile,
    deviceType,
    screenId: edited.screenId || edited.id || null,
    metaPath: artifacts.metaPath,
    updateState: stateUpdate === 'none' ? 'none' : 'current',
    recovery,
    projectRoot: paths.projectRoot,
    pageKey: paths.pageKey,
    primaryBreakpoint,
    sourcePromptFile: promptFile,
  });
  await patchJson(artifacts.metaPath, {
    recovery,
    statePath: persisted.statePath,
    designSystem: persisted.designSystem,
  });
  return {
    ...artifacts,
    projectId: selection.projectId,
    screenId: edited.screenId || edited.id || null,
    inputScreenId: selection.screenId,
    inputScreenSource: selection.source,
    stateUpdate,
    recovery,
    statePath: persisted.statePath,
    designSystem: persisted.designSystem,
    sessionIndexPath: persisted.sessionIndexPath,
    modelId,
    deviceType,
  };
});

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
