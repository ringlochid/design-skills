#!/usr/bin/env node
import { normalizeDeviceType, defaultViewportForDeviceType } from './device_viewport.mjs';

export function buildLayoutDiagnostics({ html = '', deviceType = 'DESKTOP', viewport = defaultViewportForDeviceType(deviceType), renderMeta = {}, semanticCheck = null, preApprovalLockCheck = null, copyLockCheck = null, responsiveMapText = '' } = {}) {
  const normalizedDeviceType = normalizeDeviceType(deviceType);
  const contentMetrics = renderMeta.contentMetrics || {};
  const viewportWidth = Number(renderMeta.renderedCssSize?.width || viewport.width || 0);
  const fullWidth = Number(renderMeta.fullPageRenderedCssSize?.width || 0);
  const meaningfulWidth = Number(contentMetrics.meaningfulWidth || 0);
  const domFullWidth = Number(contentMetrics.domFullWidth || 0);
  const widthRatio = viewportWidth > 0 && meaningfulWidth > 0 ? Number((meaningfulWidth / viewportWidth).toFixed(3)) : null;
  const fixedBottomBar = contentMetrics.fixedBottomBar || null;
  const lowerHtml = String(html || '').toLowerCase();
  const responsiveMapRaw = String(responsiveMapText || '');
  const lowerResponsiveMap = responsiveMapRaw.toLowerCase();
  const findings = [];
  const recommendedStrategies = [];
  const blockers = [];

  const addStrategy = (value) => {
    if (value && !recommendedStrategies.includes(value)) recommendedStrategies.push(value);
  };
  const addFinding = (severity, code, detail) => findings.push({ severity, code, detail });

  const semanticPassed = semanticCheck ? semanticCheck.passed === true : true;
  const preApprovalPassed = preApprovalLockCheck ? preApprovalLockCheck.passed === true : false;
  const copyPassed = copyLockCheck ? copyLockCheck.passed === true : false;

  if (!semanticPassed) blockers.push('semantic-check-failed');
  if (!preApprovalLockCheck) blockers.push('pre-approval-lock-missing');
  else if (!preApprovalPassed) blockers.push('pre-approval-lock-failed');
  if (!copyLockCheck) blockers.push('copy-lock-missing');
  else if (!copyPassed) blockers.push('copy-lock-failed');
  if (!responsiveMapRaw.trim()) blockers.push('responsive-plan-missing');
  else if (/\bTODO\b|Draft required before generation|Target shell must exist before layout repair/i.test(responsiveMapRaw)) blockers.push('responsive-plan-placeholder');
  if (semanticCheck?.error) blockers.push('semantic-check-error');
  if (preApprovalLockCheck?.error) blockers.push('pre-approval-lock-error');
  if (copyLockCheck?.error) blockers.push('copy-lock-error');

  const overflowX = fullWidth > viewportWidth + 24 || domFullWidth > viewportWidth + 24;
  if (overflowX) {
    addFinding('high', 'overflow-x', `Rendered width ${fullWidth || domFullWidth}px exceeds viewport ${viewportWidth}px.`);
    addStrategy('overflow-containment');
  }

  if (normalizedDeviceType === 'MOBILE' && Number(fixedBottomBar?.height || 0) >= 36 && Number(fixedBottomBar?.overlapCount || 0) > 0) {
    addFinding('high', 'mobile-bottom-nav-overlap', `Fixed bottom navigation overlaps ${fixedBottomBar.overlapCount} meaningful elements in the initial viewport.`);
    addStrategy('mobile-bottom-safe-area');
  }

  if (/design-flow-auto-layout-fix/.test(lowerHtml) && /position\s*:\s*static\s*!important/.test(lowerHtml)) {
    addFinding('medium', 'behavior-changing-auto-fix', 'Local auto-fix changed shell behavior; keep this as explicit debt until a cleaner source/remap exists.');
  }

  const bottomNavRisk = normalizedDeviceType === 'DESKTOP'
    && (/(bottom\s*:\s*0|bottom-0)/i.test(html) && /nav/i.test(html));
  if (bottomNavRisk) {
    addFinding('medium', 'desktop-bottom-nav-risk', 'Desktop render still appears to use a bottom-anchored nav pattern.');
    addStrategy('desktop-nav-remap');
  }

  const fixedWidthRisk = normalizedDeviceType === 'DESKTOP'
    && /(max-width\s*:\s*(3\d\d|4\d\d|5\d\d)px|min-width\s*:\s*(3\d\d|4\d\d|5\d\d)px)/i.test(html);
  if (fixedWidthRisk) {
    addFinding('medium', 'fixed-width-shell', 'Desktop layout contains a narrow fixed-width shell hint.');
    addStrategy('widen-main-shell');
  }

  if (normalizedDeviceType === 'DESKTOP' && widthRatio !== null && widthRatio < 0.72) {
    addFinding('medium', 'narrow-desktop-canvas', `Meaningful content width ratio is ${widthRatio}.`);
    addStrategy(lowerResponsiveMap.includes('rail') ? 'desktop-rail-layout' : 'widen-main-shell');
  }

  if (normalizedDeviceType === 'TABLET' && /grid|card|table/i.test(html) && widthRatio !== null && widthRatio > 0.96) {
    addFinding('medium', 'tablet-density-risk', `Tablet content width ratio is ${widthRatio}; grid density likely needs rebalancing.`);
    addStrategy('tablet-grid-rebalance');
  }

  if (normalizedDeviceType === 'DESKTOP' && lowerResponsiveMap.includes('adaptive remap')) {
    addStrategy('desktop-adaptive-remap');
  }

  if (!recommendedStrategies.length && normalizedDeviceType === 'DESKTOP' && widthRatio !== null && widthRatio < 0.84) {
    addStrategy('widen-main-shell');
  }
  if (!recommendedStrategies.length && overflowX) {
    addStrategy('overflow-containment');
  }

  return {
    safeToAutoFix: blockers.length === 0,
    deviceType: normalizedDeviceType,
    metrics: {
      viewportWidth,
      fullWidth,
      domFullWidth,
      meaningfulWidth,
      widthRatio,
      fixedBottomBar,
    },
    blockers,
    findings,
    recommendedStrategies,
  };
}

function injectAutoFixStyle(html, css) {
  const styleTag = `\n<style id="design-flow-auto-layout-fix">\n${css.trim()}\n</style>\n`;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${styleTag}</head>`);
  if (/<body[^>]*>/i.test(html)) return html.replace(/<body[^>]*>/i, (match) => `${match}${styleTag}`);
  return `${styleTag}${html}`;
}

export function applyAutomatedLayoutFix({ html = '', deviceType = 'DESKTOP', diagnostics = null, attempt = 1 } = {}) {
  const strategies = diagnostics?.recommendedStrategies || [];
  const normalizedDeviceType = normalizeDeviceType(deviceType);
  const cssChunks = [
    '* { box-sizing: border-box; }',
    'img, svg, canvas, video, table, pre { max-width: 100%; }',
  ];

  if (strategies.includes('overflow-containment')) {
    cssChunks.push('html, body { overflow-x: hidden; }');
  }

  if (normalizedDeviceType === 'TABLET' && strategies.includes('tablet-grid-rebalance')) {
    cssChunks.push(`@media (min-width: 768px) and (max-width: 1199px) {
  main, [role="main"], .main, .page, .page-shell, .content, .content-shell {
    width: min(960px, calc(100vw - 40px));
    margin-left: auto;
    margin-right: auto;
  }
  [class*="grid"], .grid {
    gap: 20px !important;
  }
}`);
  }

  if (normalizedDeviceType === 'MOBILE' && strategies.includes('mobile-bottom-safe-area')) {
    cssChunks.push(`@media (max-width: 767px) {
  nav.fixed.bottom-0,
  .bottom-nav,
  [class*="bottom-nav"],
  [class*="fixed"][class*="bottom-0"][class*="w-full"] {
    position: static !important;
    inset: auto !important;
    width: 100% !important;
    min-height: 56px !important;
    margin-top: 12px !important;
    padding-top: 6px !important;
    padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 8px) !important;
    border-top-left-radius: 12px !important;
    border-top-right-radius: 12px !important;
  }
  main, [role="main"], .main, .page, .page-shell, .content, .content-shell {
    padding-top: 16px !important;
    padding-bottom: 24px !important;
  }
  main > section {
    margin-bottom: 28px !important;
  }
  main > section:first-of-type {
    margin-bottom: 20px !important;
  }
  .space-y-8 {
    margin-bottom: 16px !important;
  }
  h1, [class*="text-5xl"], [class*="text-6xl"], [class*="text-7xl"] {
    line-height: 0.94 !important;
  }
  [class*="grid"][class*="grid-cols-2"], .grid.grid-cols-2 {
    gap: 14px !important;
  }
  [class*="aspect-[3/4"] {
    max-height: 180px !important;
  }
  [class*="aspect-[2/3"] {
    max-height: 140px !important;
  }
}`);
  }

  if (normalizedDeviceType === 'DESKTOP' && (strategies.includes('widen-main-shell') || strategies.includes('desktop-rail-layout') || strategies.includes('desktop-adaptive-remap'))) {
    cssChunks.push(`@media (min-width: 1200px) {
  main, [role="main"], .main, .page, .page-shell, .content, .content-shell, .layout-shell {
    width: min(${attempt >= 2 ? '1440px' : '1280px'}, calc(100vw - ${attempt >= 2 ? '40px' : '64px'}));
    margin-left: auto;
    margin-right: auto;
  }
  [class*="grid"], .grid {
    gap: ${attempt >= 2 ? '28px' : '24px'} !important;
  }
}`);
  }

  if (normalizedDeviceType === 'DESKTOP' && strategies.includes('desktop-nav-remap')) {
    cssChunks.push(`@media (min-width: 1200px) {
  nav[style*="bottom"], .bottom-nav, [class*="bottom-nav"] {
    position: static !important;
    inset: auto !important;
    width: auto !important;
    border-top: 0 !important;
  }
}`);
  }

  if (attempt >= 2 && normalizedDeviceType === 'DESKTOP') {
    cssChunks.push(`@media (min-width: 1200px) {
  body > div, body > main, .app, .app-shell, .shell, .shell-layout, .workspace, .workspace-shell {
    width: min(1440px, calc(100vw - 32px));
    margin-left: auto;
    margin-right: auto;
  }
  [class*="sidebar"], [class*="rail"] {
    flex-shrink: 0;
  }
}`);
  }

  if (!cssChunks.length) return html;
  return injectAutoFixStyle(html, cssChunks.join('\n\n'));
}

