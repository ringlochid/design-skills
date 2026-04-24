#!/usr/bin/env node
import process from 'node:process';
import {
  parseArgs,
  breakpointForDeviceType,
  reviewLocalHtmlArtifacts,
  viewportOptionsFromArgs,
  readJsonIfExists,
  resolveDesignPaths,
} from './stitch_common.mjs';

const args = parseArgs(process.argv);
const htmlPath = args['html-file'] || args.html || null;
const deviceType = args['device-type'] || 'DESKTOP';
const paths = await resolveDesignPaths({
  projectRoot: args['project-root'] || null,
  configFile: args['config-file'] || null,
  page: args.page || null,
  outdir: args.outdir || null,
  stateFile: args['state-file'] || null,
  deviceType,
});
const outdir = paths.outdir || null;
const stateFile = paths.stateFile || null;
const preApprovalLockFile = args['pre-approval-lock-file'] || null;
const copyLockFile = args['copy-lock-file'] || null;
const outputLockFile = args['output-lock-file'] || null;
const sourceLabel = args['source-label'] || 'local-layout-repair';
const viewport = viewportOptionsFromArgs(args, deviceType);

if (!htmlPath || !outdir) {
  console.error('usage: stitch_local_review.mjs --html-file <path> [--project-root <dir> --page <page-key> | --outdir <dir>] [--device-type MOBILE|TABLET|DESKTOP|AGNOSTIC] [--state-file <file>] [--pre-approval-lock-file <file>] [--copy-lock-file <file>] [--output-lock-file <file>] [--source-label <label>] [--viewport-width <px>] [--viewport-height <px>] [--device-scale-factor <n>] [--render-delay-ms <ms>]');
  process.exit(1);
}

const existingMeta = await readJsonIfExists(`${outdir}/meta.json`, {});
const artifacts = await reviewLocalHtmlArtifacts({
  htmlPath,
  outdir,
  meta: {
    ...existingMeta,
    mode: 'local-review',
    sourceLabel,
    deviceType,
    breakpoint: breakpointForDeviceType(deviceType),
    htmlSourcePath: htmlPath,
  },
  viewport,
  options: {
    stateFile,
    preApprovalLockFile,
    copyLockFile,
    outputLockFile,
  },
});

const meta = await readJsonIfExists(artifacts.metaPath, {});
process.stdout.write(JSON.stringify({
  htmlPath: artifacts.htmlPath,
  imagePath: artifacts.imagePath,
  metaPath: artifacts.metaPath,
  renderedPreview: meta.renderedPreview || null,
  semanticCheck: meta.semanticCheck || null,
  preApprovalLockCheck: meta.preApprovalLockCheck || null,
  copyLockCheck: meta.copyLockCheck || null,
  outputLockCheck: meta.outputLockCheck || null,
  sourceLabel,
}, null, 2) + '\n');
