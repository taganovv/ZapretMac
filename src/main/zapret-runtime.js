'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { app } = require('electron');

const INSTALL_DIR = '/opt/zapret';
const SOCKS_PORT = 11080;
const TPWS_PORT = 988;

const PRESETS = [
  { name: 'default', label: 'Default — split SNI + disorder', description: 'Стандарт glalker.' },
  { name: 'tlsrec', label: 'TLS record split (sniext)', description: 'Для YouTube TLS.' },
  { name: 'combo', label: 'TLS split + disorder', description: 'Комбинированный профиль.' },
  { name: 'split2', label: 'Split pos 2', description: 'Альтернативная позиция split.' },
  { name: 'oob', label: 'OOB + split', description: 'Против жёсткого DPI.' },
  { name: 'hostcase', label: 'Hostcase + split', description: 'Маскировка Host.' },
  { name: 'split-only', label: 'Только split', description: 'Минимальный split SNI.' },
  { name: 'midsld', label: 'Split midsld', description: 'Split по midsld.' },
  { name: 'all443', label: 'Весь HTTPS (без hostlist)', description: 'Последний резерв.' },
  { name: 'auto', label: 'Авто — перебор стратегий', description: 'По одной с прогрессом в журнале.' },
];

let passwordlessSudo = null;

function getBundledRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'zapret-runtime');
  }
  return path.join(__dirname, '..', '..', 'resources', 'zapret-runtime');
}

function isInstalled() {
  return fs.existsSync(path.join(INSTALL_DIR, 'init.d/macos/zapret')) &&
    fs.existsSync(path.join(INSTALL_DIR, 'binaries/mac64/tpws'));
}

function isRunning() {
  try {
    execSync('pgrep -x tpws', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function checkPasswordlessSudo() {
  if (passwordlessSudo !== null) return passwordlessSudo;
  try {
    execSync(`sudo -n ${INSTALL_DIR}/mac/status.sh`, { stdio: 'pipe', timeout: 8000 });
    passwordlessSudo = true;
  } catch {
    passwordlessSudo = false;
  }
  return passwordlessSudo;
}

function runSudoScript(script, name, sudoPrompt, timeoutMs = 60000) {
  const scriptPath = path.join(app.getPath('temp'), `zapret-${Date.now()}.sh`);
  fs.writeFileSync(scriptPath, script);
  fs.chmodSync(scriptPath, 0o755);
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve({ ok: false, stdout: '', stderr: 'timeout', timedOut: true });
      }
    }, timeoutMs);
    sudoPrompt.exec(`"${scriptPath}"`, { name }, (err, stdout, stderr) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { fs.unlinkSync(scriptPath); } catch {}
      resolve({
        ok: !err,
        stdout: (stdout || '').toString(),
        stderr: (stderr || '').toString()
      });
    });
  });
}

async function runRootScript(scriptPath, args, sudoPrompt, promptName, timeoutMs = 60000) {
  const argList = (args || []).map((a) => `"${String(a).replace(/"/g, '\\"')}"`).join(' ');
  const cmd = argList ? `"${scriptPath}" ${argList}` : `"${scriptPath}"`;

  if (checkPasswordlessSudo()) {
    try {
      const stdout = execSync(`sudo -n ${cmd}`, {
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: 12 * 1024 * 1024
      });
      return { ok: true, stdout, stderr: '' };
    } catch (e) {
      const msg = ((e.stderr || '') + (e.message || '')).toString();
      if (!/password is required|a password is required|1 incorrect password attempt/i.test(msg)) {
        return { ok: false, stdout: (e.stdout || '').toString(), stderr: msg };
      }
      passwordlessSudo = false;
    }
  }
  return runSudoScript(`#!/bin/bash\nexec ${cmd}\n`, promptName, sudoPrompt, timeoutMs);
}

async function prepareSession(sudoPrompt, log) {
  const bundledMac = path.join(getBundledRoot(), 'mac');
  const body = `
INSTALL="${INSTALL_DIR}"
BUNDLED="${bundledMac}"
mkdir -p "$INSTALL/mac"
for f in "$BUNDLED"/*.sh; do
  [ -f "$f" ] || continue
  cp "$f" "$INSTALL/mac/"
  chmod +x "$INSTALL/mac/$(basename "$f")"
done
"$INSTALL/mac/post-install.sh"
"$INSTALL/mac/sync-hosts.sh" "$BUNDLED/zapret-hosts.txt"
echo "===FW==="
"$INSTALL/init.d/macos/zapret" start 2>&1 || true
sleep 1
. "$INSTALL/mac/pf-check.sh"
if pf_zapret_rules_ok; then
  echo "PF-якоря    : ✅ правила zapret активны"
else
  echo "PF-якоря    : ⚪ правила не применились"
  [ -f /etc/pf.anchors/zapret-v4 ] && echo "--- anchor-v4 ---" && head -5 /etc/pf.anchors/zapret-v4 2>/dev/null || true
fi
echo "===STATUS==="
"$INSTALL/mac/status.sh"
`;

  const r = await runSudoScript(
    `#!/bin/bash\nset -e\n${body}\n`,
    'ZapretMac',
    sudoPrompt,
    90000
  );

  passwordlessSudo = null;
  checkPasswordlessSudo();
  if (passwordlessSudo) {
    log('info', 'Пароль сохранён: дальше без запросов');
  }

  const out = (r.stdout || '').trim();
  const fwPart = out.split('===FW===')[1]?.split('===STATUS===')[0]?.trim() || '';
  const statusPart = out.split('===STATUS===')[1]?.trim() || '';

  for (const line of fwPart.split('\n').filter(Boolean).slice(0, 8)) {
    log('info', line.trim());
  }
  for (const line of statusPart.split('\n').filter(Boolean).slice(0, 10)) {
    log('info', line.trim());
  }

  const combined = `${fwPart}\n${statusPart}`;
  const pfAnchors = parseDiagnostics(combined).pfAnchors;
  return { ok: r.ok, status: statusPart, fw: fwPart, pfAnchors };
}

async function install(sudoPrompt, log) {
  const installSh = path.join(getBundledRoot(), 'mac', 'install.sh');
  if (!fs.existsSync(installSh)) {
    return { ok: false, error: 'zapret-runtime не найден' };
  }

  log('info', 'Установка zapret в /opt/zapret...');
  const guiUser = process.env.USER || process.env.LOGNAME || '';
  const result = await runSudoScript(
    `#!/bin/bash\nexport SUDO_USER="${guiUser}"\nexec "${installSh}"\n`,
    'ZapretMac Install',
    sudoPrompt,
    120000
  );

  if (!result.ok || !isInstalled()) {
    const tail = (result.stderr || result.stdout || '').trim().split('\n').slice(-3).join(' ');
    log('error', `Установка: ${tail}`);
    return { ok: false, error: tail };
  }

  passwordlessSudo = null;
  await prepareSession(sudoPrompt, log);
  log('success', 'zapret установлен');
  return { ok: true };
}

async function ensureInstalled(sudoPrompt, log) {
  if (!isInstalled()) {
    return install(sudoPrompt, log);
  }
  return prepareSession(sudoPrompt, log);
}

async function setStrategy(name, sudoPrompt) {
  const sh = path.join(INSTALL_DIR, 'mac', 'strategy.sh');
  return runRootScript(sh, ['set', name], sudoPrompt, 'ZapretMac Strategy', 45000);
}

async function runSelftest(sudoPrompt, log) {
  const sh = path.join(INSTALL_DIR, 'mac', 'selftest.sh');
  log('info', 'Автоподбор стратегии (selftest)...');
  const r = await runRootScript(sh, [], sudoPrompt, 'ZapretMac Selftest', 120000);
  const out = (r.stdout || '') + (r.stderr || '');
  for (const line of out.split('\n').filter(Boolean)) {
    if (/^\[/.test(line)) log('info', line.trim());
  }
  const m = out.match(/BEST=(\S+)\s+OK=(\d+)/);
  if (m && parseInt(m[2], 10) > 0) {
    return { ok: true, strategy: m[1], score: parseInt(m[2], 10) };
  }
  return { ok: false };
}

async function start(sudoPrompt, log) {
  const startSh = path.join(INSTALL_DIR, 'mac', 'start.sh');
  const r = await runRootScript(startSh, [], sudoPrompt, 'ZapretMac Start', 45000);
  await new Promise((res) => setTimeout(res, 2000));
  if (isRunning()) {
    log('success', `tpws PID: ${execSync('pgrep -x tpws', { encoding: 'utf8' }).trim()}`);
    return { ok: true, stdout: r.stdout };
  }
  log('error', `tpws не запустился: ${(r.stderr || r.stdout || '').trim().slice(-200)}`);
  return { ok: false };
}

async function stop(sudoPrompt, log) {
  const stopSh = path.join(INSTALL_DIR, 'mac', 'stop.sh');
  if (!fs.existsSync(stopSh)) return { ok: true };
  const r = await runRootScript(stopSh, [], sudoPrompt, 'ZapretMac Stop', 45000);
  await new Promise((res) => setTimeout(res, 1500));
  return { ok: !isRunning(), stdout: r.stdout, stderr: r.stderr };
}

function detectVpn() {
  try {
    if (execSync('scutil --nc list 2>/dev/null', { encoding: 'utf8' }).includes('(Connected)')) {
      return { active: true, reason: 'VPN-профиль' };
    }
    const route = execSync('route -n get default 2>/dev/null', { encoding: 'utf8' });
    const m = route.match(/interface:\s*(\S+)/);
    if (m && /^(utun|ipsec|ppp|tun|tap|wg)/.test(m[1])) {
      return { active: true, reason: m[1] };
    }
  } catch {}
  return { active: false };
}

function parseDiagnostics(diag) {
  const pfAnchors = /PF-якоря\s*:\s*✅/.test(diag);
  const tpwsRunning = /Процесс tpws:\s*🟢/.test(diag);
  return { pfAnchors, tpwsRunning };
}

async function waitForReady(sudoPrompt, log, pfAnchors = false, maxWaitMs = 12000) {
  const { isPortOpen } = require('./connectivity');
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const tpwsUp = isRunning();
    const transparentUp = pfAnchors ? await isPortOpen(TPWS_PORT) : true;
    const socksUp = await isPortOpen(SOCKS_PORT);
    if (tpwsUp && transparentUp && socksUp) {
      return { ok: true, tpws: true, transparent: transparentUp, socks: socksUp };
    }
    if (tpwsUp && transparentUp) {
      return { ok: true, tpws: true, transparent: transparentUp, socks: socksUp };
    }
    await new Promise((res) => setTimeout(res, 800));
  }
  if (!isRunning()) {
    log('warning', 'tpws не поднялся — перезапуск...');
    await start(sudoPrompt, log);
  }
  const transparent = pfAnchors ? await isPortOpen(TPWS_PORT) : true;
  const socks = await isPortOpen(SOCKS_PORT);
  return { ok: isRunning(), tpws: isRunning(), transparent, socks };
}

function enableSocksProxy(log) {
  try {
    const out = execSync('networksetup -listallnetworkservices', { encoding: 'utf8' });
    const services = out.split('\n').filter((l) => l && !l.startsWith('An asterisk') && !l.startsWith('*'));
    let n = 0;
    for (const s of services) {
      try {
        execSync(`networksetup -setsocksfirewallproxy "${s}" 127.0.0.1 ${SOCKS_PORT}`, { stdio: 'pipe' });
        execSync(`networksetup -setsocksfirewallproxystate "${s}" on`, { stdio: 'pipe' });
        n++;
      } catch {}
    }
    if (n) log('info', `SOCKS резерв: ${n} интерфейсов → :${SOCKS_PORT}`);
  } catch {}
}

function disableSocksProxy() {
  try {
    const out = execSync('networksetup -listallnetworkservices', { encoding: 'utf8' });
    for (const s of out.split('\n').filter((l) => l && !l.startsWith('An asterisk') && !l.startsWith('*'))) {
      try {
        execSync(`networksetup -setsocksfirewallproxystate "${s}" off`, { stdio: 'pipe' });
      } catch {}
    }
  } catch {}
}

function getStrategies() {
  return PRESETS.filter((p) => p.name !== 'auto');
}

function getAutoOrder() {
  return ['tlsrec', 'combo', 'default', 'split2', 'oob', 'hostcase', 'split-only', 'midsld', 'all443'];
}

module.exports = {
  INSTALL_DIR,
  SOCKS_PORT,
  TPWS_PORT,
  PRESETS,
  isInstalled,
  isRunning,
  ensureInstalled,
  setStrategy,
  runSelftest,
  start,
  stop,
  detectVpn,
  parseDiagnostics,
  waitForReady,
  enableSocksProxy,
  disableSocksProxy,
  getStrategies,
  getAutoOrder
};
