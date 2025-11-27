const { exec, spawn } = require('child_process');
const path = require('path');
const os = require('os');

function run(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, { windowsHide: true }, (err, stdout, stderr) => {
            if (err) return reject(err);
            resolve((stdout || '').trim());
        });
    });
}

async function isProcessRunning(exeName) {
    if (!exeName) return false;
    try {
        const out = await run(`tasklist /FI "IMAGENAME eq ${exeName}"`);
        return out.toLowerCase().includes(exeName.toLowerCase());
    } catch {
        return false;
    }
}

async function killProcessByName(exeName) {
    if (!exeName) return true;
    try {
        // intento con PowerShell (nombre sin .exe)
        await run(`powershell -NoProfile -ExecutionPolicy Bypass "Get-Process -Name '${exeName.replace(/\.exe$/i, '')}' -ErrorAction SilentlyContinue | Stop-Process -Force"`);
        const running = await isProcessRunning(exeName);
        if (running) await run(`taskkill /IM "${exeName}" /F`);
        return !(await isProcessRunning(exeName));
    } catch {
        return false;
    }
}

async function hasAdminRights() {
    try {
        const out = await run('whoami /groups');
        return /S-1-5-32-544/i.test(out); // Administrators SID
    } catch {
        return false;
    }
}

async function ensureAdminOrRelaunch() {
    const isAdmin = await hasAdminRights();
    if (isAdmin) return true;

    // No es admin, necesitamos relanzar con elevaciÃ³n
    const exe = process.execPath;
    const args = process.argv.slice(1).filter(a => a !== '--elevated');

    // En desarrollo, usar electron con los argumentos del script
    const isDev = !require('electron').app.isPackaged;
    let psCmd;

    if (isDev) {
        // En desarrollo: relanzar Electron con el script principal
        const mainScript = args[0] || '.';
        const restArgs = args.slice(1).join(' ');
        psCmd = `Start-Process -FilePath '${exe.replace(/'/g, "''")}' -ArgumentList '${mainScript.replace(/'/g, "''")} ${restArgs} --elevated' -Verb RunAs -Wait`;
    } else {
        // En producciÃ³n: relanzar el ejecutable empaquetado
        const argsStr = args.join(' ');
        psCmd = `Start-Process -FilePath '${exe.replace(/'/g, "''")}' -ArgumentList '${argsStr.replace(/'/g, "''")} --elevated' -Verb RunAs -Wait`;
    }

    const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCmd}"`;

    try {
        // Intentar relanzar con privilegios
        console.log('Solicitando elevaciÃ³n de privilegios...');
        await run(cmd);
        // Si llegamos aquÃ­, el proceso elevado terminÃ³, cerramos este proceso no-elevado
        process.exit(0);
    } catch (err) {
        console.error('No se pudo elevar privilegios:', err);
        return false;
    }
}

/**
 * Devuelve rutas base Ãºtiles para instalaciÃ³n.
 * - startMenuAllBase: MenÃº Inicio comÃºn (requiere admin para escribir)
 * - startMenuUserBase: MenÃº Inicio del usuario actual
 * - desktopAll: Escritorio compartido
 * - desktopCur: Escritorio del usuario actual
 */
function resolveInstallPaths(appName) {
    const localAppData = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', appName);
    const programFiles = path.join(process.env['ProgramFiles'] || 'C:\\Program Files', appName);

    const startMenuAllBase = path.join(process.env['ProgramData'] || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    const startMenuUserBase = path.join(process.env['APPDATA'] || path.join(os.homedir(), 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');

    const desktopAll = path.join(process.env['Public'] || 'C:\\Users\\Public', 'Desktop');
    const desktopCur = path.join(os.homedir(), 'Desktop');

    return {
        localAppData,
        programFiles,
        startMenuAllBase,
        startMenuUserBase,
        desktopAll,
        desktopCur
    };
}

async function regAdd(pathKey, name, type, data, scope = 'all') {
    const hive = scope === 'all' ? 'HKLM' : 'HKCU';
    const cmd = `reg add "${hive}\\${pathKey}" /v "${name}" /t ${type} /d "${(data || '').replace(/"/g, '\\"')}" /f`;
    await run(cmd);
}

async function regDelete(pathKey, scope = 'all') {
    const hive = scope === 'all' ? 'HKLM' : 'HKCU';
    try {
        await run(`reg delete "${hive}\\${pathKey}" /f`);
    } catch {
        // ignorar si no existe
    }
}

/** Escapa comillas simples para PowerShell ('' dentro de '...') */
function psq(str = '') {
    return String(str).replace(/'/g, "''");
}

/**
 * Crea un acceso directo .lnk con PowerShell (WScript.Shell).
 * Usa comillas simples en PowerShell para evitar conflictos con rutas con espacios/\\.
 */
async function createShortcut(linkPath, targetPath, args = '', iconPath = '') {
    const icon = iconPath || targetPath;
    const workDir = path.dirname(targetPath);

    const script = [
        "$ErrorActionPreference = 'Stop'",
        "$WshShell = New-Object -ComObject WScript.Shell",
        `$Shortcut = $WshShell.CreateShortcut('${psq(linkPath)}')`,
        `$Shortcut.TargetPath = '${psq(targetPath)}'`,
        `$Shortcut.Arguments = '${psq(args)}'`,
        `$Shortcut.IconLocation = '${psq(icon)},0'`,
        `$Shortcut.WorkingDirectory = '${psq(workDir)}'`,
        '$Shortcut.Save()'
    ].join('; ');

    const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "& { ${script} }"`;
    await run(cmd);
}

/**
 * Lanza un ejecutable usando spawn (sin PowerShell) y devuelve el PID.
 * El proceso va desacoplado del instalador (detached) para que pueda cerrarse el instalador sin matar Battly.
 */
async function launchExecutable(filePath, args = '') {
    return new Promise((resolve) => {
        try {
            const cwd = path.dirname(filePath);

            let argsArray = [];
            if (args && typeof args === 'string' && args.trim().length > 0) {
                const matches = args.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
                argsArray = matches.map(s => s.replace(/^"|"$/g, ''));
            }

            const child = spawn(filePath, argsArray, {
                cwd,
                detached: true,
                stdio: 'ignore',
                windowsHide: true
            });

            child.on('error', () => {
                resolve(0);
            });

            child.unref();

            const pid = child.pid || 0;
            resolve(pid);
        } catch (e) {
            resolve(0);
        }
    });
}

/** Comprueba si un proceso existe por PID */
async function isProcessRunningPid(pid) {
    if (!pid || Number(pid) <= 0) return false;
    try {
        const out = await run(`tasklist /FI "PID eq ${Number(pid)}"`);
        return out.toLowerCase().includes(String(pid));
    } catch { return false; }
}

async function openExplorer(p) {
    await run(`explorer "${p}"`);
}

/**
 * Detecta si la aplicaciÃ³n ya estÃ¡ instalada buscando en el registro
 */
async function detectExistingInstall(appId) {
    try {
        // Buscar en HKLM (instalaciÃ³n para todos)
        const hklmOut = await run(`reg query "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appId}" /v InstallLocation 2>nul`);
        if (hklmOut && hklmOut.includes('InstallLocation')) {
            const match = hklmOut.match(/InstallLocation\s+REG_SZ\s+(.+)/);
            if (match && match[1]) {
                const installPath = match[1].trim();
                const version = await getInstalledVersion(appId, 'all');
                return { exists: true, path: installPath, scope: 'all', version };
            }
        }
    } catch { }

    try {
        // Buscar en HKCU (instalaciÃ³n solo para usuario actual)
        const hkcuOut = await run(`reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appId}" /v InstallLocation 2>nul`);
        if (hkcuOut && hkcuOut.includes('InstallLocation')) {
            const match = hkcuOut.match(/InstallLocation\s+REG_SZ\s+(.+)/);
            if (match && match[1]) {
                const installPath = match[1].trim();
                const version = await getInstalledVersion(appId, 'current');
                return { exists: true, path: installPath, scope: 'current', version };
            }
        }
    } catch { }

    return { exists: false, path: null, scope: null, version: null };
}

/**
 * Obtiene la versiÃ³n instalada desde el registro
 */
async function getInstalledVersion(appId, scope = 'all') {
    try {
        const hive = scope === 'all' ? 'HKLM' : 'HKCU';
        const out = await run(`reg query "${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appId}" /v DisplayVersion 2>nul`);
        if (out && out.includes('DisplayVersion')) {
            const match = out.match(/DisplayVersion\s+REG_SZ\s+(.+)/);
            if (match && match[1]) return match[1].trim();
        }
    } catch { }
    return null;
}

/**
 * Detecta la arquitectura del sistema (x64 o x86)
 */
function getSystemArchitecture() {
    // process.arch devuelve la arquitectura del proceso Node (puede ser x64 o ia32)
    // Para detectar la arquitectura real del sistema, usamos variables de entorno
    const arch = process.env.PROCESSOR_ARCHITECTURE || '';
    const arch6432 = process.env.PROCESSOR_ARCHITEW6432 || '';

    // Si PROCESSOR_ARCHITEW6432 existe, significa que estamos en un proceso 32-bit en sistema 64-bit
    if (arch6432.toLowerCase().includes('amd64') || arch6432.toLowerCase().includes('x64')) {
        return 'x64';
    }

    // Si no, chequeamos PROCESSOR_ARCHITECTURE
    if (arch.toLowerCase().includes('amd64') || arch.toLowerCase().includes('x64')) {
        return 'x64';
    }

    return 'x86';
}

/**
 * Verifica si el sistema es de 64 bits
 */
function isSystem64Bit() {
    return getSystemArchitecture() === 'x64';
}

module.exports = {
    run,
    isProcessRunning,
    killProcessByName,
    hasAdminRights,
    ensureAdminOrRelaunch,
    resolveInstallPaths,
    regAdd,
    regDelete,
    createShortcut,
    launchExecutable,
    isProcessRunningPid,
    openExplorer,
    detectExistingInstall,
    getInstalledVersion,
    getSystemArchitecture,
    isSystem64Bit
};
