#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  parseArgs,
  resolveDesignPaths,
  normalizeBreakpointName,
  ensureDir,
  readJsonIfExists,
  writeJson,
  buildPreApprovalLockMarkdown,
  buildCopyLockMarkdown,
  buildOutputLockMarkdown,
} from './stitch_common.mjs';

const execFile = promisify(execFileCb);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseBooleanFlag(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (value === true) return true;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

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

function titleCase(value) {
  return String(value || '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function slugWithoutPrefix(pageKey) {
  return String(pageKey || '').replace(/^\d+-/, '');
}

function pageNumber(pageKey) {
  const match = String(pageKey || '').match(/^(\d+)-/);
  return match ? Number(match[1]) : null;
}

function fallbackPageTitle(pageKey) {
  const slug = slugWithoutPrefix(pageKey);
  if (slug === 'sign-up-verify') return 'Sign Up / Verify';
  return titleCase(slug)
    .replace(/ Home Explore\b/g, ' Home / Explore')
    .replace(/ Search Browse\b/g, ' Search / Browse')
    .replace(/ Detail\b/g, ' Detail')
    .replace(/ Shell\b/g, ' Shell');
}

function routeCandidateForPage(pageKey) {
  const slug = slugWithoutPrefix(pageKey);
  if (/^(home|landing)(-|$)/.test(slug)) return '/';
  if (/search|browse|results|catalog/.test(slug)) return '/browse';
  if (/profile/.test(slug)) return `/${slug.replace(/-detail$/,'').replace(/-/g, '/')}/:id`;
  if (/detail$/.test(slug)) return `/${slug.replace(/-detail$/, '').replace(/-/g, '/')}/:id`;
  if (slug === 'sign-in') return '/sign-in';
  if (slug === 'sign-up-verify') return '/sign-up';
  if (/settings|preferences/.test(slug)) return '/settings';
  if (/dashboard/.test(slug)) return '/dashboard';
  if (/notifications|activity/.test(slug)) return '/notifications';
  if (/history|version/.test(slug)) return '/history';
  return `/${slug.replace(/-/g, '/')}`;
}

function roleAccessForPage(pageKey) {
  const slug = slugWithoutPrefix(pageKey);
  if (slug.startsWith('sign-') || slug === 'landing-page') return 'public';
  if (slug.includes('editor') || slug.includes('moderation') || slug.includes('jury')) return 'signed-in + elevated';
  if (slug.includes('dashboard') || slug.includes('account-settings') || slug.includes('history-version') || slug.includes('notifications')) return 'signed-in';
  return 'public + signed-in';
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

function extractRoadmapSection(roadmapText, pageKey) {
  const sections = parseHeadingSections(roadmapText);
  const expectedNumber = pageNumber(pageKey);
  const expectedSlug = slugWithoutPrefix(pageKey);
  const normalizedSlugTokens = expectedSlug.split('-').filter(Boolean);
  const byNumber = sections.find((section) => {
    const match = section.title.match(/^(\d+)\)\s*(.+)$/);
    return match && Number(match[1]) === expectedNumber;
  });
  if (byNumber) return byNumber;
  return sections.find((section) => {
    const lowered = section.title.toLowerCase();
    return normalizedSlugTokens.every((token) => lowered.includes(token));
  }) || null;
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

function parseCopyPackSections(copyPackText) {
  const sections = parseHeadingSections(copyPackText);
  const keyValues = {};
  for (const section of sections) {
    const lines = section.body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const values = {};
    for (const line of lines) {
      const match = line.match(/^[-*]\s+([^:]+):\s*(.+)$/);
      if (match) values[match[1].trim()] = match[2].trim();
    }
    keyValues[section.title.toLowerCase()] = values;
  }
  return keyValues;
}

function extractBriefSectionValue(briefText, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`##\\s+${escaped}\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, 'i');
  const match = briefText.match(regex);
  return match ? match[1].trim().replace(/\n+/g, ' ') : '';
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function shellForBreakpoint(breakpoint, { tabletShell = 'top nav', desktopShell = 'top nav + side rail' } = {}) {
  const normalized = normalizeBreakpointName(breakpoint, 'mobile');
  if (normalized === 'desktop') return desktopShell;
  if (normalized === 'tablet') return tabletShell;
  return 'top nav';
}

function modeForBreakpoint(breakpoint, { tabletMode = 'simple expansion', desktopMode = 'adaptive remap' } = {}) {
  const normalized = normalizeBreakpointName(breakpoint, 'mobile');
  if (normalized === 'desktop') return desktopMode;
  if (normalized === 'tablet') return tabletMode;
  return 'primary source';
}

function promptPathForBreakpoint(stitchRoot, breakpoint) {
  return path.join(stitchRoot, normalizeBreakpointName(breakpoint, 'mobile'), 'prompt.md');
}

function meaningfulTerms(value) {
  const aliases = new Map([
    ['searching', 'search'],
    ['filtering', 'filter'],
    ['browsing', 'browse'],
    ['reviewing', 'review'],
    ['notifications', 'notifications'],
    ['settings', 'settings'],
  ]);
  const stopwords = new Set([
    'the', 'and', 'for', 'with', 'into', 'from', 'this', 'that', 'page', 'screen', 'panel', 'section', 'area', 'view', 'task', 'surface', 'main', 'detail', 'details', 'default', 'product', 'current', 'active',
    'introduce', 'introduction', 'unified', 'discovery', 'discover', 'content', 'global', 'reusable', 'focused', 'clear', 'lightweight', 'simple', 'public', 'private', 'returning', 'signed', 'users', 'handle', 'manage', 'managing', 'show', 'showing', 'expose', 'exposing', 'onboard', 'onboarding', 'existing', 'pending', 'optional', 'later', 'strongly', 'prefer', 'entry', 'point', 'points', 'flow', 'flows', 'workflow', 'workflows', 'state', 'states', 'messaging', 'required', 'query', 'results', 'refinement', 'empty', 'summary', 'status', 'featured',
  ]);
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((item) => aliases.get(item.trim()) || item.trim())
    .filter((item) => item.length > 3 && !stopwords.has(item));
}

function entityLikeTermsFromFeatures(featureModules = []) {
  const uiStopwords = new Set(['search', 'browse', 'tabs', 'filters', 'filter', 'sort', 'refinement', 'empty', 'states', 'results', 'result', 'cards', 'card', 'global', 'searching', 'trending', 'recent', 'newly', 'approved', 'content', 'modules', 'onboarding', 'cue', 'reusable', 'alerts']);
  return unique((featureModules || [])
    .flatMap((item) => meaningfulTerms(item))
    .filter((token) => !uiStopwords.has(token)));
}

function inferRequiredNouns({ cleanedTitle = '', roadmapLists = {}, featureModules = [], family = 'generic' } = {}) {
  const scores = new Map();
  const seenOrder = [];
  const addTerm = (term, weight = 1) => {
    const normalized = String(term || '').trim().toLowerCase();
    if (!normalized) return;
    if (!scores.has(normalized)) seenOrder.push(normalized);
    scores.set(normalized, (scores.get(normalized) || 0) + weight);
  };
  const addTerms = (values = [], weight = 1) => {
    for (const value of values) {
      for (const term of meaningfulTerms(value)) addTerm(term, weight);
    }
  };

  addTerms([cleanedTitle], 8);
  addTerms(featureModules || [], 4);
  addTerms(entityLikeTermsFromFeatures(featureModules || []), 5);
  addTerms(roadmapLists.purpose || [], 2);

  const familyBoosts = {
    entry: ['explore'],
    search: ['browse', 'search'],
    'auth-sign-in': ['sign in', 'authentication', 'account'],
    'auth-sign-up': ['sign up', 'verification', 'account'],
    settings: ['account', 'settings', 'profile'],
    editor: ['entity', 'editor', 'shell'],
    history: ['history', 'version', 'revision'],
    activity: ['notifications', 'activity', 'updates'],
    workspace: ['workspace', 'queue', 'review'],
    'review-detail': ['detail', 'review', 'evidence'],
    profile: ['profile'],
  };
  for (const boosted of familyBoosts[family] || []) addTerm(boosted, 6);

  const ranked = Array.from(scores.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return seenOrder.indexOf(a[0]) - seenOrder.indexOf(b[0]);
    })
    .map(([term]) => term);

  return ranked.slice(0, 4).length ? ranked.slice(0, 4) : ['content', 'details'];
}

function preferredTermsFromRoadmap(roadmapLists = {}) {
  return unique((roadmapLists.features || [])
    .flatMap((item) => meaningfulTerms(item))
    .filter((token) => token.length > 3))
    .slice(0, 6);
}

function featureHeadingsFromRoadmap(roadmapLists = {}, fallback = []) {
  const headings = unique((roadmapLists.features || [])
    .slice(0, 4)
    .map((item) => titleCase(String(item || '').replace(/\b(global|reusable|clear|main|primary|secondary|supporting)\b/gi, '').trim()))
    .filter(Boolean));
  return headings.length ? headings : fallback;
}

function classifyPageFamily(pageKey, roadmapTitle, roadmapLists) {
  const slugTitle = `${slugWithoutPrefix(pageKey)} ${roadmapTitle || ''}`.toLowerCase();
  const context = `${slugTitle} ${(roadmapLists.features || []).join(' ')} ${(roadmapLists.purpose || []).join(' ')}`.toLowerCase();
  if (/sign-in|signin|login|log in/.test(slugTitle)) return 'auth-sign-in';
  if (/sign-up|signup|register|verify|verification|onboard/.test(slugTitle)) return 'auth-sign-up';
  if (/settings|preferences|security/.test(slugTitle)) return 'settings';
  if (/editor|edit|builder|composer/.test(slugTitle)) return 'editor';
  if (/history|version|revision|compare|restore/.test(slugTitle)) return 'history';
  if (/notification|activity|feed|updates/.test(slugTitle)) return 'activity';
  if (/moderation|review|approval|queue/.test(slugTitle) && /detail/.test(slugTitle)) return 'review-detail';
  if (/workspace|dashboard|queue|inbox|review/.test(slugTitle)) return 'workspace';
  if (/home|landing|discover|explore/.test(slugTitle)) return 'entry';
  if (/search|browse|results|catalog|finder/.test(slugTitle)) return 'search';
  if (/profile/.test(slugTitle)) return 'profile';
  if (/detail|showcase|overview/.test(slugTitle)) return 'detail';
  if (/sign-in|signin|login|log in/.test(context)) return 'auth-sign-in';
  if (/sign-up|signup|register|verify|verification|onboard/.test(context)) return 'auth-sign-up';
  if (/settings|preferences|security/.test(context)) return 'settings';
  if (/editor|edit|builder|composer/.test(context)) return 'editor';
  if (/history|version|revision|compare|restore/.test(context)) return 'history';
  if (/notification|activity|feed|updates/.test(context)) return 'activity';
  if (/moderation|review|approval|queue/.test(context) && /detail/.test(context)) return 'review-detail';
  if (/workspace|dashboard|queue|inbox|review/.test(context)) return 'workspace';
  if (/search|browse|results|catalog|finder/.test(context)) return 'search';
  if (/home|landing|discover|explore/.test(context)) return 'entry';
  if (/profile/.test(context)) return 'profile';
  if (/detail|showcase|overview/.test(context)) return 'detail';
  return 'generic';
}

function defaultHeadingsForFamily(family, pageTitle) {
  if (family === 'entry') return ['Primary Entry Point', 'Featured Areas', 'Fresh Updates', 'Getting Started'];
  if (family === 'search') return ['Search Results', 'Filter Controls', 'Saved Views', 'Related Results'];
  if (family === 'auth-sign-in') return ['Sign In Form', 'Authentication Status', 'Return Path', 'Help'];
  if (family === 'auth-sign-up') return ['Sign Up Form', 'Verification Status', 'Confirmation Steps', 'Help'];
  if (family === 'settings') return ['Settings Overview', 'Preferences', 'Security', 'Notifications'];
  if (family === 'editor') return ['Editor Overview', 'Fields', 'Draft Changes', 'Publishing Actions'];
  if (family === 'history') return ['History', 'Change Summary', 'Revision Metadata', 'Restore Actions'];
  if (family === 'activity') return ['Notifications', 'Recent Activity', 'Unread Updates', 'Filters'];
  if (family === 'review-detail') return [pageTitle, 'Context', 'Evidence', 'Actions'];
  if (family === 'workspace') return ['Primary Queue', 'Selected Item Detail', 'Notes', 'Actions'];
  if (family === 'profile') return [pageTitle, 'Overview', 'Activity', 'Related Items'];
  if (family === 'detail') return [pageTitle, 'Overview', 'Related Items', 'Next Actions'];
  return [pageTitle, 'Primary Content', 'Supporting Context', 'Next Actions'];
}

function ctasForFamily(family) {
  if (family === 'entry') return ['Get Started', 'Open Featured Item'];
  if (family === 'search') return ['Open Result', 'Apply Filters', 'Clear Filters'];
  if (family === 'auth-sign-in') return ['Sign In', 'Forgot Password', 'Create Account'];
  if (family === 'auth-sign-up') return ['Create Account', 'Verify Email', 'Sign In'];
  if (family === 'settings') return ['Save Changes', 'Sign Out'];
  if (family === 'editor') return ['Save Draft', 'Preview Changes', 'Publish'];
  if (family === 'history') return ['Open Version', 'Compare Changes', 'Restore Version'];
  if (family === 'activity') return ['Open Item', 'Mark All Read'];
  if (family === 'review-detail') return ['Approve', 'Dismiss', 'Open Related Item'];
  if (family === 'workspace') return ['Open Item', 'Complete Review', 'Save Notes'];
  if (family === 'profile') return ['Open Activity', 'View More'];
  if (family === 'detail') return ['Open Related Item', 'Continue'];
  return ['Open Detail', 'Continue'];
}

function responsiveNotesForFamily(family, pageTitle) {
  if (family === 'entry') return 'Keep this as the default entry into the product. Preserve primary orientation, discovery cues, and a clear getting-started path across breakpoints.';
  if (family === 'search') return 'Tablet and desktop may widen filters and result grouping, but the page must still read as a search/discovery utility rather than a dashboard.';
  if (family === 'auth-sign-in' || family === 'auth-sign-up') return 'Keep authentication intimate and task-focused across breakpoints; do not turn it into a marketing splash or admin portal.';
  if (family === 'settings') return 'Keep settings structured and calm; avoid enterprise admin chrome or a second competing nav shell.';
  if (family === 'editor') return 'Keep the editor disciplined and field/task-first; do not drift into generic CRUD tables or analytics chrome.';
  if (family === 'history') return 'Keep history readable and evidence-led; avoid developer-tool clutter or decorative framing.';
  if (family === 'activity') return 'Keep the activity surface calm and legible; avoid chat-app or admin-console drift.';
  if (family === 'review-detail' || family === 'workspace') return 'Keep the workspace serious and task-focused; avoid top-framing slogans, a second app nav, or dashboard excess.';
  if (family === 'profile') return 'Keep the profile recognizable as one person/context surface across breakpoints; do not turn it into a generic dashboard.';
  if (family === 'detail') return `Keep ${pageTitle} as a focused detail surface across breakpoints and avoid turning it into a different product area.`;
  return 'Non-primary breakpoints may widen structure, but must not change the page into a different product surface.';
}

function shellHintsForFamily(family) {
  if (family === 'entry') return { tabletMode: 'simple expansion', tabletShell: 'top nav + wider feature grid', desktopMode: 'adaptive remap', desktopShell: 'top nav + side rail' };
  if (family === 'search') return { tabletMode: 'simple expansion', tabletShell: 'top nav + wider filter row', desktopMode: 'adaptive remap', desktopShell: 'top nav + side rail' };
  if (family === 'auth-sign-in' || family === 'auth-sign-up') return { tabletMode: 'simple expansion', tabletShell: 'top nav', desktopMode: 'adaptive remap', desktopShell: 'top nav + centered auth panel' };
  return { tabletMode: 'simple expansion', tabletShell: 'top nav', desktopMode: 'adaptive remap', desktopShell: 'top nav + side rail' };
}

function searchPlaceholderForFamily(family, requiredNouns = []) {
  if (family !== 'search') return null;
  const entities = requiredNouns.filter((token) => !['browse', 'search', 'filter', 'filters', 'tabs'].includes(String(token).toLowerCase()));
  return `Search ${entities.slice(0, 3).join(', ') || 'results'}`;
}

function pageHintFor(pageKey, roadmapTitle, roadmapLists) {
  const title = roadmapTitle || fallbackPageTitle(pageKey);
  const cleanedTitle = title
    .split('/')
    .map((part) => part.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .pop() || title.replace(/\([^)]*\)/g, '').trim();
  const family = classifyPageFamily(pageKey, roadmapTitle, roadmapLists);
  const requiredNouns = inferRequiredNouns({ cleanedTitle, roadmapLists, featureModules: roadmapLists.features, family });
  const shellHints = shellHintsForFamily(family);
  const coreHeadings = featureHeadingsFromRoadmap(roadmapLists, defaultHeadingsForFamily(family, cleanedTitle));
  const tokens = cleanedTitle.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return {
    pageTitle: cleanedTitle,
    supportingLine: roadmapLists.purpose[0] || `Use ${cleanedTitle} as a focused product page without changing the product category.`,
    coreHeadings,
    ctas: unique(ctasForFamily(family)),
    preApprovalCtas: family === 'entry' ? ['Get Started'] : [],
    searchPlaceholder: searchPlaceholderForFamily(family, requiredNouns),
    requiredAny: tokens.slice(0, 3),
    requiredNouns,
    preferred: preferredTermsFromRoadmap(roadmapLists),
    banned: ['pricing', 'customers', 'campaigns', 'conversions'],
    responsiveNotes: responsiveNotesForFamily(family, cleanedTitle),
    tabletMode: shellHints.tabletMode,
    tabletShell: shellHints.tabletShell,
    desktopMode: shellHints.desktopMode,
    desktopShell: shellHints.desktopShell,
  };
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

async function runNodeJson(scriptPath, args = []) {
  const { stdout } = await execFile(process.execPath, [scriptPath, ...args], {
    cwd: path.dirname(scriptPath),
    maxBuffer: 10 * 1024 * 1024,
  });
  const trimmed = String(stdout || '').trim();
  if (!trimmed) return null;
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end < start) {
    throw new Error(`Expected JSON output from ${path.basename(scriptPath)} but got: ${trimmed.slice(0, 400)}`);
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}

async function ensureProjectBootstrap(projectRoot, force = false) {
  const scriptPath = path.join(__dirname, 'design_flow_bootstrap_project.mjs');
  return runNodeJson(scriptPath, [
    '--project-root', projectRoot,
    '--force', force ? 'true' : 'false',
  ]);
}

function buildBootstrapResponsiveMap({ primaryBreakpoint, projectId = '[pending]', screenId = '[pending]', primarySourceStatus = 'pending', featureModules = [], pageTitle, siteTitle, primaryNavLabels = [], coreHeadings = [], ctaLabels = [], requiredNouns = [], tabletMode = 'simple expansion', tabletShell = 'top nav', desktopMode = 'adaptive remap', desktopShell = 'top nav + side rail' }) {
  const fixedItems = [siteTitle, pageTitle, ...primaryNavLabels, ...coreHeadings, ...requiredNouns];
  const mainModules = featureModules.slice(0, 2);
  const sideModules = featureModules.slice(2, 4);
  return `# Responsive map\n\n` +
    `## Approved primary source\n` +
    `- breakpoint: ${primaryBreakpoint}\n` +
    `- project id: ${projectId}\n` +
    `- screen id: ${screenId}\n` +
    `- status: ${primarySourceStatus}\n\n` +
    `## Semantic truth\n` +
    `- approved primary source is the source of truth for product framing, copy, labels, and module meaning\n` +
    `- until the first approved primary source exists, use page brief, content, critique, and this responsive map as the temporary truth pack\n\n` +
    `## Remap prerequisites\n` +
    `- non-primary remap requires a dedicated breakpoint prompt under \`exports/stitch/<breakpoint>/prompt.md\`\n` +
    `- regenerate this map after the primary source exists so project/screen ids are real, not pending\n` +
    `- if the target breakpoint still reads like a stretched ${primaryBreakpoint} stack, go back to remap instead of Phase C\n\n` +
    `## Tablet strategy\n` +
    `- mode: ${tabletMode}\n` +
    `- shell: ${tabletShell}\n` +
    `- keep fixed:\n${fixedItems.map((item) => `  - ${item}`).join('\n')}\n` +
    `- may remap:\n  - widen module spacing and list density carefully\n  - relocate filters/search tools without changing meaning\n` +
    `- distinct from desktop:\n  - keep grouping simpler and less persistent than desktop\n` +
    `- borrow from tablet reference:\n  - structural grouping only after a tablet reference exists\n` +
    `- ignore from tablet reference:\n  - any copy/category drift or dashboard chrome\n\n` +
    `## Desktop strategy\n` +
    `- mode: ${desktopMode}\n` +
    `- shell: ${desktopShell}\n` +
    `- keep fixed:\n${fixedItems.map((item) => `  - ${item}`).join('\n')}\n` +
    `- may remap:\n  - widen shell, add rails, regroup supporting modules\n  - increase scan density without rewriting product framing\n` +
    `- distinct from tablet:\n  - desktop may keep more persistent secondary structure than tablet\n` +
    `- borrow from desktop reference:\n  - structural grouping only after a desktop reference exists\n` +
    `- ignore from desktop reference:\n  - bottom-nav carryover, dashboard drift, or label drift\n\n` +
    `## Breakpoint-specific elements\n` +
    `- Search/filter tools may relocate and widen at larger breakpoints, but must remain clearly tied to the page task\n\n` +
    `## Exact action labels to preserve\n${unique(ctaLabels).length ? unique(ctaLabels).map((item) => `- ${item}`).join('\n') : '- [none]'}\n\n` +
    `## Desktop anti-patterns to reject\n` +
    `- bottom-nav carryover\n` +
    `- stretched ${primaryBreakpoint} stack without real desktop regions\n` +
    `- top-framing slogans or atmospheric headlines that displace task modules\n` +
    `- dashboard chrome that replaces the actual page task\n\n` +
    `## Shell behavior guardrails\n` +
    `- global product nav stays in the header/top navigation, not a second app-admin side menu\n` +
    `- if a side rail exists on desktop, use it for page-local modules such as notes, actions, filters, or supporting state\n` +
    `- item titles or sample content may appear inside queue/detail modules, but not as hero framing above the page task\n\n` +
    `## Desktop grouping target\n` +
    `- main column:\n${mainModules.length ? mainModules.map((item) => `  - ${item}`).join('\n') : '  - [define after approved primary source]'}\n` +
    `- side rail:\n${sideModules.length ? sideModules.map((item) => `  - ${item}`).join('\n') : '  - [define after approved primary source]'}\n\n` +
    `## Mobile grouping target\n` +
    `- top stack:\n${mainModules.length ? mainModules.map((item) => `  - ${item}`).join('\n') : '  - [define after approved primary source]'}\n` +
    `- lower stack:\n${sideModules.length ? sideModules.map((item) => `  - ${item}`).join('\n') : '  - [define after approved primary source]'}\n\n` +
    `## Non-negotiables\n` +
    `- do not change product category\n` +
    `- do not change locked copy\n` +
    `- do not drop core modules without an explicit reason\n` +
    `- do not let non-primary breakpoints become independent semantic redesigns\n` +
    `- do not let tablet simply clone desktop unless you explicitly justify why the same shell is correct\n\n` +
    `## Phase C eligibility\n` +
    `- only use Phase C after the target breakpoint already has the correct shell (${desktopShell} for desktop, not a stretched ${primaryBreakpoint} stack)\n` +
    `- only use Phase C when core modules already land in the intended regions\n` +
    `- if desktop still shows bottom-nav carryover, top-framing drift, or missing desktop regions, return to breakpoint remap first\n`;
}

function buildPrimaryPrompt({
  primaryBreakpoint,
  pageName,
  siteTitle,
  goal,
  featureModules = [],
  responsiveIntentLine,
  pageHint,
  primaryNavLabels = [],
  utilityLabel,
  ctaLabels = [],
  requiredNouns = [],
  bannedWords = [],
  visualTone,
  themeStrategy,
  pageKey,
}) {
  return `# Stitch prompt

Create a primary breakpoint ${primaryBreakpoint} page for ${pageName} in ${siteTitle}.

Goal:
${goal || pageHint.supportingLine}

Required structure:
${featureModules.slice(0, 10).map((item) => `- ${item}`).join('\n')}

Responsive intent:
- Primary breakpoint: ${primaryBreakpoint === 'mobile' ? 'mobile-first' : 'desktop-first'}
- Secondary expansion rules: ${responsiveIntentLine}
- Keep stable across breakpoints: ${[siteTitle, pageHint.pageTitle, ...primaryNavLabels, ...requiredNouns].join(', ')}

Theme intent:
- Base design system: ${visualTone || 'calm, readable, product-first'}
- Theme overlay: task-focused product surface, not a marketing splash page
- Theme strategy: ${themeStrategy}
- Current export may render in one theme, but the component choices must stay consistent with both light and dark overlays
- Prefer neutral surfaces, restrained borders, and contrast-safe text that can invert cleanly across themes
- Do not drift into: ${bannedWords.join(', ')}

Semantic focus:
- Required nouns: ${requiredNouns.join(', ')}
- Preferred nouns: ${unique(pageHint.preferred).slice(0, 5).join(', ')}
- Banned drift words: ${bannedWords.join(', ')}

Page-specific guardrails:
- Role access: ${roleAccessForPage(pageKey)}
- Route candidate: ${routeCandidateForPage(pageKey)}
- Responsive/task constraint: ${pageHint.responsiveNotes}
- Keep the global product navigation visible: ${[...primaryNavLabels, utilityLabel].join(' / ')}

Exact visible section labels:
${pageHint.coreHeadings.map((item) => `- ${item}`).join('\n')}

Exact visible action labels:
${unique(ctaLabels).map((item) => `- ${item}`).join('\n')}

Stitch execution rules:
- Design exactly one product screen for this page, not a multi-step flow, moodboard, or adjacent product surface
- Use the visible labels and nouns here as the contract; do not invent a new brand, new page title, or new product category
- Prefer concrete UI structure, real components, and readable information hierarchy over atmospheric storytelling chrome
- If a visual flourish conflicts with the locked copy or route/task framing, keep the contract and drop the flourish
- If the primary breakpoint uses a fixed bottom nav, keep the first viewport clear above it; no cards, CTA buttons, or primary modules should be visibly obscured by mobile chrome
- keep section headings and action labels literal; do not rename them into looser editorial wording
- put sample item titles inside queue/detail cards, not as hero framing above the page task
- if this page can work with header/top navigation, prefer that over a fixed bottom nav that obscures content

Use this exact visible copy:
- Site title: ${siteTitle}
- Page title: ${pageHint.pageTitle}
- Supporting line: ${pageHint.supportingLine}
- Navigation: ${[...primaryNavLabels, utilityLabel].join(' / ')}

Copy locks:
- keep the exact site title string "${siteTitle}" visible on the page
- keep the exact page title string "${pageHint.pageTitle}" visible on the page
- if any other brand or page-title wording appears, replace it with the locked copy above
- do not paraphrase the page title into a synonym such as Archive, Story, Workspace, Dashboard, Profile, or Hub unless that exact word is already the approved page title
- keep the exact product nouns "${requiredNouns.join('\", \"')}" visible somewhere in the UI
- preserve the page as the correct task surface for this route, not a marketing splash, unrelated enterprise tool, or the wrong product category

Do not introduce:
${bannedWords.map((item) => `- ${item}`).join('\n')}
- a different product category
- unrelated dashboard or enterprise chrome
`;
}

function buildRemapPrompt({
  breakpoint,
  primaryBreakpoint,
  pageName,
  pageTitle,
  siteTitle,
  primaryNavLabels = [],
  utilityLabel,
  coreHeadings = [],
  ctaLabels = [],
  requiredNouns = [],
  bannedWords = [],
  visualTone,
  themeStrategy,
  responsiveMapText,
  pageKey,
  shell,
  mode,
  mainModules = [],
  sideModules = [],
  primarySourceStatus = 'pending',
  sourceProjectId = '[pending]',
  sourceScreenId = '[pending]',
}) {
  const isDesktop = normalizeBreakpointName(breakpoint, 'desktop') === 'desktop';
  const regionSummary = isDesktop
    ? `- main column: ${mainModules.join(', ') || '[define after approved primary source]'}\n- side rail: ${sideModules.join(', ') || '[define after approved primary source]'}`
    : `- keep the stack simpler than desktop while widening spacing and controls`;
  return `# Stitch prompt

Create a ${breakpoint} breakpoint remap for the existing ${pageName} page.

This is a breakpoint translation from the ${primarySourceStatus} ${primaryBreakpoint} source, not a semantic redesign.
Use the ${primaryBreakpoint} screen in the same Stitch project as the semantic source of truth.

Keep fixed:
- ${siteTitle}
- ${pageTitle}
- ${[...primaryNavLabels, utilityLabel].join('\n- ')}
- ${coreHeadings.join('\n- ')}
- ${requiredNouns.join('\n- ')}

Copy locks:
- keep the exact site title string "${siteTitle}" visible
- keep the exact page title string "${pageTitle}" visible
- if the current screen shows any different brand or page-title wording, replace it with the locked copy above
- do not paraphrase the page title into Archive, Story, Workspace, Dashboard, Profile, or Hub unless that exact word is already approved
- keep the exact product nouns "${requiredNouns.join('\", \"')}" visible somewhere in the UI
- preserve product framing while only remapping layout for the target breakpoint
- keep these exact section labels visible: ${coreHeadings.join(', ')}
- keep these exact action labels visible: ${unique(ctaLabels).join(', ')}

${isDesktop ? `Desktop shell requirements:
- keep the global product navigation in the header/top navigation only
- use any side rail for page-local modules, not a second global admin/app navigation menu
- no bottom navigation carryover
- do not place sample item titles, slogans, or atmospheric phrases above the page task as hero framing
` : `Breakpoint shell requirements:
- preserve the page task hierarchy while widening controls and spacing
- do not let utility chrome displace the page's working sections
`}

Responsive rules:
- target breakpoint: ${breakpoint}
- source breakpoint: ${primaryBreakpoint}
- source project id: ${sourceProjectId}
- source screen id: ${sourceScreenId}
- remap mode: ${mode}
- shell target: ${shell}
- use a real ${breakpoint} shell, not a stretched ${primaryBreakpoint} stack
- no bottom navigation carryover
- region target:\n${regionSummary}
- responsive map:\n${responsiveMapText.split('\n').map((line) => `  ${line}`).join('\n')}

Page-specific product rules:
- Role access: ${roleAccessForPage(pageKey)}
- Route candidate: ${routeCandidateForPage(pageKey)}
- Keep the global product navigation visible: ${[...primaryNavLabels, utilityLabel].join(' / ')}
- Preserve the page as the correct task surface for this route instead of drifting into dashboard, archive, or marketing framing
- If the target breakpoint still looks like a stretched ${primaryBreakpoint} shell, rebuild the shell before polishing spacing
- make the four working sections easy to scan: ${coreHeadings.join(' / ')}
- expose the locked actions as actual visible controls: ${unique(ctaLabels).join(' / ')}
- keep any sample item or entity title subordinate to the section it belongs to, never as the page hero

Theme system rules:
- Base design system: ${visualTone || 'calm, readable, product-first'}
- Theme strategy: ${themeStrategy}
- Keep styling consistent with the shared project design system
- Preserve restrained surfaces, readable spacing, and contrast-safe text
- Avoid these drift families: ${bannedWords.join(', ')}

Avoid drift into:
${bannedWords.map((item) => `- ${item}`).join('\n')}
- bottom-nav carryover
- stretched ${primaryBreakpoint} stack
- atmospheric top-framing that replaces working modules
- unrelated dashboard or enterprise chrome
`;
}

const args = parseArgs(process.argv);
const force = parseBooleanFlag(args.force, false);
const paths = await resolveDesignPaths({
  projectRoot: args['project-root'] || null,
  configFile: args['config-file'] || null,
  page: args.page || null,
  outdir: args.outdir || null,
  stateFile: args['state-file'] || null,
  deviceType: args['device-type'] || 'MOBILE',
  startPath: process.cwd(),
});

if (!paths.projectRoot || !paths.pageDir || !paths.pageKey || !paths.stitchRoot) {
  console.error('usage: design_flow_bootstrap_page.mjs --project-root <dir> --page <page-key> [--target-breakpoint mobile|desktop|tablet] [--force true|false]');
  process.exit(1);
}

const targetBreakpoint = normalizeBreakpointName(args['target-breakpoint'] || paths.primaryBreakpoint || 'mobile', paths.primaryBreakpoint || 'mobile');
const primaryBreakpoint = normalizeBreakpointName(paths.primaryBreakpoint || 'mobile', 'mobile');
const briefPath = path.join(paths.projectRoot, '00-meta', 'brief.md');
const copyPackPath = path.join(paths.projectRoot, '00-meta', 'copy-pack.md');
const roadmapPath = path.join(paths.projectRoot, 'ROADMAP.md');

if (!await fileExists(roadmapPath)) {
  console.error(`design-flow bootstrap requires ${roadmapPath}`);
  process.exit(1);
}

const projectBootstrap = await ensureProjectBootstrap(paths.projectRoot, force);

for (const requiredFile of [briefPath, copyPackPath]) {
  if (!await fileExists(requiredFile)) {
    console.error(`design-flow page bootstrap expected ${requiredFile} after project bootstrap`);
    process.exit(1);
  }
}

const projectBrief = await readFileSafe(briefPath);
const copyPack = await readFileSafe(copyPackPath);
const roadmap = await readFileSafe(roadmapPath);
const roadmapSection = extractRoadmapSection(roadmap, paths.pageKey);
if (!roadmapSection) {
  console.error(`Unable to locate ROADMAP section for page ${paths.pageKey}. Refusing to invent page truth without a roadmap anchor.`);
  process.exit(1);
}

const roadmapTitle = roadmapSection.title.replace(/^\d+\)\s*/, '').trim();
const roadmapLists = extractRoadmapLists(roadmapSection.body);
const copySections = parseCopyPackSections(copyPack);
const nav = copySections.navigation || {};
const productSummary = extractBriefSectionValue(projectBrief, 'Product summary');
const targetUser = extractBriefSectionValue(projectBrief, 'Target user');
const visualTone = extractBriefSectionValue(projectBrief, 'Visual tone');
const constraints = extractBriefSectionValue(projectBrief, 'Constraints');
const successCriteria = extractBriefSectionValue(projectBrief, 'Success criteria');
const responsivePriority = extractBriefSectionValue(projectBrief, 'Responsive priority');
const pageHint = pageHintFor(paths.pageKey, roadmapTitle, roadmapLists);

const pageBriefPath = path.join(paths.pageDir, 'brief.md');
const notesPath = path.join(paths.pageDir, 'notes.md');
const contentPath = path.join(paths.pageDir, 'content.md');
const critiquePath = path.join(paths.pageDir, 'critique.md');
const semanticRulesPath = path.join(paths.stitchRoot, 'semantic-rules.json');
const responsiveMapPath = path.join(paths.stitchRoot, 'responsive-map.md');
const preApprovalLockPath = path.join(paths.stitchRoot, 'pre-approval-lock.md');
const copyLockPath = path.join(paths.stitchRoot, 'copy-lock.md');
const outputLockPath = path.join(paths.stitchRoot, 'output-lock.md');
const primaryPromptPath = promptPathForBreakpoint(paths.stitchRoot, primaryBreakpoint);

const pageName = roadmapTitle || fallbackPageTitle(paths.pageKey);
const pageTitle = pageHint.pageTitle;
const primaryNavLabels = unique([nav['Link 1'], nav['Link 2'], nav['Link 3']]).filter(Boolean);
const utilityLabel = nav.Utility || 'Sign In';
const siteTitle = nav.Brand || 'Product';
const featureModules = unique(roadmapLists.features.length ? roadmapLists.features : ['primary task surface', 'supporting state', 'action area', 'supporting detail']);
const actions = unique(pageHint.ctas.concat(utilityLabel));
const requiredNouns = (pageHint.requiredNouns && pageHint.requiredNouns.length)
  ? pageHint.requiredNouns
  : inferRequiredNouns({ cleanedTitle: pageTitle || pageName, roadmapLists, featureModules });
const bannedWords = pageHint.banned;
const themeStrategy = paths.config?.themeStrategy || 'light+dark';
const responsiveIntentLine = responsivePriority && !/\s-\s/.test(responsivePriority) && responsivePriority.length < 180
  ? responsivePriority
  : pageHint.responsiveNotes;
const stitchState = await readJsonIfExists(paths.stateFile, {});
const approvedPrimarySource = stitchState?.approved?.[primaryBreakpoint] || null;
const currentPrimarySource = stitchState?.current?.[primaryBreakpoint] || null;
const activePrimarySource = approvedPrimarySource || currentPrimarySource || null;
const primarySourceStatus = approvedPrimarySource
  ? 'approved'
  : currentPrimarySource
    ? 'current-not-yet-approved'
    : 'pending';
const lockGuidance = {
  pageName,
  siteTitle,
  pageTitle,
  navLabels: [...primaryNavLabels, utilityLabel],
  searchPlaceholder: pageHint.searchPlaceholder,
  coreHeadings: pageHint.coreHeadings,
  ctaLabels: actions,
  preApprovalCtas: pageHint.preApprovalCtas,
  requiredNouns,
  banned: bannedWords,
};

const created = [];
const skipped = [];
const mainModules = featureModules.slice(0, 2);
const sideModules = featureModules.slice(2, 4);

await writeFileIfMissing(pageBriefPath, `# Page brief\n\n## Page\n- Name: ${pageName}\n- Folder: ${paths.pageKey}\n- Route candidate: ${routeCandidateForPage(paths.pageKey)}\n- Role access: ${roleAccessForPage(paths.pageKey)}\n\n## Goal\n- Primary job of the page: ${roadmapLists.purpose[0] || 'serve a focused product page without changing product category'}\n- Top user intent: ${featureModules[0] || 'complete the page\'s main task quickly'}\n- Failure if this page is weak: the page feels generic, drifts from the approved product nouns, or hides core task objects\n\n## Required modules\n- Hero / header: ${siteTitle} brand + ${pageTitle} page title + lightweight utility nav\n- Main content modules: ${featureModules.slice(0, 3).join(', ')}\n- Secondary content modules: ${featureModules.slice(3).join(', ') || 'supporting page states / lightweight utility'}\n- Actions: ${actions.join(', ')}\n\n## Repo-aware notes\n- Existing components to reuse: none yet\n- Existing layout shell to reuse: none yet\n- Existing tokens / styles to respect: none yet\n- New components likely needed: ${featureModules.slice(0, 4).map((item) => item.toLowerCase()).join(', ')}\n\n## Breakpoint source\n- Primary breakpoint: ${primaryBreakpoint}\n- Why this breakpoint is the source of truth: keep the smallest-surface hierarchy and product framing stable before widening into richer browse shells\n\n## Constraints\n- Copy constraints: preserve ${siteTitle}, ${primaryNavLabels.join(' / ')}, and ${requiredNouns.join(' / ')} language\n- Semantic constraints: ${pageName} must stay the correct product page for ${requiredNouns.join(', ')}\n- Design-system constraints: ${visualTone || 'calm, readable, product-first'}\n- Responsive constraints: ${pageHint.responsiveNotes}\n`, created, skipped, force);

await writeFileIfMissing(notesPath, `- Bootstrap source: ROADMAP section \`${roadmapSection.title}\`\n- Product summary: ${productSummary}\n- Target user: ${targetUser}\n- Page purpose: ${roadmapLists.purpose[0] || 'n/a'}\n- Feature ownership:\n${featureModules.map((item) => `  - ${item}`).join('\n')}\n- Roadmap notes:\n${(roadmapLists.notes.length ? roadmapLists.notes : ['Tighten after first approved primary source.']).map((item) => `  - ${item}`).join('\n')}\n- Project constraints: ${constraints || 'Preserve product framing and avoid unrelated dashboard / marketing drift.'}\n- Success criteria anchor: ${successCriteria || `Keep ${requiredNouns.join(', ')} first-class.`}\n`, created, skipped, force);

await writeFileIfMissing(contentPath, `# ${pageName} content\n\n## Page framing\n- Site title: ${siteTitle}\n- Page title: ${pageTitle}\n- Supporting line: ${pageHint.supportingLine}\n\n## Navigation labels\n${primaryNavLabels.map((item) => `- ${item}`).join('\n')}\n- ${utilityLabel}\n\n## Core headings\n${pageHint.coreHeadings.map((item) => `- ${item}`).join('\n')}\n\n## CTA labels\n${actions.map((item) => `- ${item}`).join('\n')}\n\n## Required nouns\n${requiredNouns.map((item) => `- ${item}`).join('\n')}\n\n## Avoid\n${bannedWords.map((item) => `- ${item}`).join('\n')}\n`, created, skipped, force);

await writeFileIfMissing(critiquePath, `# Bootstrap critique\n\n## What to preserve\n- ${siteTitle}, ${pageTitle}, and ${requiredNouns.join(' / ')} must remain first-class.\n- ${pageHint.supportingLine}\n\n## First-pass review targets\n${featureModules.map((item) => `- verify ${item} stays clearly represented`).join('\n')}\n\n## Drift to reject\n${bannedWords.map((item) => `- ${item}`).join('\n')}\n`, created, skipped, force);

await ensureDir(paths.stitchRoot);
await writeJson(semanticRulesPath, await (async () => {
  if (!force && await fileExists(semanticRulesPath)) {
    skipped.push(semanticRulesPath);
    return JSON.parse(await fs.readFile(semanticRulesPath, 'utf8'));
  }
  const payload = {
    requiredAll: requiredNouns,
    requiredAny: unique(pageHint.requiredAny),
    requiredAnyGroups: Array.isArray(pageHint.requiredAnyGroups)
      ? pageHint.requiredAnyGroups.map((group, index) => ({
        label: String(group?.label || `group-${index + 1}`).trim(),
        any: unique(group?.any || group?.terms || []).map((item) => String(item || '').trim()).filter(Boolean),
      })).filter((group) => group.any.length > 0)
      : [],
    preferred: unique(pageHint.preferred).slice(0, 5),
    banned: bannedWords,
    notes: `${pageName} must preserve the approved product framing and avoid unrelated dashboard / marketing drift.`,
  };
  created.push(semanticRulesPath);
  return payload;
})());

const responsiveMapText = buildBootstrapResponsiveMap({
  primaryBreakpoint,
  projectId: activePrimarySource?.projectId || stitchState?.projectId || '[pending]',
  screenId: activePrimarySource?.screenId || '[pending]',
  primarySourceStatus,
  featureModules,
  pageTitle,
  siteTitle,
  primaryNavLabels,
  coreHeadings: pageHint.coreHeadings,
  ctaLabels: actions,
  requiredNouns,
  tabletMode: pageHint.tabletMode,
  tabletShell: pageHint.tabletShell,
  desktopMode: pageHint.desktopMode,
  desktopShell: pageHint.desktopShell,
});

await writeFileIfMissing(responsiveMapPath, responsiveMapText, created, skipped, force);

await writeFileIfMissing(preApprovalLockPath, buildPreApprovalLockMarkdown(lockGuidance), created, skipped, force);
await writeFileIfMissing(copyLockPath, buildCopyLockMarkdown(lockGuidance), created, skipped, force);
await writeFileIfMissing(outputLockPath, buildOutputLockMarkdown(lockGuidance), created, skipped, force);

await writeFileIfMissing(primaryPromptPath, buildPrimaryPrompt({
  primaryBreakpoint,
  pageName,
  siteTitle,
  goal: roadmapLists.purpose[0] || pageHint.supportingLine,
  featureModules,
  responsiveIntentLine,
  pageHint,
  primaryNavLabels,
  utilityLabel,
  ctaLabels: actions,
  requiredNouns,
  bannedWords,
  visualTone,
  themeStrategy,
  pageKey: paths.pageKey,
}), created, skipped, force);

const secondaryPromptBreakpoints = unique(
  (paths.enabledBreakpoints || ['mobile', 'desktop'])
    .map((item) => normalizeBreakpointName(item, primaryBreakpoint))
    .filter((item) => item !== primaryBreakpoint),
);

for (const breakpoint of secondaryPromptBreakpoints) {
  const promptPath = promptPathForBreakpoint(paths.stitchRoot, breakpoint);
  await writeFileIfMissing(promptPath, buildRemapPrompt({
    breakpoint,
    primaryBreakpoint,
    pageName,
    pageTitle,
    siteTitle,
    primaryNavLabels,
    utilityLabel,
    coreHeadings: pageHint.coreHeadings,
    ctaLabels: actions,
    requiredNouns,
    bannedWords,
    visualTone,
    themeStrategy,
    responsiveMapText,
    pageKey: paths.pageKey,
    shell: shellForBreakpoint(breakpoint, { tabletShell: pageHint.tabletShell, desktopShell: pageHint.desktopShell }),
    mode: modeForBreakpoint(breakpoint, { tabletMode: pageHint.tabletMode, desktopMode: pageHint.desktopMode }),
    mainModules,
    sideModules,
    primarySourceStatus,
    sourceProjectId: activePrimarySource?.projectId || stitchState?.projectId || '[pending]',
    sourceScreenId: activePrimarySource?.screenId || '[pending]',
  }), created, skipped, force);
}

process.stdout.write(JSON.stringify({
  projectRoot: paths.projectRoot,
  pageKey: paths.pageKey,
  pageName,
  targetBreakpoint,
  primaryBreakpoint,
  roadmapSection: roadmapSection.title,
  projectBootstrap,
  created,
  skipped,
  files: {
    pageBriefPath,
    notesPath,
    contentPath,
    critiquePath,
    semanticRulesPath,
    responsiveMapPath,
    preApprovalLockPath,
    copyLockPath,
    outputLockPath,
    primaryPromptPath,
    secondaryPromptPaths: secondaryPromptBreakpoints.map((breakpoint) => promptPathForBreakpoint(paths.stitchRoot, breakpoint)),
  },
}, null, 2) + '\n');
