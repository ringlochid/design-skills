#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  parseArgs,
  ensureDir,
  loadDesignProjectConfig,
  readJsonIfExists,
  writeJson,
} from './stitch_common.mjs';

const execFile = promisify(execFileCb);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readFileSafe(targetPath) {
  try {
    return await fs.readFile(targetPath, 'utf8');
  } catch {
    return '';
  }
}

function unique(values = []) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function parseHeadingSections(markdown) {
  const sections = [];
  const regex = /^##\s+(.+)$/gm;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    sections.push({ title: match[1].trim(), index: match.index, contentStart: regex.lastIndex });
  }
  return sections.map((section, idx) => ({
    title: section.title,
    start: section.contentStart,
    end: idx + 1 < sections.length ? sections[idx + 1].index : markdown.length,
    body: markdown.slice(section.contentStart, idx + 1 < sections.length ? sections[idx + 1].index : markdown.length).trim(),
  }));
}

function extractRoadmapLists(sectionBody) {
  const lines = String(sectionBody || '').split(/\r?\n/);
  let current = null;
  const result = {
    purpose: [],
    features: [],
    notes: [],
  };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^\*\*Purpose\*\*/i.test(line)) {
      current = 'purpose';
      continue;
    }
    if (/^\*\*Owns these features\*\*/i.test(line)) {
      current = 'features';
      continue;
    }
    if (/^\*\*Notes\*\*/i.test(line)) {
      current = 'notes';
      continue;
    }
    if (line.startsWith('**')) {
      current = null;
      continue;
    }
    if (line.startsWith('- ') && current) {
      result[current].push(line.slice(2).trim());
    }
  }
  return result;
}

function extractPageInventory(roadmapText) {
  return parseHeadingSections(roadmapText)
    .map((section) => {
      const match = section.title.match(/^(\d+)\)\s*(.+)$/);
      if (!match) return null;
      return {
        index: Number(match[1]),
        title: match[2].trim(),
        lists: extractRoadmapLists(section.body),
      };
    })
    .filter(Boolean);
}

function firstHeading(markdown) {
  const match = String(markdown || '').match(/^#\s+(.+)$/m);
  return match ? String(match[1]).trim() : null;
}

function inferProductName(roadmapText, projectRoot) {
  const heading = firstHeading(roadmapText) || path.basename(projectRoot || process.cwd());
  return heading
    .replace(/\b(frontend|product|design)\b/gi, '')
    .replace(/\broadmap\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || path.basename(projectRoot || process.cwd());
}

function titleCase(value) {
  return String(value || '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizePageLabel(title) {
  const raw = String(title || '').replace(/^\d+\)\s*/, '').replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  if (!raw) return '';
  const parts = raw.split('/').map((part) => part.trim()).filter(Boolean);
  const preferred = parts.find((part) => !/^(home|search|my|team|product|public)$/i.test(part)) || parts[parts.length - 1] || raw;
  return preferred.replace(/\s+/g, ' ').trim();
}

function pageSignals(label) {
  const value = String(label || '').toLowerCase();
  return {
    utility: /(^my\b|personal|sign|account|settings|profile|dashboard|workspace|editor|history|notification|activity|moderation|review|admin|inbox|approval|jury)/i.test(value),
    auth: /sign|login|register|verify|password/i.test(value),
    detail: /detail|profile/i.test(value),
  };
}

function normalizeNavSurfaceLabel(label) {
  return String(label || '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/^Public\s+/i, '')
    .replace(/\s+Page$/i, '')
    .replace(/\s+Detail$/i, '')
    .replace(/\s+Shell$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function navPreferenceScore(label) {
  const value = String(label || '').toLowerCase();
  let score = 0;
  if (/home|explore|discover|search|browse|catalog|library|feed|landing|collection|collections|directory|finder|index/i.test(value)) score += 8;
  if (/results|topics|categories|projects|teams/i.test(value)) score += 4;
  if (/landing|optional/i.test(value)) score -= 14;
  if (/workspace|dashboard/i.test(value)) score -= 2;
  if (/detail|profile/i.test(value)) score -= 5;
  if (/moderation|review|admin|history|notification|activity|editor/i.test(value)) score -= 6;
  if (pageSignals(label).auth) score -= 12;
  return score;
}

function inferNavigation(pageInventory) {
  const labels = unique(pageInventory.map((item) => normalizePageLabel(item.title)).filter(Boolean));
  const nonUtility = labels.filter((label) => !pageSignals(label).utility);
  const nonUtilityVisible = nonUtility.filter((label) => !pageSignals(label).detail);
  const ranked = labels
    .filter((label) => !pageSignals(label).detail)
    .map((label) => ({
      label,
      canonical: normalizeNavSurfaceLabel(label),
      score: navPreferenceScore(label),
    }))
    .sort((a, b) => b.score - a.score);

  const preferred = ranked.filter((item) => item.score >= 0);
  const source = preferred.length ? preferred : ranked.length ? ranked : nonUtilityVisible;
  const chosen = unique((source.length ? source : labels).slice(0, 3).map((item) => item.canonical || normalizeNavSurfaceLabel(item)));
  const utility = labels.find((label) => pageSignals(label).auth)
    || labels.find((label) => /account|profile|settings/i.test(label))
    || labels.find((label) => pageSignals(label).utility)
    || 'Account';
  return {
    links: chosen.slice(0, 2),
    utility: normalizeNavSurfaceLabel(utility),
  };
}

function meaningfulTermsFromTexts(texts = [], extraStopwords = []) {
  const stopwords = new Set([
    'page', 'pages', 'screen', 'screens', 'product', 'details', 'detail', 'surface', 'surfaces', 'flow', 'flows', 'main', 'primary', 'secondary', 'public', 'private', 'role', 'gated', 'signed', 'route', 'routes', 'entry', 'entries', 'default', 'focused', 'global', 'utility', 'utilities', 'section', 'sections', 'panel', 'panels', 'view', 'views', 'state', 'states', 'shell', 'shells', 'workspace', 'workspaces', 'dashboard', 'dashboards', 'account', 'accounts', 'profile', 'profiles', 'settings', 'setting', 'sign', 'verification', 'verify', 'history', 'version', 'notifications', 'activity', 'landing', 'home', 'overview',
    ...extraStopwords,
  ]);
  const tokens = [];
  for (const text of texts) {
    for (const token of String(text || '').toLowerCase().split(/[^a-z0-9]+/)) {
      if (!token || token.length < 4 || stopwords.has(token)) continue;
      tokens.push(token);
    }
  }
  return unique(tokens);
}

function inferCoreConcepts(pageInventory) {
  const titleTerms = meaningfulTermsFromTexts(pageInventory.map((item) => item.title));
  const featureTerms = meaningfulTermsFromTexts(pageInventory.flatMap((item) => item.lists.features || []));
  const purposeTerms = meaningfulTermsFromTexts(pageInventory.flatMap((item) => item.lists.purpose || []));
  return unique([...titleTerms, ...featureTerms, ...purposeTerms]).slice(0, 6);
}

function oxfordJoin(values = []) {
  const items = values.filter(Boolean);
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function inferTargetUser(pageTitles = []) {
  const combined = pageTitles.join(' ');
  if (/sign|account|settings|profile|dashboard|workspace|editor|moderation|history|notification/i.test(combined)) {
    return 'People moving between public entry points and signed-in utility surfaces.';
  }
  return 'People completing the product\'s primary tasks across a small set of reusable surfaces.';
}

async function writeFileIfMissing(filePath, content, created, skipped, force = false) {
  if (!force && await fileExists(filePath)) {
    skipped.push(filePath);
    return;
  }
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content);
  created.push(filePath);
}

async function writeJsonIfMissing(filePath, value, created, skipped, force = false) {
  if (!force && await fileExists(filePath)) {
    skipped.push(filePath);
    return;
  }
  await ensureDir(path.dirname(filePath));
  await writeJson(filePath, value);
  created.push(filePath);
}

async function runNodeJson(scriptPath, args = []) {
  const { stdout } = await execFile(process.execPath, [scriptPath, ...args], {
    cwd: path.dirname(scriptPath),
    maxBuffer: 10 * 1024 * 1024,
  });
  const trimmed = String(stdout || '').trim();
  if (!trimmed) return null;
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  return JSON.parse(trimmed.slice(start, end + 1));
}

const args = parseArgs(process.argv);
const force = ['1', 'true', 'yes', 'on'].includes(String(args.force || '').trim().toLowerCase());
const projectRoot = args['project-root'] ? path.resolve(String(args['project-root'])) : null;
if (!projectRoot) {
  console.error('usage: design_flow_bootstrap_project.mjs --project-root <dir> [--force true|false]');
  process.exit(1);
}

const roadmapPath = path.join(projectRoot, 'ROADMAP.md');
if (!await fileExists(roadmapPath)) {
  console.error(`design-flow project bootstrap requires ${roadmapPath}`);
  process.exit(1);
}

const config = await loadDesignProjectConfig({ projectRoot, startPath: projectRoot }).catch(() => null);
const repoStatus = await readJsonIfExists(path.join(projectRoot, '00-meta', 'repo-status.json'), {});
const repoContextMd = await readFileSafe(path.join(projectRoot, '00-meta', 'repo-context.md'));
const roadmap = await readFileSafe(roadmapPath);
const pageInventory = extractPageInventory(roadmap);
const productName = inferProductName(roadmap, projectRoot);
const primaryBreakpoint = String(config?.primaryBreakpoint || 'mobile').trim().toLowerCase() || 'mobile';
const breakpointStrategy = primaryBreakpoint === 'desktop' ? 'desktop-first' : 'mobile-first';
const themeStrategy = String(config?.themeStrategy || 'light+dark').trim() || 'light+dark';
const designSystemMode = String(config?.designSystemMode || 'create-new').trim() || 'create-new';
const repoAwarenessMode = String(repoStatus?.recommendedMode || config?.repoAwarenessMode || 'inspect-only').trim() || 'inspect-only';
const pageTitles = pageInventory.map((item) => item.title);
const navigation = inferNavigation(pageInventory);
const surfaceLabels = navigation.links;
const utilityLabel = navigation.utility;
const firstSurface = surfaceLabels[0] || 'Primary Surface';
const secondSurface = surfaceLabels[1] || 'Secondary Surface';
const thirdSurface = surfaceLabels[2] || 'Supporting Surface';
const navigationLines = [firstSurface, secondSurface, surfaceLabels[2]].filter(Boolean)
  .map((label, index) => `- Link ${index + 1}: ${label}`)
  .join('\n');
const footerLines = [secondSurface, surfaceLabels[2], utilityLabel].filter(Boolean)
  .map((label, index) => `- Link ${index + 1}: ${label}`)
  .join('\n');
const coreConcepts = inferCoreConcepts(pageInventory);
const repeatedCues = unique([
  ...coreConcepts,
  ...meaningfulTermsFromTexts(pageInventory.flatMap((item) => item.lists.features || [])).slice(0, 12),
]).slice(0, 12);
const coreConceptSummary = oxfordJoin(coreConcepts.slice(0, 3)) || 'primary tasks, details, and activity';
const researchPath = path.join(projectRoot, '00-meta', 'research.md');
const briefPath = path.join(projectRoot, '00-meta', 'brief.md');
const copyPackPath = path.join(projectRoot, '00-meta', 'copy-pack.md');
const designConfigPath = path.join(projectRoot, '00-meta', 'design-config.json');
const baseDesignPath = path.join(projectRoot, '00-meta', 'design-system', 'base', 'DESIGN.md');
const lightThemePath = path.join(projectRoot, '00-meta', 'design-system', 'themes', 'light.md');
const darkThemePath = path.join(projectRoot, '00-meta', 'design-system', 'themes', 'dark.md');
const created = [];
const skipped = [];

const targetUser = inferTargetUser(pageTitles);

const inferredFrontendRoot = await fileExists(path.join(projectRoot, 'frontend')) ? 'frontend' : '.';
const designConfig = {
  version: 2,
  projectName: productName,
  projectRoot,
  metaDir: '00-meta',
  pagesDir: '03-pages',
  policyFile: '00-meta/design-policy.md',
  runtimeDir: '00-meta/runtime',
  designSystemDir: '00-meta/design-system',
  primaryBreakpoint,
  enabledBreakpoints: ['mobile', 'tablet', 'desktop'],
  themeStrategy,
  repoAwarenessMode: repoAwarenessMode === 'init-required' ? 'inspect-only' : repoAwarenessMode,
  designSystemMode,
  stitch: {
    globalSessionIndex: '00-meta/runtime/stitch-sessions.json',
    projectRuntime: '00-meta/runtime/stitch-project.json',
  },
  repoAware: {
    repoRoot: '.',
    frontendRoot: inferredFrontendRoot,
    routesPath: inferredFrontendRoot === 'frontend'
      ? ['frontend/src/app', 'frontend/src/routes', 'frontend/src/pages']
      : [],
    componentRoots: inferredFrontendRoot === 'frontend'
      ? ['frontend/src/components', 'frontend/src/features']
      : [],
    designSystemPaths: [
      '00-meta/design-system/base/DESIGN.md',
      '00-meta/design-system/themes/light.md',
      '00-meta/design-system/themes/dark.md',
    ],
    tokenFiles: inferredFrontendRoot === 'frontend'
      ? ['frontend/src/styles/tokens.css']
      : [],
  },
};

await writeJsonIfMissing(designConfigPath, designConfig, created, skipped, force);

await writeFileIfMissing(researchPath, `# Research notes

## Project frame
- Product: ${productName}
- Roadmap anchor: \`ROADMAP.md\`
- Primary breakpoint policy: ${breakpointStrategy}
- Theme strategy: ${themeStrategy}
- Repo-awareness mode: ${repoAwarenessMode}
- Design-system source: ${designSystemMode}

## Anchor references
- ROADMAP page inventory and feature ownership
- 00-meta/repo-context.md${repoContextMd ? ' (present)' : ' (create or refresh in Phase 0 when needed)'}
- Existing shared Stitch design system export when available

## Anti-references / drift families
- generic admin chrome replacing the page's real task
- pricing / checkout / campaign drift
- product/category drift away from the roadmap's approved nouns

## Public implementation references
- Add public app references only after repo-aware review identifies the right comparators.
- Until then, use local roadmap + repo-context as the truth pack.

## Repeated structure cues
${(pageTitles.slice(0, 8).map((item) => `- ${item}`)).join('\n') || '- none yet'}

## Repeated visual cues
- calm, readable, editorial, product-first
- clear hierarchy for primary tasks, details, and supporting activity
- reusable entry/detail/utility shells rather than one-off novelty layouts

## Prompt ingredients worth keeping
- Product name: ${productName}
- Core nouns: ${coreConceptSummary}
- Primary breakpoint: ${primaryBreakpoint}
- Theme strategy: ${themeStrategy}
- Repeated structure tokens: ${repeatedCues.join(', ') || 'primary, details, activity'}

## What to borrow
- ROADMAP ownership split as semantic scope
- repo-context shell/layout signals when present
- shared Stitch design system only as structure/style reference

## What to avoid
- dashboard drift on public entry pages
- marketing/ecommerce framing
- rewriting product meaning at non-primary breakpoints

## Open questions
- Which pages need their own tablet references versus simple expansion?
- Which labels and modules should stay visibly stable after the first approved primary source?
`, created, skipped, force);

await writeFileIfMissing(briefPath, `# Project brief

## Product summary
${productName} is a multi-surface product system with ${surfaceLabels.join(', ') || 'a small set of reusable surfaces'} and focused utility/detail pages kept in one coherent product language.

## Target user
${targetUser}

## Primary goal
Deliver a reusable page system that keeps entry, detail, task, and account flows semantically aligned while remaining adaptable across breakpoints.

## Core screens and pages
${(pageTitles.slice(0, 10).map((item) => `- ${item}`)).join('\n') || '- Define from ROADMAP'}

## Information hierarchy
- Brand + primary navigation
- Primary task surfaces first
- Detail/context modules second
- Signed-in utilities without changing product category

## Reference cues
- calm product reading rather than generic SaaS
- strong reusable pages with cards/lists/forms matched to the page family
- layout remaps may widen structure but must preserve copy and product framing

## Visual tone
Calm, readable, editorial, product-first, with enough structure to support discovery density without feeling like an admin console.

## Constraints
- Preserve the roadmap's approved nouns and page labels as first-class product language.
- Do not let non-primary breakpoints become independent redesigns.
- Treat exported design-system cache as reference, not semantic truth.

## Responsive priority
- Source of truth breakpoint: ${primaryBreakpoint}
- Required primary modules: brand/nav, page title, core object/discovery modules, stable utility entry points
- Tablet expansion rules: widen density carefully, simplify before copying desktop wholesale
- Desktop expansion rules: allow adaptive remap when it improves scanability, but keep semantics/copy fixed
- Copy that must stay locked across breakpoints: product name, page titles, core nav, core nouns
- Probe failure signals to watch for: category drift, dashboard drift, dropped core modules, copy drift, bottom-nav carryover on desktop

## Success criteria
Pages feel like one coherent ${productName} product system, not unrelated templates, and preserve stable product framing across breakpoint remaps.

## Open questions
- Which optional pages remain truly optional after first-pass design review?
- Which modules should become reusable system primitives versus page-local compositions?

## Approval status
- State: draft
- Notes: Bootstrapped from \`ROADMAP.md\`; tighten after Phase 0 / first approved primary source.
`, created, skipped, force);

await writeFileIfMissing(copyPackPath, `# Copy pack

## Voice and tone guardrails
- Calm, literate, product-first.
- Prefer concrete object nouns over marketing abstractions.
- Keep labels short, visible, and reusable across breakpoints.

## Navigation
- Brand: ${productName}
${navigationLines}
- Utility: ${utilityLabel}

## Hero
- Eyebrow: Unified product system
- Headline: Move through ${productName} with clear entry points and focused task surfaces
- Deck: Keep the main flows scannable, preserve approved product nouns, and make breakpoint remaps feel like the same product.
- Primary CTA: ${firstSurface}
- Secondary CTA: ${secondSurface}

## Core module 1
- Heading: Primary ${firstSurface} surface
- Body: Keep the ${firstSurface.toLowerCase()} flow easy to scan with direct next actions.
- Support copy: Prefer concrete modules over decorative framing.

## Core module 2
- Heading: Key ${secondSurface} paths
- Body: Keep cross-links and supporting context close to the main task.
- Support copy: Preserve orientation before adding density.

## Core module 3
- Heading: Supporting ${thirdSurface} work
- Body: Let this area reinforce the product system without replacing the page's main job.
- Support copy: Use it for supporting context, not for a second competing hero.

## Proof / trust
- Strip label: Product cues
- Logos or proof items: usage states, recent updates, supporting context
- Testimonial or proof line: The product should feel grounded, not noisy.

## Repeated content items
- Item 1 title: Primary item
- Item 1 summary: Title, metadata, and a clear path to detail.
- Item 2 title: Supporting item
- Item 2 summary: Context, relationship cues, and a useful next action.
- Item 3 title: Related item
- Item 3 summary: A grouped surface with meaningful metadata.

## Footer
${footerLines}
- Fine print: Keep the product language rooted in the roadmap's approved nouns.

## Copy constraints
- Do not drift into pricing, checkout, campaigns, or generic KPI language.
- Keep visible labels compact and reusable across breakpoint remaps.
`, created, skipped, force);

await writeFileIfMissing(baseDesignPath, `# DESIGN

## Product frame
- Product: ${productName}
- Core category: ${coreConceptSummary}
- Primary mode: reusable entry, detail, and utility surfaces

## Structural cues
- Stable brand/nav shell
- reusable cards, lists, forms, and detail modules
- public entry pages should stay distinct from signed-in utility density

## Typography and rhythm
- readable editorial hierarchy
- compact but not cramped metadata blocks
- consistent spacing rhythm across cards, sections, and side rails

## Layout rules
- ${breakpointStrategy} is the semantic source-of-truth policy
- tablet may widen and regroup before desktop becomes more persistent
- desktop may use rails/columns only when it improves scanning without changing meaning

## Component expectations
- nav should stay recognizable across breakpoints
- cards must preserve object identity and primary action clarity
- detail sections should privilege content over decoration
- controls should read as product tools, not dashboard chrome

## Do not drift
- do not turn entry/task pages into KPI dashboards
- do not let theme changes alter product category or locked copy
- do not let breakpoint remaps become independent redesigns
`, created, skipped, force);

await writeFileIfMissing(lightThemePath, `# Theme overlay

## Theme id
- light

## Intent
- bright, calm, readable, editorial
- keep the base DESIGN.md structure and product framing intact

## Color adjustments
- primary: grounded brand accent
- secondary: warm neutrals
- surface: soft paper / light stone
- text: high-contrast charcoal
- muted: quiet neutral accents

## Contrast rules
- minimum expectations: body text must stay clearly readable on paper-like surfaces
- elevated surfaces: cards and nav layers should separate with contrast before border noise
- border usage: subtle, structural, not decorative clutter

## Component deltas
- nav: preserve strong active-state clarity without heavy chrome
- cards: light surfaces with clear hierarchy for title, metadata, and action
- buttons: compact, legible, not marketing-loud
- forms: quiet fields with clear focus states

## Do not change
- product framing
- information hierarchy
- required labels
- core spacing rhythm unless explicitly approved
`, created, skipped, force);

await writeFileIfMissing(darkThemePath, `# Theme overlay

## Theme id
- dark

## Intent
- darker variant of the same product with the same structure
- keep the base DESIGN.md structure and product framing intact

## Color adjustments
- primary: muted brand accent / restrained deep hue
- secondary: warm charcoal neutrals
- surface: layered graphite / ink
- text: high-contrast off-white
- muted: smoky neutral accents

## Contrast rules
- minimum expectations: text and metadata must remain readable before visual mood is considered
- elevated surfaces: use clear depth steps instead of glow-heavy separation
- border usage: minimal; prefer tonal separation first

## Component deltas
- nav: preserve orientation and active states without neon or gaming UI cues
- cards: slightly elevated dark surfaces with restrained borders
- buttons: clear contrast, compact weight, no loud saturation spikes
- forms: inputs should stay obvious and usable against dark surfaces

## Do not change
- product framing
- information hierarchy
- required labels
- core spacing rhythm unless explicitly approved
`, created, skipped, force);

const repoPreflight = await runNodeJson(path.join(__dirname, 'design_repo_preflight.mjs'), [
  '--project-root', projectRoot,
  '--ensure-policy', 'true',
]).catch(() => null);

process.stdout.write(JSON.stringify({
  projectRoot,
  productName,
  primaryBreakpoint,
  breakpointStrategy,
  themeStrategy,
  repoAwarenessMode,
  repoPreflight,
  created,
  skipped,
  files: {
    designConfigPath,
    researchPath,
    briefPath,
    copyPackPath,
    baseDesignPath,
    lightThemePath,
    darkThemePath,
  },
}, null, 2) + '\n');
