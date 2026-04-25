#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function workspaceRoot() {
  return path.resolve(__dirname, '../../..');
}

export async function loadStitchSdk() {
  try {
    return await import('@google/stitch-sdk');
  } catch (nativeError) {
    const candidates = [];
    const configured = process.env.STITCH_SDK_NODE_MODULES;
    if (configured) {
      candidates.push(path.join(configured, '@google/stitch-sdk/dist/src/index.js'));
      candidates.push(path.join(configured, 'node_modules/@google/stitch-sdk/dist/src/index.js'));
      candidates.push(path.join(configured, 'dist/src/index.js'));
    }
    candidates.push(path.join(workspaceRoot(), 'tmp/stitch-sdk-exp/node_modules/@google/stitch-sdk/dist/src/index.js'));
    const attempted = [];
    for (const candidate of candidates) {
      attempted.push(candidate);
      try {
        return await import(pathToFileURL(candidate).href);
      } catch {
        // try next
      }
    }
    throw new Error([
      'Unable to load @google/stitch-sdk.',
      'Install it in the active runtime or set STITCH_SDK_NODE_MODULES to a node_modules directory containing @google/stitch-sdk.',
      'Example: npm install --prefix /tmp/design-skills-deps @google/stitch-sdk@0.1.0 && export STITCH_SDK_NODE_MODULES=/tmp/design-skills-deps/node_modules',
      `Native import error: ${nativeError?.message || nativeError}`,
      attempted.length ? `Attempted fallback paths: ${attempted.join(', ')}` : null,
    ].filter(Boolean).join(' '));
  }
}

export function availableApiKeys() {
  return [process.env.STITCH_API_KEY, process.env.STITCH_API_KEY_1].filter(Boolean);
}

export async function createSdk(apiKey) {
  const sdk = await loadStitchSdk();
  if (!sdk.Stitch || !sdk.StitchToolClient) {
    throw new Error('Loaded Stitch SDK is missing Stitch or StitchToolClient exports.');
  }
  const client = new sdk.StitchToolClient({ apiKey, timeout: 300_000 });
  const instance = new sdk.Stitch(client);
  return { sdk, client, stitch: instance };
}

export function isRateLimitLikeError(error) {
  const message = (error?.message || String(error || '')).toLowerCase();
  return [
    '429',
    'rate limit',
    'rate-limit',
    'too many requests',
    'quota',
    'resource_exhausted',
    'exhausted',
    'capacity',
  ].some(token => message.includes(token));
}

export async function withKeyFallback(runFn) {
  const keys = availableApiKeys();
  if (!keys.length) {
    throw new Error('No Stitch API key found in environment. Expected STITCH_API_KEY or STITCH_API_KEY_1.');
  }
  const errors = [];
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    let ctx;
    try {
      ctx = await createSdk(key);
      const result = await runFn(ctx.stitch, ctx.sdk);
      await ctx.client.close().catch(() => {});
      return result;
    } catch (error) {
      if (ctx?.client) await ctx.client.close().catch(() => {});
      const message = error.message || String(error);
      errors.push(message);
      const hasAnotherKey = i < keys.length - 1;
      if (!hasAnotherKey) break;
      if (!isRateLimitLikeError(error)) {
        throw error;
      }
    }
  }
  throw new Error(errors.join(' | '));
}

export function normalizeStitchModelId(modelId = null, fallback = 'GEMINI_3_PRO') {
  const value = String(modelId || fallback).trim().toUpperCase();
  if (value === 'GEMINI_3_1_PRO') return 'GEMINI_3_PRO';
  if (value === 'GEMINI_3_PRO') return 'GEMINI_3_PRO';
  if (value === 'GEMINI_3_FLASH') return 'GEMINI_3_FLASH';
  return fallback;
}

export async function createOrOpenStitchProject(stitch, { title, projectId } = {}) {
  const asProject = (candidate) => {
    if (!candidate) return null;
    if (typeof candidate === 'object' && typeof candidate.generate === 'function' && typeof candidate.getScreen === 'function') {
      return candidate;
    }
    const resolvedProjectId = candidate?.projectId || candidate?.id || candidate;
    if (resolvedProjectId && typeof stitch?.project === 'function') {
      return stitch.project(resolvedProjectId);
    }
    return null;
  };
  if (projectId) return stitch.project(projectId);
  if (typeof stitch?.createProject === 'function') {
    const created = await stitch.createProject(title);
    const wrapped = asProject(created);
    if (wrapped) return wrapped;
  }
  if (typeof stitch?.callTool === 'function') {
    const created = await stitch.callTool('create_project', { title });
    const wrapped = asProject(created)
      || asProject(created?.project)
      || asProject(created?.projectId)
      || asProject(created?.id)
      || asProject(created?.project?.projectId)
      || asProject(created?.project?.id);
    if (wrapped) return wrapped;
  }
  throw new Error('Unable to create a Stitch project with the current SDK surface.');
}

