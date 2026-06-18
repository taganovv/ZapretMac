'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PF_MAIN = '/etc/pf.conf';
const PF_ANCHOR_DIR = '/etc/pf.anchors';
const ANCHOR = 'zapretmac';

function getLanInterfaces() {
  const ifaces = new Set();
  try {
    const def = execSync("route -n get default 2>/dev/null | awk '/interface:/{print $2}'", { encoding: 'utf8', stdio: 'pipe' }).trim();
    if (def) ifaces.add(def);
  } catch {}
  try {
    const out = execSync('networksetup -listallhardwareports', { encoding: 'utf8', stdio: 'pipe' });
    let device = null;
    for (const line of out.split('\n')) {
      const dm = line.match(/^Device:\s*(\S+)/);
      if (dm) device = dm[1];
      if (device && /^(Wi-Fi|Ethernet|USB|Thunderbolt)/i.test(line) && !device.startsWith('bridge')) {
        ifaces.add(device);
      }
    }
  } catch {}
  ifaces.add('en0');
  return [...ifaces];
}

function buildMainAnchor() {
  return [
    `rdr-anchor "/${ANCHOR}-v4" inet to any`,
    `anchor "/${ANCHOR}-v4" inet to any`,
    `anchor "/${ANCHOR}-filter" all`
  ].join('\n') + '\n';
}

function buildFilterAnchor() {
  return [
    'block return out quick proto udp from any to any port 443',
    'block return out quick proto udp from any to any port 19294:19344',
    'block return out quick proto udp from any to any port 50000:50100'
  ].join('\n') + '\n';
}

function buildV4Rules(ifaces, tpwsPort) {
  const ports = '{80,443}';
  const lines = [];
  for (const iface of ifaces) {
    lines.push(`rdr on ${iface} inet proto tcp from any to any port ${ports} -> 127.0.0.1 port ${tpwsPort}`);
  }
  lines.push(`rdr on lo0 inet proto tcp from !127.0.0.0/8 to any port ${ports} -> 127.0.0.1 port ${tpwsPort}`);
  lines.push(`pass out route-to (lo0 127.0.0.1) inet proto tcp from !127.0.0.0/8 to any port ${ports} user { >root }`);
  return lines.join('\n') + '\n';
}

function writeAnchorFiles(userDataPath, tpwsPort) {
  const dir = path.join(userDataPath, 'pf');
  fs.mkdirSync(dir, { recursive: true });
  const ifaces = getLanInterfaces();
  const files = {
    mainPath: path.join(dir, 'main.conf'),
    v4Path: path.join(dir, 'v4.conf'),
    filterPath: path.join(dir, 'filter.conf'),
    ifaces
  };
  fs.writeFileSync(files.mainPath, buildMainAnchor());
  fs.writeFileSync(files.v4Path, buildV4Rules(ifaces, tpwsPort));
  fs.writeFileSync(files.filterPath, buildFilterAnchor());
  return files;
}

function buildEnableScript({ mainPath, v4Path, filterPath }, tpwsPort) {
  const anchorMain = `${PF_ANCHOR_DIR}/${ANCHOR}`;
  const anchorV4 = `${PF_ANCHOR_DIR}/${ANCHOR}-v4`;
  const anchorFilter = `${PF_ANCHOR_DIR}/${ANCHOR}-filter`;

  return `#!/bin/bash
set -e
ERR=0
mkdir -p "${PF_ANCHOR_DIR}"
cp "${mainPath}" "${anchorMain}"
cp "${v4Path}" "${anchorV4}"
cp "${filterPath}" "${anchorFilter}"

if ! grep -q 'rdr-anchor "${ANCHOR}"' "${PF_MAIN}" 2>/dev/null; then
  if grep -q 'rdr-anchor "com.apple' "${PF_MAIN}" 2>/dev/null; then
    sed -i '' '/^rdr-anchor "com\\.apple/i\\
rdr-anchor "${ANCHOR}"
' "${PF_MAIN}"
    sed -i '' '/^anchor "com\\.apple/i\\
anchor "${ANCHOR}"
' "${PF_MAIN}"
    pfctl -qf "${PF_MAIN}" 2>/dev/null || ERR=1
  else
    ERR=1
  fi
fi

pfctl -qa ${ANCHOR} -f "${anchorMain}" 2>/dev/null || ERR=1
pfctl -qa ${ANCHOR}-v4 -f "${anchorV4}" 2>/dev/null || ERR=1
pfctl -qa ${ANCHOR}-filter -f "${anchorFilter}" 2>/dev/null || ERR=1
pfctl -qe 2>/dev/null || true

if ! pfctl -s nat 2>/dev/null | grep -q "127.0.0.1 port ${tpwsPort}"; then
  ERR=1
fi

exit $ERR
`;
}

function buildDisableScript() {
  return `#!/bin/bash
pfctl -qa ${ANCHOR}-v4 -F all 2>/dev/null || true
pfctl -qa ${ANCHOR}-filter -F all 2>/dev/null || true
pfctl -qa ${ANCHOR} -F all 2>/dev/null || true
exit 0`;
}

function buildVerifyScript(tpwsPort) {
  return `#!/bin/bash
pfctl -s info 2>/dev/null | head -3
echo "---NAT---"
pfctl -s nat 2>/dev/null | grep -E "zapretmac|127.0.0.1 port ${tpwsPort}" || echo "NO_NAT_RULES"
echo "---RULES---"
pfctl -a ${ANCHOR}-filter -sr 2>/dev/null | head -5 || echo "NO_FILTER"
exit 0`;
}

module.exports = {
  ANCHOR,
  getLanInterfaces,
  writeAnchorFiles,
  buildEnableScript,
  buildDisableScript,
  buildVerifyScript
};
