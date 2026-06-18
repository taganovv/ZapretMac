'use strict';

const { exec } = require('child_process');

const YOUTUBE_ENDPOINTS = [
  'https://www.youtube.com/',
  'https://www.youtube.com/generate_204',
  'https://youtubei.googleapis.com/youtubei/v1/config'
];

function testUrl(url, timeoutSec = 20, socksPort = null) {
  return new Promise((resolve) => {
    const socks = socksPort ? `--socks5-hostname 127.0.0.1:${socksPort} ` : '';
    exec(
      `curl ${socks}-4 --http1.1 --connect-timeout ${timeoutSec} -s -o /dev/null -w "%{http_code}" -L -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" "${url}"`,
      { timeout: (timeoutSec + 15) * 1000 },
      (error, stdout) => {
        if (error) {
          resolve({ ok: false, code: 0, error: error.message });
          return;
        }
        const code = parseInt(stdout.trim(), 10);
        resolve({ ok: code > 0 && code < 500, code });
      }
    );
  });
}

async function testYouTube(timeoutSec = 20, socksPort = null) {
  const results = [];
  for (const url of YOUTUBE_ENDPOINTS) {
    const r = await testUrl(url, timeoutSec, socksPort);
    results.push({ url, ...r });
  }
  const okCount = results.filter((r) => r.ok).length;
  const ok = okCount >= 2;
  return { ok, okCount, results };
}

async function testYouTubeBoth(timeoutSec = 20, socksPort = null, preferSocks = false) {
  const runDirect = () => testYouTube(timeoutSec, null);
  const runSocks = () => (socksPort ? testYouTube(timeoutSec, socksPort) : null);

  if (preferSocks && socksPort) {
    const socks = await runSocks();
    if (socks?.ok) return { ok: true, mode: 'socks', ...socks };
    const direct = await runDirect();
    if (direct.ok) return { ok: true, mode: 'transparent', ...direct };
    return { ok: false, mode: null, direct, socks };
  }

  const direct = await runDirect();
  if (direct.ok) return { ok: true, mode: 'transparent', ...direct };

  if (socksPort) {
    const socks = await runSocks();
    if (socks?.ok) return { ok: true, mode: 'socks', ...socks };
    return { ok: false, mode: null, direct, socks };
  }

  return { ok: false, mode: null, ...direct };
}

async function testProxyConnection(_port, timeoutSec = 20, socksPort = null) {
  return testYouTubeBoth(timeoutSec, socksPort);
}

function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const net = require('net');
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.connect(port, host);
  });
}

function validateTpwsArgs(binaryPath, args) {
  const { execFileSync } = require('child_process');
  try {
    execFileSync(binaryPath, [...args, '--dry-run'], { stdio: 'pipe', timeout: 5000 });
    return { valid: true };
  } catch (e) {
    const msg = (e.stderr || e.stdout || '').toString().trim() || e.message;
    return { valid: false, reason: msg.slice(0, 200) };
  }
}

module.exports = {
  YOUTUBE_ENDPOINTS,
  testYouTube,
  testYouTubeBoth,
  testProxyConnection,
  isPortOpen,
  validateTpwsArgs
};
