import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const blender = process.argv.slice(2).find(arg => arg !== '--') ?? process.env.BLENDER_EXE ?? 'blender';
const args = ['--background', fileURLToPath(new URL('../assets/cars/ns-coupe-01.blend', import.meta.url)),
  '--python-exit-code', '1', '--python', fileURLToPath(new URL('./export-coupe.py', import.meta.url))];
await new Promise((resolve, reject) => {
  const child = spawn(blender, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  child.on('error', error => reject(new Error(`Cannot run Blender. Set BLENDER_EXE or pass its executable path. ${error.message}`)));
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Blender export exited ${code}`)));
});
await import('./optimize-car.mjs');
