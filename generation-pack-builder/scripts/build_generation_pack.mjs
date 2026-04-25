#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  parseArgs,
  ensureDir,
  buildPreApprovalLockMarkdown,
  buildCopyLockMarkdown,
  buildOutputLockMarkdown,
} from '../../stitch-adapter/scripts/stitch_common.mjs';

const args = parseArgs(process.argv);
const projectRoot = path.resolve(args['project-root'] || process.cwd());
const tool = args.tool || 'stitch';
const page = String(args.page || '').trim();
const breakpoint = String(args.breakpoint || args['device-breakpoint'] || 'mobile').toLowerCase();
if (!page) {
  console.error('usage: build_generation_pack.mjs --page <page-key> [--project-root <dir>] [--tool stitch] [--breakpoint mobile|tablet|desktop]');
  process.exit(1);
}

const pageKey = page.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || page;

async function readRequired(rel) {
  const target = path.join(projectRoot, rel);
  try {
    const text = await fs.readFile(target, 'utf8');
    if (!text.trim() || /\bTODO\b/i.test(text)) throw new Error(`Required source file is empty or still contains TODO: ${rel}`);
    return text;
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Missing required source file: ${rel}`);
    throw error;
  }
}

async function readOptional(rel) {
  try { return await fs.readFile(path.join(projectRoot, rel), 'utf8'); } catch { return ''; }
}

function titleFromMarkdown(markdown, fallback) {
  const match = String(markdown || '').match(/^#\s+(.+)$/m);
  return match ? match[1].trim().slice(0, 80) : fallback;
}

function headingsFromMarkdown(markdown) {
  const scaffold = new Set(['page goal','primary user journey','sections','data/actions','constraints','jobs dashboard content','product goal','target users','core workflows','success criteria','assumptions / open questions']);
  return [...String(markdown || '').matchAll(/^#{1,3}\s+(.+)$/gm)]
    .map((m) => m[1].trim())
    .filter((value) => value && !/^todo$/i.test(value) && !scaffold.has(value.toLowerCase()))
    .slice(0, 6);
}

function bulletLabelsFromMarkdown(markdown) {
  return [...String(markdown || '').matchAll(/^[-*]\s+(.+)$/gm)]
    .map((m) => m[1].trim().replace(/[.:;]$/g, ''))
    .filter((value) => value && value.length >= 3 && value.length <= 48)
    .filter((value) => !/^(none|n\/?a|todo|draft required)/i.test(value));
}

function lockTermsFromSource({ spec = '', content = '' } = {}) {
  const stopPhrases = new Set(['last updated timestamp']);
  const candidates = [
    ...bulletLabelsFromMarkdown(content),
    ...bulletLabelsFromMarkdown(spec),
  ];
  const seen = [];
  for (const item of candidates) {
    const clean = item.replace(/`/g, '').trim();
    const lower = clean.toLowerCase();
    if (stopPhrases.has(lower)) continue;
    if (/^(header|sections?|constraints?|data\/actions?|page goal|primary user journey)$/i.test(clean)) continue;
    if (seen.some((value) => value.toLowerCase() === lower)) continue;
    seen.push(clean);
    if (seen.length >= 10) break;
  }
  return seen;
}

const brief = await readRequired('00-product/brief.md');
const design = await readRequired('01-system/DESIGN.md');
const spec = await readRequired(`02-pages/${pageKey}/spec.md`);
const content = await readOptional(`02-pages/${pageKey}/content.md`);
const states = await readOptional(`02-pages/${pageKey}/states.md`);
const responsive = await readOptional(`02-pages/${pageKey}/responsive-plan.md`);
if (responsive && (/\bTODO\b/i.test(responsive) || /Draft required before generation/i.test(responsive) || /Target shell must exist before layout repair/i.test(responsive))) {
  throw new Error(`Responsive plan is still placeholder/draft: 02-pages/${pageKey}/responsive-plan.md`);
}

const outdir = path.join(projectRoot, '04-generated', tool, pageKey);
const locksDir = path.join(outdir, 'locks');
await ensureDir(outdir);
await ensureDir(locksDir);

const pageTitle = titleFromMarkdown(spec, pageKey.replace(/-/g, ' '));
const siteTitle = titleFromMarkdown(brief, 'Product');
const coreHeadings = headingsFromMarkdown(spec).concat(headingsFromMarkdown(content)).slice(0, 6);
const requiredNouns = lockTermsFromSource({ spec, content }).slice(0, 10);
if (!requiredNouns.length) throw new Error('Unable to derive meaningful visible lock terms. Add concrete page content/actions first.');

const lockGuidance = {
  siteTitle: null,
  pageTitle,
  pageName: pageTitle,
  coreHeadings,
  requiredNouns,
  navLabels: [],
  ctaLabels: [],
  preApprovalCtas: [],
  banned: ['lorem', 'placeholder', 'dummy'],
};
const preApprovalLockPath = path.join(locksDir, 'pre-approval-lock.md');
const copyLockPath = path.join(locksDir, 'copy-lock.md');
const outputLockPath = path.join(locksDir, 'output-lock.md');
await fs.writeFile(preApprovalLockPath, buildPreApprovalLockMarkdown(lockGuidance));
await fs.writeFile(copyLockPath, buildCopyLockMarkdown(lockGuidance));
await fs.writeFile(outputLockPath, buildOutputLockMarkdown(lockGuidance));

const prompt = `# stitch prompt

copy locks:
- pre-approval: ${path.relative(outdir, preApprovalLockPath)}
- copy: ${path.relative(outdir, copyLockPath)}
- output: ${path.relative(outdir, outputLockPath)}

goal:
Generate the ${breakpoint} breakpoint for ${pageTitle}.

responsive intent:
${responsive || `Use the ${breakpoint} breakpoint contract from the page spec. Preserve hierarchy and adapt layout intentionally.`}

theme intent:
${design}

semantic focus:
${spec}

page-specific guardrails:
- Preserve product semantics from 00-product/brief.md.
- Preserve page-specific actions, states, and constraints from 02-pages/${pageKey}/spec.md.
- Required visible terms: ${requiredNouns.join(', ')}.

use this exact visible copy:
${content || 'Use only source-grounded concise copy from the product brief and page spec; do not invent unrelated marketing claims.'}

theme strategy: source-truth DESIGN.md
role access: use roles/permissions only when explicitly described in source truth
route candidate: /${pageKey}

source material:

## Product brief

${brief}

## Page spec

${spec}

## States

${states || '(none)'}
`;
const promptFile = path.join(outdir, `${breakpoint}.prompt.md`);
await fs.writeFile(promptFile, prompt);

console.log(JSON.stringify({
  pageKey,
  tool,
  breakpoint,
  promptFile,
  locksDir,
  preApprovalLockFile: preApprovalLockPath,
  copyLockFile: copyLockPath,
  outputLockFile: outputLockPath,
}, null, 2));
