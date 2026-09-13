import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { verifySearchCatalog } from './catalog.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let server;
let api;
let stopping = false;
async function stop(code) {
  if (stopping) return;
  stopping = true;
  await server?.close();
  if (api?.pid && api.exitCode === null && api.signalCode === null) {
    const stopped = once(api, 'exit');
    api.kill('SIGTERM');
    await stopped;
  }
  process.exit(code);
}
process.once('SIGINT', () => {
  void stop(0);
});
process.once('SIGTERM', () => {
  void stop(0);
});

try {
  if (process.versions.node !== '24.21.0')
    throw new Error('Node.js 24.21.0を使用してください。setup.commandで専用環境を準備できます。');
  await verifySearchCatalog(resolve(root, 'public/data/catalog.json'));
  const token = randomBytes(32).toString('hex');
  api = spawn(resolve(root, '.venv/bin/python'), ['-m', 'railway_data.server'], {
    cwd: root,
    env: { ...process.env, RAILWAY_API_TOKEN: token },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const port = await new Promise((ready, reject) => {
    const timer = setTimeout(
      () => reject(new Error('ローカルDBの起動がタイムアウトしました。')),
      15000,
    );
    let output = '';
    api.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/RAILWAY_API_PORT=(\d+)/);
      if (match) {
        clearTimeout(timer);
        ready(Number(match[1]));
      }
    });
    api.once('error', () => {
      clearTimeout(timer);
      reject(new Error('専用Python環境がありません。setup.commandを実行してください。'));
    });
    api.once('exit', () => {
      clearTimeout(timer);
      reject(new Error('ローカルDBを起動できません。表示データを再生成してください。'));
    });
  });
  api.once('exit', () => {
    if (!stopping) {
      console.error('ローカルDBが終了したためアプリを停止します。');
      void stop(1);
    }
  });
  server = await createServer({
    root,
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      open: false,
      proxy: {
        '/api': { target: `http://127.0.0.1:${port}`, headers: { 'X-Railway-Token': token } },
      },
    },
  });
  await server.listen();
  console.log(
    'Railway Viewer: http://127.0.0.1:5173\n終了するには、このターミナルでCtrl+Cを押してください。',
  );
  if (!process.argv.includes('--no-open')) {
    const url = 'http://127.0.0.1:5173';
    const command =
      process.platform === 'darwin'
        ? 'open'
        : process.platform === 'win32'
          ? 'explorer.exe'
          : 'xdg-open';
    const browser = spawn(command, [url], { stdio: 'ignore' });
    browser.on('error', () => console.log('ブラウザで http://127.0.0.1:5173 を開いてください。'));
  }
} catch (error) {
  console.error(`起動できません: ${error instanceof Error ? error.message : '不明なエラー'}`);
  await stop(1);
}
