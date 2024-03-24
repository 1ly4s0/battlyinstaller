const fs = require('fs');
const path = require('path');
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

document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById("reject").style.display = "none";
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
                    await import(`./index-${language}.js`);
                }
            });
        });
    });
});
