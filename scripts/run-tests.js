'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..', 'tests');
const groups = process.argv.slice(2);
const dirs = groups.length ? groups : ['unit', 'integration', 'multiplayer'];

function collect(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return collect(p);
    return e.name.endsWith('.test.js') ? [p] : [];
  });
}

const files = dirs.flatMap((d) => collect(path.join(root, d)));
if (!files.length) {
  console.error('Nenhum teste encontrado em:', dirs.join(', '));
  process.exit(1);
}
const res = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(res.status ?? 1);
