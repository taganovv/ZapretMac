'use strict';

const { execSync } = require('child_process');

function getPidsOnPort(port) {
  try {
    const out = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null`, { encoding: 'utf8', stdio: 'pipe' }).trim();
    if (!out) return [];
    return out.split('\n').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
  } catch {
    return [];
  }
}

function getTpwsPids() {
  try {
    const out = execSync('pgrep -f "[t]pws" 2>/dev/null', { encoding: 'utf8', stdio: 'pipe' }).trim();
    if (!out) return [];
    return out.split('\n').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
  } catch {
    return [];
  }
}

function killPids(pids) {
  let killed = 0;
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL');
      killed++;
    } catch {}
  }
  return killed;
}

function freePort(port, childProcess = null) {
  if (childProcess) {
    try { childProcess.kill('SIGKILL'); } catch {}
  }

  const pids = new Set([...getPidsOnPort(port), ...getTpwsPids()]);
  const killed = killPids([...pids]);

  const remaining = getPidsOnPort(port);
  if (remaining.length > 0) {
    killPids(remaining);
  }

  return killed;
}

function isPortListening(port) {
  return getPidsOnPort(port).length > 0;
}

function waitForPortFree(port, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isPortListening(port)) return true;
    execSync('sleep 0.1', { stdio: 'pipe' });
  }
  return !isPortListening(port);
}

module.exports = { freePort, waitForPortFree, isPortListening, getPidsOnPort };
