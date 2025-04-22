const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

let LangStrings = await lang(localStorage.getItem("lang"));
async function lang(lang) {
    try {
        const langModule = await import(`./langs/${lang}.js`);
        const langFile = langModule.default;

        return langFile;

    } catch (error) {
        console.error(error);
    }
}

document.getElementById("uninstall-battly-btn").addEventListener('click', async function () {
    document.getElementById("are-u-sure-uninstall").innerHTML = LangStrings["uninstalling-battly"];
    document.getElementById("are-u-sure-uninstall-desc").innerHTML = LangStrings["please-wait-uninstalling-battly"];
    document.getElementById("uninstall-battly-btn").style.display = "none";
    document.getElementById("cancel-uninstall-battly-btn").style.display = "none";
    async function getInstallationPath() {
        const registryPaths = [
            'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Battly Launcher',
            'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Battly Launcher'
        ];

        for (const registryKeyPath of registryPaths) {
            try {
                const installationPath = execSync(`reg query "${registryKeyPath}" /v InstallLocation`, { encoding: 'utf-8' })
                    .split('    ').pop().trim();

                if (fs.existsSync(installationPath)) {
                    return installationPath;
                } else {
                    console.warn(`No se encontró la instalación en: ${registryKeyPath}`);
                }
            } catch (error) {
                console.warn(`Error consultando el registro en ${registryKeyPath}:`, error.message);
            }
        }

        document.getElementById("are-u-sure-uninstall").innerHTML = LangStrings["uninstall-err-1"];

        return null;
    }

    async function uninstallBattly() {
        const installationPath = await getInstallationPath();
        if (!installationPath) {
            document.getElementById("are-u-sure-uninstall").innerHTML = LangStrings["uninstall-err-2"];
            return;
        }

        const uninstallScript = path.join(installationPath, 'uninstall.bat');
        if (!fs.existsSync(uninstallScript)) {
            document.getElementById("are-u-sure-uninstall").innerHTML = LangStrings["uninstall-err-3"];
            return;
        }

        const uninstallProcess = await spawn(`"${uninstallScript}"`, [], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
            shell: true
        });

        uninstallProcess.on('exit', (code) => {
            if (code === 0) {
                document.getElementById("are-u-sure-uninstall").innerHTML = "✅ Battly se ha desinstalado correctamente.";
                ipcRenderer.send('uninstall-complete');
            } else {
                console.error(`❌ Error al desinstalar Battly (exit code ${code})`);
            }
        });

        uninstallProcess.unref();
    }

    uninstallBattly();
});

document.getElementById("cancel-uninstall-battly-btn").addEventListener('click', function () {
    ipcRenderer.send('close-uninstall-window');
});

document.getElementById("minimize").addEventListener("click", () => {
    ipcRenderer.send('minimize');
});

document.getElementById("close").addEventListener("click", () => {
    ipcRenderer.send('close');
});


document.getElementById("are-u-sure-uninstall").innerHTML = LangStrings["are-u-sure-uninstall"];
document.getElementById("are-u-sure-uninstall-desc").innerHTML = LangStrings["are-u-sure-uninstall-desc"];
document.getElementById("uninstall-battly-btn").innerHTML = LangStrings["uninstall-battly"];
document.getElementById("cancel-uninstall-battly-btn").innerHTML = LangStrings["cancel"];