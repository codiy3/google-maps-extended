import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

async function files(directory) {
  return (
    await Promise.all(
      await readdir(directory, { withFileTypes: true }).then((entries) =>
        entries.map(async (entry) =>
          entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)],
        ),
      ),
    )
  ).flat();
}
const root = process.argv[2] ?? 'dist';
const paths = await files(root);
for (const path of paths) {
  if (/\.(?:sqlite3?|db|zip|pem|key)$|\/\.env(?:\.|$)/.test(path))
    throw new Error(`公開対象にローカルファイルがあります: ${path}`);
  if (/\.(?:js|json|html|css)$/.test(path)) {
    const content = await readFile(path, 'utf8');
    if (
      /AIza[0-9A-Za-z_-]{35}|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(
        content,
      )
    )
      throw new Error(`公開対象に認証情報の疑いがあります: ${path}`);
  }
}
const catalog = JSON.parse(await readFile(join(root, 'data/catalog.json'), 'utf8'));
const stations = JSON.parse(await readFile(join(root, 'data/stations.json'), 'utf8'));
const network = JSON.parse(await readFile(join(root, 'data/journey-network.json'), 'utf8'));
if (
  catalog.schemaVersion !== 3 ||
  !catalog.dataRevision ||
  stations.schemaVersion !== 1 ||
  network.schemaVersion !== 1 ||
  stations.dataRevision !== catalog.dataRevision ||
  network.dataRevision !== catalog.dataRevision
)
  throw new Error('公開データの版が一致しません。');
const routes = await readdir(join(root, 'data/routes'));
if (
  routes.length !== catalog.routes.length ||
  catalog.routes.some((r) => !routes.includes(`${r.id}.json`))
)
  throw new Error('路線カタログと公開ファイルが一致しません。');
console.log(
  `公開ビルド検査成功: ${catalog.routes.length}候補・${stations.stations.length}駅候補。Googleキー・DB・原典ZIPなし。`,
);
