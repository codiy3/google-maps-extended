import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { verifySearchCatalog } from './catalog.mjs';

for (const catalog of [
  { schemaVersion: 1, routes: [{ id: 'old' }] },
  { schemaVersion: 2, routes: [{ id: 'missing-fields' }] },
]) {
  test(`旧形式・不完全な索引を保護して再生成を案内する: ${catalog.routes[0].id}`, async (t) => {
    const dir = await mkdtemp(join(tmpdir(), 'railway-catalog-test-'));
    t.after(() => rm(dir, { recursive: true }));
    const file = join(dir, 'catalog.json');
    const original = JSON.stringify(catalog);
    await writeFile(file, original);
    await assert.rejects(verifySearchCatalog(file), /npm run data:build/);
    assert.equal(await readFile(file, 'utf8'), original);
  });
}

test('現行データの駅名と会社別名の索引を受け入れる', async () => {
  await verifySearchCatalog(new URL('../public/data/catalog.json', import.meta.url));
});
