import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function run() {
  const child = spawn(process.execPath, ['scripts/dev.mjs', '--no-open'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  const exit = once(child, 'exit');
  return { child, exit, output: () => output };
}
function availablePort() {
  const socket = createServer((connection) => connection.destroy());
  return new Promise((resolveReady, reject) => {
    socket.once('error', reject);
    socket.listen(5173, '127.0.0.1', () => resolveReady(socket));
  });
}

test('ローカル固定ポートで起動しSIGINT後に解放する', { timeout: 20000 }, async () => {
  const initial = await availablePort();
  await new Promise((resolveClose) => initial.close(resolveClose));
  const process = run();
  try {
    await new Promise((ready, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`起動待ちがタイムアウト: ${process.output()}`)),
        12000,
      );
      process.child.stdout.on('data', () => {
        if (process.output().includes('http://127.0.0.1:5173')) {
          clearTimeout(timeout);
          ready();
        }
      });
      process.exit.then(([code]) => {
        clearTimeout(timeout);
        reject(new Error(`起動前に終了: ${code} ${process.output()}`));
      });
    });
    const response = await fetch('http://127.0.0.1:5173/data/catalog.json');
    assert.equal(response.status, 200);
    assert.ok((await response.json()).routes.length > 0);
    process.child.kill('SIGINT');
    assert.equal((await process.exit)[0], 0);
    const released = await availablePort();
    await new Promise((resolveClose) => released.close(resolveClose));
  } finally {
    process.child.kill('SIGTERM');
  }
});

test('使用中のポートを奪わず、別のポートへ移動せず終了する', { timeout: 12000 }, async () => {
  const occupied = await availablePort();
  const process = run();
  try {
    assert.equal((await process.exit)[0], 1);
    assert.match(process.output(), /5173.*in use/);
    assert.equal(occupied.listening, true);
  } finally {
    process.child.kill('SIGTERM');
    await new Promise((resolveClose) => occupied.close(resolveClose));
  }
});
