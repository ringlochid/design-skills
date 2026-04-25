#!/usr/bin/env node

export function normalizeDeviceType(deviceType = 'DESKTOP') {
  return String(deviceType || 'DESKTOP').trim().toUpperCase();
}

export function breakpointForDeviceType(deviceType = 'DESKTOP') {
  const normalized = normalizeDeviceType(deviceType);
  if (normalized === 'MOBILE') return 'mobile';
  if (normalized === 'TABLET') return 'tablet';
  if (normalized === 'DESKTOP') return 'desktop';
  return 'agnostic';
}

export function defaultViewportForDeviceType(deviceType = 'DESKTOP') {
  const normalized = String(deviceType || 'DESKTOP').toUpperCase();
  if (normalized === 'MOBILE') {
    return { width: 390, height: 844, deviceScaleFactor: 2, delayMs: 1500 };
  }
  if (normalized === 'TABLET') {
    return { width: 1024, height: 1366, deviceScaleFactor: 2, delayMs: 1500 };
  }
  return { width: 1440, height: 900, deviceScaleFactor: 2, delayMs: 1500 };
}

export function viewportOptionsFromArgs(args = {}, deviceType = 'DESKTOP') {
  const defaults = defaultViewportForDeviceType(deviceType);
  return {
    width: args['viewport-width'] ? Number(args['viewport-width']) : defaults.width,
    height: args['viewport-height'] ? Number(args['viewport-height']) : defaults.height,
    deviceScaleFactor: args['device-scale-factor'] ? Number(args['device-scale-factor']) : defaults.deviceScaleFactor,
    delayMs: args['render-delay-ms'] ? Number(args['render-delay-ms']) : defaults.delayMs,
  };
}

