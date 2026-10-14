import { afterEach, expect, it, vi } from 'vitest';
import { fetchCatalog, fetchDurations, fetchRoute, fetchStations, restoreRoute } from './data';
import { routeFixture } from './test-fixtures';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function mockStatic() {
  vi.stubEnv('VITE_DATA_MODE', 'static');
  vi.stubEnv('BASE_URL', '/google-maps-extended/');
  const route = routeFixture();
  const mock = vi.fn(async (url: string) =>
    Response.json(
      url.endsWith('catalog.json')
        ? { schemaVersion: 3, dataRevision: 'v1', routes: [route] }
        : url.endsWith('stations.json')
          ? { schemaVersion: 1, dataRevision: 'v1', stations: [] }
          : route,
    ),
  );
  vi.stubGlobal('fetch', mock);
  return { mock, route };
}
it('静的版はPagesのサブパスから読み、再試行でもPOSTしない', async () => {
  const { mock, route } = mockStatic();
  const signal = new AbortController().signal;
  await fetchCatalog(signal);
  await fetchRoute(route.id, signal);
  await restoreRoute(route.id);
  await fetchStations(signal);
  expect(mock.mock.calls.every(([url]) => url.startsWith('/google-maps-extended/data/'))).toBe(
    true,
  );
  expect(mock.mock.calls.map(([url]) => url)).toContain(
    `/google-maps-extended/data/routes/${route.id}.json`,
  );
});
it('静的版の時刻未取得を0分の移動時間と混同しない', async () => {
  const { route } = mockStatic();
  const result = await fetchDurations(
    route.id,
    route.stations[0].id,
    '2026-10-14T12:00:00+09:00',
    [],
    new AbortController().signal,
  );
  expect(result.status).toBe('unavailable');
  expect(result.rows[0].status).toBe('origin');
  expect(
    result.rows.slice(1).every((r) => r.status === 'unavailable' && r.minutes === undefined),
  ).toBe(true);
});
it('静的な駅一覧とカタログの版が違う場合は拒否する', async () => {
  mockStatic();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      Response.json(
        url.endsWith('catalog.json')
          ? { schemaVersion: 3, dataRevision: 'v2', routes: [] }
          : { schemaVersion: 1, dataRevision: 'v1', stations: [] },
      ),
    ),
  );
  await expect(fetchStations(new AbortController().signal)).rejects.toThrow('版が一致');
});
it('路線IDを使ったディレクトリ外の参照を拒否する', async () => {
  const { mock } = mockStatic();
  await expect(fetchRoute('../config', new AbortController().signal)).rejects.toThrow('路線ID');
  expect(mock).not.toHaveBeenCalled();
});
it('ローカルモードでは従来のAPIを使う', async () => {
  vi.stubEnv('VITE_DATA_MODE', '');
  const route = routeFixture();
  const mock = vi.fn(async () => Response.json(route));
  vi.stubGlobal('fetch', mock);
  await fetchRoute(route.id, new AbortController().signal);
  expect(mock.mock.calls[0]).toContain(`/api/routes/${route.id}`);
});
