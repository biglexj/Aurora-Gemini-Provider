import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

export function resolveGeminiBinary() {
  if (process.env.GEMINI_BINARY && existsSync(process.env.GEMINI_BINARY)) return process.env.GEMINI_BINARY;
  if (process.env.AGY_BINARY && existsSync(process.env.AGY_BINARY)) return process.env.AGY_BINARY;

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const standardAgy = path.join(localAppData, 'agy', 'bin', 'agy.exe');
    if (existsSync(standardAgy)) return standardAgy;

    for (const name of ['agy', 'gemini']) {
      const probe = spawnSync('where.exe', [name], {encoding: 'utf8', shell: false, windowsHide: true});
      if (probe.status === 0 && probe.stdout) {
        const found = probe.stdout.split(/\r?\n/).map(l => l.trim()).find(p => existsSync(p));
        if (found) return found;
      }
    }
    return standardAgy;
  }

  // Linux / Unix
  const home = os.homedir();
  const candidates = [
    path.join(home, '.local', 'bin', 'agy'),
    path.join(home, '.local', 'bin', 'gemini'),
    '/usr/local/bin/agy',
    '/usr/local/bin/gemini'
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }

  for (const name of ['agy', 'gemini']) {
    const probe = spawnSync('which', [name], {encoding: 'utf8', shell: false});
    if (probe.status === 0 && probe.stdout) {
      const found = probe.stdout.trim();
      if (found && existsSync(found)) return found;
    }
  }

  return path.join(home, '.local', 'bin', 'agy');
}
