'use strict';
// Sauvegarde de la base : mysqldump → gzip → <racine>/backups/<base>-AAAA-MM-JJ_HH-MM-SS.sql.gz
// Usage : npm run backup   (à programmer avec cron ou le Planificateur de tâches, voir installNew.md)
// Variables facultatives : BACKUP_KEEP (nombre de sauvegardes gardées, 14 par défaut),
//                          MYSQLDUMP_PATH (chemin complet de mysqldump s'il n'est pas dans le PATH).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');
const { pipeline } = require('stream/promises');
const config = require('../src/config/env');

const BACKUP_DIR = path.resolve(__dirname, '../../backups');
const MIN_SIZE = 200; // octets : en dessous, le fichier ne peut pas contenir une vraie sauvegarde
const keep = Math.max(1, Number.parseInt(process.env.BACKUP_KEEP, 10) || 14);
const prefix = `${config.db.database}-`;

// Où trouver mysqldump ? 1) MYSQLDUMP_PATH, 2) le PATH, 3) les dossiers d'installation habituels sous Windows.
function findMysqldump() {
  if (process.env.MYSQLDUMP_PATH) return process.env.MYSQLDUMP_PATH;
  const exe = process.platform === 'win32' ? 'mysqldump.exe' : 'mysqldump';
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  if (process.platform === 'win32') {
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean)) {
      for (const vendor of ['MySQL', 'MariaDB']) {
        const root = path.join(base, vendor);
        if (!fs.existsSync(root)) continue;
        // Version la plus récente d'abord (ex. « MySQL Server 8.4 » avant « MySQL Server 8.0 »).
        for (const d of fs.readdirSync(root).sort().reverse()) dirs.push(path.join(root, d, 'bin'));
      }
    }
    dirs.push('C:\\xampp\\mysql\\bin');
  }
  for (const d of dirs) {
    const candidate = path.join(d, exe);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function timestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  // Pas de « : » dans le nom : interdit dans les noms de fichiers sous Windows.
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

async function dump(bin, target) {
  const args = [
    '--single-transaction', '--routines', '--no-tablespaces',
    '--default-character-set=utf8mb4',
    `--host=${config.db.host}`, `--port=${config.db.port}`, `--user=${config.db.user}`,
    config.db.database,
  ];
  // Le mot de passe passe par l'environnement du processus fils, jamais par la ligne de commande
  // (une ligne de commande est visible par les autres utilisateurs de la machine : ps, Gestionnaire des tâches).
  const child = spawn(bin, args, {
    env: { ...process.env, MYSQL_PWD: config.db.password },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stderr = '';
  child.stderr.on('data', (c) => { stderr += c; });

  const exited = new Promise((resolve, reject) => {
    child.on('error', reject); // ex. ENOENT : programme introuvable
    child.on('close', (code) => resolve(code));
  });
  const written = pipeline(child.stdout, zlib.createGzip({ level: 9 }), fs.createWriteStream(target));

  // On attend les DEUX (fin du processus ET fichier entièrement écrit/fermé) avant de conclure,
  // sinon Windows refuserait de supprimer un fichier encore ouvert.
  const [proc, file] = await Promise.allSettled([exited, written]);
  if (proc.status === 'rejected') throw proc.reason;
  if (file.status === 'rejected') throw file.reason;
  const code = proc.value;
  if (code !== 0) {
    throw new Error(`mysqldump a échoué (code ${code}) : ${stderr.trim() || 'aucun détail'}`);
  }
}

function prune() {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.sql.gz'))
    .sort(); // la date AAAA-MM-JJ_HH-MM-SS se trie correctement par ordre alphabétique
  const old = files.slice(0, Math.max(0, files.length - keep));
  for (const f of old) fs.unlinkSync(path.join(BACKUP_DIR, f));
  return old.length;
}

async function main() {
  const bin = findMysqldump();
  if (!bin) {
    throw new Error(
      "mysqldump est introuvable. Installez le client MySQL (ou MariaDB), ajoutez son dossier « bin » au PATH, "
      + 'ou indiquez son chemin complet dans .env : MYSQLDUMP_PATH=C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe',
    );
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const final = path.join(BACKUP_DIR, `${prefix}${timestamp()}.sql.gz`);
  const partial = `${final}.partial`; // renommé seulement si tout s'est bien passé

  try {
    await dump(bin, partial);
    const size = fs.statSync(partial).size;
    if (size < MIN_SIZE) throw new Error(`sauvegarde trop petite (${size} octets) : elle est sans doute vide.`);
    fs.renameSync(partial, final);
  } catch (err) {
    fs.rmSync(partial, { force: true });
    if (err.code === 'ENOENT') {
      throw new Error(`mysqldump est introuvable à cet emplacement : ${bin} (vérifiez MYSQLDUMP_PATH).`);
    }
    throw err;
  }

  const removed = prune();
  const kb = (fs.statSync(final).size / 1024).toFixed(1);
  console.log(`Sauvegarde créée : ${final} (${kb} ko)`);
  console.log(`${removed} ancienne(s) sauvegarde(s) supprimée(s) ; ${keep} gardée(s) au maximum.`);
}

main().catch((err) => {
  console.error('Échec de la sauvegarde :', err.message);
  process.exit(1);
});
