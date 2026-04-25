#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

export function workspaceRoot() {
  return path.resolve(__dirname, '../../..');
}


export function slugifyPageToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function pathExists(targetPath) {
  if (!targetPath) return false;
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(dir) {
  if (!dir) return;
  await fs.mkdir(dir, { recursive: true });
}

function contentTypeForFile(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  if (ext === '.html' || ext === '.htm') return 'text/html; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js' || ext === '.mjs') return 'text/javascript; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.woff') return 'font/woff';
  if (ext === '.woff2') return 'font/woff2';
  return 'application/octet-stream';
}

export async function fetchToFile(url, outPath) {
  const parsed = new URL(url);
  if (parsed.protocol === 'file:') {
    await fs.copyFile(fileURLToPath(parsed), outPath);
    return contentTypeForFile(outPath);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  const ab = await res.arrayBuffer();
  await ensureDir(path.dirname(outPath));
  await fs.writeFile(outPath, Buffer.from(ab));
  return res.headers.get('content-type') || '';
}

export async function readJsonIfExists(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

export async function writeJson(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2) + '\n');
}

export async function patchJson(filePath, patch) {
  const current = await readJsonIfExists(filePath, {});
  await writeJson(filePath, { ...(current || {}), ...patch });
}
