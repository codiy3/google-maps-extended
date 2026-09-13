import { readFile } from 'node:fs/promises';

export async function verifySearchCatalog(path) {
  let catalog;
  try {
    catalog = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new Error('表示データを読めません。setup.commandでデータを生成してください。');
  }
  if (
    catalog?.schemaVersion !== 2 ||
    !Array.isArray(catalog.routes) ||
    catalog.routes.length === 0 ||
    catalog.routes.some(
      (route) =>
        !route ||
        typeof route.id !== 'string' ||
        !Array.isArray(route.stationNames) ||
        route.stationNames.some((name) => typeof name !== 'string') ||
        !Array.isArray(route.operatorAliases) ||
        route.operatorAliases.some((name) => typeof name !== 'string'),
    )
  ) {
    throw new Error(
      '検索データが古いか不完全です。npm run data:build を実行してから、npm run dev で再起動してください。',
    );
  }
}
