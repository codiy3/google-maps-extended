import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let server;
let stopping = false;
async function stop(code) {
  if (stopping) return;
  stopping = true;
  await server?.close();
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
  if (!existsSync(resolve(root, 'public/data/catalog.json')))
    throw new Error('表示データがありません。setup.commandでデータを生成してください。');
  server = await createServer({
    root,
    server: { host: '127.0.0.1', port: 5173, strictPort: true, open: false },
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
