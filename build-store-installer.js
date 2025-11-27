const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('='.repeat(60));
console.log('  Building Battly Installer for Microsoft Store');
console.log('='.repeat(60));
console.log('');

const distDir = path.join(__dirname, 'dist-store');
const outputExe = path.join(distDir, 'BattlyInstaller.exe');

// Limpiar dist-store
console.log('1. Limpiando directorio dist-store...');
if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// Verificar que existe el ZIP
const zipPath = path.join(__dirname, 'src', 'Battly-Launcher-win.zip');
if (!fs.existsSync(zipPath)) {
    console.error(`ERROR: No se encuentra ${zipPath}`);
    console.error('Por favor, coloca Battly-Launcher-win.zip en src/');
    process.exit(1);
}

const zipSizeMB = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(2);
console.log(`   ✓ ZIP encontrado: ${zipSizeMB} MB`);
console.log('');

// Copiar ZIP a la carpeta del instalador para que pkg lo incluya
console.log('2. Preparando assets para pkg...');
const installerZip = path.join(__dirname, 'store-installer', 'Battly-Launcher-win.zip');
fs.copyFileSync(zipPath, installerZip);
console.log(`   ✓ ZIP copiado a store-installer/`);
console.log('');

// Compilar con pkg incluyendo el ZIP
console.log('3. Compilando instalador con pkg...');
console.log('   (Esto puede tardar varios minutos la primera vez)');
console.log('');

try {
    execSync(
        `npx pkg store-installer/index.js --target node18-win-x64 --output "${outputExe}" --compress GZip --public --public-packages "*" --no-bytecode --debug`,
        { stdio: 'inherit' }
    );
} catch (err) {
    console.error('ERROR en compilación con pkg');
    process.exit(1);
}

// Limpiar ZIP temporal
fs.unlinkSync(installerZip);
console.log('');
console.log('   ✓ Assets limpiados');

// Verificar tamaño del .exe
const exeSizeMB = (fs.statSync(outputExe).size / 1024 / 1024).toFixed(2);
console.log('');
console.log('='.repeat(60));
console.log('  ✓ Build completado exitosamente!');
console.log('='.repeat(60));
console.log('');
console.log(`Archivo generado: ${outputExe}`);
console.log(`Tamaño: ${exeSizeMB} MB (incluye ZIP de ${zipSizeMB} MB)`);
console.log('');
console.log('Para probar:');
console.log(`  .\\dist-store\\BattlyInstaller.exe /install`);
console.log(`  .\\dist-store\\BattlyInstaller.exe /uninstall`);
console.log('');
console.log('NOTA: El .exe es standalone, no necesita archivos externos.');
console.log('');
