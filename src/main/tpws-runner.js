'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function startTpwsDaemon(sudoExec, binaryPath, args, pidfile, label) {
  const allArgs = [...args, '--daemon', `--pidfile=${pidfile}`];
  const cmd = `${shellQuote(binaryPath)} ${allArgs.map(shellQuote).join(' ')}`;
  const script = `#!/bin/bash
set -e
rm -f ${shellQuote(pidfile)}
${cmd}
sleep 0.5
test -f ${shellQuote(pidfile)} && kill -0 $(cat ${shellQuote(pidfile)}) 2>/dev/null
`;

  return new Promise((resolve) => {
    sudoExec(script, label, (err) => {
      if (err) {
        resolve({ ok: false, error: err.message || String(err) });
        return;
      }
      try {
        const pid = parseInt(fs.readFileSync(pidfile, 'utf8').trim(), 10);
        resolve({ ok: !isNaN(pid), pid });
      } catch (e) {
        resolve({ ok: false, error: e.message });
      }
    });
  });
}

function stopTpwsDaemon(sudoExec, pidfile, label) {
  const script = `#!/bin/bash
if [ -f ${shellQuote(pidfile)} ]; then
  kill $(cat ${shellQuote(pidfile)}) 2>/dev/null || true
  rm -f ${shellQuote(pidfile)}
fi
exit 0`;
  return new Promise((resolve) => {
    sudoExec(script, label, () => resolve());
  });
}

function killByPort(port) {
  try {
    const pids = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null`, { encoding: 'utf8' }).trim();
    if (pids) {
      for (const pid of pids.split('\n')) {
        try { process.kill(parseInt(pid, 10), 'SIGKILL'); } catch {}
      }
    }
  } catch {}
  try { execSync('pkill -9 -f "[t]pws" 2>/dev/null; exit 0', { stdio: 'pipe', shell: '/bin/sh' }); } catch {}
}

module.exports = { startTpwsDaemon, stopTpwsDaemon, killByPort };
