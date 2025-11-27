// src/scripts/uninstaller-builder.js
// Genera un desinstalador .exe portable usando ps2exe o similar

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { run } = require('./utils/win');

/**
 * Genera un archivo .bat que actÃƒÂºa como desinstalador portable
 * Este .bat puede ser convertido a .exe con herramientas externas
 */
async function generateUninstallerBat({ appName, targetDir, appId, scope }) {
    const batPath = path.join(targetDir, 'Desinstalar.bat');
    const iconPath = path.join(targetDir, `${appName}.exe`);

    const hive = scope === 'all' ? 'HKLM' : 'HKCU';
    const appBat = appName.replace(/"/g, '""');
    const targetDirBat = targetDir.replace(/"/g, '""');
    const appIdBat = appId.replace(/"/g, '""');

    // Script .bat mÃƒÂ¡s simple y robusto
    const batScript = `@echo off
setlocal EnableDelayedExpansion
title Desinstalador de ${appBat}
color 0A

echo.
echo Ã¢â€¢â€Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢â€”
echo Ã¢â€¢â€˜          DESINSTALADOR DE ${appBat.toUpperCase().padEnd(28)}Ã¢â€¢â€˜
echo Ã¢â€¢Å¡Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
echo.
echo Este programa desinstalara ${appBat} de tu sistema.
echo.
echo Presiona cualquier tecla para continuar o cierra esta ventana para cancelar...
pause >nul

echo.
echo [1/5] Cerrando procesos...
taskkill /F /IM "${appBat}.exe" >nul 2>&1

echo [2/5] Eliminando accesos directos...
rd /s /q "%ProgramData%\\Microsoft\\Windows\\Start Menu\\Programs\\${appBat}" >nul 2>&1
rd /s /q "%AppData%\\Microsoft\\Windows\\Start Menu\\Programs\\${appBat}" >nul 2>&1
del /f /q "%Public%\\Desktop\\${appBat}.lnk" >nul 2>&1
del /f /q "%UserProfile%\\Desktop\\${appBat}.lnk" >nul 2>&1

echo [3/5] Eliminando registro...
reg delete "${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appIdBat}" /f >nul 2>&1
reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appIdBat}" /f >nul 2>&1

echo [4/5] Copiando desinstalador a carpeta temporal...
set "TEMP_UNINSTALLER=%TEMP%\\battly_uninstall_final.bat"
copy "%~f0" "!TEMP_UNINSTALLER!" >nul 2>&1

echo [5/5] Eliminando archivos...
start /min cmd /c "timeout /t 2 /nobreak >nul && rd /s /q \\"${targetDirBat}\\" && del /f /q \\"!TEMP_UNINSTALLER!\\" && exit"

echo.
echo Desinstalacion completada exitosamente.
echo La ventana se cerrara en 3 segundos...
timeout /t 3 /nobreak >nul
exit
`;

    await fsp.writeFile(batPath, batScript, 'utf8');

    // Intentar crear un VBS que lance el BAT con icono personalizado
    const vbsPath = path.join(targetDir, 'Desinstalar.vbs');
    const vbsScript = `Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")
strBatPath = objFSO.GetParentFolderName(WScript.ScriptFullName) & "\\Desinstalar.bat"
objShell.Run chr(34) & strBatPath & chr(34), 1, False
Set objShell = Nothing
Set objFSO = Nothing
`;
    await fsp.writeFile(vbsPath, vbsScript, 'utf8');

    return { batPath, vbsPath };
}

/**
 * Intenta crear un acceso directo al desinstalador en el menÃƒÂº inicio
 */
async function createUninstallerShortcut({ appName, targetDir, scope }) {
    const { createShortcut, resolveInstallPaths } = require('./utils/win');
    const paths = resolveInstallPaths(appName);

    const batPath = path.join(targetDir, 'Desinstalar.bat');
    if (!fs.existsSync(batPath)) return;

    const startMenuBase = scope === 'all' ? paths.startMenuAllBase : paths.startMenuUserBase;
    const startMenuFolder = path.join(startMenuBase, appName);

    try {
        await fsp.mkdir(startMenuFolder, { recursive: true });
        const uninstallLink = path.join(startMenuFolder, `Desinstalar ${appName}.lnk`);
        const iconPath = path.join(targetDir, `${appName}.exe`);
        await createShortcut(uninstallLink, batPath, '', iconPath);
    } catch (e) {
            }
}

module.exports = {
    generateUninstallerBat,
    createUninstallerShortcut
};
