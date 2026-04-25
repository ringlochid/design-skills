#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { ensureDir } from './file_utils.mjs';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

function contentTypeForFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
  }[ext] || 'application/octet-stream';
}

async function startStaticServer(rootDir, defaultFile) {
  const resolvedRoot = path.resolve(rootDir);
  const realRoot = await fs.realpath(resolvedRoot);
  const server = createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      let requestPath = decodeURIComponent(url.pathname || '/');
      if (requestPath === '/') requestPath = `/${defaultFile}`;
      const candidate = path.resolve(resolvedRoot, `.${requestPath}`);
      if (candidate !== resolvedRoot && !candidate.startsWith(`${resolvedRoot}${path.sep}`)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }
      const stat = await fs.lstat(candidate);
      if (stat.isSymbolicLink()) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Symlinks forbidden');
        return;
      }
      const realCandidate = await fs.realpath(candidate);
      if (realCandidate !== realRoot && !realCandidate.startsWith(`${realRoot}${path.sep}`)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }
      const content = await fs.readFile(realCandidate);
      res.writeHead(200, { 'Content-Type': contentTypeForFile(candidate) });
      res.end(content);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(error.message || String(error));
    }
  });

  await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
    close: async () => {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}

async function commandWorks(command, args = ['--version']) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve(false);
    }, 5000);
    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

async function findChromiumBinary() {
  const candidates = [
    process.env.CHROMIUM_BIN,
    '/snap/bin/chromium',
    'chromium',
    'chromium-browser',
    '/usr/bin/chromium-browser',
    'google-chrome',
    'google-chrome-stable',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await commandWorks(candidate)) return candidate;
  }
  throw new Error('Unable to find a Chromium binary for rendered preview capture. Set CHROMIUM_BIN if needed.');
}

async function waitForJsonVersion(debugPort, timeoutMs = 15000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (res.ok) return await res.json();
      lastError = new Error(`Debugger endpoint returned ${res.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(200);
  }
  throw lastError || new Error('Timed out waiting for Chromium remote debugging endpoint.');
}

class CdpConnection {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.eventWaiters = [];
    this.eventListeners = [];
  }

  static async connect(wsUrl) {
    const connection = new CdpConnection(wsUrl);
    await connection.open();
    return connection;
  }

  async open() {
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', (event) => reject(event.error || new Error('WebSocket open failed')));
      ws.addEventListener('message', (event) => this.onMessage(event));
      ws.addEventListener('close', () => {
        for (const { reject } of this.pending.values()) {
          reject(new Error('CDP WebSocket closed'));
        }
        this.pending.clear();
      });
    });
  }

  onMessage(event) {
    const message = JSON.parse(event.data);
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else pending.resolve(message.result || {});
      return;
    }
    for (const listener of this.eventListeners) {
      if (listener.method !== message.method) continue;
      if (listener.sessionId && listener.sessionId !== message.sessionId) continue;
      listener.handler(message);
    }
    for (let i = 0; i < this.eventWaiters.length; i += 1) {
      const waiter = this.eventWaiters[i];
      if (waiter.method !== message.method) continue;
      if (waiter.sessionId && waiter.sessionId !== message.sessionId) continue;
      this.eventWaiters.splice(i, 1);
      waiter.resolve(message);
      return;
    }
  }

  onEvent(method, sessionId, handler) {
    const listener = { method, sessionId, handler };
    this.eventListeners.push(listener);
    return () => {
      const index = this.eventListeners.indexOf(listener);
      if (index >= 0) this.eventListeners.splice(index, 1);
    };
  }

  async send(method, params = {}, sessionId) {
    const id = this.nextId += 1;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.ws.send(JSON.stringify(payload));
    return await promise;
  }

  async waitForEvent(method, sessionId, timeoutMs = 30000) {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.eventWaiters.findIndex((waiter) => waiter.resolve === resolve);
        if (index >= 0) this.eventWaiters.splice(index, 1);
        reject(new Error(`Timed out waiting for event ${method}`));
      }, timeoutMs);
      this.eventWaiters.push({
        method,
        sessionId,
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
        reject,
      });
    });
  }

  async close() {
    if (!this.ws) return;
    this.ws.close();
    this.ws = null;
  }
}

function pngDimensionsFromBuffer(buffer) {
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') {
    throw new Error('Rendered preview is not a PNG.');
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

export async function renderHtmlPreview({ htmlPath, outPath, fullOutPath, viewport, networkAccess = 'full' }) {
  const resolvedHtmlPath = path.resolve(htmlPath);
  const rootDir = path.dirname(resolvedHtmlPath);
  const defaultFile = path.basename(resolvedHtmlPath);
  const staticServer = await startStaticServer(rootDir, defaultFile);
  await ensureDir(path.dirname(outPath));
  if (fullOutPath) await ensureDir(path.dirname(fullOutPath));
  const homedirTmp = path.join(os.homedir(), 'tmp');
  await ensureDir(homedirTmp);
  const userDataDir = await fs.mkdtemp(path.join(homedirTmp, 'openclaw-stitch-render-'));
  const chromium = await findChromiumBinary();
  const debugPort = await getFreePort();
  const allowExternalNetwork = networkAccess === 'full' || networkAccess === 'external';
  const browserArgs = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-dev-shm-usage',
    '--disable-sync',
    '--disable-default-apps',
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ];
  if (!allowExternalNetwork) {
    browserArgs.splice(7, 0, '--disable-background-networking', '--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE 127.0.0.1, EXCLUDE localhost');
  }
  const browser = spawn(chromium, browserArgs, {
    stdio: 'ignore',
  });

  let cdp;
  let targetId;
  try {
    const version = await waitForJsonVersion(debugPort, 20000);
    cdp = await CdpConnection.connect(version.webSocketDebuggerUrl);
    const created = await cdp.send('Target.createTarget', { url: 'about:blank', newWindow: false });
    targetId = created.targetId;
    const attached = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const sessionId = attached.sessionId;

    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    let removeFetchListener = null;
    if (!allowExternalNetwork) {
      await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }, sessionId);
      const allowedOrigin = staticServer.baseUrl;
      removeFetchListener = cdp.onEvent('Fetch.requestPaused', sessionId, (message) => {
        const params = message.params || {};
        const requestId = params.requestId;
        const url = params.request?.url || '';
        const allowed = url.startsWith(allowedOrigin) || url.startsWith('data:') || url.startsWith('blob:') || url === 'about:blank';
        cdp.send(allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest', allowed ? { requestId } : { requestId, errorReason: 'BlockedByClient' }, sessionId).catch(() => {});
      });
    }
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.deviceScaleFactor,
      mobile: false,
      screenWidth: viewport.width,
      screenHeight: viewport.height,
      positionX: 0,
      positionY: 0,
      dontSetVisibleSize: false,
    }, sessionId);

    const targetUrl = `${staticServer.baseUrl}/${encodeURIComponent(defaultFile)}`;
    await cdp.send('Page.navigate', { url: targetUrl }, sessionId);
    await cdp.waitForEvent('Page.loadEventFired', sessionId, 30000);
    await cdp.send('Runtime.evaluate', {
      expression: `(async () => {
        try {
          if (document.fonts?.ready) await document.fonts.ready;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, ${viewport.delayMs}));
        return true;
      })()`,
      awaitPromise: true,
      returnByValue: true,
    }, sessionId);

    const layout = await cdp.send('Page.getLayoutMetrics', {}, sessionId);
    const evaluated = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const de = document.documentElement;
        const body = document.body;
        const attrs = ['aria-label', 'placeholder', 'alt', 'value', 'title'];
        const meaningfulTags = new Set(['IMG', 'SVG', 'CANVAS', 'VIDEO', 'PICTURE', 'INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'A']);
        const meaningfulElements = Array.from(body?.querySelectorAll('*') || []).filter((el) => {
          const tag = (el.tagName || '').toUpperCase();
          if (!tag || ['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'HEAD'].includes(tag)) return false;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) === 0) return false;
          const rect = el.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) return false;
          const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
          const directText = Array.from(el.childNodes || []).some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent || '').replace(/\s+/g, ' ').trim().length > 0);
          const hasText = directText || (el.children.length === 0 && text.length > 0);
          const hasAttrText = attrs.some((attr) => {
            const value = el.getAttribute?.(attr);
            return !!(value && value.trim());
          });
          const hasBackgroundImage = style.backgroundImage && style.backgroundImage !== 'none';
          return hasText || hasAttrText || meaningfulTags.has(tag) || hasBackgroundImage;
        });

        let contentBottom = 0;
        let contentRight = 0;
        for (const el of meaningfulElements) {
          const rect = el.getBoundingClientRect();
          contentBottom = Math.max(contentBottom, rect.bottom + window.scrollY);
          contentRight = Math.max(contentRight, rect.right + window.scrollX);
        }

        const fixedBottomCandidates = Array.from(body?.querySelectorAll('*') || []).filter((el) => {
          const tag = (el.tagName || '').toUpperCase();
          if (!tag || ['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'HEAD'].includes(tag)) return false;
          const style = window.getComputedStyle(el);
          if (!['fixed', 'sticky'].includes(String(style.position || '').toLowerCase())) return false;
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) === 0) return false;
          const rect = el.getBoundingClientRect();
          if (rect.width < window.innerWidth * 0.55 || rect.height < 36) return false;
          if (rect.top < window.innerHeight * 0.55) return false;
          if (rect.bottom < window.innerHeight - 4) return false;
          return true;
        });

        let fixedBottomBar = null;
        if (fixedBottomCandidates.length) {
          const bar = fixedBottomCandidates
            .map((el) => ({ el, rect: el.getBoundingClientRect() }))
            .sort((a, b) => (b.rect.height * b.rect.width) - (a.rect.height * a.rect.width))[0];

          const overlapping = meaningfulElements
            .filter((el) => el !== bar.el && !bar.el.contains(el) && !el.contains(bar.el))
            .map((el) => {
              const rect = el.getBoundingClientRect();
              const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
              const directText = Array.from(el.childNodes || []).some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent || '').replace(/\s+/g, ' ').trim().length > 0);
              return { el, rect, text, directText };
            })
            .filter(({ el, rect, text, directText }) => {
              const tag = (el.tagName || '').toUpperCase();
              const style = window.getComputedStyle(el);
              if (style.position === 'fixed' || style.position === 'sticky') return false;
              if (rect.width < 12 || rect.height < 12) return false;
              if (rect.bottom <= 0 || rect.top >= window.innerHeight) return false;
              if (rect.bottom <= bar.rect.top + 2) return false;
              if (rect.top >= bar.rect.bottom - 2) return false;
              const hasUsefulContent = directText || meaningfulTags.has(tag) || (text && text.length > 0) || (style.backgroundImage && style.backgroundImage !== 'none');
              return hasUsefulContent;
            });

          fixedBottomBar = {
            top: Math.round(bar.rect.top),
            bottom: Math.round(bar.rect.bottom),
            height: Math.round(bar.rect.height),
            width: Math.round(bar.rect.width),
            overlapCount: overlapping.length,
            overlapSamples: overlapping.slice(0, 6).map(({ el, text, rect }) => ({
              tag: (el.tagName || '').toUpperCase(),
              text: String(text || '').slice(0, 80),
              top: Math.round(rect.top),
              bottom: Math.round(rect.bottom),
            })),
          };
        }

        return {
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
            dpr: window.devicePixelRatio,
          },
          fullWidth: Math.max(de.scrollWidth, body?.scrollWidth || 0, de.clientWidth, body?.clientWidth || 0),
          fullHeight: Math.max(de.scrollHeight, body?.scrollHeight || 0, de.clientHeight, body?.clientHeight || 0),
          meaningfulWidth: Math.max(contentRight, 0),
          meaningfulHeight: Math.max(contentBottom, 0),
          meaningfulElementCount: meaningfulElements.length,
          fixedBottomBar,
        };
      })()`,
      returnByValue: true,
    }, sessionId);

    const measured = evaluated.result?.value || {};
    const layoutWidth = Math.ceil(layout.contentSize?.width || 0);
    const layoutHeight = Math.ceil(layout.contentSize?.height || 0);
    const domFullWidth = Math.ceil(measured.fullWidth || 0);
    const domFullHeight = Math.ceil(measured.fullHeight || 0);
    const meaningfulWidth = Math.ceil(measured.meaningfulWidth || 0);
    const meaningfulHeight = Math.ceil(measured.meaningfulHeight || 0);

    const fullWidth = Math.ceil(Math.max(layoutWidth, domFullWidth, meaningfulWidth, viewport.width));
    const rawFullHeight = Math.ceil(Math.max(layoutHeight, domFullHeight, viewport.height));
    const croppedHeight = meaningfulHeight ? Math.min(Math.max(meaningfulHeight + 32, 240), rawFullHeight) : rawFullHeight;
    const fullHeight = Math.max(1, croppedHeight);
    const viewportShot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
      clip: {
        x: 0,
        y: 0,
        width: viewport.width,
        height: viewport.height,
        scale: 1,
      },
    }, sessionId);

    const viewportBuffer = Buffer.from(viewportShot.data, 'base64');
    await fs.writeFile(outPath, viewportBuffer);
    const viewportImageSize = pngDimensionsFromBuffer(viewportBuffer);

    const screenshot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
      clip: {
        x: 0,
        y: 0,
        width: fullWidth,
        height: fullHeight,
        scale: 1,
      },
    }, sessionId);

    const buffer = Buffer.from(screenshot.data, 'base64');
    const fullPagePath = fullOutPath || outPath;
    await fs.writeFile(fullPagePath, buffer);
    const fullPageImageSize = pngDimensionsFromBuffer(buffer);

    await cdp.send('Target.closeTarget', { targetId });
    return {
      previewPath: outPath,
      fullPagePath,
      viewport: {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.deviceScaleFactor,
        delayMs: viewport.delayMs,
      },
      renderedCssSize: {
        width: viewport.width,
        height: viewport.height,
      },
      fullPageRenderedCssSize: {
        width: fullWidth,
        height: fullHeight,
      },
      viewportCapture: {
        previewPath: outPath,
        renderedCssSize: {
          width: viewport.width,
          height: viewport.height,
        },
        imageSize: viewportImageSize,
      },
      fullPageCapture: {
        previewPath: fullPagePath,
        renderedCssSize: {
          width: fullWidth,
          height: fullHeight,
        },
        imageSize: fullPageImageSize,
      },
      contentMetrics: {
        layoutWidth,
        domFullWidth,
        meaningfulWidth,
        layoutHeight,
        domFullHeight,
        meaningfulHeight,
        meaningfulElementCount: Number(measured.meaningfulElementCount || 0),
        fixedBottomBar: measured.fixedBottomBar || null,
      },
      imageSize: viewportImageSize,
      fullPageImageSize,
    };
  } finally {
    if (cdp) await cdp.close().catch(() => {});
    if (browser.pid && !browser.killed) browser.kill('SIGTERM');
    await staticServer.close().catch(() => {});
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

