import fs from 'node:fs';
import path from 'node:path';

const oldPath = path.resolve('pokemon-checklist-db.json');
const appDir = path.join(process.env.APPDATA || '', 'com.gabrielmwalker.pixelmon-pokedex-checklist');
const appDbPath = path.join(appDir, 'pokemon-checklist-db.json');

function key(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\u2640/g, 'f')
    .replace(/\u2642/g, 'm')
    .replace(/[^a-z0-9]/g, '');
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function addRecords(map, records = []) {
  records.forEach(record => {
    const name = typeof record === 'string' ? record : record?.name;
    if (!name) return;
    const id = key(name);
    if (!id || map.has(id)) return;
    map.set(id, {
      name,
      capturedAt: typeof record === 'object' && record?.capturedAt ? record.capturedAt : '',
    });
  });
}

const oldData = readJson(oldPath, { captured: [] });
const appData = readJson(appDbPath, { captured: [] });
const byKey = new Map();

addRecords(byKey, oldData.captured);
addRecords(byKey, appData.captured);

const captured = [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
fs.mkdirSync(appDir, { recursive: true });

if (fs.existsSync(appDbPath)) {
  const backupPath = path.join(appDir, `pokemon-checklist-db.backup-${Date.now()}.json`);
  fs.copyFileSync(appDbPath, backupPath);
  console.log(`Backup: ${backupPath}`);
}

fs.writeFileSync(
  appDbPath,
  JSON.stringify({ version: 3, updatedAt: new Date().toISOString(), captured }, null, 2),
  'utf8',
);

console.log(`Migrated ${captured.length} captures to ${appDbPath}`);
