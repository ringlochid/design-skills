#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  parseArgs,
  ensureDir,
  buildPreApprovalLockMarkdown,
  buildCopyLockMarkdown,
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

async function readOptionalJson(rel) {
  try { return JSON.parse(await fs.readFile(path.join(projectRoot, rel), 'utf8')); } catch { return null; }
}

function cleanDisplayTitle(value, fallback, options = {}) {
  const shouldStripScaffold = options.stripScaffold !== false;
  let cleaned = String(value || fallback || '');
  if (shouldStripScaffold) cleaned = cleaned.replace(/\b(page\s+spec|specification|content)\b/ig, '');
  cleaned = cleaned
    .replace(/\s+[-–—:]\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return (cleaned || fallback || 'Untitled').slice(0, 80);
}

function explicitPageTitle(markdown) {
  const match = String(markdown || '').match(/^[-*]\s*(?:page\s+title|visible\s+page\s+title|display\s+title)\s*:\s*(.+)$/im);
  return match ? match[1].trim() : null;
}

function explicitProductName(markdown) {
  const match = String(markdown || '').match(/^[-*]\s*(?:product\s+name|app\s+name|site\s+title|brand)\s*:\s*(.+)$/im);
  return match ? match[1].trim() : null;
}

function titleFromMarkdown(markdown, fallback) {
  const explicit = explicitPageTitle(markdown);
  if (explicit) return cleanDisplayTitle(explicit, fallback);
  const match = String(markdown || '').match(/^#\s+(.+)$/m);
  return cleanDisplayTitle(match ? match[1] : fallback, fallback);
}

function headingsFromMarkdown(markdown) {
  const scaffoldExact = new Set([
    'page goal','primary user journey','sections','data/actions','data / actions','constraints','product goal','target users','core workflows','success criteria','assumptions / open questions','required visible labels','header copy','kpi card copy','metric copy','activity copy','coach ai copy','metadata','source truth','notes','acceptance criteria'
  ]);
  const scaffoldPattern = /^(.*\b(content|page spec|spec|copy)\b|required visible modules?|data\/actions?|constraints?)$/i;
  return [...String(markdown || '').matchAll(/^#{1,3}\s+(.+)$/gm)]
    .map((m) => cleanDisplayTitle(m[1].trim(), '', { stripScaffold: false }))
    .filter((value) => value && !/^todo$/i.test(value))
    .filter((value) => !scaffoldExact.has(value.toLowerCase()) && !scaffoldPattern.test(value))
    .slice(0, 6);
}

function normalizeVisibleBullet(value) {
  let clean = String(value || '').trim().replace(/[.;]$/g, '');
  const field = clean.match(/^([^:]{2,32}):\s*(.+)$/);
  if (field) {
    const label = field[1].trim().toLowerCase();
    const rhs = field[2].trim();
    if (/^(chips?|tabs?|modes?|filters?|mode chips?|mode labels?|filter chips?|filter labels?|segments?)$/.test(label)) return '';
    if (/^(page title|visible page title|display title|product name|required modules?|visible modules?|modules?|label|heading|section|cta|metric|card)$/.test(label)) clean = rhs;
    else if (/^(route|role|owner|source|status|breakpoint|screen id|project id|updated|notes?|metadata)$/.test(label)) return '';
  }
  if (/^(none|n\/?a|todo|draft required)$/i.test(clean)) return '';
  if (/^(route|role|owner|source|status|breakpoint|screen id|project id|updated|metadata)\b/i.test(clean)) return '';
  if (/\b(must|should|avoid|preserve|provide|create|review|generate|candidate|source truth|exactly|visible ui|do not)\b/i.test(clean) && clean.length > 28) return '';
  if (clean.split(/\s+/).length > 6) return '';
  return clean.replace(/`/g, '').trim();
}

function bulletLabelsFromMarkdown(markdown) {
  const skipSections = new Set([
    'metadata', 'source truth', 'notes', 'implementation notes', 'debug notes',
    'prompt checks', 'review notes', 'acceptance criteria', 'status', 'routing',
  ]);
  const skipSectionPattern = /^(metadata|source truth|notes?|implementation|debug|review|status|routing)\b/i;
  const labels = [];
  let currentSection = '';
  for (const line of String(markdown || '').split(/\r?\n/)) {
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      currentSection = cleanDisplayTitle(heading[1], '', { stripScaffold: false }).toLowerCase();
      continue;
    }
    if (skipSections.has(currentSection) || skipSectionPattern.test(currentSection)) continue;
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (!bullet) continue;
    const normalized = normalizeVisibleBullet(bullet[1]);
    if (normalized && normalized.length >= 3 && normalized.length <= 48) labels.push(normalized);
  }
  return labels;
}

function splitVisibleLabelList(value) {
  return String(value || '')
    .replace(/\band\b/gi, ',')
    .split(/[,/|]+/)
    .map((item) => normalizeVisibleBullet(item))
    .filter((item) => item && item.length >= 2 && item.length <= 32);
}

function structuredVisibleLabelsFromMarkdown(markdown) {
  const labels = [];
  for (const match of String(markdown || '').matchAll(/^[-*]?\s*(?:.*?\b(?:chips?|tabs?|segments?|filters?|modes?|mode\s+labels?|filter\s+labels?)\b)\s*:\s*(.+)$/gim)) {
    for (const label of splitVisibleLabelList(match[1])) labels.push(label);
  }
  const seen = [];
  for (const label of labels) {
    const lower = label.toLowerCase();
    if (seen.some((item) => item.toLowerCase() === lower)) continue;
    seen.push(label);
    if (seen.length >= 12) break;
  }
  return seen;
}

function uniqueVisibleLabels(values = [], limit = 24) {
  const seen = [];
  for (const value of values) {
    const label = normalizeVisibleBullet(value);
    if (!label) continue;
    const lower = label.toLowerCase();
    if (seen.some((item) => item.toLowerCase() === lower)) continue;
    seen.push(label);
    if (seen.length >= limit) break;
  }
  return seen;
}

function explicitRequiredVisibleLabelsFromMarkdown(markdown) {
  const labels = [];
  const text = String(markdown || '');
  for (const match of text.matchAll(/^[-*]?\s*(?:required\s+visible\s+labels?|hard\s+visible\s+labels?|must\s+show)\s*:\s*(.+)$/gim)) {
    labels.push(...splitVisibleLabelList(match[1]));
  }
  let inRequiredSection = false;
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      inRequiredSection = /^required\s+visible\s+labels?$/i.test(heading[1].trim()) || /^hard\s+visible\s+labels?$/i.test(heading[1].trim());
      continue;
    }
    if (!inRequiredSection) continue;
    if (!line.trim()) {
      inRequiredSection = false;
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) labels.push(normalizeVisibleBullet(bullet[1]));
  }
  return uniqueVisibleLabels(labels, 12);
}

function lockTermsFromSource({ spec = '', content = '' } = {}) {
  const stopPhrases = new Set(['last updated timestamp']);
  const candidates = [
    ...bulletLabelsFromMarkdown(spec),
    ...bulletLabelsFromMarkdown(content),
  ];
  const seen = [];
  for (const item of candidates) {
    const clean = item.replace(/`/g, '').trim();
    const lower = clean.toLowerCase();
    if (stopPhrases.has(lower)) continue;
    if (/^(header|sections?|constraints?|data\/actions?|page goal|primary user journey)$/i.test(clean)) continue;
    if (seen.some((value) => value.toLowerCase() === lower)) continue;
    seen.push(clean);
    if (seen.length >= 18) break;
  }
  return seen;
}

const config = await readOptionalJson('00-product/design-config.json');
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
const productName = cleanDisplayTitle(config?.productName || explicitProductName(brief) || titleFromMarkdown(brief, 'Product'), 'Product');
const siteTitle = productName;
const coreHeadings = []; // Avoid locking scaffold/source headings; visible content is protected by required visible labels and copy lock.
const hardVisibleLabels = uniqueVisibleLabels(explicitRequiredVisibleLabelsFromMarkdown(`${spec}\n${content}`), 12);
const inferredVisibleLabels = uniqueVisibleLabels([
  ...lockTermsFromSource({ spec, content }),
  ...structuredVisibleLabelsFromMarkdown(`${spec}\n${content}`),
], 18).filter((label) => !hardVisibleLabels.some((hard) => hard.toLowerCase() === label.toLowerCase()));
const promptVisibleLabels = uniqueVisibleLabels([...hardVisibleLabels, ...inferredVisibleLabels], 24);
if (!promptVisibleLabels.length) throw new Error('Unable to derive meaningful visible lock terms. Add concrete page content/actions first.');


const lockGuidance = {
  siteTitle: null,
  pageTitle,
  pageName: pageTitle,
  coreHeadings: inferredVisibleLabels,
  requiredNouns: hardVisibleLabels,
  navLabels: [],
  ctaLabels: [],
  preApprovalCtas: [],
  banned: ['lorem', 'placeholder', 'dummy'],
};
const preApprovalLockPath = path.join(locksDir, 'pre-approval-lock.md');
const copyLockPath = path.join(locksDir, 'copy-lock.md');
await fs.writeFile(preApprovalLockPath, buildPreApprovalLockMarkdown(lockGuidance));
await fs.writeFile(copyLockPath, buildCopyLockMarkdown(lockGuidance));

const prompt = `Design the ${breakpoint} breakpoint for ${pageTitle} as a finished product UI screen, not as a document.

Renderable UI brief:
- Product name: ${siteTitle}
- Page title: ${pageTitle}
- Route candidate: /${pageKey}
- Hard required visible labels: ${hardVisibleLabels.length ? hardVisibleLabels.join(', ') : '[none explicitly marked]'}
- Soft visible labels to preserve when practical: ${inferredVisibleLabels.join(', ')}
- Output should be a polished, responsive ${breakpoint} app screen with real visual hierarchy, cards, navigation, and controls where appropriate.

Non-negotiables:
- Do not invent alternate product or page names.
- Do not render markdown headings, bullets, implementation notes, source labels, or PRD/spec prose as the UI.
- Role access: use roles/permissions only when explicitly described in source truth.
- Theme strategy: source-truth DESIGN.md.

Responsive intent:
${responsive || `Use the ${breakpoint} breakpoint contract from the page spec. Preserve hierarchy and adapt layout intentionally.`}

Visual direction:
Apply this direction; do not render this text.
${design}

Layout and semantic requirements:
Apply this source as UI requirements; do not render as markdown/spec/PRD prose.
${spec}

Exact visible copy and labels:
Use field values as UI copy only when they are actual visible labels; do not render source field names.
${content || 'Use only source-grounded concise copy from the product brief and page spec; do not invent unrelated marketing claims.'}

States to account for (apply only where useful in the UI):
${states || '(none)'}

Avoid:
- generic analytics landing pages
- marketing hero sections
- placeholder charts or lorem ipsum
- unrelated business, finance, ecommerce, CRM, or social metrics
- debug notes, scaffold headings, PRD text, or implementation commentary in the visible UI
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
}, null, 2));
