// src/scripts/partners/opera.js
// Descarga e instala Opera de forma opcional, robusta y SIN ventana de consola.

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const https = require('https');
const { spawn } = require('child_process');

const OPERA_URL = 'https://net.geo.opera.com/opera/stable/windows?utm_source=battly&utm_medium=pb&utm_campaign=installer';

function send(sendProgress, phase, message, extra = {}) {
    try { sendProgress({ partner: 'opera', phase, message, ...extra }); } catch { }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function fmtBytes(n) {
    if (!n) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0; let v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(1)} ${u[i]}`;
}

function operaExePath() {
    return path.join(os.tmpdir(), 'BattlyInstaller', 'OperaSetup.exe');
}

/** GET con follow-redirects (hasta 5) */
function followGet(url, options = {}, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, options, (res) => {
            const code = res.statusCode || 0;
            if (code >= 300 && code < 400 && res.headers.location) {
                if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
                const next = new URL(res.headers.location, url).toString();
                res.resume();
                return resolve(followGet(next, options, maxRedirects - 1));
            }
            resolve(res);
        });
        req.on('error', reject);
    });
}

/** Descarga con progreso Ã¢â‚¬Å“cada ~2sÃ¢â‚¬Â y opcional % si hay content-length */
async function downloadFile(url, dest, onTick) {
    await fsp.mkdir(path.dirname(dest), { recursive: true });

    const res = await followGet(url, {
        headers: { 'User-Agent': 'BattlyInstaller', 'Accept': 'application/octet-stream' }
    });

    if ((res.statusCode || 0) !== 200) {
        res.resume();
        throw new Error(`HTTP ${res.statusCode}`);
    }

    const total = parseInt(res.headers['content-length'] || '0', 10);
    let downloaded = 0;
    let nextTick = Date.now() + 2000;

    await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        res.on('data', (chunk) => {
            downloaded += chunk.length;
            const now = Date.now();
            if (now >= nextTick) {
                nextTick = now + 2000;
                if (typeof onTick === 'function') {
                    const percent = total ? Math.min(99, Math.floor((downloaded / total) * 100)) : null;
                    onTick({ downloaded, total, percent });
                }
            }
        });
        res.on('end', () => {
            if (typeof onTick === 'function') onTick({ downloaded: total || downloaded, total, percent: total ? 99 : null });
            resolve();
        });
        res.on('error', reject);
        file.on('error', reject);
        res.pipe(file);
    });
}

/** Reintentos con backoff exponencial (1s Ã¢â€ â€™ 2s Ã¢â€ â€™ 4s Ã¢â€ â€™ Ã¢â‚¬Â¦ mÃƒÂ¡x 10s) */
async function withRetries(fn, attempts = 5) {
    let delay = 1000;
    let lastErr;
    for (let i = 1; i <= attempts; i++) {
        try { return await fn(); }
        catch (e) {
            lastErr = e;
            if (i === attempts) break;
            await sleep(Math.min(delay, 10000));
            delay *= 2;
        }
    }
    throw lastErr;
}

/** Quita el Ã¢â‚¬Å“bloqueoÃ¢â‚¬Â de SmartScreen (Zone.Identifier) y su ADS si existe. */
async function unblockFile(fullPath) {
    try {
        // Intento 1: quitar ADS Zone.Identifier
        try { await fsp.unlink(`${fullPath}:Zone.Identifier`); } catch { }
        // Intento 2: PowerShell Unblock-File (sin ventana)
        await new Promise((resolve) => {
            const ps = spawn('powershell.exe',
                ['-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', `Unblock-File -Path "${fullPath.replace(/"/g, '""')}"`],
                { windowsHide: true, stdio: 'ignore', shell: false }
            );
            ps.on('error', () => resolve());
            ps.on('exit', () => resolve());
        });
    } catch { /* silencioso */ }
}

/** Comprueba que el archivo es accesible y no estÃƒÂ¡ vacÃƒÂ­o. */
async function isFileReady(fullPath) {
    try {
        const st = await fsp.stat(fullPath);
        return st.isFile() && st.size > 0;
    } catch { return false; }
}

/** InstalaciÃƒÂ³n silenciosa con reintentos si EBUSY/EPERM/EACCES */
// Sustituye la firma y parte del cuerpo de esta funciÃƒÂ³n:
async function installOperaSilentWithRetries({ allUsers, independent = false }) {
    const exe = operaExePath();
    const args = ['--silent', `--allusers=${allUsers ? 1 : 0}`];

    // pequeÃƒÂ±o respiro tras la descarga por AV/SmartScreen
    await new Promise(r => setTimeout(r, 350));

    for (let attempt = 1; attempt <= 6; attempt++) {
        await unblockFile(exe);

        // Asegura que el archivo estÃƒÂ¡ listo
        try {
            const st = await fsp.stat(exe);
            if (!st.isFile() || st.size === 0) { await new Promise(r => setTimeout(r, 300)); continue; }
        } catch { await new Promise(r => setTimeout(r, 300)); continue; }

        // ---- MODO INDEPENDIENTE: el proceso seguirÃƒÂ¡ aunque cierres el instalador ----
        if (independent) {
            try {
                const child = require('child_process').spawn(exe, args, {
                    windowsHide: true,
                    detached: true,     // clave
                    stdio: 'ignore',
                    shell: false,
                    cwd: require('os').tmpdir()
                });
                child.unref();        // clave
                return true;          // no esperamos resultado; Opera seguirÃƒÂ¡ por su cuenta
            } catch (err) {
                // si falla por EBUSY/EPERM/EACCES reintenta
                const code = (err && err.code) ? String(err.code) : '';
                if (['EBUSY', 'EPERM', 'EACCES'].includes(code)) {
                    await new Promise(r => setTimeout(r, 400 * attempt));
                    continue;
                }
                return false;
            }
        }

        // ---- MODO ESPERADO (como lo tenÃƒÂ­as), reintentando si EBUSY/EPERM/EACCES ----
        const result = await new Promise((resolve) => {
            const child = require('child_process').spawn(exe, args, {
                windowsHide: true,
                detached: false,
                stdio: 'ignore',
                shell: false,
                cwd: require('os').tmpdir()
            });

            let errored = false;
            child.on('error', (err) => {
                errored = true;
                const code = (err && err.code) ? String(err.code) : '';
                if (['EBUSY', 'EPERM', 'EACCES'].includes(code)) return resolve({ retry: true });
                resolve({ retry: false, ok: false });
            });

            child.on('exit', (code) => {
                if (errored) return;
                resolve({ retry: false, ok: code === 0 });
            });
        });

        if (result.ok) return true;
        if (!result.retry) return false;

        await new Promise(r => setTimeout(r, 400 * attempt));
    }

    return false;
}

/**
 * Punto de entrada: instala Opera si payload.installOpera === true.
 * - Descarga con reintentos y progreso cada ~2s
 * - Ã¢â‚¬Å“DesbloqueaÃ¢â‚¬Â el archivo y reintenta si el spawn da EBUSY/EPERM/EACCES
 * - SILENCIOSO (sin ventana de consola)
 * - No lanza error fatal: informa por logs y continÃƒÂºa
 */
async function installOperaIfRequested(payload, sendProgress) {
    try {
        if (!payload?.installOpera) {
                        return;
        }

                send(sendProgress, 'start', 'Descargando OperaÃ¢â‚¬Â¦');
        const exe = operaExePath();

        // Descarga con reintentos mejorados
        await withRetries(async () => {
            await downloadFile(OPERA_URL, exe, ({ downloaded, total, percent }) => {
                const msg = total
                    ? `Opera ${percent ?? 0}% Ã¢â‚¬â€ ${fmtBytes(downloaded)} / ${fmtBytes(total)}`
                    : `Opera Ã¢â‚¬â€ ${fmtBytes(downloaded)} descargados`;
                send(sendProgress, 'progress', msg, { percent: percent ?? null, downloaded, total });
            });
        });

        // Verificar que el archivo existe y tiene tamaÃƒÂ±o vÃƒÂ¡lido
        const stats = await fsp.stat(exe);
        if (stats.size < 1000000) { // Menos de 1MB es sospechoso
            throw new Error(`Archivo descargado invÃƒÂ¡lido (${fmtBytes(stats.size)})`);
        }
        console.log(`Ã¢Å“â€œ Opera descargado correctamente (${fmtBytes(stats.size)})`);

        send(sendProgress, 'downloaded', 'Opera descargado. Instalando en modo silenciosoÃ¢â‚¬Â¦');

        // InstalaciÃƒÂ³n con reintentos
        const ok = await installOperaSilentWithRetries({ allUsers: payload.scope === 'all' });
        if (ok) {
                        send(sendProgress, 'done', 'Opera instalado correctamente.');
        } else {
                        send(sendProgress, 'done', 'Opera finalizÃƒÂ³ (posiblemente ya estaba instalado).');
        }

    } catch (err) {
                // Importante: no rompemos la instalaciÃƒÂ³n principal
        send(sendProgress, 'error', `No se pudo instalar Opera: ${err.message}`);
    } finally {
        // Limpieza
        try {
            await fsp.unlink(operaExePath());
                    } catch { }
    }
}

module.exports = { installOperaIfRequested };
