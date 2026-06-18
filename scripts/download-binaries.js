#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { isMachOBinary } = require('../src/main/binary-format');

const ZAPRET_COMMIT = '1a1fc38c8ea05b481eebcbd338df48cdcca23c15';
const repoRoot = path.join(__dirname, '..');
const binDir = path.join(repoRoot, 'bin', 'darwin');
const tempRoot = path.join(repoRoot, 'temp', 'build');

function build() {
  if (process.platform !== 'darwin') {
    console.error('Компиляция tpws возможна только на macOS');
    process.exit(1);
  }

  fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(tempRoot, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });

  const source = path.join(tempRoot, 'zapret');
  fs.mkdirSync(source, { recursive: true });

  console.log('Клонирование zapret...');
  execFileSync('git', ['init'], { cwd: source, stdio: 'inherit' });
  execFileSync('git', ['fetch', '--depth', '1', 'https://github.com/bol-van/zapret.git', ZAPRET_COMMIT], {
    cwd: source, stdio: 'inherit'
  });
  execFileSync('git', ['checkout', '--detach', 'FETCH_HEAD'], { cwd: source, stdio: 'inherit' });

  console.log('Компиляция tpws...');
  execFileSync('make', ['mac'], {
    cwd: path.join(source, 'tpws'),
    stdio: 'inherit',
    env: { ...process.env, OPTIMIZE: '-O2' }
  });

  const compiled = path.join(source, 'tpws', 'tpws');
  if (!isMachOBinary(compiled)) {
    console.error('tpws не скомпилирован. Установите Xcode Command Line Tools: xcode-select --install');
    process.exit(1);
  }

  const dest = path.join(binDir, 'tpws');
  fs.copyFileSync(compiled, dest);
  fs.chmodSync(dest, 0o755);
  fs.rmSync(tempRoot, { recursive: true, force: true });
  console.log(`Готово: ${dest}`);
}

build();
