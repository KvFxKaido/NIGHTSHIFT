import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const blender = process.argv.slice(2).find(arg => arg !== '--') ?? process.env.BLENDER_EXE ?? 'blender';
await new Promise((resolve, reject) => {
  const child = spawn(blender, ['--background',
    fileURLToPath(new URL('../assets/tracks/blackglass/blackglass-rivergate.blend', import.meta.url)),
    '--python-exit-code', '1', '--python', fileURLToPath(new URL('./export-blackglass.py', import.meta.url))],
    { cwd: root, stdio: 'inherit', windowsHide: true });
  child.on('error', error => reject(new Error(`Cannot run Blender. Set BLENDER_EXE or pass its path. ${error.message}`)));
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Track export exited ${code}`)));
});
await import('./optimize-track.mjs');
