'use strict';

const $ = (id) => document.getElementById(id);

let state = {
  connected: false,
  searching: false,
  strategy: null,
  strategyProgress: null
};

const powerBtn = $('powerBtn');
const powerRing = $('powerRing');
const powerLabel = $('powerLabel');
const statusBadge = $('statusBadge');
const activeStrategy = $('activeStrategy');
const strategySelect = $('strategySelect');
const strategyHint = $('strategyHint');
const progressCard = $('progressCard');
const progressText = $('progressText');
const progressFill = $('progressFill');
const logEl = $('log');
const autoStart = $('autoStart');
const autoConnect = $('autoConnect');

function addLog(entry) {
  const div = document.createElement('div');
  div.className = `log-entry ${entry.type}`;
  const time = new Date(entry.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  div.textContent = `[${time}] ${entry.message}`;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}

function updateUI() {
  const { connected, searching, strategy, strategyProgress } = state;

  powerRing.className = 'power-ring';
  if (searching) {
    powerRing.classList.add('searching');
    statusBadge.textContent = 'Поиск...';
    statusBadge.className = 'status-badge searching';
    powerLabel.textContent = 'Подбор стратегии...';
    strategySelect.disabled = true;
    powerBtn.disabled = true;
  } else if (connected) {
    powerRing.classList.add('active');
    statusBadge.textContent = 'Подключено';
    statusBadge.className = 'status-badge connected';
    powerLabel.textContent = 'Нажмите для отключения';
    activeStrategy.textContent = strategy ? `Стратегия: ${strategy}` : '';
    strategySelect.disabled = true;
    powerBtn.disabled = false;
  } else {
    statusBadge.textContent = 'Отключено';
    statusBadge.className = 'status-badge';
    powerLabel.textContent = 'Нажмите для включения';
    activeStrategy.textContent = '';
    strategySelect.disabled = false;
    powerBtn.disabled = false;
  }

  if (strategyProgress) {
    progressCard.classList.remove('hidden');
    progressText.textContent = `Тест ${strategyProgress.current}/${strategyProgress.total}: ${strategyProgress.name}`;
    progressFill.style.width = `${(strategyProgress.current / strategyProgress.total) * 100}%`;
  } else {
    progressCard.classList.add('hidden');
  }
}

async function loadStrategies() {
  const strategies = await window.zapret.getStrategies();
  for (const s of strategies) {
    const opt = document.createElement('option');
    opt.value = s.name;
    opt.textContent = s.label;
    strategySelect.appendChild(opt);
  }

  strategySelect.addEventListener('change', () => {
    const selected = strategies.find((s) => s.name === strategySelect.value);
    if (selected?.description) {
      strategyHint.textContent = selected.description;
    } else if (strategySelect.value === 'auto') {
      strategyHint.textContent = 'Авто перебирает стратегии по одной. Журнал: Копировать или Файл.';
    }
  });
}

async function loadSettings() {
  const settings = await window.zapret.getSettings();
  autoStart.checked = settings.autoStart || false;
  autoConnect.checked = settings.autoConnect || false;
  if (settings.selectedStrategy) {
    strategySelect.value = settings.selectedStrategy;
  }
}

async function saveSettings() {
  await window.zapret.saveSettings({
    autoStart: autoStart.checked,
    autoConnect: autoConnect.checked,
    selectedStrategy: strategySelect.value
  });
}

powerBtn.addEventListener('click', async () => {
  if (state.searching) return;
  if (state.connected) {
    await window.zapret.disconnect();
  } else {
    await saveSettings();
    await window.zapret.connect();
  }
});

strategySelect.addEventListener('change', saveSettings);
autoStart.addEventListener('change', saveSettings);
autoConnect.addEventListener('change', saveSettings);

$('clearLog').addEventListener('click', () => { logEl.innerHTML = ''; });

$('copyLog').addEventListener('click', async () => {
  try {
    const r = await window.zapret.copyLog();
    addLog({ type: 'success', message: r.path ? `Журнал скопирован (${r.path})` : 'Журнал скопирован', timestamp: Date.now() });
  } catch {
    addLog({ type: 'error', message: 'Не удалось скопировать', timestamp: Date.now() });
  }
});

$('openLog').addEventListener('click', async () => {
  const r = await window.zapret.openLogFile();
  if (r.success) {
    addLog({ type: 'info', message: `Лог: ${r.path}`, timestamp: Date.now() });
  }
});

window.zapret.onStatus((data) => {
  state = {
    connected: data.connected,
    searching: data.searching || false,
    strategy: data.strategy,
    strategyProgress: data.strategyProgress
  };
  updateUI();
});

window.zapret.onLog((entry) => addLog(entry));

(async () => {
  await loadStrategies();
  await loadSettings();

  const status = await window.zapret.getStatus();
  state = {
    connected: status.connected,
    searching: false,
    strategy: status.strategy,
    strategyProgress: status.strategyProgress
  };
  (status.logs || []).forEach(addLog);
  updateUI();

  if (!status.binaryExists) {
    addLog({ type: 'info', message: 'tpws не установлен — будет скачан при первом включении', timestamp: Date.now() });
  }
})();
