const { app, BrowserWindow, ipcMain, dialog, ipcRenderer } = require('electron');
const fs = require('fs');
require('ejs-electron')

//Create our main windows, here you can set the initial size.
const createWindow = () => {
  const win = new BrowserWindow({
    title: "Battly Launcher Installer",
    frame: false,
    width: 605,
    height: 385,
    resizable: false,
    fullscreenable: false,
    maximizable: false,
    backgroundColor: "#0c0d10",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      devTools: false
    },
    icon: __dirname + '/assets/icon.ico'
  });
  win.loadURL(`file://${__dirname}/index.ejs`);
    
  ipcMain.on('minimize', () => {
    win.minimize()
  });

  ipcMain.on('close', () => {
    win.close()
  });

  let texts = {
    es: {
      1: "No tienes permisos de administrador.",
      2: "Para continuar con la instalación en esta ruta, necesitas permisos de administrador."
    },
    en: {
      1: "You don't have administrator permissions.",
      2: "To continue with the installation in this path, you need administrator permissions."
    },
    pt: {
      1: "Você não tem permissões de administrador.",
      2: "Para continuar com a instalação neste caminho, você precisa de permissões de administrador."
    },
    it: {
      1: "Non hai permessi di amministratore.",
      2: "Per continuare con l'installazione in questo percorso, è necessario avere i permessi di amministratore."
    },
    fr: {
      1: "Vous n'avez pas les autorisations d'administrateur.",
      2: "Pour continuer avec l'installation dans ce chemin, vous avez besoin d'autorisations d'administrateur."
    },
    de: {
      1: "Sie haben keine Administratorberechtigungen.",
      2: "Um mit der Installation in diesem Pfad fortzufahren, benötigen Sie Administratorberechtigungen."
    }
  }

  ipcMain.on('admin-permission', async (event, lang) => {
    let exec = require('child_process').exec;
    let adminPermissionListener = async function (err, so, se) {
        if (se) {
            console.log(lang);
            dialog.showMessageBox(win, {
                type: "error",
                title: "Error",
                message: texts[lang][1],
                detail: texts[lang][2],
            });
            win.webContents.send('admin-permission-response', "rejected");
            ipcMain.removeListener('admin-permission', adminPermissionListener);
        } else {
            win.webContents.send('admin-permission-response', "accepted");
            ipcMain.removeListener('admin-permission', adminPermissionListener);
        }
    };

    exec('NET SESSION', adminPermissionListener);
});


  ipcMain.on('admin-permission-2', () => {
    let exec = require('child_process').exec;
    exec('NET SESSION', function (err, so, se) {
      if (se) {
        win.webContents.send('admin-permission-response-2', "rejected");
      } else {
        win.webContents.send('admin-permission-response-2', "accepted");
      }
    });
  });

  ipcMain.on("open-folder-dialog", async (event) => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    });

    if (!result.canceled) {
      const selectedDirectory = result.filePaths[0];

      // Intenta crear un archivo dentro de la carpeta seleccionada
      const tempFilePath = `${selectedDirectory}/battly-temp.txt`;
      fs.writeFile(tempFilePath, 'Test', (err) => {
        if (err) {
          event.sender.send("selected-directory", "permisos_rechazados");
        } else {
          fs.unlink(tempFilePath, (err) => {
            if (err) {
              console.error('Error al eliminar el archivo temporal:', err);
            }
          });
          event.sender.send("selected-directory", selectedDirectory);
        }
      });
    } else {
      event.sender.send("selected-directory", "seleccion_cancelada");
    }
  });
}

app.whenReady().then(() => {
  createWindow()
})