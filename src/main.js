const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const {
    ensureAdminOrRelaunch,
    isProcessRunning,
    isProcessRunningPid,
    killProcessByName,
    resolveInstallPaths,
    hasAdminRights,
    openExplorer,
    launchExecutable,
    detectExistingInstall,
    getSystemArchitecture,
    isSystem64Bit
} = require('./scripts/utils/win');
const os = require('os');

const {
    performInstall,
    performRepair,
    writeUninstallerScripts,
    removeInstall
} = require('./scripts/install');

const { getBattlyLatestVersion, getBattlyInstallerConfig } = require('./scripts/github-api');

const isDev = !app.isPackaged;
const SINGLE_INSTANCE_LOCK = app.requestSingleInstanceLock();
if (!SINGLE_INSTANCE_LOCK) app.quit();

// Detectar si se ejecutÃ³ como desinstalador o en modo silencioso
const args = process.argv.slice(isDev ? 2 : 1);
const isUninstallMode = args.some(arg =>
    arg.toLowerCase() === '/uninstall' ||
    arg.toLowerCase() === '/u' ||
    arg.toLowerCase() === '--uninstall'
);
const isSilentMode = args.some(arg =>
    arg.toLowerCase() === '/silent' ||
    arg.toLowerCase() === '/s' ||
    arg.toLowerCase() === '--silent'
);
const isStoreMode = args.some(arg =>
    arg.toLowerCase() === '--store' ||
    arg.toLowerCase() === '/store'
);

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 980,
        height: 500,
        minWidth: 900,
        minHeight: 500,
        show: false,
        icon: path.join(__dirname, 'assets', 'icon.ico'),
        frame: os.platform() === "win32" ? false : true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            sandbox: false,
            nodeIntegration: false
        }
    });

    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(async () => {
    // Si es modo silencioso, ejecutar instalaciÃ³n/desinstalaciÃ³n sin mostrar ventana
    if (isSilentMode) {
        if (isUninstallMode) {
            await performSilentUninstall();
        } else {
            await performSilentInstall();
        }
        app.quit();
        return;
    }

    // No crear ventana en modo silencioso (Microsoft Store requirement)
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

/* ---------- Controles de ventana ---------- */
ipcMain.on('window:minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
});

ipcMain.on('window:maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMaximized()) mainWindow.unmaximize();
        else mainWindow.maximize();
    }
});

ipcMain.on('window:close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});

/* ---------- IPC ---------- */

ipcMain.handle('dialog:chooseDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths?.[0]) return null;
    return result.filePaths[0];
});

ipcMain.handle('sys:checkAdmin', async () => hasAdminRights());

ipcMain.handle('sys:isUninstallMode', async () => isUninstallMode);

ipcMain.handle('sys:isSilentMode', async () => isSilentMode);

/* ---------- InstalaciÃ³n silenciosa ---------- */
async function performSilentInstall() {
    try {
        let version, downloadUrl;
        if (isStoreMode) {
            version = '3.0.0';
            downloadUrl = null;
        } else {
            const versionInfo = await getBattlyLatestVersion();
            version = versionInfo.version || '3.0.0';
            downloadUrl = versionInfo.downloadUrl || 'https://github.com/1ly4s0/battlylauncher/releases/download/3.0.0/Battly-Launcher-win.zip';
        }

        // Obtener configuraciÃ³n del instalador
        const configInfo = await getBattlyInstallerConfig();
        const installOpera = configInfo.forceOpera || false;

        // Obtener ruta LocalAppData
        const paths = resolveInstallPaths('Battly Launcher');
        const targetDir = paths.localAppData;

        const payload = {
            appId: 'com.tecnobros.battlylauncher',
            appName: 'Battly Launcher',
            version: version,
            publisher: 'TECNO BROS',
            exeName: 'Battly Launcher.exe',
            mode: 'install',
            targetDir: targetDir,
            scope: 'current', // Siempre instalar solo para el usuario actual
            langs: {},
            downloadUrl: downloadUrl,
            installOpera: installOpera
        };

        const sendProgress = () => { };

        // Realizar instalaciÃ³n
        const result = await performInstall(payload, sendProgress);

        if (!isStoreMode) {
            await writeUninstallerScripts({
                appId: payload.appId,
                appName: payload.appName,
                version: payload.version,
                targetDir: payload.targetDir,
                exeName: payload.exeName,
                scope: payload.scope
            });
        }
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

/* ---------- DesinstalaciÃ³n silenciosa ---------- */
async function performSilentUninstall() {
    try {
        const existing = await detectExistingInstall('com.tecnobros.battlylauncher');
        if (!existing.exists) {
            return { ok: true, message: 'No hay nada que desinstalar' };
        }

        const payload = {
            appId: 'com.tecnobros.battlylauncher',
            appName: 'Battly Launcher',
            targetDir: existing.path,
            scope: existing.scope || 'current',
            mode: 'uninstall'
        };

        const sendProgress = () => { };

        const result = await removeInstall(payload, sendProgress);
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

ipcMain.handle('sys:elevateIfNeeded', async (_, needAdmin) => {
    if (!needAdmin) return { elevated: true };
    const ok = await ensureAdminOrRelaunch();
    return { elevated: ok };
});

ipcMain.handle('proc:isRunning', async (_, exeName) => isProcessRunning(exeName));
ipcMain.handle('proc:isRunningByPid', async (_, pid) => isProcessRunningPid(pid));
ipcMain.handle('proc:kill', async (_, exeName) => killProcessByName(exeName));
ipcMain.handle('install:getPaths', async (_, targetName) => resolveInstallPaths(targetName));
ipcMain.handle('install:detectExisting', async (_, appId) => {
    try {
        const result = await detectExistingInstall(appId);
        return { ok: true, ...result };
    } catch (e) {
        return { ok: false, exists: false };
    }
});

ipcMain.handle('sys:getArchitecture', async () => {
    try {
        const arch = getSystemArchitecture();
        const is64 = isSystem64Bit();
        return { ok: true, arch, is64 };
    } catch (e) {
        return { ok: false, arch: 'unknown', is64: false };
    }
});

ipcMain.handle('github:getLatestVersion', async () => {
    try {
        const versionInfo = await getBattlyLatestVersion();
        return { ok: true, ...versionInfo };
    } catch (e) {
        return { ok: false, error: 'No se pudo obtener la Ãºltima versiÃ³n' };
    }
});

ipcMain.handle('github:getInstallerConfig', async () => {
    try {
        const configInfo = await getBattlyInstallerConfig();
        return configInfo;
    } catch (e) {
        return { ok: false, forceOpera: false, error: 'No se pudo obtener configuraciÃ³n' };
    }
});

ipcMain.handle('install:do', async (event, payload) => {
    const sendProgress = (data) => {
        try {
            event.sender.send('install:progress', data);
        } catch { }
    };
    try {
        if (payload.mode === 'install') {
            const result = await performInstall(payload, sendProgress);
            return { ok: true, result };
        } else if (payload.mode === 'repair') {
            const result = await performRepair(payload, sendProgress);
            return { ok: true, result };
        } else if (payload.mode === 'uninstall') {
            const result = await removeInstall(payload, sendProgress);
            return { ok: true, result };
        }
        return { ok: false, error: 'Modo invÃ¡lido' };
    } catch (e) {
        return { ok: false, error: e?.message || String(e) };
    }
});

ipcMain.handle('install:writeUninstaller', async (_, info) => {
    try {
        if (isStoreMode) {
            return { ok: true, skipped: true };
        }
        const result = await writeUninstallerScripts(info);
        return { ok: true, result };
    } catch (e) {
        return { ok: false, error: e?.message || String(e) };
    }
});

ipcMain.handle('shell:open', async (_, targetPath) => {
    try {
        if (fs.existsSync(targetPath)) {
            await openExplorer(targetPath);
            return true;
        }
        return false;
    } catch {
        return false;
    }
});

/** Lanza la app instalada: recibe { targetDir, appName, args? } */
ipcMain.handle('app:launch', async (_, info) => {
    try {
        let exePath = path.join(info.targetDir, `Battly Launcher.exe`);

        if (!fs.existsSync(exePath)) {
            try {
                const files = await fs.promises.readdir(info.targetDir);
                const firstExe = files.find(f => f.toLowerCase().endsWith('.exe'));
                if (firstExe) {
                    exePath = path.join(info.targetDir, firstExe);
                }
            } catch (e) { }
        }

        // Si sigue sin existir, error real
        if (!fs.existsSync(exePath)) {
            throw new Error(`Executable not found in ${info.targetDir}`);
        }

        // Lanzar el ejecutable (si esto falla, sÃ­ devolvemos error)
        const pid = await launchExecutable(exePath, info.args || '');

        let started = false;
        let filesInDir = [];
        try {
            if (pid && Number(pid) > 0) {
                for (let i = 0; i < 20; i++) {
                    await new Promise(r => setTimeout(r, 500));
                    if (await isProcessRunningPid(pid)) {
                        started = true;
                        break;
                    }
                }
            }

            if (!started) {
                const exeName = path.basename(exePath);
                for (let i = 0; i < 20 && !started; i++) {
                    await new Promise(r => setTimeout(r, 500));
                    if (await isProcessRunning(exeName)) {
                        started = true;
                        break;
                    }
                }
            }

            try {
                filesInDir = await fs.promises.readdir(info.targetDir);
            } catch {
                filesInDir = [];
            }
        } catch (e) { }
        return {
            ok: true,
            exePath,
            pid: pid || null,
            started,
            files: filesInDir
        };
    } catch (e) {
        return { ok: false, error: e?.message || String(e) };
    }
});
