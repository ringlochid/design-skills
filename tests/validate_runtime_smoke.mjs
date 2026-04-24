#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { assertPhaseZeroReady, assertPromptPacketReadyForStitch } from '../stitch-adapter/scripts/stitch_common.mjs';

const root = path.resolve(import.meta.dirname, '..');
function run(command, args, opts = {}) {
  const res = spawnSync(command, args, { cwd: root, encoding: 'utf8', ...opts });
  if (res.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`);
  }
  return res.stdout;
}
async function write(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}
async function makeRepo({ ready = true, responsiveReady = true } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'design-skills-smoke-'));
  run('node', ['design-repo-init/scripts/design_repo_bootstrap_project.mjs', '--project-root', dir, '--product-name', 'Smoke']);
  run('node', ['design-repo-init/scripts/design_repo_bootstrap_page.mjs', '--project-root', dir, '--page', 'dashboard']);
  if (ready) {
    await write(path.join(dir, '00-product/brief.md'), '# Operator Console\n\nHelp operators monitor async jobs, inspect failures, and retry failed jobs safely.\n');
    await write(path.join(dir, '01-system/DESIGN.md'), '# Design System\n\nCalm technical dashboard with compact spacing and clear status chips.\n');
    await write(path.join(dir, '00-product/source-inventory.md'), '# Source Inventory\n\n## Evidence\n\n- Smoke-test product and page source truth.\n');
    await write(path.join(dir, '02-pages/dashboard/spec.md'), '# Jobs Dashboard\n\nShow job health summary, recent failed jobs, retry actions, and log links.\n');
    await write(path.join(dir, '02-pages/dashboard/content.md'), '# Jobs Dashboard Content\n\n- Jobs dashboard\n- Retry failed job\n- View logs\n- Queue health\n');
  }
  if (responsiveReady) {
    await write(path.join(dir, '02-pages/dashboard/responsive-plan.md'), '# Dashboard Responsive Plan\n\nDesktop uses a wide shell. Mobile stacks summary, failures, and logs.\n');
  }
  return dir;
}

const readyRepo = await makeRepo({ ready: true, responsiveReady: true });
run('node', ['design-repo-init/scripts/design_repo_preflight.mjs', '--project-root', readyRepo]);
run('node', ['generation-pack-builder/scripts/build_generation_pack.mjs', '--project-root', readyRepo, '--page', 'dashboard', '--tool', 'stitch', '--breakpoint', 'desktop']);
const outdir = path.join(readyRepo, '04-generated/stitch/dashboard/desktop');
const promptFile = path.join(outdir, 'prompt.md');
const prompt = await fs.readFile(promptFile, 'utf8');
await assertPromptPacketReadyForStitch({ promptFile, prompt, outdir, mode: 'generate', promptStage: 'generate' });
await assertPhaseZeroReady({ projectRoot: readyRepo, requireRepoContext: true });
await fs.rm(path.join(readyRepo, '04-generated/stitch/dashboard/locks/copy-lock.md'));
let missingCopyFailed = false;
try {
  await assertPromptPacketReadyForStitch({ promptFile, prompt, outdir, mode: 'generate', promptStage: 'generate' });
} catch {
  missingCopyFailed = true;
}
if (!missingCopyFailed) throw new Error('missing copy lock did not fail generate prompt gate');

const notReadyRepo = await makeRepo({ ready: false, responsiveReady: true });
spawnSync('node', ['design-repo-init/scripts/design_repo_preflight.mjs', '--project-root', notReadyRepo], { cwd: root, encoding: 'utf8' });
let phase0Failed = false;
try {
  await assertPhaseZeroReady({ projectRoot: notReadyRepo, requireRepoContext: true });
} catch {
  phase0Failed = true;
}
if (!phase0Failed) throw new Error('repoStatus.ready=false did not fail Phase 0 readiness');

const placeholderRepo = await makeRepo({ ready: true, responsiveReady: false });
let placeholderFailed = false;
try {
  run('node', ['generation-pack-builder/scripts/build_generation_pack.mjs', '--project-root', placeholderRepo, '--page', 'dashboard', '--tool', 'stitch', '--breakpoint', 'desktop']);
} catch {
  placeholderFailed = true;
}
if (!placeholderFailed) throw new Error('placeholder responsive plan did not fail generation pack build');

console.log(JSON.stringify({ ok: true, readyRepo, notReadyRepo, placeholderRepo }, null, 2));
