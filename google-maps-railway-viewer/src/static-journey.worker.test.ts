import { afterEach, expect, it, vi } from 'vitest';
import type { StaticJourneyWorkerRequest, StaticJourneyWorkerResponse } from './static-journey';
import fixture from './static-journey.fixture.json';

const request: StaticJourneyWorkerRequest = {
  catalogUrl: 'https://example.test/project/data/catalog.json',
  networkUrl: 'https://example.test/project/data/journey-network.json',
  query: {
    stops: ['A', 'C'],
    start: '2026-10-14T10:00:00+09:00',
    transferMinutes: 5,
    services: {},
  },
};
const catalog = {
  schemaVersion: 3,
  dataRevision: 'test-version',
  routes: Object.entries(fixture.routes).map(([id, route]) => ({ id, ...route })),
};
const snapshot = { schemaVersion: 1, dataRevision: 'test-version', network: fixture.network };
async function setup(fetcher: (url: string) => Promise<Response>) {
  vi.resetModules();
  const context = {
    onmessage: undefined as
      | ((event: MessageEvent<StaticJourneyWorkerRequest>) => Promise<void>)
      | undefined,
    postMessage: vi.fn<(response: StaticJourneyWorkerResponse) => void>(),
  };
  vi.stubGlobal('self', context);
  vi.stubGlobal('fetch', vi.fn(fetcher));
  await import('./static-journey.worker');
  return context;
}
afterEach(() => vi.unstubAllGlobals());

it('Worker内で公開データを検証し、同じ版のグラフを再利用する', async () => {
  const fetcher = vi.fn(async (url: string) =>
    Response.json(url === request.catalogUrl ? catalog : snapshot),
  );
  const worker = await setup(fetcher);
  await worker.onmessage?.(new MessageEvent('message', { data: request }));
  expect(worker.postMessage).toHaveBeenLastCalledWith({
    ok: true,
    value: {
      distance: fixture.cases.find((sample) => sample.name === 'direct')?.expected,
      time: {
        status: 'unavailable',
        message: '時刻表未取得のため最短時間経路は未計算です。距離から時間を推定していません。',
      },
    },
  });
  await worker.onmessage?.(new MessageEvent('message', { data: request }));
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('読み込み失敗を通知し、次回は失敗したPromiseを再利用しない', async () => {
  let failing = true;
  const worker = await setup(async (url) =>
    failing
      ? new Response('', { status: 503 })
      : Response.json(url === request.catalogUrl ? catalog : snapshot),
  );
  await worker.onmessage?.(new MessageEvent('message', { data: request }));
  expect(worker.postMessage).toHaveBeenLastCalledWith({
    ok: false,
    message: expect.stringContaining('読み込めません'),
  });
  failing = false;
  await worker.onmessage?.(new MessageEvent('message', { data: request }));
  expect(worker.postMessage).toHaveBeenLastCalledWith({ ok: true, value: expect.any(Object) });
});

it('版が違うカタログと線形を混ぜて計算しない', async () => {
  const worker = await setup(async (url) =>
    Response.json(url === request.catalogUrl ? catalog : { ...snapshot, dataRevision: 'old' }),
  );
  await worker.onmessage?.(new MessageEvent('message', { data: request }));
  expect(worker.postMessage).toHaveBeenLastCalledWith({
    ok: false,
    message: expect.stringContaining('更新版'),
  });
});
