'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { app } = require('electron');

const PAC_HOSTS = [
  'youtube.com', 'youtu.be', 'googlevideo.com', 'ytimg.com', 'ggpht.com',
  'googleapis.com', 'gstatic.com', 'google.com', 'youtube-nocookie.com',
  'youtubei.googleapis.com', 'yt3.ggpht.com', 'yt4.ggpht.com'
];

function pacPath() {
  return path.join(app.getPath('userData'), 'youtube-proxy.pac');
}

function buildPac(port) {
  const cond = PAC_HOSTS.map((h) => `dnsDomainIs(host, ".${h}") || host === "${h}"`).join(' ||\n    ');
  return `function FindProxyForURL(url, host) {
  if (${cond}) {
    return "SOCKS5 127.0.0.1:${port}";
  }
  return "DIRECT";
}
`;
}

function listNetworkServices() {
  try {
    const out = execSync('networksetup -listallnetworkservices', { encoding: 'utf8' });
    return out.split('\n').filter((l) => l && !l.startsWith('An asterisk') && !l.startsWith('*'));
  } catch {
    return [];
  }
}

function enablePacProxy(port, log) {
  const file = pacPath();
  fs.writeFileSync(file, buildPac(port), 'utf8');
  const url = `file://${file}`;
  let n = 0;
  for (const s of listNetworkServices()) {
    try {
      execSync(`networksetup -setautoproxyurl "${s}" "${url}"`, { stdio: 'pipe' });
      execSync(`networksetup -setautoproxystate "${s}" on`, { stdio: 'pipe' });
      n++;
    } catch {}
  }
  if (n) log('info', `PAC: YouTube → SOCKS :${port} (${n} сетей), остальное напрямую`);
}

function disablePacProxy() {
  for (const s of listNetworkServices()) {
    try {
      execSync(`networksetup -setautoproxystate "${s}" off`, { stdio: 'pipe' });
    } catch {}
  }
}

module.exports = { enablePacProxy, disablePacProxy };
