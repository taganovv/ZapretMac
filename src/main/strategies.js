'use strict';

const path = require('path');

const TPWS_PORT = 988;
const SOCKS_PORT = 11080;

function paths(listsDir) {
  const p = (f) => path.join(listsDir, f);
  return {
    youtube: p('list-youtube.txt'),
    exclude: p('list-exclude.txt'),
    all: p('list-all.txt')
  };
}

function BASE(port = TPWS_PORT, socks = false) {
  const args = [
    '--port', String(port),
    '--bind-addr=127.0.0.1',
    '--bind-wait-ifup=20',
    '--bind-wait-ip=20'
  ];
  if (socks) args.push('--socks');
  return args;
}

function withMode(strategyArgs, port, socks) {
  const b = BASE(port, socks);
  const rest = strategyArgs.filter((a, i, arr) => {
    if (a === '--port') return false;
    if (i > 0 && arr[i - 1] === '--port') return false;
    if (a.startsWith('--bind-')) return false;
    if (a === '--socks') return false;
    return true;
  });
  return [...b, ...rest];
}

function buildStrategies(listsDir) {
  const l = paths(listsDir);

  const ruleYt443 = (tamper) => [
    '--filter-tcp=443', `--hostlist=${l.youtube}`, `--hostlist-exclude=${l.exclude}`,
    ...tamper
  ];
  const ruleYt80443 = (tamper) => [
    '--filter-tcp=80,443', `--hostlist=${l.youtube}`, `--hostlist-exclude=${l.exclude}`,
    ...tamper
  ];

  const DISORDER = ['--split-pos=1,midsld', '--disorder', '--hostcase'];
  const DISORDER2 = ['--split-pos=2', '--disorder', '--hostcase'];
  const YT_TLS = ['--filter-l7=tls', '--tlsrec=sniext', '--split-pos=1,sniext', '--disorder', '--hostcase'];
  const YT_VIDEO = ['--split-pos=1,midsld', '--split-any-protocol', '--disorder', '--hostcase'];
  const TLSREC_SNI = ['--filter-l7=tls', '--tlsrec=sni', '--split-pos=1,midsld', '--disorder', '--hostcase'];
  const METHODEOL = ['--methodeol', '--hostcase', '--split-pos=1'];
  const ZAPRET_STD = [
    '--filter-tcp=80', `--hostlist=${l.youtube}`, `--hostlist-exclude=${l.exclude}`,
    ...METHODEOL,
    '--new',
    '--filter-tcp=443', `--hostlist=${l.youtube}`, `--hostlist-exclude=${l.exclude}`,
    ...DISORDER
  ];

  const defs = [
    {
      name: 'zapret-std',
      label: 'Zapret standard — methodeol + split (рекомендуется)',
      description: 'Стандартная стратегия bol-van/zapret для YouTube.',
      core: ZAPRET_STD
    },
    {
      name: 'youtube',
      label: 'YouTube — tlsrec + googlevideo',
      description: 'TLS split + split-any для googlevideo.',
      core: [
        ...ruleYt443(YT_TLS),
        '--new',
        ...ruleYt443(YT_VIDEO),
        '--new',
        ...ruleYt80443(['--hostdot', ...DISORDER, '--methodeol'])
      ]
    },
    {
      name: 'youtube-tlsrec',
      label: 'YouTube — tlsrec sni',
      core: [
        ...ruleYt443(TLSREC_SNI),
        '--new',
        ...ruleYt443(YT_VIDEO),
        '--new',
        ...ruleYt80443([...DISORDER, '--methodeol'])
      ]
    },
    {
      name: 'youtube-split2',
      label: 'YouTube — split pos 2',
      core: [
        ...ruleYt443(DISORDER2),
        '--new',
        ...ruleYt443(YT_VIDEO)
      ]
    },
    {
      name: 'youtube-oob',
      label: 'YouTube — oob + tlsrec (без disorder)',
      core: [
        ...ruleYt443(['--filter-l7=tls', '--tlsrec=midsld', '--split-pos=1', '--oob', '--hostcase'])
      ]
    },
    {
      name: 'youtube-domcase',
      label: 'YouTube — domcase + tlsrec',
      core: [
        ...ruleYt443(['--domcase', '--tlsrec=sni', '--split-pos=1', '--disorder']),
        '--new',
        ...ruleYt443(YT_VIDEO)
      ]
    },
    {
      name: 'fallback-all',
      label: 'Fallback — весь HTTPS 443',
      description: 'Без hostlist — обрабатывает весь TLS.',
      core: [
        '--filter-tcp=443', '--filter-l7=tls', ...TLSREC_SNI,
        '--new',
        '--filter-tcp=443', ...YT_VIDEO,
        '--new',
        '--filter-tcp=80', ...METHODEOL
      ]
    }
  ];

  return defs.map((d) => ({
    name: d.name,
    label: d.label,
    description: d.description,
    args: withMode(d.core, TPWS_PORT, false),
    socksArgs: withMode(d.core, SOCKS_PORT, true)
  }));
}

const AUTO_ORDER = [
  'zapret-std', 'youtube', 'youtube-tlsrec', 'youtube-split2',
  'youtube-oob', 'youtube-domcase', 'fallback-all'
];

function getOrderedStrategies(listsDir) {
  const all = buildStrategies(listsDir);
  const byName = new Map(all.map((s) => [s.name, s]));
  const ordered = [];
  for (const name of AUTO_ORDER) {
    if (byName.has(name)) {
      ordered.push(byName.get(name));
      byName.delete(name);
    }
  }
  for (const s of all) {
    if (byName.has(s.name)) ordered.push(s);
  }
  return ordered;
}

function validateStrategy(args) {
  const blocks = [];
  let current = [];
  for (const arg of args) {
    if (arg === '--new') {
      blocks.push(current);
      current = [];
    } else {
      current.push(arg);
    }
  }
  blocks.push(current);
  for (const block of blocks) {
    const hasOob = block.some((a) => a === '--oob' || a.startsWith('--oob='));
    const hasDisorder = block.includes('--disorder') || block.some((a) => a.startsWith('--disorder='));
    if (hasOob && hasDisorder) {
      return { valid: false, reason: 'oob+disorder в одном блоке (не работает на macOS)' };
    }
  }
  return { valid: true };
}

module.exports = {
  TPWS_PORT,
  SOCKS_PORT,
  buildStrategies,
  getOrderedStrategies,
  AUTO_ORDER,
  validateStrategy
};
