/* ============================================================
   Flow — server locale minimale.
   Nessuna dipendenza esterna: solo i moduli inclusi in Node.
   Ascolta solo su 127.0.0.1: niente è raggiungibile dalla rete.
   ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;
const APP_DIR = path.join(ROOT, 'app');
const DATA_DIR = path.join(ROOT, 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const DATA_FILE = path.join(DATA_DIR, 'board.json');
const PORT_FILE = path.join(DATA_DIR, '.port');
const LOG_FILE = path.join(DATA_DIR, 'server.log');

const PORT_START = 7391;
const PORT_TRIES = 20;
const MAX_BACKUPS = 25;
const MAX_RESCUE = 5;
const BACKUP_EVERY_MS = 5 * 60 * 1000;
const IDLE_TIMEOUT_MS = 45 * 1000;   // nessun battito dalla finestra -> spegnimento
const STARTUP_GRACE_MS = 90 * 1000;  // tempo concesso al browser per aprirsi

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

/* ---------------------------------------------------------------- *
 * Archiviazione
 * ---------------------------------------------------------------- */

function ensureDirs() {
  for (const d of [DATA_DIR, BACKUP_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

/** Scrive sia su console sia su data/server.log: il launcher avvia node senza redirezioni. */
function log(...parts) {
  const line = '[flow] ' + parts.join(' ');
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, new Date().toISOString() + ' ' + line + '\n'); } catch (err) {}
}

function readData() {
  try {
    // Il BOM va tolto: un file salvato da Blocco note o PowerShell lo contiene.
    const raw = fs.readFileSync(DATA_FILE, 'utf8').replace(/^﻿/, '');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // File illeggibile: lo metto da parte invece di sovrascriverlo alla cieca.
      const rescue = path.join(BACKUP_DIR, 'illeggibile-' + stamp() + '.json');
      try {
        fs.copyFileSync(DATA_FILE, rescue);
        trimBackups('illeggibile-', MAX_RESCUE);   // anche questi vanno limitati
      } catch (e) {}
      log('board.json non leggibile, copia salvata in', rescue);
    }
  }
  return null;
}

function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** I nomi contengono la data, quindi l'ordine alfabetico è anche cronologico. */
function listBackups(prefix) {
  try {
    return fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith(prefix) && f.endsWith('.json'))
      .sort();
  } catch (err) {
    return [];
  }
}

/** Tiene solo gli ultimi `keep` file con quel prefisso, cancella i più vecchi. */
function trimBackups(prefix, keep) {
  const files = listBackups(prefix);
  while (files.length > keep) {
    try { fs.unlinkSync(path.join(BACKUP_DIR, files.shift())); } catch (err) { break; }
  }
}

function backupStats() {
  let count = 0, bytes = 0;
  try {
    for (const f of fs.readdirSync(BACKUP_DIR)) {
      if (!f.endsWith('.json')) continue;
      count++;
      bytes += fs.statSync(path.join(BACKUP_DIR, f)).size;
    }
  } catch (err) {}
  return { count, bytes };
}

/**
 * Istante dell'ultima copia, letto dal disco anziché tenuto in memoria:
 * il server si spegne a ogni chiusura della finestra, e una soglia in memoria
 * ripartirebbe da zero a ogni lancio, producendo un backup per avvio.
 */
function lastBackupTime() {
  const files = listBackups('board-');
  if (!files.length) return 0;
  try {
    return fs.statSync(path.join(BACKUP_DIR, files[files.length - 1])).mtimeMs;
  } catch (err) {
    return 0;
  }
}

let lastBackup = 0;

function rotateBackup() {
  if (!fs.existsSync(DATA_FILE)) return;
  const now = Date.now();
  if (now - lastBackup < BACKUP_EVERY_MS) return;
  lastBackup = now;

  try {
    // Niente copie identiche: apri e chiudi l'app senza modifiche sostanziali
    // e la cronologia si riempirebbe di doppioni, buttando fuori quelle utili.
    const files = listBackups('board-');
    if (files.length) {
      const prev = path.join(BACKUP_DIR, files[files.length - 1]);
      if (fs.readFileSync(prev).equals(fs.readFileSync(DATA_FILE))) return;
    }
    fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, `board-${stamp()}.json`));
    trimBackups('board-', MAX_BACKUPS);
  } catch (err) {
    log('backup non riuscito:', err.message);
  }
}

/** Scrittura atomica: file temporaneo + rename, così un crash non tronca l'archivio. */
function writeData(obj) {
  ensureDirs();
  rotateBackup();
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

/* ---------------------------------------------------------------- *
 * Utilità HTTP
 * ---------------------------------------------------------------- */

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req, limitBytes = 64 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limitBytes) { reject(new Error('payload troppo grande')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';

  const full = path.join(APP_DIR, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!full.startsWith(APP_DIR)) { res.writeHead(403); res.end('Vietato'); return; }

  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Non trovato'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
      'Content-Length': buf.length,
      'Cache-Control': 'no-cache'
    });
    res.end(buf);
  });
}

/* ---------------------------------------------------------------- *
 * Battito: se la finestra sparisce, il processo si spegne
 * ---------------------------------------------------------------- */

let lastSeen = Date.now();
let everSeen = false;
const startedAt = Date.now();

setInterval(() => {
  const idle = Date.now() - lastSeen;
  const waited = Date.now() - startedAt;
  if (everSeen && idle > IDLE_TIMEOUT_MS) {
    log('finestra chiusa, arresto del server.');
    shutdown(0);
  } else if (!everSeen && waited > STARTUP_GRACE_MS) {
    log('nessun client collegato, arresto del server.');
    shutdown(0);
  }
}, 5000).unref();

function shutdown(code) {
  try { fs.unlinkSync(PORT_FILE); } catch (e) {}
  process.exit(code);
}

/* ---------------------------------------------------------------- *
 * Instradamento
 * ---------------------------------------------------------------- */

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';

  if (!url.startsWith('/api/')) return serveStatic(req, res, url);

  lastSeen = Date.now();
  everSeen = true;

  try {
    if (url === '/api/health') return sendJSON(res, 200, { app: 'flow', ok: true, pid: process.pid });

    if (url === '/api/ping') return sendJSON(res, 200, { ok: true });

    if (url === '/api/info') {
      const st = backupStats();
      return sendJSON(res, 200, {
        file: DATA_FILE, dir: DATA_DIR,
        backups: st.count, backupBytes: st.bytes, maxBackups: MAX_BACKUPS,
        node: process.version
      });
    }

    if (url === '/api/reveal') {
      const target = fs.existsSync(DATA_FILE) ? DATA_FILE : DATA_DIR;
      spawn('explorer.exe', ['/select,', target], { detached: true, stdio: 'ignore' }).unref();
      return sendJSON(res, 200, { ok: true });
    }

    if (url === '/api/data') {
      if (req.method === 'GET') {
        const data = readData();
        return sendJSON(res, 200, data || {});
      }
      if (req.method === 'PUT' || req.method === 'POST') {
        const body = await readBody(req);
        let parsed;
        try { parsed = JSON.parse(body); } catch (e) {
          return sendJSON(res, 400, { error: 'JSON non valido' });
        }
        if (!parsed || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.projects)) {
          return sendJSON(res, 400, { error: 'struttura inattesa' });
        }
        writeData(parsed);
        return sendJSON(res, 200, { ok: true, bytes: Buffer.byteLength(body) });
      }
      res.writeHead(405); return res.end();
    }

    if (url === '/api/quit') { sendJSON(res, 200, { ok: true }); return setTimeout(() => shutdown(0), 120); }

    return sendJSON(res, 404, { error: 'endpoint sconosciuto' });
  } catch (err) {
    log('errore:', (err && err.stack) || err);
    return sendJSON(res, 500, { error: String(err && err.message || err) });
  }
});

/* ---------------------------------------------------------------- *
 * Avvio con ricerca di una porta libera
 * ---------------------------------------------------------------- */

// I due gestori vanno rimossi a vicenda: altrimenti ogni tentativo fallito ne
// lascia uno appeso e a porta trovata scattano tutti insieme.
function listen(port, attempt) {
  function onError(err) {
    server.removeListener('listening', onListening);
    if (err.code === 'EADDRINUSE' && attempt < PORT_TRIES) return listen(port + 1, attempt + 1);
    log('impossibile avviare il server:', err.message);
    process.exit(1);
  }

  function onListening() {
    server.removeListener('error', onError);
    ensureDirs();
    fs.writeFileSync(PORT_FILE, String(port), 'utf8');
    log('in ascolto su http://127.0.0.1:' + port);
    log('archivio: ' + DATA_FILE);
  }

  server.once('error', onError);
  server.once('listening', onListening);
  server.listen(port, '127.0.0.1');
}

ensureDirs();
try { fs.writeFileSync(LOG_FILE, ''); } catch (err) {}   // un log pulito a ogni avvio
lastBackup = lastBackupTime();                            // la soglia riparte dal disco
if (!fs.existsSync(DATA_FILE)) log('primo avvio: creo ' + DATA_FILE);
listen(PORT_START, 0);

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
