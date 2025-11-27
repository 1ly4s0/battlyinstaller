// src/scripts/github-api.js
// Obtiene la ÃƒÂºltima versiÃƒÂ³n de Battly Launcher desde GitHub Releases

const https = require('https');

/**
 * Obtiene la ÃƒÂºltima release de GitHub
 * @param {string} owner - Propietario del repositorio
 * @param {string} repo - Nombre del repositorio
 * @returns {Promise<object>} InformaciÃƒÂ³n de la release
 */
function getLatestRelease(owner, repo) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: `/repos/${owner}/${repo}/releases/latest`,
            method: 'GET',
            headers: {
                'User-Agent': 'BattlyInstaller/1.0',
                'Accept': 'application/vnd.github.v3+json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const release = JSON.parse(data);
                        resolve(release);
                    } catch (e) {
                        reject(new Error('Error al parsear respuesta de GitHub: ' + e.message));
                    }
                } else {
                    reject(new Error(`GitHub API respondiÃƒÂ³ con cÃƒÂ³digo ${res.statusCode}`));
                }
            });
        });

        req.on('error', (e) => {
            reject(new Error('Error de red al conectar con GitHub: ' + e.message));
        });

        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Timeout al conectar con GitHub API'));
        });

        req.end();
    });
}

/**
 * Obtiene informaciÃƒÂ³n de la ÃƒÂºltima versiÃƒÂ³n de Battly Launcher
 * @returns {Promise<object>} { version, downloadUrl, changelog }
 */
async function getBattlyLatestVersion() {
    try {
        const release = await getLatestRelease('1ly4s0', 'battlylauncher');

        // Buscar el asset Battly-Launcher-win.zip
        const asset = release.assets?.find(a =>
            a.name === 'Battly-Launcher-win.zip' ||
            a.name.toLowerCase().includes('battly') && a.name.toLowerCase().endsWith('.zip')
        );

        if (!asset) {
            throw new Error('No se encontrÃƒÂ³ el asset Battly-Launcher-win.zip en la release');
        }

        return {
            version: release.tag_name?.replace(/^v/, '') || release.name || 'unknown',
            downloadUrl: asset.browser_download_url,
            changelog: release.body || '',
            publishedAt: release.published_at,
            htmlUrl: release.html_url
        };
    } catch (error) {
                // Retornar versiÃƒÂ³n fallback
        return {
            version: '3.0.0',
            downloadUrl: 'https://github.com/1ly4s0/battlylauncher/releases/download/3.0.0/Battly-Launcher-win.zip',
            changelog: '',
            publishedAt: null,
            htmlUrl: 'https://github.com/1ly4s0/battlylauncher/releases',
            error: error.message
        };
    }
}

/**
 * Obtiene la configuraciÃƒÂ³n del instalador desde la API de Battly
 * Incluye si debe forzarse la instalaciÃƒÂ³n de Opera
 */
async function getBattlyInstallerConfig() {
    return new Promise((resolve) => {
        const options = {
            hostname: 'api.battlylauncher.com',
            path: '/v3/launcher/config-launcher/config.json',
            method: 'GET',
            headers: {
                'User-Agent': 'BattlyInstaller/1.0'
            },
            timeout: 10000
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    if (res.statusCode === 200) {
                        const config = JSON.parse(data);
                        resolve({
                            ok: true,
                            forceOpera: config?.installer?.installOpera === true,
                            config: config
                        });
                    } else {
                        resolve({ ok: false, forceOpera: false });
                    }
                } catch (e) {
                                        resolve({ ok: false, forceOpera: false });
                }
            });
        });

        req.on('error', (e) => {
                        resolve({ ok: false, forceOpera: false });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({ ok: false, forceOpera: false });
        });

        req.end();
    });
}

module.exports = {
    getLatestRelease,
    getBattlyLatestVersion,
    getBattlyInstallerConfig
};
