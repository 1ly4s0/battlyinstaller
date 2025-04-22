/* eslint-disable no-console */
'use strict';

/**
 * Battly Launcher Installer — Versión 2025‑04‑22 (v2.6)
 * @author TECNO BROS
 */

const { ipcRenderer, shell } = require('electron');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const https = require('https');
const { execSync, exec, spawn, fork } = require('child_process');
const windowsShortcuts = require('windows-shortcuts');

/* ──────────────────────────────
 * 0. MANEJADORES GLOBALES
 * ────────────────────────────── */
function registerGlobalHandlers() {
    process.on('uncaughtException', err => { console.error(err); log(`❌ ${LangStrings['installation-failed']}: ${err.message}`); });
    process.on('unhandledRejection', err => { console.error(err); log(`❌ ${LangStrings['installation-failed']}: ${err}`); });
}
registerGlobalHandlers();

/* ──────────────────────────────
 * 1. CONFIGURACIÓN BÁSICA
 * ────────────────────────────── */
const language = localStorage.getItem('lang') || 'es';
const LangStrings = (await import(`./langs/${language}.js`)).default;

/* ----- CONFIG REMOTA (Opera) ----- */
const CONFIG_URL = 'https://api.battlylauncher.com/v2/launcher/config-launcher/config.json';
let forceInstallOpera = false;
try {
    const remoteCfg = await(await fetch(CONFIG_URL, { cache: 'no-store' })).json();
    forceInstallOpera = remoteCfg?.installer?.installOpera === true;
    console.log('[Config] installer.installOpera =', forceInstallOpera);
} catch {/* silencio */ }
/* --------------------------------- */

const RELEASE_API = 'https://api.github.com/repos/1ly4s0/battlylauncher/releases';
const TEMP_DIR = path.join(process.env.LOCALAPPDATA, 'Temp', 'Battly Launcher');
const PROGRAMS_APPDATA = path.join(process.env.LOCALAPPDATA, 'Programs');
const SYSTEM_PATH = path.join(process.env.ProgramFiles, 'Battly Launcher');
const USER_PATH = path.join(PROGRAMS_APPDATA, 'Battly Launcher');
const userName = process.env.USERNAME;
const MAKEDIR_PROGRESS = 20;

/* --- Selección de ZIP por arquitectura --- */
const archAliases = { ia32: 'win-ia32.zip', x32: 'win-ia32.zip', x64: 'win.zip', arm64: 'win.zip', arm: 'win.zip' };
const zipName = `Battly-Launcher-${archAliases[process.arch] || 'win.zip'}`;
/* ------------------------------------------ */

let typeOfInstall = 'user';
let installationPath = USER_PATH;
let battlyFolder = USER_PATH;
let installOpera = forceInstallOpera;   // parte de la config remota
let operaEndedInstall = false;
let battlyVersion = '';
let currentIndex = 1;
let optionSelectedInstall = 'instalacion';

const paths = {
    system: SYSTEM_PATH,
    user: USER_PATH,
    custom: LangStrings['custom-path'],
};

const battlyZIP = path.join(TEMP_DIR, zipName);
const asarPath = path.join(TEMP_DIR, zipName);

const indexInstallPages = [
    'language',
    'eula-container',
    'install-container',
    'install-path-container',
    'accept-external-program-container',
    'install-logs-container',
];

/* ──────────────────────────────
 * 2. HELPERS UI / PROGRESS
 * ────────────────────────────── */
const qs = sel => document.querySelector(sel);
const logA = qs('#install-logs');

let installationFailed = false;

const log = m => { logA.textContent += `\n${m}`; logA.scrollTop = logA.scrollHeight; };
const logInline = m => { if (!installationFailed) { logA.textContent += m; logA.scrollTop = logA.scrollHeight; } };
const logNl = m => log(`\n${m}`);

const progress = { value: 0, set: v => { progress.value = v; qs('#progress').style.width = `${v}%`; } };
const fail = () => { installationFailed = true; log(`❌ ${LangStrings['installation-failed']}`); progress.set(0); };

const exists = async p => !!(await fsp.access(p).then(() => true).catch(() => false));
const makeDirectories = async (...folders) => {
    const delta = (MAKEDIR_PROGRESS - progress.value) / folders.length;
    for (const dir of folders) {
        if (await exists(dir)) { log(`✅ ${LangStrings['the-folder-already-exists']}: ${dir}`); progress.set(progress.value + delta); continue; }
        try { await fsp.mkdir(dir, { recursive: true }); log(`✅ ${LangStrings['folder-created']}: ${dir}`); progress.set(progress.value + delta); }
        catch (e) { log(`❌ ${LangStrings['error-creating-folder']}: ${dir}\n❌ ${e.message}`); qs('#progress-bar').classList.replace('success', 'error'); return e; }
    }
};

/* ──────────────────────────────
 * 3. DETECCIÓN / CIERRE DE BATTLY
 * ────────────────────────────── */
const TASK_EXE = 'Battly Launcher.exe';

function isBattlyRunning() {
    try {
        const out = execSync(`tasklist /FI "IMAGENAME eq ${TASK_EXE}" /NH`, { encoding: 'utf8' });
        return out.toLowerCase().includes(TASK_EXE.toLowerCase());
    } catch { return false; }
}

async function ensureBattlyClosed() {
    if (!isBattlyRunning()) return;

    // Abre el Administrador de tareas para que el usuario vea el proceso
    spawn('taskmgr', { detached: true, stdio: 'ignore' }).unref();
    log(`⚠️  ${LangStrings['battly-is-running']}`);

    let keepTrying = true;
    while (keepTrying && isBattlyRunning()) {
        const ask = confirm(LangStrings['close-battly-question'] || '');
        if (!ask) {
            log(`❌ ${LangStrings['installation-aborted']}`);
            throw new Error('Battly running');
        }
        try {
            execSync(`taskkill /F /IM "${TASK_EXE}"`, { stdio: 'ignore' });
            await new Promise(r => setTimeout(r, 1500)); // espera a que Windows lo quite
            keepTrying = false;
        } catch (e) {
            alert(LangStrings['cannot-close-battly']);
        }
    }
    log(`✅ ${LangStrings['battly-closed-successfully']}`);
}

/* ──────────────────────────────
 * 4. DESCARGA HTTP (follow‑redirect)
 * ────────────────────────────── */
function downloadFile(url, dest, onProgress = _ => { }, retries = 3) {
    return new Promise((resolve, reject) => {
        const attempt = (currentUrl, left) => {
            https.get(currentUrl,
                { headers: { 'User-Agent': 'BattlyInstaller', Accept: 'application/octet-stream' } },
                res => {
                    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        return attempt(new URL(res.headers.location, currentUrl).toString(), left);
                    }
                    if (res.statusCode !== 200) return left ? attempt(currentUrl, left - 1) : reject(new Error(`HTTP ${res.statusCode}`));

                    const total = parseInt(res.headers['content-length'] || '0', 10);
                    let downloaded = 0, last = 0;
                    const file = fs.createWriteStream(dest);
                    res.on('data', b => {
                        downloaded += b.length;
                        if (total && !installationFailed) {
                            const pct = Math.round(100 * downloaded / total);
                            if (pct - last >= 5) { onProgress(pct); last = pct; }
                        }
                    });
                    res.pipe(file);
                    file.on('finish', () => file.close(resolve));
                    file.on('error', err => reject(err));
                }
            ).on('error', err => (left ? attempt(currentUrl, left - 1) : reject(err)));
        };
        attempt(url, retries);
    });
}

/* ──────────────────────────────
 * 5. ZIP: descarga + extracción
 * ────────────────────────────── */
async function downloadZIP() {
    log(`🔍 ${zipName} `);
    const headers = { 'User-Agent': 'BattlyInstaller/1.0', 'Accept': 'application/vnd.github+json' };

    let releases;
    try {
        const res = await fetch(RELEASE_API, { headers });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        releases = await res.json();
    } catch (err) {
        log(`❌ GitHub API: ${err.message}`);
        return fallbackDownload();
    }

    let asset = releases?.[0]?.assets?.find(a => a.name.toLowerCase() === zipName.toLowerCase());
    if (!asset && zipName !== 'battly-launcher-win.zip') {
        asset = releases?.[0]?.assets?.find(a => a.name.toLowerCase() === 'battly-launcher-win.zip');
    }
    if (!asset) return fallbackDownload();

    battlyVersion = releases[0].tag_name;
    await downloadFile(asset.browser_download_url, battlyZIP, p => logInline(`${p}%… `));
    return;

    async function fallbackDownload() {
        log('⚠️  Usando enlace directo de fallback');
        const url = `https://github.com/1ly4s0/battlylauncher/releases/latest/download/${zipName}`;
        await downloadFile(url, battlyZIP, p => logInline(`${p}%… `));
    }
}

function extractInChildProcess(zipPath, outDir) {
    return new Promise((resolve, reject) => {
        const child = fork(path.join(__dirname, 'assets', 'js', 'extract-worker.js'), [zipPath, outDir]);
        child.on('message', m => m.status === 'success' ? resolve() : reject(new Error(m.message)));
        child.once('error', reject);
        child.once('exit', code => code !== 0 && reject(new Error(`extract-worker exit ${code}`)));
    });
}

async function installZIP() {
    const outDir = typeOfInstall === 'custom' ? path.join(battlyFolder, 'Battly Launcher') : battlyFolder;
    log(`🔃 ${LangStrings['extracting-battly']}…`);
    await extractInChildProcess(asarPath, outDir);
    log(`✅ ${LangStrings['battly-extracted-successfully-to']} ${outDir}`);
    progress.set(70);
}

/* ──────────────────────────────
 * 6. OPERA (descarga + instalación)
 * ────────────────────────────── */
const OPERA_URL = 'https://net.geo.opera.com/opera/stable/windows?utm_source=battly&utm_medium=pb&utm_campaign=installer';
async function downloadAndInstallOpera({ retries = 10, onProgress = _ => { } } = {}) {
    if (!(forceInstallOpera || installOpera)) return;
    const operaExe = path.join(TEMP_DIR, 'OperaSetup.exe');
    if (!fs.existsSync(TEMP_DIR)) await fsp.mkdir(TEMP_DIR, { recursive: true });

    try {
        await downloadFile(OPERA_URL, operaExe, pct => onProgress(pct), 1);
        await new Promise(res => {
            const proc = spawn(operaExe, ['--silent', '--allusers=0'], { detached: true, stdio: 'ignore' });
            proc.on('exit', code => { code === 0 ? log(`✅ ${LangStrings['opera-installed-successfully']}`) : log(`❌ Opera exit ${code}`); res(); });
            proc.unref();
        });
        operaEndedInstall = true;
    } catch (err) {
        log(`❌ ${LangStrings['error-installing-opera']}: ${err.message}`);
        if (--retries) {
            await new Promise(r => setTimeout(r, 800));
            return downloadAndInstallOpera({ retries, onProgress });
        }
        log(`⚠️  ${LangStrings['opera-installation-aborted']}`);
    }
}

/* ──────────────────────────────
 * 7. ACCIONES POST‑INSTALACIÓN
 * ────────────────────────────── */
async function addShortcut(target, icon, location) {
    try {
        await windowsShortcuts.create(location, { target, description: 'Battly Launcher', icon });
        const place = location.includes('Desktop') ? LangStrings['to-the-desktop'] : LangStrings['to-the-menu'];
        log(`✅ ${LangStrings['added']} Battly Launcher ${place}`);
    } catch (e) { log(`❌ ${LangStrings['error-adding']} Battly Launcher: ${e.message}`); }
}

async function addRegistry(global = true) {
    const HK = global ? 'HKLM' : 'HKCU';
    const ps = `
    $p      = "${installationPath.replace(/\\/g, '\\\\')}"
    $exe    = "$p\\\\Battly Launcher.exe"
    $key    = "${HK}:\\\\SOFTWARE\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\Battly Launcher"
    $props  = @{
      DisplayName     = "Battly Launcher"
      DisplayIcon     = $exe
      UninstallString = "$p\\\\uninstall.bat"
      Publisher       = "TECNO BROS"
      DisplayVersion  = "${battlyVersion}"
      Description     = "${LangStrings['the-best-launcher']}"
      URLInfoAbout    = "https://www.battlylauncher.com"
      EstimatedSize   = (Get-Item $exe).length/1KB
      InstallLocation = $p
      NoModify        = 1
      NoRepair        = 1
      SystemComponent = 0
    }
    New-Item -Path $key -Force | Out-Null
    foreach($kv in $props.GetEnumerator()){ Set-ItemProperty -Path $key -Name $kv.Key -Value $kv.Value }
  `;
    try { execSync(ps, { shell: 'powershell.exe', stdio: 'ignore' }); }
    catch (e) { log(`⚠️ Registro: ${e.message}`); }
}

/* ──────────────────────────────
 * 8. NAVEGACIÓN UI
 * ────────────────────────────── */
const showPage = idx => { qs(`#${indexInstallPages[currentIndex]}`).style.display = 'none'; qs(`#${indexInstallPages[idx]}`).style.display = 'block'; currentIndex = idx; };
const updateNav = () => { qs('#back').toggleAttribute('disabled', currentIndex <= 1); qs('#reject').style.display = currentIndex === 4 ? 'block' : 'none'; };

/* ──────────────────────────────
 * 9. CLI DE INSTALACIÓN
 * ────────────────────────────── */
async function StartInstall() {
    try {
        /* 0. Cierra Battly si está abierto */
        await ensureBattlyClosed();

        /* 1. Carpetas */
        logInline(`🔃 ${LangStrings['creating-required-folders']}`);
        if (typeOfInstall === 'custom') {
            installationPath = path.join(battlyFolder, 'Battly Launcher');
            if (await makeDirectories(TEMP_DIR, PROGRAMS_APPDATA, installationPath)) return fail();
        } else if (await makeDirectories(TEMP_DIR, PROGRAMS_APPDATA, battlyFolder)) return fail();
        log(`✅ ${LangStrings['folders-created-successfully']}`); progress.set(10);

        /* 2. Descarga Battly */
        logNl(`🔃 ${LangStrings['downloading-battly-file']}`); await downloadZIP();
        log(`✅ ${LangStrings['battly-file-downloaded-successfully']}`); progress.set(50);

        /* 3. Extrae */
        logNl(`🔃 ${LangStrings['extracting-battly']}`); await installZIP();

        /* 4. Opera (paralelo) */
        downloadAndInstallOpera();

        /* 5. Shortcuts + registro */
        progress.set(75); logNl(`🔃 ${LangStrings['adding-battly-to-the-programs-list']}`);
        const icon = path.join(battlyFolder, 'resources', 'app', 'src', 'assets', 'images', 'icon.ico');
        const exe = path.join(battlyFolder, 'Battly Launcher.exe');
        await addShortcut(exe, icon, path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Battly Launcher.lnk'));
        await addShortcut(exe, icon, path.join(require('os').homedir(), 'Desktop', 'Battly Launcher.lnk'));

        ipcRenderer.send('admin-permission-2');
        ipcRenderer.once('admin-permission-response-2', async (_, _ok) => {
            await addRegistry(_ok === 'accepted');
            log(`✅ ${LangStrings['battly-added-successfully-to-the-programs-list']}`); progress.set(85);

            /* 6. Limpieza */
            logNl(`🔃 ${LangStrings['cleaning-temporary-files']}`); await fsp.unlink(battlyZIP).catch(() => { });
            log(`✅ ${LangStrings['temporary-files-cleaned-successfully']}`); progress.set(95);

            /* 7. Fin */
            qs('#back').setAttribute('disabled', 'true'); qs('#next').removeAttribute('disabled');
            logNl(`✅ ${LangStrings['installation-completed-successfully']}`); progress.set(100);
            qs('#next').addEventListener('click', () => {
                spawn(`"${exe}"`, { detached: true, stdio: 'ignore' }).unref();
                setTimeout(() => ipcRenderer.send('close'), 2000);
            }, { once: true });
        });
    } catch { fail(); }
}

/* ──────────────────────────────
 * 10. INICIALIZACIÓN UI
 * ────────────────────────────── */
qs('#system-text').textContent = SYSTEM_PATH.replace(/\\/g, '/');
qs('#user-text').textContent = USER_PATH.replace(/\\/g, '/');
qs('#custom-text').textContent = paths.custom;
qs('#user-text-only-for').textContent = `${LangStrings['only-for']} ${userName}`;

/* Botón Rechazar Opera */
qs('#reject').addEventListener('click', () => {
    if (forceInstallOpera) {
        // alert(LangStrings['opera-forced'] || 'Opera se instalará automáticamente como parte de esta instalación.');
        installOpera = confirm(LangStrings['are-you-sure-opera']);
        installOpera = true; qs('#next').click(); return;
    }
    installOpera = confirm(LangStrings['are-you-sure-opera']);
    qs('#next').click();
});

/* EULA */
qs('#checkbox-accept-eula').addEventListener('change', e => e.target.checked ? qs('#next').removeAttribute('disabled') : qs('#next').setAttribute('disabled', 'true'));

/* Carpeta custom */
qs('#open-folder-btn').addEventListener('click', () => {
    ipcRenderer.send('open-folder-dialog');
    ipcRenderer.once('selected-directory', (_, dir) => {
        if (dir === 'permisos_rechazados') { qs('#next').setAttribute('disabled', 'true'); qs('#custom-text').textContent = LangStrings['you-dont-have-write-permissions']; }
        else { qs('#next').removeAttribute('disabled'); qs('#custom-text').textContent = dir; installationPath = dir; battlyFolder = dir; typeOfInstall = 'custom'; paths.custom = dir; }
    });
});

/* Radio ruta instalación */
qs('#installation-path-options').addEventListener('click', e => {
    if (e.target.tagName !== 'INPUT') return;
    document.querySelectorAll('.check-container input').forEach(i => (i.checked = false));
    e.target.checked = true;
    const v = e.target.value;
    if (v === 'custom') qs('#open-folder-btn').click(); else { installationPath = paths[v]; battlyFolder = installationPath; typeOfInstall = v; }
});

/* Radio instalar / reparar / desinstalar */
qs('#select-options-install').addEventListener('click', e => {
    if (e.target.tagName !== 'INPUT') return;
    optionSelectedInstall = e.target.value;
    const g = e.target.closest('.radio-group'), idx = [...g.querySelectorAll('input')].indexOf(e.target);
    g.setAttribute('selected-index', idx); g.style.setProperty('--index', idx);
});

/* BACK / NEXT */
qs('#back').addEventListener('click', () => { showPage(currentIndex - 1); updateNav(); });
qs('#next').addEventListener('click', async () => {
    if (currentIndex === 5 && optionSelectedInstall === 'desinstalar') return ipcRenderer.send('open-uninstall-panel');
    showPage(currentIndex + 1); updateNav();
    if (currentIndex === 5) {
        qs('#next').setAttribute('disabled', 'true'); qs('#back').setAttribute('disabled', 'true'); qs('#next').textContent = LangStrings['installing-battly'];
        fetch('https://api.battlylauncher.com/api/battlylauncher/installer/download?downloadedOpera=true');
        await StartInstall();
        qs('#next').removeAttribute('disabled'); qs('#next').textContent = LangStrings['end'];
    } else if (currentIndex === 4 && (typeOfInstall === 'system' || typeOfInstall === 'custom')) {
        ipcRenderer.send('admin-permission', language);
        ipcRenderer.once('admin-permission-response', (_, ok) => ok === 'accepted' ? qs('#next').removeAttribute('disabled') : qs('#back').click());
    }
});

/* Estado inicial */
qs('#back').setAttribute('disabled', 'true');
