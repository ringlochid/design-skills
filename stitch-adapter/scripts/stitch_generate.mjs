#!/usr/bin/env node
import process from 'node:process';
import { parseArgs, readPrompt, withKeyFallback, exportScreenArtifacts, viewportOptionsFromArgs, runScreenActionWithRecovery, persistProjectContext, patchJson, resolveDesignPaths, assertPhaseZeroReady, normalizeStitchModelId, createOrOpenStitchProject, generateScreenWithSdkProjectionFallback, loadProjectRuntime, loadStitchState, assertPromptPacketReadyForStitch } from './stitch_common.mjs';

const args = parseArgs(process.argv);
const promptFile = args['prompt-file'];
const deviceType = args['device-type'] || 'MOBILE';
const projectId = args['project-id'];
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
const modelId = normalizeStitchModelId(args['model-id'] || 'GEMINI_3_PRO');
const stateUpdate = args['state-update'] || 'current';
const promptStage = args['prompt-stage'] || 'generate';
const viewport = viewportOptionsFromArgs(args, deviceType);

const confirmExternalWrite = ['1', 'true', 'yes'].includes(String(args['confirm-external-write'] || '').toLowerCase());
if (!confirmExternalWrite) {
  console.error('Refusing Stitch generate: external Stitch mutations require --confirm-external-write true after explicit user approval.');
  process.exit(1);
}

if (!promptFile || !outdir) {
  console.error('usage: stitch_generate.mjs --prompt-file <file> [--project-root <dir> --page <page-key> | --outdir <dir>] [--title <name>] [--device-type MOBILE|TABLET|DESKTOP|AGNOSTIC] [--model-id GEMINI_3_PRO|GEMINI_3_FLASH] [--project-id <id>] [--allow-new-project] [--state-file <file>] [--state-update current|none] [--primary-breakpoint mobile|desktop] [--prompt-stage <stage>] [--pre-approval-lock-file <file>] [--copy-lock-file <file>] [--output-lock-file <file>] [--confirm-external-write true] [--viewport-width <px>] [--viewport-height <px>] [--device-scale-factor <n>] [--render-delay-ms <ms>]');
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
  mode: 'generate',
  promptStage,
  preApprovalLockFile: args['pre-approval-lock-file'] || null,
  copyLockFile: args['copy-lock-file'] || null,
  outputLockFile: args['output-lock-file'] || null,
});
const { runtime: existingRuntime, config: projectConfig } = await loadProjectRuntime({ projectRoot: paths.projectRoot, startPath: outdir }).catch(() => ({ runtime: null, config: null }));
const { state } = await loadStitchState({ outdir, stateFile }).catch(() => ({ state: null }));
const stateProjectId = state?.projectId || null;
const stateEntryProjectId = [
  ...Object.values(state?.current || {}),
  ...Object.values(state?.approved || {}),
].map((entry) => entry?.projectId).find(Boolean) || null;
const title = args.title || projectConfig?.projectName || projectConfig?.productName || `${paths.pageKey || 'Design'} Stitch Project`;
const effectiveProjectId = projectId || existingRuntime?.projectId || stateProjectId || stateEntryProjectId || null;
const allowNewProject = ['1', 'true', 'yes'].includes(String(args['allow-new-project'] || '').toLowerCase());
const priorArtifactsExist = Boolean(
  existingRuntime?.projectId
  || state?.projectId
  || stateEntryProjectId
  || Object.keys(state?.current || {}).length
  || Object.keys(state?.approved || {}).length
);

if (!effectiveProjectId && priorArtifactsExist && !allowNewProject) {
  console.error('Refusing to create a fresh Stitch project: prior design artifacts exist but no reusable projectId was resolved. Restore 04-generated/stitch/project.json, pass --project-id, or rerun with --allow-new-project if you intentionally want a new project.');
  process.exit(1);
}
const result = await withKeyFallback(async (stitch) => {
  const project = await createOrOpenStitchProject(stitch, { title, projectId: effectiveProjectId });
  const { screen, recovery } = await runScreenActionWithRecovery({
    project,
    deviceType,
    run: (activeProject) => generateScreenWithSdkProjectionFallback(activeProject, prompt, deviceType, modelId),
  });
  const artifacts = await exportScreenArtifacts(screen, outdir, {
    mode: 'generate',
    promptStage,
    projectId: project.projectId,
    stateUpdate,
    deviceType,
    modelId,
    sourcePromptFile: promptFile,
    preApprovalLockFile: args['pre-approval-lock-file'] || null,
    copyLockFile: args['copy-lock-file'] || null,
    outputLockFile: args['output-lock-file'] || null,
  }, viewport, { stateFile });
  const persisted = await persistProjectContext({
    stitch,
    projectId: project.projectId,
    outdir,
    stateFile,
    deviceType,
    screenId: screen.screenId || screen.id || null,
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
    projectId: project.projectId,
    screenId: screen.screenId || screen.id || null,
    recovery,
    stateUpdate,
    statePath: persisted.statePath,
    designSystem: persisted.designSystem,
    sessionIndexPath: persisted.sessionIndexPath,
    modelId,
    deviceType,
  };
});

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
