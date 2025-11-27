const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridge', {
    chooseDirectory: () => ipcRenderer.invoke('dialog:chooseDirectory'),
    checkAdmin: () => ipcRenderer.invoke('sys:checkAdmin'),
    elevateIfNeeded: (needAdmin) => ipcRenderer.invoke('sys:elevateIfNeeded', needAdmin),
    getArchitecture: () => ipcRenderer.invoke('sys:getArchitecture'),
    getLatestVersion: () => ipcRenderer.invoke('github:getLatestVersion'),
    getInstallerConfig: () => ipcRenderer.invoke('github:getInstallerConfig'),
    isUninstallMode: () => ipcRenderer.invoke('sys:isUninstallMode'),
    isSilentMode: () => ipcRenderer.invoke('sys:isSilentMode'),
    isRunning: (exeName) => ipcRenderer.invoke('proc:isRunning', exeName),
    isRunningByPid: (pid) => ipcRenderer.invoke('proc:isRunningByPid', pid),
    killProcess: (exeName) => ipcRenderer.invoke('proc:kill', exeName),
    getPaths: (targetName) => ipcRenderer.invoke('install:getPaths', targetName),
    detectExisting: (appId) => ipcRenderer.invoke('install:detectExisting', appId),
    doInstall: (payload) => ipcRenderer.invoke('install:do', payload),
    writeUninstaller: (info) => ipcRenderer.invoke('install:writeUninstaller', info),
    openInExplorer: (p) => ipcRenderer.invoke('shell:open', p),
    launchApp: (info) => ipcRenderer.invoke('app:launch', info),
    // Controles de ventana
    windowMinimize: () => ipcRenderer.send('window:minimize'),
    windowMaximize: () => ipcRenderer.send('window:maximize'),
    windowClose: () => ipcRenderer.send('window:close')
});

// ReenvÃ­o de progreso al renderer mediante CustomEvent
ipcRenderer.on('install:progress', (_event, data) => {
    const ev = new CustomEvent('install-progress', { detail: data });
    window.dispatchEvent(ev);
});
