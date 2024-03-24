const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');
const { execSync } = require('child_process');
let language = localStorage.getItem('lang') || 'es';
async function lang(lang) {    
    try {
        const langModule = await import(`./langs/${lang}.js`);
        const langFile = langModule.default;
        
        return langFile;
			
    } catch (error) {
        console.error(error);
    }
}
let LangStrings = await lang(language);

let optionSelectedInstall = "instalacion";
let ProgramsAppDataFolder = `${process.env.LOCALAPPDATA}/Programs`;
let installationPath = `${process.env.ProgramFiles}/Battly Launcher`
let typeOfInstall = "system";
let paths = {
    system: `${process.env.ProgramFiles}/Battly Launcher`,
    user: `${process.env.LOCALAPPDATA}/Programs/Battly Launcher`,
    custom: LangStrings["custom-path"]
};
const userName = process.env.USERNAME;
let installOpera = true;

const MAKE_DIR_PROGRESS = 20;

const RELEASE_API = "https://api.github.com/repos/1ly4s0/battlylauncher/releases";

const tempFolder = path.join(process.env.LOCALAPPDATA, 'Temp', 'Battly Launcher');
let battlyFolder = path.join(installationPath);
let battlyZIP = path.join(tempFolder, "Battly-Launcher-win.zip");


let indexInstallPages = {
    0: "language",
    1: "eula-container",
    2: "install-container",
    3: "install-path-container",
    4: "accept-external-program-container",
    5: "install-logs-container",
};
let currentIndex = 1;

const response = await fetch(RELEASE_API);
const releases = await response.json();
document.getElementById("version").innerHTML = releases[0].tag_name;    

document.getElementById("system-text").innerHTML = paths.system.replace(/\\/g, '/');
document.getElementById("user-text").innerHTML = paths.user.replace(/\\/g, '/');
document.getElementById("custom-text").innerHTML = paths.custom;
document.getElementById("user-text-only-for").innerHTML = `${LangStrings["only-for"]} ${userName}`
    

document.getElementById("minimize").addEventListener("click", () => {
    ipcRenderer.send('minimize');
});

    document.getElementById("close").addEventListener("click", () => {
        ipcRenderer.send('close');
    });

    document.getElementById("reject").addEventListener("click", () => {
        installOpera = false;
        document.getElementById("next").click();
    });

    document.getElementById("checkbox-accept-eula").addEventListener("change", (e) => {
        if (e.target.checked) {
            document.getElementById("next").removeAttribute("disabled");
        } else {
            document.getElementById("next").setAttribute("disabled", "true");
        }
    });

document.getElementById("open-folder-btn").addEventListener("click", () => {
    // Abrir el diálogo de selección de carpeta del sistema nativo de JS
    ipcRenderer.send('open-folder-dialog');

    ipcRenderer.on('selected-directory', (event, pathd) => {
        if (pathd === "permisos_rechazados") {
            document.getElementById("next").setAttribute("disabled", "true");
            document.getElementById("custom-text").innerHTML = LangStrings["you-dont-have-write-permissions"];
        } else {
            document.getElementById("next").removeAttribute("disabled");
            document.getElementById("custom-text").innerHTML = pathd;
            installationPath = pathd;
            typeOfInstall = "custom";
            paths.custom = pathd;
            battlyFolder = path.join(pathd);
        }
    });
});

    document.getElementById("next").addEventListener("click", async () => {
        const nextIndex = currentIndex + 1;
        if (nextIndex !== 3) {
            const nextContainer = indexInstallPages[nextIndex];
            const currentContainer = indexInstallPages[currentIndex];
            document.getElementById(currentContainer).style.display = "none";
            document.getElementById(nextContainer).style.display = "block";

            if (nextIndex !== 4) {
                document.getElementById("reject").style.display = "none";
            }

            if (nextIndex === 1) {
                document.getElementById("back").setAttribute("disabled", "true");
                document.getElementById("next").setAttribute("disabled", "true");
            } else if (nextIndex === 0) {
                document.getElementById("back").setAttribute("disabled", "true");
            }

            if (nextIndex === 2) {
                document.getElementById("back").removeAttribute("disabled");
            } else if (nextIndex === 0) {
                document.getElementById("back").setAttribute("disabled", "true");
            } else if (nextIndex === 4) {
                if (typeOfInstall === "system" || typeOfInstall === "custom") {
                    //solicitar permisos de administrador
                    if (typeOfInstall !== "custom") {
                        ipcRenderer.send('admin-permission', language);

                        // Usar once para manejar el evento una vez
                        ipcRenderer.once('admin-permission-response', (event, arg) => {
                            if (arg === "accepted") {
                                document.getElementById("next").removeAttribute("disabled");
                            } else {
                                document.getElementById("back").click();
                            }
                        });
                    }
                }

                document.getElementById("reject").style.display = "block";
            } else if (nextIndex === 5) {
                if (installOpera) {
                    document.getElementById("next").setAttribute("disabled", "true");
                    document.getElementById("back").setAttribute("disabled", "true");
                    document.getElementById("next").innerHTML = LangStrings["installing-battly"];
                    StartInstall();
                    
                        setInterval(logNotNewLine("."), 1000);
                    await DownloadAndInstallOpera();
                    document.getElementById("next").removeAttribute("disabled");
                    document.getElementById("back").setAttribute("disabled", "true");
                    document.getElementById("next").innerHTML = LangStrings["end"];
                    lognewline("✅ " + LangStrings["installation-completed-successfully"]);
                    progress.set(100);
                    } else {
                        document.getElementById("next").setAttribute("disabled", "true");
                        document.getElementById("back").setAttribute("disabled", "true");
                        document.getElementById("next").innerHTML = LangStrings["installing-battly"];
                        await StartInstall();
                        document.getElementById("next").removeAttribute("disabled");
                        document.getElementById("back").setAttribute("disabled", "true");
                        document.getElementById("next").innerHTML = LangStrings["end"];
                        lognewline("✅ " + LangStrings["installation-completed-successfully"]);
                        progress.set(100);
                    }
            }

            currentIndex++;
        } else {
            if (optionSelectedInstall === "instalacion") {
                const nextContainer = indexInstallPages[nextIndex];
                const currentContainer = indexInstallPages[currentIndex];
                document.getElementById(currentContainer).style.display = "none";
                document.getElementById(nextContainer).style.display = "block";

                if (nextIndex !== 4) {
                    document.getElementById("reject").style.display = "none";
                }

                if (nextIndex === 1) {
                    document.getElementById("back").setAttribute("disabled", "true");
                    document.getElementById("next").setAttribute("disabled", "true");
                } else if (nextIndex === 0) {
                    document.getElementById("back").setAttribute("disabled", "true");
                }

                if (nextIndex === 2) {
                    document.getElementById("back").removeAttribute("disabled");
                } else if (nextIndex === 0) {
                    document.getElementById("back").setAttribute("disabled", "true");
                } else if (nextIndex === 4) {
                    if (typeOfInstall === "system" || typeOfInstall === "custom") {
                        //solicitar permisos de administrador
                        console.log(language);
                        ipcRenderer.send('admin-permission', language);

                        // Usar once para manejar el evento una vez
                        ipcRenderer.once('admin-permission-response', (event, arg) => {
                            if (arg === "accepted") {
                                document.getElementById("next").removeAttribute("disabled");
                            } else {
                                document.getElementById("back").click();
                            }
                        });
                    }

                    document.getElementById("reject").style.display = "block";
                } else if (nextIndex === 5) {
                    if (installOpera) {
                    document.getElementById("next").setAttribute("disabled", "true");
                    document.getElementById("back").setAttribute("disabled", "true");
                    document.getElementById("next").innerHTML = LangStrings["installing-battly"];
                        StartInstall();
                        setInterval(logNotNewLine("."), 1000);
                    await DownloadAndInstallOpera();
                    document.getElementById("next").removeAttribute("disabled");
                    document.getElementById("back").setAttribute("disabled", "true");
                    document.getElementById("next").innerHTML = LangStrings["end"];
                    lognewline("✅ " + LangStrings["installation-completed-successfully"]);
                    progress.set(100);
                    } else {
                        document.getElementById("next").setAttribute("disabled", "true");
                        document.getElementById("back").setAttribute("disabled", "true");
                        document.getElementById("next").innerHTML = LangStrings["installing-battly"];
                        await StartInstall();
                        document.getElementById("next").removeAttribute("disabled");
                        document.getElementById("back").setAttribute("disabled", "true");
                        document.getElementById("next").innerHTML = LangStrings["end"];
                        lognewline("✅ " + LangStrings["installation-completed-successfully"]);
                        progress.set(100);
                    }
                }

                currentIndex++;
            } else if (optionSelectedInstall === "reparar") {
            } else if (optionSelectedInstall === "desinstalar") {
            }
        }
});

document.getElementById("back").addEventListener("click", () => {
    document.getElementById("reject").style.display = "none";
    const prevIndex = currentIndex - 1;
    const prevContainer = indexInstallPages[prevIndex];
    const currentContainer = indexInstallPages[currentIndex];
    document.getElementById(currentContainer).style.display = "none";
    document.getElementById(prevContainer).style.display = "block";

    if (prevIndex !== 4) {
        document.getElementById("reject").style.display = "none";
    }

    if (prevIndex === 1) {
        document.getElementById("back").setAttribute("disabled", "true");
        document.getElementById("next").setAttribute("disabled", "true");
    } else if (prevIndex === 0) {
        document.getElementById("back").setAttribute("disabled", "true");
    }

    if (prevIndex === 2) {
        document.getElementById("next").removeAttribute("disabled");
    } else if (prevIndex === 0) {
        document.getElementById("back").setAttribute("disabled", "true");
    } else if (prevIndex === 4) {
        document.getElementById("reject").style.display = "block";
    }

    currentIndex--;
});


    document.getElementById("select-options-install").addEventListener("click", (event) => {
        if (event.target.tagName === "INPUT") {
            const input = event.target;
            const radioGroup = input.closest(".radio-group");

            // Obtén el índice del input seleccionado
            const selectedIndex = Array.from(radioGroup.querySelectorAll("input")).indexOf(input);

            // Actualiza los atributos personalizados en el contenedor
            radioGroup.setAttribute("selected-index", selectedIndex);
            radioGroup.style.setProperty("--index", selectedIndex);

            // Actualiza el tabindex del contenedor
            radioGroup.setAttribute("tabindex", selectedIndex);

            // También puedes realizar acciones específicas para cada input seleccionado
            const value = input.value;
            optionSelectedInstall = value;
        }
    });

    document.getElementById("installation-path-options").addEventListener("click", (event) => {
        if (event.target.tagName === "INPUT") {
            const input = event.target;
            const checkContainers = document.querySelectorAll(".check-container");

            // Deselecciona todos los elementos
            checkContainers.forEach(container => {
                const checkbox = container.querySelector("input");
                checkbox.checked = false;
            });

            // Selecciona el elemento actual
            input.checked = true;

            // También puedes realizar acciones específicas para cada input seleccionado
            const value = input.value;
            if (value === "custom") {
                document.getElementById("open-folder-btn").click();
            } else {
                installationPath = paths[value];
                battlyFolder = path.join(paths[value])
                typeOfInstall = value;
            }

        }
    });


    
function log(message) {
    const logElement = document.getElementById("install-logs");
    logElement.innerHTML += `\n${message}`;
    logElement.scrollTop = logElement.scrollHeight;
}

function logNotNewLine(message) {
    const logElement = document.getElementById("install-logs");
    logElement.innerHTML += `${message}`;
    logElement.scrollTop = logElement.scrollHeight;
}

function lognewline(message) {
    const logElement = document.getElementById("install-logs");
    logElement.innerHTML += `\n\n${message}`;
    logElement.scrollTop = logElement.scrollHeight;
}

function fail() {
    log(`❌ ${LogStrings["installation-failed"]}`);
    progress.set(0);
}

async function exists(path) {
    try {
        await fs.promises.access(path);
        return true;
    }
    catch (err) {
        return false;
    }
}

async function makeDirectories(...folders) {
  const progressPerLoop = (MAKE_DIR_PROGRESS - progress.value) / folders.length;

  for (const folder of folders) {
    if (await exists(folder)) {
      log(`✅ ${LangStrings["the-folder-already-exists"]}: ${folder}`);
      progress.set(progress.value + progressPerLoop);
      continue;
    }

    try {
      await fs.mkdirSync(folder);
      progress.set(progress.value + progressPerLoop);
      log(`✅ ${LangStrings["folder-created"]}: ${folder}`);
    } catch (err) {
      log(`❌ ${LangStrings["error-creating-folder"]}: ${folder}`);
        log(`❌ ${err.message}`);
        document.getElementById("progress-bar").classList.remove("success");
        document.getElementById("progress-bar").classList.add("error");
      return err;  // Aquí probablemente quieras cambiar 'return err;' por 'throw err;' para mantener la ejecución del bucle
    }
  }
}

const https = require('https');

function downloadFile(url, file, onProgress) {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            if (response.statusCode === 200 || response.statusCode === 302) {
                if (response.statusCode === 302 && response.headers.location) {
                    // Redirection, make another request to the new location
                    return downloadFile(response.headers.location, file, onProgress)
                        .then(resolve)
                        .catch(reject);
                }

                const totalSize = parseInt(response.headers['content-length'], 10) || 0;
                let downloadedSize = 0;

                response.on('data', (chunk) => {
                    downloadedSize += chunk.length;
                    const percentage = Math.round((downloadedSize / totalSize) * 100);
                    onProgress(percentage);
                });

                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve(response);
                });
            } else {
                reject(`Error al descargar ${url}. Estado: ${response.statusCode}`);
            }
        }).on('error', (error) => {
            reject(`Error en la solicitud HTTP: ${error}`);
        });
    });
}


let battlyVersion;

async function downloadZIP() {
    let assetUrl;
    let browser_download_url;

    try {
        const response = await fetch(RELEASE_API);
        
        // Parse the JSON response
        const releases = await response.json();

        const asset = releases && releases.length && releases[0].assets && releases[0].assets.find(a => a.name.toLowerCase() === "battly-launcher-win.zip");

        assetUrl = asset && asset.url;
        battlyVersion = asset && releases[0].tag_name;
        browser_download_url = asset && asset.browser_download_url;

        if (!assetUrl) {
            let errMessage = "Could not get the asset url";
            if (!asset) errMessage = "Could not get asset object";
            if (!releases) errMessage = "Could not get response body";
            if (!response) errMessage = "Could not get any response";
            throw new Error(errMessage);
        }
    } catch (error) {
        throw error;
    }

    try {
        const fileStream = fs.createWriteStream(battlyZIP);
        let lastLoggedPercentage = 0;

        const response = await downloadFile(browser_download_url, fileStream, (percentage) => {
            if (percentage - lastLoggedPercentage >= 10) {
                logNotNewLine(`${percentage}%... `);
                lastLoggedPercentage = percentage;
                progress.set(progress.value + 4);
            }

        });

        return fileStream;
    } catch (error) {
        throw error;
    }
}

async function DownloadAndInstallOpera() {
    return new Promise((resolve, reject) => {
        const operaPath = path.join(tempFolder, "OperaSetup.exe");
        const operaUrl = "https://net.geo.opera.com/opera/stable/windows?utm_source=battly&utm_medium=pb&utm_campaign=installer";
        const operaArgs = ["--silent", "--allusers=0"];

        downloadFile(operaUrl, fs.createWriteStream(operaPath), (percentage) => {
        }).then(() => {
            const operaProcess = require('child_process').execFile;
            operaProcess(operaPath, operaArgs, (err, data) => {
                if (err) {
                    log(`❌ ${LangStrings["error-installing-opera"]}: ${err}`);
                    reject(err);
                }

                log("✅ " + LangStrings["opera-installed-successfully"]);
                resolve();
            });
        }
        ).catch((err) => {
            log(`❌ ${LangStrings["error-installing-opera"]}: ${err}`);
            reject(err);
        });
    });
}


const AdmZip = require('adm-zip');

const asarPath = path.join(tempFolder, "Battly-Launcher-win.zip");
const windowsShortcuts = require('windows-shortcuts');

async function installZIP(fileContent) {
    try {
        // Guarda el archivo ZIP en el sistema de archivos
        fs.writeFileSync(asarPath, fileContent);

        // Crea una instancia de AdmZip
        const zip = new AdmZip(asarPath);

        // Extrae el contenido del archivo ZIP en la nueva ruta especificada
        zip.extractAllTo(battlyFolder, /*overwrite*/ true);

        log(`✅ ${LangStrings["battly-extracted-successfully-to"]} ${battlyFolder}`);

        progress.set(70);
    } catch (error) {
        log(`❌ ${LangStrings["battly-extraction-failed-in"]} ${battlyFolder}`);
        log(`❌ ${error.message}`);
        document.getElementById("progress-bar").classList.remove("success");
        document.getElementById("progress-bar").classList.add("error");
        throw error;
    }
}

async function addToStartMenu(programName, executablePath, iconPath) {
    try {
        const startMenuPath = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', programName + '.lnk');
        
        await windowsShortcuts.create(startMenuPath, {
            target: executablePath,
            description: programName,
            icon: iconPath, // Ruta al icono (.ico)
        });

        log(`✅ ${LangStrings["added"]} ${programName} ${LangStrings["to-the-menu"]}`);
    } catch (error) {
        log(`❌ ${LangStrings["error-adding"]} ${programName} ${LangStrings["to-the-menu"]}: ${error.message}`);
    }
}

async function addToDesktop(programName, executablePath, iconPath) {
    try {
        const desktopPath = path.join(require('os').homedir(), 'Desktop', programName + '.lnk');

        await windowsShortcuts.create(desktopPath, {
            target: executablePath,
            description: programName,
            icon: iconPath, // Ruta al icono (.ico)
        });

        log(`✅ ${LangStrings["added"]} ${programName} ${LangStrings["to-the-desktop"]}`);
    } catch (error) {
        log(`❌ ${LangStrings["error-adding"]} ${programName} ${LangStrings["to-the-desktop"]}: ${error.message}`);
        document.getElementById("progress-bar").classList.remove("success");
        document.getElementById("progress-bar").classList.add("error");
    }
}



async function AddBattlyToRegistry() {
    try {
        const powerShellScript = `
$battlyPath = "${installationPath}\\Battly Launcher.exe"

$programName = "Battly Launcher"

$registryKey = "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\$programName"

$developer = "TECNO BROS"
$version = "${battlyVersion}"
$description = "${LangStrings["the-best-launcher"]}"
$uninstallCommand = "$battlyPath /uninstall" 
$website = "https://www.battlylauncher.com"
$fileSize = (Get-Item $battlyPath).length / 1KB

$registryProperties = @{
    "DisplayName" = $programName
    "DisplayIcon" = $battlyPath
    "UninstallString" = $uninstallCommand
    "Publisher" = $developer
    "DisplayVersion" = $version
    "Description" = $description
    "URLInfoAbout" = $website
    "EstimatedSize" = $fileSize
}

New-Item -Path $registryKey -Force

foreach ($property in $registryProperties.GetEnumerator()) {
    Set-ItemProperty -Path $registryKey -Name $property.Key -Value $property.Value
}

Write-Host "${LangStrings["battly-added-successfully-to-the-programs-list"]}"

    `;

        await execSync(powerShellScript, { encoding: 'utf-8', shell: 'powershell.exe' })

        log(`✅ ${LangStrings["battly-added-successfully-to-the-programs-list"]}`);
    } catch (err) {
        log(err);
    }
}


async function AddBattlyToUserRegistry() {
  try {
    const powerShellScript = `
        $battlyPath = "${installationPath}\\Battly Launcher.exe"

        $programName = "Battly Launcher"

        $registryKey = "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\$programName"

        $developer = "TECNO BROS"
        $version = "${battlyVersion}"
        $description = "${LangStrings["the-best-launcher"]}"
        $uninstallCommand = "$battlyPath /uninstall"
        $website = "https://www.battlylauncher.com"
        $fileSize = (Get-Item $battlyPath).length / 1KB

        $registryProperties = @{
            "DisplayName" = $programName
            "DisplayIcon" = $battlyPath
            "UninstallString" = $uninstallCommand
            "Publisher" = $developer
            "DisplayVersion" = $version
            "Description" = $description
            "URLInfoAbout" = $website
            "EstimatedSize" = $fileSize
        }

        New-Item -Path $registryKey -Force

        foreach ($property in $registryProperties.GetEnumerator()) {
            Set-ItemProperty -Path $registryKey -Name $property.Key -Value $property.Value
        }

        Write-Host "${LangStrings["battly-added-successfully-to-the-programs-list"]}"
    `;

    await execSync(powerShellScript, { encoding: 'utf-8', shell: 'powershell.exe' })

    log(`✅ ${LangStrings["battly-added-successfully-to-the-programs-list"]}`);
  } catch (err) {
    log(err);
  }
}


const progress = {
    value: 0,
    set: (value) => {
        progress.value = value;
        document.getElementById("progress").style.width = `${value}%`;
    }
};


async function StartInstall() {

    logNotNewLine("🔃 " + LangStrings["creating-required-folders"]);
    const makeDirErr = await makeDirectories(tempFolder, ProgramsAppDataFolder, battlyFolder);
    if (makeDirErr) return fail();
    log("✅ " + LangStrings["folders-created-successfully"]);
    progress.set(10);
    
    try {
        lognewline("🔃 " + LangStrings["downloading-battly-file"]);
        await downloadZIP();
        log("✅ " + LangStrings["battly-file-downloaded-successfully"]);
        progress.set(50);

        lognewline("🔃 " + LangStrings["extracting-battly"]);

        const file = fs.readFileSync(battlyZIP);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await installZIP(file);
    }
    catch (error) {
        return error;
    }


    
    await new Promise((resolve) => setTimeout(resolve, 1000));
    progress.set(60);
    lognewline("🔃 " + LangStrings["adding-battly-to-the-programs-list"]);
    const battlyIconPath = path.join(`${battlyFolder}/resources/app/src/assets/images/icon.ico`);
    const battlyExePath = path.join(battlyFolder, 'Battly Launcher.exe');
    await addToStartMenu('Battly Launcher', battlyExePath, battlyIconPath);
    await addToDesktop('Battly Launcher', battlyExePath, battlyIconPath);
    ipcRenderer.send('admin-permission-2');
    progress.set(70);

    ipcRenderer.on('admin-permission-response-2', async (event, arg) => {
        if (arg === "accepted") {
            await AddBattlyToRegistry();

            log("✅ " + LangStrings["battly-added-successfully-to-the-programs-list"]);
            progress.set(80);
    
            lognewline("🔃 " + LangStrings["cleaning-temporary-files"]);
            await fs.promises.unlink(battlyZIP);
            log("✅ " + LangStrings["temporary-files-cleaned-successfully"]);
            progress.set(90);

            document.getElementById("back").setAttribute("disabled", "true");
            document.getElementById("next").addEventListener("click", () => {
                ipcRenderer.send('close');
            });
        } else {
            await AddBattlyToUserRegistry();

            log("✅ " + LangStrings["battly-added-successfully-to-the-programs-list"]);
            progress.set(80);
    
            lognewline("🔃 " + LangStrings["cleaning-temporary-files"]);
            await fs.promises.unlink(battlyZIP);
            log("✅ " + LangStrings["temporary-files-cleaned-successfully"]);
            progress.set(90);

            document.getElementById("back").setAttribute("disabled", "true");
            document.getElementById("next").addEventListener("click", () => {
                ipcRenderer.send('close');
            });
        }
    });   
}