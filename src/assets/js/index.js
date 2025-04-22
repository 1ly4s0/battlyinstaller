const fs = require('fs');
const path = require('path');
const https = require('https');
const { ipcRenderer } = require('electron');

let language = 'es';
async function eula(lang) {
    const eula = fs.readFileSync(path.join(__dirname, `/assets/langs/${lang}/eula.txt`), 'utf-8');
    return eula;
}
async function lang(lang) {
    try {
        const langModule = await import(`./langs/${lang}.js`);
        const langFile = langModule.default;

        return langFile;

    } catch (error) {
        console.error(error);
    }
}

const RELEASE_API = "https://api.github.com/repos/1ly4s0/battlylauncher/releases";

async function LoadGitHubData() {
    const response = await fetch(RELEASE_API);
    const releases = await response.json();
    document.getElementById("version").innerHTML = releases[0].tag_name;
}

LoadGitHubData();

function CopyToAppData(redirectedUrl) {
    let url = redirectedUrl || 'https://github.com/1ly4s0/battlyinstaller/releases/latest/download/Battly-Launcher-Windows.exe';
    let dest = `${process.env.APPDATA}\\.battly\\installer\\installer.exe`;


    if (!fs.existsSync(`${process.env.APPDATA}\\.battly\\installer`)) {
        fs.mkdirSync(`${process.env.APPDATA}\\.battly\\installer`, { recursive: true });
    }

    const file = fs.createWriteStream(dest);

    https.get(url, function (response) {
        if (response.statusCode === 200) {
            response.pipe(file);

            response.on('finish', function () {
                file.close();
            });

            file.on('error', function (err) {
                fs.unlinkSync(dest);
                if (callback) callback(err.message);
            });

        } else if (response.statusCode === 302) {
            const redirectedUrl = response.headers.location;
            CopyToAppData(redirectedUrl);

        }
    }).on('error', function (err) {
        fs.unlink(dest, () => { });
        if (callback) callback(err.message);
    });
}

// CopyToAppData();



document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById("reject").style.display = "none";

    document.getElementById("minimize").addEventListener("click", () => {
        ipcRenderer.send('minimize');
    });

    document.getElementById("close").addEventListener("click", () => {
        ipcRenderer.send('close');
    });

    const { shell } = require('electron');

    document.getElementById("web")?.addEventListener('click', async function () {
        console.log("web");
        shell.openExternal('https://battlylauncher.com')
    });

    document.getElementById("youtube")?.addEventListener('click', async function () {
        shell.openExternal('https://youtube.com/tecnobros')
    });

    document.getElementById("discord")?.addEventListener('click', async function () {
        shell.openExternal('https://discord.gg/tecno-bros-885235460178342009')
    });


    const radioItems = document.querySelectorAll('#radio-item');

    radioItems.forEach(async function (item) {
        item.addEventListener('click', async function () {
            const isSelected = this.classList.contains('selected');

            radioItems.forEach(function (item) {
                item.classList.remove('selected');
            });

            if (!isSelected) {
                this.classList.add('selected');
                language = this.getAttribute('value');
                document.getElementById("next").removeAttribute("disabled");
                localStorage.setItem('lang', language);
            } else {
                language = 'es';
                document.getElementById("next").setAttribute("disabled", "true");
            }

            let LangStrings = await lang(language);

            document.getElementById("eula").innerHTML = await eula(language);
            document.getElementById("next").innerHTML = LangStrings["next"];
            document.getElementById("back").innerHTML = LangStrings["back"];
            document.getElementById("reject").innerHTML = LangStrings["reject"];
            document.getElementById("eula-text").innerHTML = LangStrings["battly-eula"];
            document.getElementById("eula-accept-text").innerHTML = LangStrings["battly-eula-accept"];
            document.getElementById("what-do-you-want-to-do").innerHTML = LangStrings["what-do-you-want-to-do"];
            document.getElementById("install-battly-text").innerHTML = LangStrings["install-battly"];
            document.getElementById("repair-battly-text").innerHTML = LangStrings["repair-battly"];
            document.getElementById("uninstall-battly-text").innerHTML = LangStrings["uninstall-battly"];
            document.getElementById("where-do-you-want-to-install-battly").innerHTML = LangStrings["where-do-you-want-to-install-battly"];
            document.getElementById("all-users-text").innerHTML = LangStrings["all-users"];
            document.getElementById("custom-path-text").innerHTML = LangStrings["custom-path"];
            document.getElementById("search").innerHTML = LangStrings["search"];
            document.getElementById("opera-install-text").innerHTML = LangStrings["opera-install-text"];
            document.getElementById("opera-install-text-description").innerHTML = LangStrings["opera-install-text-description"];
            document.getElementById("install-logs-text").innerHTML = LangStrings["installing-battly"];
            document.getElementById("opera-ad").src = `./assets/images/opera_banner_${language}.png`;


            localStorage.setItem('lang', language);

            document.getElementById("next").addEventListener('click', async function () {
                console.log("next");
                //si la ventana actual es la de lang, cargar  await import(`./index-${language}.js`);

                if (document.getElementById("language").style.display !== "none") {
                    document.getElementById("language").style.display = "none";
                    document.getElementById("eula-container").style.display = "block";
                    document.getElementById("back").setAttribute("disabled", "true");
                    document.getElementById("next").setAttribute("disabled", "true");
                    await import(`./main.js`);
                }
            });
        });
    });
});


