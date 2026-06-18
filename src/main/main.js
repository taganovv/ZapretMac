'use strict';

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const sudo = require('sudo-prompt');
const {
  isInstalled,
  isRunning,
  ensureInstalled,
  setStrategy,
  start,
  stop,
  detectVpn,
  parseDiagnostics,
  waitForReady,
  disableSocksProxy,
  getStrategies,
  getAutoOrder,
  SOCKS_PORT
} = require('./zapret-runtime');
const { testYouTubeBoth, testYouTube } = require('./connectivity');
const { enablePacProxy, disablePacProxy } = require('./pac-proxy');

let mainWindow;
let tray;
let isConnected = false;
let currentStrategy = null;
let strategyProgress = null;
let logEntries = [];
let stopInProgress = false;
let connectInProgress = false;

const isDev = !app.isPackaged;
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath())) {
      return JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    }
  } catch {}
  return { autoStart: false, autoConnect: false, selectedStrategy: 'auto', lastWorkingStrategy: null };
}

function saveSettings(settings) {
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
}

function sendStatus(extra = {}) {
  mainWindow?.webContents?.send('status', {
    connected: isConnected,
    strategy: currentStrategy,
    installed: isInstalled(),
    running: isRunning(),
    strategyProgress,
    ...extra
  });
}

function getLogText() {
  return logEntries.map((e) => {
    const time = new Date(e.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `[${time}] ${e.message}`;
  }).join('\n');
}

function saveLogToFile() {
  try {
    const p = path.join(app.getPath('userData'), 'zapret-log.txt');
    fs.writeFileSync(p, getLogText() + '\n', 'utf8');
    return p;
  } catch {
    return null;
  }
}

function sendLog(type, message) {
  const entry = { type, message, timestamp: Date.now() };
  logEntries.push(entry);
  if (logEntries.length > 200) logEntries.shift();
  console.log(`[${type}] ${message}`);
  mainWindow?.webContents?.send('log-entry', entry);
  saveLogToFile();
}

function updateTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Открыть', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: isConnected ? '● YouTube обход активен' : '○ Отключено', enabled: false },
    { label: 'Включить', click: () => startProxy(), enabled: !isConnected },
    { label: 'Выключить', click: () => stopProxy(), enabled: isConnected },
    { type: 'separator' },
    { label: 'Выход', click: () => { app.isQuitting = true; stopProxy(); app.quit(); } }
  ]));
}

async function tryStrategy(name, labels, vpnActive, pfAnchors) {
  sendLog('info', `Тест: ${labels[name] || name}`);
  const r = await setStrategy(name, sudo);
  if (r.timedOut) {
    sendLog('warning', `${name}: таймаут — следующая`);
    return { ok: false };
  }
  if (!r.ok) return { ok: false };

  const ready = await waitForReady(sudo, sendLog, pfAnchors, 15000);
  if (!ready.tpws) {
    sendLog('warning', `${name}: tpws не запущен — следующая`);
    return { ok: false };
  }

  await new Promise((res) => setTimeout(res, 2000));

  if (pfAnchors && !vpnActive) {
    const yt = await testYouTube(18, null);
    if (yt.ok) {
      sendLog('info', `${name}: YouTube OK (PF)`);
      return { ok: true, mode: 'transparent' };
    }
    const ytSocks = await testYouTube(18, SOCKS_PORT);
    if (ytSocks.ok) {
      sendLog('info', `${name}: YouTube OK (SOCKS → PAC для Firefox)`);
      return { ok: true, mode: 'socks-pac' };
    }
    const codes = yt.results.map((x) => x.code || 'err').join(',');
    sendLog('warning', `${name}: PF (${codes}), SOCKS нет — следующая`);
    return { ok: false };
  }

  const yt = await testYouTubeBoth(18, SOCKS_PORT, true);
  if (yt.ok) {
    sendLog('info', `${name}: YouTube OK (${yt.mode === 'socks' ? 'SOCKS' : 'PF'})`);
    return { ok: true, mode: yt.mode };
  }
  const sample = yt.socks?.results || yt.results || [];
  const codes = sample.map((x) => x.code || 'err').join(',');
  sendLog('warning', `${name}: YouTube (${codes})`);
  return { ok: false };
}

async function startProxy() {
  if (isConnected || connectInProgress) return { success: false, error: 'Уже подключено' };
  connectInProgress = true;

  sendLog('info', 'Zapret — YouTube...');
  const logPath = path.join(app.getPath('userData'), 'zapret-log.txt');
  sendLog('info', `Журнал сохраняется: ${logPath}`);
  sendStatus({ searching: true });

  // Сброс прокси от прошлой сессии
  disableSocksProxy();
  disablePacProxy();

  const settings = loadSettings();
  const inst = await ensureInstalled(sudo, sendLog);
  if (!inst.ok) {
    sendStatus({ searching: false });
    connectInProgress = false;
    return inst;
  }

  const vpn = detectVpn();
  const vpnActive = vpn.active;
  const diagInfo = parseDiagnostics(inst.status || '');

  const pfAnchors = diagInfo.pfAnchors;

  if (vpnActive) {
    sendLog('warning', `VPN активен (${vpn.reason || 'туннель'}). Тест через SOCKS :${SOCKS_PORT}.`);
  } else if (!pfAnchors) {
    sendLog('warning', 'PF-якоря не загрузились — проверьте IFACE_LAN в /opt/zapret/config');
  } else {
    sendLog('info', 'PF-якоря загружены — браузер через прозрачный прокси (без системного SOCKS).');
  }

  const labels = Object.fromEntries(getStrategies().map((s) => [s.name, s.label]));
  let winner = null;
  let winnerMode = null;

  if (settings.selectedStrategy === 'auto' || !settings.selectedStrategy) {
    const order = settings.lastWorkingStrategy
      ? [settings.lastWorkingStrategy, ...getAutoOrder().filter((n) => n !== settings.lastWorkingStrategy)]
      : getAutoOrder();
    sendLog('info', `Авто: перебор ${order.length} стратегий (без selftest)`);
    for (let i = 0; i < order.length; i++) {
      strategyProgress = { current: i + 1, total: order.length, name: order[i] };
      sendStatus({ searching: true });
      const tr = await tryStrategy(order[i], labels, vpnActive, pfAnchors);
      if (tr.ok) {
        winner = order[i];
        winnerMode = tr.mode;
        break;
      }
    }
  } else {
    strategyProgress = { current: 1, total: 1, name: settings.selectedStrategy };
    const tr = await tryStrategy(settings.selectedStrategy, labels, vpnActive, pfAnchors);
    if (tr.ok) {
      winner = settings.selectedStrategy;
      winnerMode = tr.mode;
    } else if (settings.selectedStrategy !== 'all443') {
      sendLog('info', 'Пробую all443...');
      const tr2 = await tryStrategy('all443', labels, vpnActive, pfAnchors);
      if (tr2.ok) {
        winner = 'all443';
        winnerMode = tr2.mode;
      }
    }
  }

  strategyProgress = null;

  if (winner) {
    disableSocksProxy();
    disablePacProxy();
    if (winnerMode === 'socks-pac') {
      enablePacProxy(SOCKS_PORT, sendLog);
      sendLog('info', 'Режим: PAC — только YouTube через SOCKS, остальные сайты напрямую');
    } else if (winnerMode === 'transparent') {
      sendLog('info', 'Режим: прозрачный PF');
    }
    isConnected = true;
    currentStrategy = winner;
    settings.lastWorkingStrategy = winner;
    saveSettings(settings);
    updateTray();
    sendLog('success', `YouTube: ${labels[winner] || winner}`);
    sendStatus({ searching: false });
    connectInProgress = false;
    return { success: true, strategy: winner, mode: winnerMode };
  }

  await stop(sudo, sendLog);
  disableSocksProxy();
  disablePacProxy();
  const hint = vpnActive
    ? 'Ни одна стратегия не подошла. Выключите VPN полностью и перезапустите.'
    : 'Ни одна стратегия не подошла. Перезапустите или попробуйте другую сеть.';
  sendLog('error', hint);
  sendStatus({ searching: false });
  connectInProgress = false;
  return { success: false, error: 'ALL_STRATEGIES_FAILED' };
}

async function stopProxy() {
  if (stopInProgress) return { success: true };
  stopInProgress = true;
  try {
    disableSocksProxy();
    disablePacProxy();
    await stop(sudo, sendLog);
    isConnected = false;
    currentStrategy = null;
    strategyProgress = null;
    connectInProgress = false;
    updateTray();
    sendStatus();
    sendLog('info', 'zapret остановлен');
    return { success: true };
  } finally {
    stopInProgress = false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 640,
    minWidth: 400,
    minHeight: 500,
    title: 'ZapretMac',
    backgroundColor: '#0f0f14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset',
    show: false
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function buildTrayIcon() {
  const iconPath = path.join(__dirname, 'icons', 'tray.png');
  const img = nativeImage.createFromPath(iconPath);
  if (img.isEmpty()) return nativeImage.createEmpty();
  if (process.platform === 'darwin') {
    img.setTemplateImage(false);
  }
  return img.resize({ width: 22, height: 22 });
}

function createTray() {
  tray = new Tray(buildTrayIcon());
  tray.setToolTip('ZapretMac — YouTube');
  tray.on('click', () => mainWindow?.show());
  updateTray();
}

ipcMain.handle('get-status', () => ({
  connected: isConnected || isRunning(),
  strategy: currentStrategy,
  installed: isInstalled(),
  running: isRunning(),
  strategyProgress,
  logs: logEntries.slice(-50)
}));

ipcMain.handle('get-strategies', () => [
  { name: 'auto', label: 'Авто — перебор стратегий', description: 'По одной стратегии с прогрессом.' },
  ...getStrategies()
]);

ipcMain.handle('get-log-text', () => getLogText());

ipcMain.handle('copy-log', () => {
  const text = getLogText();
  clipboard.writeText(text);
  const filePath = saveLogToFile();
  return { success: true, path: filePath };
});

ipcMain.handle('open-log-file', () => {
  const filePath = saveLogToFile();
  if (filePath) {
    const { shell } = require('electron');
    shell.showItemInFolder(filePath);
    return { success: true, path: filePath };
  }
  return { success: false };
});

ipcMain.handle('get-settings', () => loadSettings());
ipcMain.handle('save-settings', (_, s) => {
  saveSettings(s);
  if (!isDev) app.setLoginItemSettings({ openAtLogin: s.autoStart, openAsHidden: true });
  return { success: true };
});
ipcMain.handle('connect', () => startProxy());
ipcMain.handle('disconnect', () => stopProxy());

app.whenReady().then(() => {
  isConnected = isRunning();
  createWindow();
  createTray();
  const s = loadSettings();
  if (!isDev) app.setLoginItemSettings({ openAtLogin: s.autoStart, openAsHidden: true });
  if (s.autoConnect && !isConnected) setTimeout(() => startProxy(), 2000);
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if ((isConnected || isRunning()) && !stopInProgress) stopProxy();
});
app.on('window-all-closed', (e) => e.preventDefault());
app.on('activate', () => mainWindow?.show());
