/* src/scripts/install.js */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { pipeline, Readable, Transform } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);

// 🗡️ Opera: se intentará instalar en paralelo (silent & detached)
const { installOperaIfRequested } = require('./partners/opera');
const { generateUninstallerBat, createUninstallerShortcut } = require('./uninstaller-builder');

const { run, regAdd, regDelete, createShortcut, resolveInstallPaths } = require('./utils/win');

async function removeDirSafe(dir) { try { await fsp.rm(dir, { recursive: true, force: true }); } catch { } }
function getUninstallRegPath(appId) { return `Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appId}`; }

/* -------------------- Registro de desinstalación -------------------- */
async function registerUninstall(payload) {
    const { appId, appName, version, publisher, targetDir, scope } = payload;
    const regPath = getUninstallRegPath(appId);
    const displayIcon = path.join(targetDir, `${appName}.exe`);
    const uninstallerExe = path.join(targetDir, 'uninstall.exe');
    const uninstallPs1 = path.join(targetDir, 'uninstall.ps1');

    // Determinar qué comando usar (exe si existe, sino PowerShell)
    let uninstallCmd;
    let quietUninstallCmd;
    if (fs.existsSync(uninstallerExe)) {
        // Usar el instalador como desinstalador con flag /uninstall
        uninstallCmd = `"${uninstallerExe}" /uninstall`;
        quietUninstallCmd = `"${uninstallerExe}" /uninstall /quiet`;
    } else {
        // Fallback al PowerShell script
        uninstallCmd = `"powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "${uninstallPs1}"`;
        quietUninstallCmd = `"powershell.exe" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "${uninstallPs1}" /quiet`;
    }

    await regAdd(regPath, 'DisplayName', 'REG_SZ', appName, scope);
    await regAdd(regPath, 'DisplayVersion', 'REG_SZ', version, scope);
    await regAdd(regPath, 'Publisher', 'REG_SZ', publisher, scope);
    await regAdd(regPath, 'InstallLocation', 'REG_SZ', targetDir, scope);
    await regAdd(regPath, 'DisplayIcon', 'REG_SZ', displayIcon, scope);
    await regAdd(regPath, 'UninstallString', 'REG_SZ', uninstallCmd, scope);
    await regAdd(regPath, 'QuietUninstallString', 'REG_SZ', quietUninstallCmd, scope);
    await regAdd(regPath, 'NoModify', 'REG_DWORD', '1', scope);
    await regAdd(regPath, 'NoRepair', 'REG_DWORD', '0', scope);

    const now = new Date();
    const y = String(now.getFullYear()), m = String(now.getMonth() + 1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0');
    await regAdd(regPath, 'InstallDate', 'REG_SZ', `${y}${m}${d}`, scope);
}

async function unregisterUninstall({ appId, scope }) {
    await regDelete(getUninstallRegPath(appId), scope);
}

/* -------------------- Accesos directos -------------------- */
async function createStartMenuAndDesktopShortcuts(payload) {
    const { appName, targetDir, scope } = payload;
    const exePath = path.join(targetDir, `${appName}.exe`);
    const paths = resolveInstallPaths(appName);

    // Menú Inicio
    let startMenuBase = scope === 'all' ? paths.startMenuAllBase : paths.startMenuUserBase;
    let startMenuFolder = path.join(startMenuBase, appName);
    try { await fsp.mkdir(startMenuFolder, { recursive: true }); }
    catch (e) {
        if (scope === 'all') {
            startMenuBase = paths.startMenuUserBase;
            startMenuFolder = path.join(startMenuBase, appName);
            await fsp.mkdir(startMenuFolder, { recursive: true });
        } else throw e;
    }
    const startLink = path.join(startMenuFolder, `${appName}.lnk`);
    await createShortcut(startLink, exePath, '', exePath);

    // Escritorio
    const desktopTarget = scope === 'all' ? paths.desktopAll : paths.desktopCur;
    try { await fsp.mkdir(desktopTarget, { recursive: true }); } catch { }
    const desktopLink = path.join(desktopTarget, `${appName}.lnk`);
    try { await createShortcut(desktopLink, exePath, '', exePath); }
    catch (e) {
        if (scope === 'all') {
            const userDesktopLink = path.join(paths.desktopCur, `${appName}.lnk`);
            await createShortcut(userDesktopLink, exePath, '', exePath);
        } else throw e;
    }
}

/* -------------------- Desinstalador (oculto, condicional, síncrono, se reubica a %TEMP%) -------------------- */
async function writeUninstallerScripts({ appName, targetDir, appId, scope }) {
    const psPath = path.join(targetDir, 'uninstall.ps1');
    const batPath = path.join(targetDir, 'uninstall.bat'); // opcional para ejecución manual

    const hive = scope === 'all' ? 'HKLM' : 'HKCU';
    const appPS = appName.replace(/'/g, "''");
    const appIdPS = appId.replace(/'/g, "''");
    const targetDirSQ = targetDir.replace(/'/g, "''"); // comillas simples en PS

    // PS1: se mueve a %TEMP% y se relanza (oculto); eleva solo si hace falta; borra de forma BLOQUEANTE y luego se auto-borra
    const ps = `
Param([switch]$quiet, [switch]$relocated)

function Test-NeedsAdmin([string]$TargetDir, [string]$AppId) {
  $needs = $false
  try { if (Test-Path ("HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\" + $AppId)) { $needs = $true } } catch {}
  if (-not $needs) {
    try {
      $tmp = [System.IO.Path]::Combine($TargetDir, ".battly_uninstall_write_test")
      [System.IO.File]::WriteAllText($tmp, "ok")
      Remove-Item -Path $tmp -Force -ErrorAction SilentlyContinue
    } catch { $needs = $true }
  }
  if (-not $needs) {
    try {
      $pf = [Environment]::GetFolderPath('ProgramFiles')
      $pd = $Env:ProgramData
      if ($TargetDir.StartsWith($pf, [System.StringComparison]::OrdinalIgnoreCase) -or
          $TargetDir.StartsWith($pd, [System.StringComparison]::OrdinalIgnoreCase)) { $needs = $true }
    } catch {}
  }
  return $needs
}

function Ensure-Admin-IfNeeded {
  param([string]$TargetDir, [string]$AppId)
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p  = New-Object Security.Principal.WindowsPrincipal($id)
  $isAdmin = $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  $needs = Test-NeedsAdmin -TargetDir $TargetDir -AppId $AppId
  if ($needs -and -not $isAdmin) {
    $argsList = @('-NoProfile','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File', $PSCommandPath)
    if ($quiet) { $argsList += '/quiet' }
    # elevamos y ESPERAMOS a que termine
    Start-Process -Verb RunAs -FilePath 'powershell.exe' -ArgumentList $argsList -WindowStyle Hidden -Wait
    exit 0
  }
}

$ErrorActionPreference = 'SilentlyContinue'

# 0) Si aún estamos dentro de la carpeta de instalación, COPIAR a %TEMP% y relanzar oculto (y esperar).
$targetDir = '${targetDirSQ}'
$scriptPath = $PSCommandPath
if (-not $relocated) {
  try {
    if ($scriptPath -like ($targetDir + '*')) {
      $tempPs1 = [System.IO.Path]::Combine($Env:TEMP, 'battly_uninstall_' + [System.Guid]::NewGuid().ToString('N') + '.ps1')
      Copy-Item -Path $scriptPath -Destination $tempPs1 -Force
      $argsList = @('-NoProfile','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File', $tempPs1, '/quiet','-relocated')
      Start-Process -FilePath 'powershell.exe' -ArgumentList $argsList -WindowStyle Hidden -Wait
      exit 0
    }
  } catch {}
}

# 1) Elevar solo si realmente hace falta (y esperar si elevamos)
Ensure-Admin-IfNeeded -TargetDir '${targetDirSQ}' -AppId '${appIdPS}'

# 2) Cerrar proceso si existe (nombre sin .exe)
try { Get-Process -Name '${appPS}' -ErrorAction SilentlyContinue | Stop-Process -Force } catch {}

# 3) Eliminar accesos directos
try { $StartMenuCommon = "$Env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\${appPS}"; if (Test-Path $StartMenuCommon) { Remove-Item -Path $StartMenuCommon -Recurse -Force } } catch {}
try { $StartMenuUser   = "$Env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\${appPS}"; if (Test-Path $StartMenuUser) { Remove-Item -Path $StartMenuUser -Recurse -Force } } catch {}
try { $DesktopAll = "$Env:Public\\Desktop\\${appPS}.lnk"; if (Test-Path $DesktopAll) { Remove-Item -Path $DesktopAll -Force } } catch {}
try { $DesktopCur = "$([Environment]::GetFolderPath('Desktop'))\\${appPS}.lnk"; if (Test-Path $DesktopCur) { Remove-Item -Path $DesktopCur -Force } } catch {}

# 4) Quitar clave de desinstalación (HKLM/HKCU)
try { reg delete '${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appIdPS}' /f | Out-Null } catch {}
try { reg delete 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appIdPS}' /f | Out-Null } catch {}

# 5) Borrado BLOQUEANTE de la carpeta de instalación (cmd oculto + -Wait)
try {
  if (Test-Path $targetDir) {
    Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c','rmdir','/s','/q', '"' + $targetDir + '"') -WindowStyle Hidden -Wait
  }
} catch {}

# 6) Auto-borrado del propio script (si está en %TEMP%)
try {
  if ($PSCommandPath -like ($Env:TEMP + '*')) {
    Remove-Item -Path $PSCommandPath -Force -ErrorAction SilentlyContinue
  }
} catch {}

exit 0
`.trim();

    const bat = `@echo off
setlocal
set PSARGS=
:parse
if "%~1"=="/quiet" ( set PSARGS=/quiet ) else ( if "%~1"=="" goto run )
shift
goto parse
:run
powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1" %PSARGS%
exit /b 0
`.trim();

    await fsp.writeFile(psPath, ps, 'utf8');
    await fsp.writeFile(batPath, bat, 'utf8');
    return { psPath, batPath };
}

/* -------------------- Descarga con pipeline + % cada ~2s -------------------- */
function formatBytes(n) { if (!n || n <= 0) return '0 B'; const u = ['B', 'KB', 'MB', 'GB', 'TB']; const i = Math.floor(Math.log(n) / Math.log(1024)); return `${(n / Math.pow(1024, i)).toFixed(1)} ${u[i]}`; }

async function downloadToFile(url, outPath, progressCb = () => { }, { timeoutMs = 10 * 60 * 1000, tickMs = 1000 } = {}) {
    const ac = new AbortController(); const to = setTimeout(() => ac.abort(new Error('Timeout de descarga')), timeoutMs);
    try {
        progressCb({ phase: 'download:start', message: `Conectando a ${url}` });
        const res = await fetch(url, { redirect: 'follow', signal: ac.signal, headers: { 'User-Agent': 'BattlyInstaller/1.0 (+https://battlylauncher.com)' } });
        if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`);
        await fsp.mkdir(path.dirname(outPath), { recursive: true });

        const total = Number(res.headers.get('content-length')) || 0;
        if (total) progressCb({ phase: 'download:meta', totalBytes: total, message: `Tamaño: ${formatBytes(total)}` });

        let downloaded = 0, nextTick = Date.now() + tickMs;
        const counter = new Transform({
            transform(chunk, _e, cb) {
                downloaded += chunk.length;
                const now = Date.now();
                if (now >= nextTick) {
                    nextTick = now + tickMs;
                    if (total) {
                        const pct = Math.min(99, Math.floor((downloaded / total) * 100));
                        progressCb({ phase: 'download:progress', downloadedBytes: downloaded, totalBytes: total, percent: pct, message: `Descargando ${formatBytes(downloaded)} / ${formatBytes(total)} (${pct}%)` });
                    } else {
                        progressCb({ phase: 'download:progress', downloadedBytes: downloaded, totalBytes: 0, percent: null, message: `Descargando ${formatBytes(downloaded)}` });
                    }
                }
                cb(null, chunk);
            }
        });

        const nodeReadable = Readable.fromWeb(res.body);
        const fileStream = fs.createWriteStream(outPath);
        await streamPipeline(nodeReadable, counter, fileStream);

        if (total) progressCb({ phase: 'download:progress', downloadedBytes: total, totalBytes: total, percent: 99, message: `Descarga casi completada (${formatBytes(total)})` });
        progressCb({ phase: 'download:done', message: 'Descarga finalizada' });
        return outPath;
    } finally { clearTimeout(to); }
}

/* -------------------- Extracción rápida -------------------- */
async function extractZipFast(zipPath, destDir, progressCb = () => { }) {
    progressCb({ phase: 'extract:start', message: 'Extrayendo paquete (método rápido)...' });
    try { await run('tar --version'); await run(`tar -xf "${zipPath}" -C "${destDir}"`); progressCb({ phase: 'extract:done', message: 'Extracción completada (tar).' }); return; } catch { }
    try {
        const ps = `$ErrorActionPreference='Stop';Add-Type -AssemblyName 'System.IO.Compression.FileSystem';[System.IO.Compression.ZipFile]::ExtractToDirectory('${zipPath.replace(/'/g, "''")}', '${destDir.replace(/'/g, "''")}', $true)`;
        await run(`powershell -NoProfile -ExecutionPolicy Bypass -Command "& { ${ps} }"`);
        progressCb({ phase: 'extract:done', message: 'Extracción completada (ZipFile).' }); return;
    } catch { }
    await run(`powershell -NoProfile -ExecutionPolicy Bypass "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force"`);
    progressCb({ phase: 'extract:done', message: 'Extracción completada (Expand-Archive).' });
}

/* -------------------- Utils post extracción -------------------- */
async function flattenIfSingleRoot(destDir) {
    const entries = await fsp.readdir(destDir, { withFileTypes: true });
    if (entries.length === 1 && entries[0].isDirectory()) {
        const root = path.join(destDir, entries[0].name);
        const inner = await fsp.readdir(root);
        for (const name of inner) { await fsp.rename(path.join(root, name), path.join(destDir, name)); }
        await fsp.rmdir(root);
    }
}

/* -------------------- ESPERAR a que termine la desinstalación (para nuestra UI) -------------------- */
async function regKeyExists(hive, subkey) {
    try {
        await run(`reg query "${hive}\\${subkey}"`);
        return true;
    } catch { return false; }
}

async function waitForUninstallDone({ targetDir, appId }, progressCb = () => { }) {
    const subkey = `Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appId}`;
    const deadline = Date.now() + 120 * 1000; // 120s máximo
    let lastLog = 0;

    while (Date.now() < deadline) {
        const dirExists = fs.existsSync(targetDir);
        const inHKLM = await regKeyExists('HKLM', subkey);
        const inHKCU = await regKeyExists('HKCU', subkey);

        if (!dirExists && !inHKLM && !inHKCU) {
            progressCb({ phase: 'uninstall:verify', message: 'Verificación: desinstalación confirmada.' });
            return true;
        }

        const now = Date.now();
        if (now - lastLog > 2000) {
            lastLog = now;
            const pieces = [];
            if (dirExists) pieces.push('carpeta aún presente');
            if (inHKLM) pieces.push('registro HKLM presente');
            if (inHKCU) pieces.push('registro HKCU presente');
            progressCb({ phase: 'uninstall:verify', message: `Esperando a que termine... (${pieces.join(', ')})` });
        }

        await new Promise(r => setTimeout(r, 500));
    }
    progressCb({ phase: 'uninstall:verify', message: 'Tiempo de espera agotado. Puede que otro proceso esté bloqueando archivos.' });
    return false;
}

/* -------------------- Flujo principal -------------------- */
async function performInstall(payload, progressCb = () => { }) {
    const { appName, version, targetDir, downloadUrl } = payload;
    let actualDownloadUrl = downloadUrl; // Track para el return

    // Cerrar proceso de Battly antes de instalar
    progressCb({ phase: 'close-process', message: 'Cerrando procesos de Battly...' });
    try {
        const exeName = `${appName}.exe`;
        await run(`taskkill /F /IM "${exeName}" 2>nul`);
        await new Promise(r => setTimeout(r, 1000)); // Esperar 1 segundo
    } catch (e) {
        // Ignorar si no estaba ejecutándose
    }

    progressCb({ phase: 'prep', message: 'Preparando carpeta de destino...' });
    await removeDirSafe(targetDir);
    await fsp.mkdir(targetDir, { recursive: true });

    // >>> Opera opcional EN PARALELO (silent, detached, oculto).
    //    - Si el usuario lo marcó, se dispara y continúa aunque cierres el installer.
    //    - partners/opera se encargará de windowsHide/detached/unref y reintentos.
    try {
        // Pasamos un tercer argumento opcional por si tu módulo lo acepta (no rompe si no):
        installOperaIfRequested(payload, (ev) => {
            // etiquetamos el log (tu lado UI ya imprime cualquier message recibido)
            if (ev && ev.message) progressCb({ ...ev, partner: 'opera' });
        }, { independent: true }); // <- seguirá en segundo plano
    } catch { /* silencio */ }

    const tmpZip = path.join(os.tmpdir(), `${appName.replace(/\s+/g, '_')}-${Date.now()}.zip`);

    // Si downloadUrl es null, usar .zip bundled (modo store)
    if (downloadUrl === null) {
        progressCb({ phase: 'copy-bundled', message: 'Copiando archivos desde paquete incluido...' });

        // El .zip bundled está en resources/ (extraResource de electron-forge)
        const resourcesPath = process.resourcesPath || path.join(__dirname, '..', '..');
        const bundledZip = path.join(resourcesPath, 'Battly-Launcher-win.zip');

        if (!fs.existsSync(bundledZip)) {
            // Fallback para desarrollo: buscar en src/
            const devZip = path.join(__dirname, '..', 'Battly-Launcher-win.zip');
            if (fs.existsSync(devZip)) {
                await fsp.copyFile(devZip, tmpZip);
            } else {
                throw new Error('Archivo bundled no encontrado. Este instalador requiere conexión a internet o debe ser compilado con --store flag.');
            }
        } else {
            await fsp.copyFile(bundledZip, tmpZip);
        }
        progressCb({ phase: 'copy-bundled', message: 'Archivo copiado desde paquete.' });
    } else {
        // Modo online: descargar desde URL
        const url = downloadUrl && downloadUrl.length > 0
            ? downloadUrl
            : 'https://github.com/1ly4s0/battlylauncher/releases/download/3.0.0/Battly-Launcher-win.zip';
        actualDownloadUrl = url; // Actualizar para el return
        await downloadToFile(url, tmpZip, progressCb, { timeoutMs: 10 * 60 * 1000, tickMs: 2000 });
    }
    await extractZipFast(tmpZip, targetDir, progressCb);

    progressCb({ phase: 'post:flatten', message: 'Organizando archivos...' });
    await flattenIfSingleRoot(targetDir);

    // Asegurar ejecutable "Battly Launcher.exe"
    const exeWanted = path.join(targetDir, `${appName}.exe`);
    if (!fs.existsSync(exeWanted)) {
        const files = await fsp.readdir(targetDir);
        const firstExe = files.find(f => f.toLowerCase().endsWith('.exe'));
        if (firstExe) await fsp.copyFile(path.join(targetDir, firstExe), exeWanted);
    }

    progressCb({ phase: 'shortcuts', message: 'Creando accesos directos...' });
    await createStartMenuAndDesktopShortcuts(payload);

    progressCb({ phase: 'registry', message: 'Registrando en Apps y características...' });
    await registerUninstall(payload);

    progressCb({ phase: 'uninstaller', message: 'Generando desinstalador...' });
    await generateUninstallerBat(payload);
    await createUninstallerShortcut(payload);

    // Copiar el instalador a la carpeta de Battly como desinstalador
    try {
        progressCb({ phase: 'copy-uninstaller', message: 'Copiando desinstalador...' });
        const installerExe = process.execPath; // Ruta del instalador actual
        const uninstallerExe = path.join(targetDir, 'uninstall.exe');

        // Solo copiar si es un ejecutable empaquetado (no en modo dev)
        if (!installerExe.includes('electron.exe') && !installerExe.includes('node.exe')) {
            await fsp.copyFile(installerExe, uninstallerExe);
            progressCb({ phase: 'copy-uninstaller', message: 'Desinstalador copiado a la carpeta de instalación.' });
        } else {
            progressCb({ phase: 'copy-uninstaller', message: 'Modo desarrollo: desinstalador .bat generado.' });
        }
    } catch (e) {
        // No es crítico, continuar
    }

    try {
        progressCb({ phase: 'unblock', message: 'Desbloqueando archivos descargados...' });
        await run(`powershell -NoProfile -ExecutionPolicy Bypass "Get-ChildItem -Path '${targetDir.replace(/\\/g, '\\\\')}' -Recurse | Unblock-File"`);
    } catch { }

    try { await fsp.unlink(tmpZip); } catch { }

    progressCb({ phase: 'done', message: 'Instalación completada.' });
    return { installed: true, version, targetDir, fromZip: actualDownloadUrl };
}

async function performRepair(payload, progressCb = () => { }) {
    const { targetDir, appName, downloadUrl } = payload;
    progressCb({ phase: 'repair:start', message: 'Iniciando reparación...' });

    // Cerrar proceso de Battly antes de reparar
    progressCb({ phase: 'repair:close', message: 'Cerrando procesos de Battly...' });
    try {
        const exeName = `${appName}.exe`;
        await run(`taskkill /F /IM "${exeName}" 2>nul`);
        await new Promise(r => setTimeout(r, 1000)); // Esperar 1 segundo
    } catch (e) {
        // Ignorar si no estaba ejecutándose
    }

    // Verificar si existe el ejecutable principal
    const exePath = path.join(targetDir, `${appName}.exe`);
    const needsReDownload = !fs.existsSync(exePath);

    if (needsReDownload) {
        progressCb({ phase: 'repair:download', message: 'El ejecutable principal no existe. Reinstalando archivos...' });

        // Limpiar carpeta
        await removeDirSafe(targetDir);
        await fsp.mkdir(targetDir, { recursive: true });

        // Descargar y extraer de nuevo
        const tmpZip = path.join(os.tmpdir(), `${appName.replace(/\s+/g, '_')}-repair-${Date.now()}.zip`);
        const url = downloadUrl && downloadUrl.length > 0
            ? downloadUrl
            : 'https://github.com/1ly4s0/battlylauncher/releases/download/3.0.0/Battly-Launcher-win.zip';

        await downloadToFile(url, tmpZip, progressCb, { timeoutMs: 10 * 60 * 1000, tickMs: 2000 });
        await extractZipFast(tmpZip, targetDir, progressCb);

        progressCb({ phase: 'repair:flatten', message: 'Organizando archivos...' });
        await flattenIfSingleRoot(targetDir);

        // Asegurar ejecutable
        if (!fs.existsSync(exePath)) {
            const files = await fsp.readdir(targetDir);
            const firstExe = files.find(f => f.toLowerCase().endsWith('.exe'));
            if (firstExe) await fsp.copyFile(path.join(targetDir, firstExe), exePath);
        }

        try { await fsp.unlink(tmpZip); } catch { }
    }

    progressCb({ phase: 'repair:shortcuts', message: 'Reparando accesos directos...' });
    await createStartMenuAndDesktopShortcuts(payload);

    progressCb({ phase: 'repair:registry', message: 'Reparando registro...' });
    await registerUninstall(payload);

    try {
        progressCb({ phase: 'repair:unblock', message: 'Desbloqueando archivos...' });
        await run(`powershell -NoProfile -ExecutionPolicy Bypass "Get-ChildItem -Path '${targetDir.replace(/\\/g, '\\\\')}' -Recurse | Unblock-File"`);
    } catch { }

    progressCb({ phase: 'repair:done', message: 'Reparación completada.' });
    return { repaired: true, redownloaded: needsReDownload };
}

/**
 * Desinstalación directa desde el instalador (sin usar script externo)
 * Borra archivos, accesos directos y registros del sistema
 */
async function performUninstallDirect(payload, progressCb = () => { }) {
    const { appName, targetDir, appId, scope } = payload;
    const hive = scope === 'all' ? 'HKLM' : 'HKCU';

    progressCb({ phase: 'uninstall:start', message: 'Iniciando desinstalación...' });

    // 1. Cerrar procesos
    progressCb({ phase: 'uninstall:close', message: 'Cerrando procesos...' });
    try {
        const exeName = `${appName}.exe`;
        await run(`taskkill /F /IM "${exeName}" 2>nul`);
        await new Promise(r => setTimeout(r, 500)); // Esperar un poco
    } catch (e) {
        // Ignorar si no estaba ejecutándose
    }

    // 2. Eliminar accesos directos
    progressCb({ phase: 'uninstall:shortcuts', message: 'Eliminando accesos directos...' });
    try {
        const paths = resolveInstallPaths(appName);

        // Menú Inicio
        const startMenuAll = path.join(paths.startMenuAllBase, appName);
        const startMenuUser = path.join(paths.startMenuUserBase, appName);
        await removeDirSafe(startMenuAll);
        await removeDirSafe(startMenuUser);

        // Escritorio
        const desktopAllLink = path.join(paths.desktopAll, `${appName}.lnk`);
        const desktopCurLink = path.join(paths.desktopCur, `${appName}.lnk`);
        try { await fsp.unlink(desktopAllLink); } catch { }
        try { await fsp.unlink(desktopCurLink); } catch { }
    } catch (e) {
    }

    // 3. Eliminar registro de desinstalación
    progressCb({ phase: 'uninstall:registry', message: 'Eliminando entradas del registro...' });
    try {
        await regDelete(getUninstallRegPath(appId), 'all');
        await regDelete(getUninstallRegPath(appId), 'current');
    } catch (e) {
    }

    // 4. Eliminar archivos de instalación
    progressCb({ phase: 'uninstall:files', message: 'Eliminando archivos...' });

    // Intentar varios métodos de borrado
    let deleted = false;

    // Método 1: CMD directo (más confiable para carpetas con archivos en uso)
    try {
        await run(`cmd /c "timeout /t 1 /nobreak >nul & rmdir /s /q \"${targetDir}\""`);
        await new Promise(r => setTimeout(r, 1500));
        if (!fs.existsSync(targetDir)) {
            deleted = true;
        }
    } catch (e) {
    }

    // Método 2: PowerShell con Start-Process para ejecutar en contexto separado
    if (!deleted && fs.existsSync(targetDir)) {
        try {
            const psScript = `Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','timeout /t 1 /nobreak >nul & rmdir /s /q \"${targetDir.replace(/\\/g, '\\\\')}\"' -WindowStyle Hidden -Wait`;
            await run(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript}"`);
            await new Promise(r => setTimeout(r, 1500));
            if (!fs.existsSync(targetDir)) {
                deleted = true;
            }
        } catch (e) {
        }
    }

    // Método 3: Usar fs.rm de Node.js
    if (!deleted && fs.existsSync(targetDir)) {
        try {
            await removeDirSafe(targetDir);
            await new Promise(r => setTimeout(r, 500));
            if (!fs.existsSync(targetDir)) {
                deleted = true;
            }
        } catch (e) {
        }
    }

    if (!deleted && fs.existsSync(targetDir)) {
    }

    progressCb({ phase: 'uninstall:done', message: 'Desinstalación completada.' });
    return { uninstalled: true };
}

async function removeInstall(payload, progressCb = () => { }) {
    // Usar desinstalación directa en lugar del script externo
    return performUninstallDirect(payload, progressCb);
}

module.exports = {
    performInstall,
    performRepair,
    writeUninstallerScripts,
    removeInstall
};
