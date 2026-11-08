import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const python = resolve(
  '.venv',
  isWindows ? 'Scripts' : 'bin',
  isWindows ? 'python.exe' : 'python',
);

if (!existsSync(python)) {
  console.error('Python virtual environment not found. Create it with: python -m venv .venv');
  process.exit(1);
}

const child = spawn(python, process.argv.slice(2), { stdio: 'inherit' });
child.on('error', (error) => {
  console.error(`Could not start the Python backend: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
