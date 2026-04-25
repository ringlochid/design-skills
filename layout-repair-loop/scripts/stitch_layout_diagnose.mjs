#!/usr/bin/env node
import process from 'node:process';
import path from 'node:path';
import { parseArgs, diagnoseLocalHtmlLayout, resolveDesignPaths, viewportOptionsFromArgs } from './stitch_common.mjs';

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
const outdir = paths.outdir;
const stateFile = paths.stateFile;
const viewport = viewportOptionsFromArgs(args, deviceType);

if (!htmlPath || !outdir) {
  console.error('usage: stitch_layout_diagnose.mjs --html-file <path> [--project-root <dir> --page <page-key> | --outdir <dir>] [--theme <theme-slug>] [--device-type MOBILE|TABLET|DESKTOP|AGNOSTIC] [--state-file <file>] [--responsive-plan-file <file>] [--responsive-map-file <legacy-file>] [--pre-approval-lock-file <file>] [--copy-lock-file <file>] [--output-lock-file <file>] [--viewport-width <px>] [--viewport-height <px>] [--device-scale-factor <n>] [--render-delay-ms <ms>]');
  process.exit(1);
}

const result = await diagnoseLocalHtmlLayout({
  htmlPath,
  outdir,
  deviceType,
  stateFile,
  preApprovalLockFile: args['pre-approval-lock-file'] || null,
  copyLockFile: args['copy-lock-file'] || null,
  outputLockFile: args['output-lock-file'] || null,
  responsiveMapFile: args['responsive-plan-file'] || args['responsive-map-file'] || (paths.pageDir ? path.join(paths.pageDir, 'responsive-plan.md') : null),
  sourceLabel: args['source-label'] || 'layout-diagnose',
  viewport,
  pageKey: paths.pageKey,
  theme: args.theme || args['theme-name'] || null,
});

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
