#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const os = require('os');
const AdmZip = require('adm-zip');

// ===== CONFIGURACIÓN =====
const APP_NAME = 'Battly Launcher';
const APP_ID = 'com.tecnobros.battlylauncher';
const VERSION = '3.0.0';
const PUBLISHER = 'TECNO BROS';
const EXE_NAME = 'Battly Launcher.exe';

// ===== UTILIDADES =====
function log(message) {
    console.log(`[BATTLY INSTALLER] ${message}`);
}

function error(message) {
    console.error(`[ERROR] ${message}`);
}

function getLocalAppData() {
    return process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
}

function getInstallPath() {
    return path.join(getLocalAppData(), 'Programs', APP_NAME);
}

function getProgramFiles() {
    return process.env['ProgramFiles'] || 'C:\\Program Files';
}

function isAdmin() {
    try {
        execSync('net session', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

// ===== EXTRACCIÓN DEL ZIP =====
async function extractZip(zipPath, targetDir) {
    return new Promise((resolve, reject) => {
        log(`Extrayendo ${zipPath} a ${targetDir}...`);

        try {
            // Crear directorio si no existe
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            // Usar adm-zip (JavaScript puro, funciona dentro de pkg)
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(targetDir, true);

            log('Extracción completada.');
            resolve();
        } catch (err) {
            error(`Error al extraer: ${err.message}`);
            reject(err);
        }
    });
}// ===== REGISTRO DE WINDOWS =====
function registerUninstall(installPath) {
    log('Registrando en Panel de Control...');

    const uninstallBat = path.join(installPath, 'uninstall.bat');
    const uninstallPs1 = path.join(installPath, 'uninstall.ps1');

    const regKey = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_ID}`;

    const commands = [
        `reg add "${regKey}" /v DisplayName /t REG_SZ /d "${APP_NAME}" /f`,
        `reg add "${regKey}" /v DisplayVersion /t REG_SZ /d "${VERSION}" /f`,
        `reg add "${regKey}" /v Publisher /t REG_SZ /d "${PUBLISHER}" /f`,
        `reg add "${regKey}" /v InstallLocation /t REG_SZ /d "${installPath}" /f`,
        `reg add "${regKey}" /v UninstallString /t REG_SZ /d "\\"${uninstallBat}\\"" /f`,
        `reg add "${regKey}" /v QuietUninstallString /t REG_SZ /d "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \\"${uninstallPs1}\\"" /f`,
        `reg add "${regKey}" /v NoModify /t REG_DWORD /d 1 /f`,
        `reg add "${regKey}" /v NoRepair /t REG_DWORD /d 1 /f`
    ];

    try {
        commands.forEach(cmd => execSync(cmd, { stdio: 'inherit' }));
        log('Registro completado.');
    } catch (err) {
        error(`Error en registro: ${err.message}`);
    }
}

// ===== SCRIPTS DE DESINSTALACIÓN =====
function createUninstallScripts(installPath) {
    log('Creando scripts de desinstalación...');

    const batContent = `@echo off
echo Desinstalando ${APP_NAME}...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1"
pause
`;

    const ps1Content = `
$ErrorActionPreference = 'SilentlyContinue'

$installPath = "${installPath.replace(/\\/g, '\\\\')}"
$regKey = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_ID}"

Write-Host "Deteniendo procesos..."
Stop-Process -Name "${EXE_NAME.replace('.exe', '')}" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "Eliminando archivos..."
if (Test-Path $installPath) {
    Remove-Item -Path $installPath -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Eliminando entrada del registro..."
Remove-Item -Path $regKey -Force -ErrorAction SilentlyContinue

Write-Host "Desinstalación completada."
Start-Sleep -Seconds 2
`;

    fs.writeFileSync(path.join(installPath, 'uninstall.bat'), batContent, 'utf8');
    fs.writeFileSync(path.join(installPath, 'uninstall.ps1'), ps1Content, 'utf8');

    log('Scripts de desinstalación creados.');
}

// ===== INSTALACIÓN =====
async function install() {
    try {
        log(`Iniciando instalación de ${APP_NAME} v${VERSION}...`);

        // Buscar el ZIP bundled dentro del .exe
        const possibleZipPaths = [
            // Dentro del ejecutable empaquetado por pkg
            path.join(__dirname, 'Battly-Launcher-win.zip'),
            // Fallback: mismo directorio que el .exe
            path.join(path.dirname(process.execPath), 'Battly-Launcher-win.zip'),
            path.join(process.cwd(), 'Battly-Launcher-win.zip')
        ];

        let zipPath = null;
        for (const p of possibleZipPaths) {
            if (fs.existsSync(p)) {
                zipPath = p;
                break;
            }
        }

        if (!zipPath) {
            error('No se encontró Battly-Launcher-win.zip. Rutas buscadas:');
            possibleZipPaths.forEach(p => console.log(`  - ${p}`));
            process.exit(1);
        }

        log(`ZIP encontrado en: ${zipPath}`);        // Directorio de instalación
        const installPath = getInstallPath();
        log(`Instalando en: ${installPath}`);

        // Extraer ZIP
        await extractZip(zipPath, installPath);

        // Crear scripts de desinstalación
        createUninstallScripts(installPath);

        // Registrar en Windows
        registerUninstall(installPath);

        // Crear acceso directo en escritorio
        createDesktopShortcut(installPath);

        log('');
        log('='.repeat(50));
        log(`✓ ${APP_NAME} instalado correctamente!`);
        log(`Ubicación: ${installPath}`);
        log('='.repeat(50));
        log('');

        // Salir con código 0 (éxito)
        process.exit(0);

    } catch (err) {
        error(`Error en instalación: ${err.message}`);
        console.error(err.stack);
        process.exit(1);
    }
}

// ===== DESINSTALACIÓN =====
async function uninstall() {
    try {
        log(`Desinstalando ${APP_NAME}...`);

        const installPath = getInstallPath();

        if (!fs.existsSync(installPath)) {
            log('No se encontró instalación. Ya está desinstalado.');
            process.exit(0);
        }

        // Detener proceso
        try {
            execSync(`taskkill /F /IM "${EXE_NAME}" /T`, { stdio: 'ignore' });
            log('Proceso detenido.');
        } catch {
            // No estaba corriendo
        }

        // Esperar
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Eliminar archivos
        log('Eliminando archivos...');
        fs.rmSync(installPath, { recursive: true, force: true });

        // Eliminar registro
        log('Eliminando registro...');
        const regKey = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_ID}`;
        execSync(`reg delete "${regKey}" /f`, { stdio: 'ignore' });

        // Eliminar acceso directo
        removeDesktopShortcut();

        log('');
        log('='.repeat(50));
        log(`✓ ${APP_NAME} desinstalado correctamente!`);
        log('='.repeat(50));
        log('');

        // Salir con código 0 (éxito)
        process.exit(0);

    } catch (err) {
        error(`Error en desinstalación: ${err.message}`);
        console.error(err.stack);
        process.exit(1);
    }
}

// ===== ACCESO DIRECTO =====
function createDesktopShortcut(installPath) {
    try {
        const desktopPath = path.join(os.homedir(), 'Desktop');
        const shortcutPath = path.join(desktopPath, `${APP_NAME}.lnk`);
        const targetPath = path.join(installPath, EXE_NAME);

        const vbsScript = `
Set oWS = WScript.CreateObject("WScript.Shell")
sLinkFile = "${shortcutPath.replace(/\\/g, '\\\\')}"
Set oLink = oWS.CreateShortcut(sLinkFile)
oLink.TargetPath = "${targetPath.replace(/\\/g, '\\\\')}"
oLink.WorkingDirectory = "${installPath.replace(/\\/g, '\\\\')}"
oLink.Description = "${APP_NAME}"
oLink.Save
`;

        const vbsPath = path.join(os.tmpdir(), 'create_shortcut.vbs');
        fs.writeFileSync(vbsPath, vbsScript, 'utf8');

        execSync(`cscript //nologo "${vbsPath}"`, { stdio: 'ignore' });
        fs.unlinkSync(vbsPath);

        log('Acceso directo creado en escritorio.');
    } catch (err) {
        log(`Advertencia: No se pudo crear acceso directo: ${err.message}`);
    }
}

function removeDesktopShortcut() {
    try {
        const desktopPath = path.join(os.homedir(), 'Desktop');
        const shortcutPath = path.join(desktopPath, `${APP_NAME}.lnk`);

        if (fs.existsSync(shortcutPath)) {
            fs.unlinkSync(shortcutPath);
            log('Acceso directo eliminado.');
        }
    } catch (err) {
        log(`Advertencia: No se pudo eliminar acceso directo: ${err.message}`);
    }
}

// ===== MAIN =====
function showHelp() {
    console.log(`
${APP_NAME} Installer v${VERSION}

Uso:
  BattlyInstaller.exe [opciones]

Opciones:
  /install, /i      Instalar ${APP_NAME} (por defecto)
  /uninstall, /u    Desinstalar ${APP_NAME}
  /silent, /s       Modo silencioso (sin preguntas)
  /help, /?         Mostrar esta ayuda

Ejemplos:
  BattlyInstaller.exe                    # Instalar modo interactivo
  BattlyInstaller.exe /install           # Instalar modo interactivo
  BattlyInstaller.exe /install /silent   # Instalar sin preguntas
  BattlyInstaller.exe /uninstall         # Desinstalar
  BattlyInstaller.exe /uninstall /silent # Desinstalar sin preguntas
`);
}

async function main() {
    const args = process.argv.slice(2).map(a => a.toLowerCase());

    const isUninstallMode = args.some(a => a === '/uninstall' || a === '/u');
    const isSilentMode = args.some(a => a === '/silent' || a === '/s');
    const isHelpMode = args.some(a => a === '/help' || a === '/?');

    if (isHelpMode) {
        showHelp();
        process.exit(0);
    }

    console.log('');
    console.log('='.repeat(50));
    console.log(`  ${APP_NAME} Installer v${VERSION}`);
    console.log(`  ${PUBLISHER}`);
    console.log('='.repeat(50));
    console.log('');

    if (isUninstallMode) {
        await uninstall();
    } else {
        await install();
    }
}

// Ejecutar
main().catch(err => {
    error(`Error fatal: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
});
