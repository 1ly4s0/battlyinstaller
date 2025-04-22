const AdmZip = require('adm-zip');

const [zipPath, outputPath] = process.argv.slice(2);

try {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(outputPath, true);

    process.send({ status: 'success', message: `Extraction completed to ${outputPath}` });
    process.exit(0);
} catch (error) {
    process.send({ status: 'error', message: error.message });
    process.exit(1);
}
