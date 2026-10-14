import { afterEach, expect, it, vi } from 'vitest';
import {
  type StaticJourneyQuery,
  type StaticJourneyWorkerRequest,
  type StaticJourneyWorkerResponse,
  type StaticNetwork,
  shortestDistance,
  staticJourneyResponse,
  validateStaticSnapshot,
} from './static-journey';
import fixture from './static-journey.fixture.json';
import type { Catalog, TrainService } from './types';

const network = fixture.network as unknown as StaticNetwork;
const routes = fixture.routes as unknown as Record<string, { services: TrainService[] }>;
const catalog = {
  schemaVersion: 3,
  dataRevision: 'test-version',
  routes: Object.entries(routes).map(([id, route]) => ({ id, ...route })),
} as unknown as Catalog;
const query: StaticJourneyQuery = {
  stops: ['A', 'C'],
  start: '2026-10-14T10:00:00+09:00',
  transferMinutes: 5,
  services: {},
};

it.each(fixture.cases)('Pythonと距離・経路・線形を一致させる: $name', (sample) => {
  expect(
    shortestDistance(network, sample.stops, sample.filters as Record<string, string[]>, routes),
  ).toEqual(sample.expected);
});

it('不明な駅・種別を推測して補わない', () => {
  expect(() => shortestDistance(network, ['A', 'missing'], {}, routes)).toThrow('候補');
  expect(() => shortestDistance(network, ['A', 'C'], { short: ['missing'] }, routes)).toThrow(
    '停車駅データ',
  );
});

it('対象路線を制限し、ちょうど0.5mではPythonと同じ丸めを使う', () => {
  const copy = structuredClone(network);
  for (const edge of copy.edges) {
    if (edge.routeId === 'short' && edge.kind === 'rail') edge.meters = 1000.5;
  }
  const result = shortestDistance(copy, ['A', 'C'], {}, routes, new Set(['short']));
  expect(result.meters).toBe(1000);
  expect(result.legs?.[0].meters).toBe(1000);
  expect(shortestDistance(network, ['A', 'X'], {}, routes, new Set(['short'])).status).toBe(
    'unavailable',
  );
});

it('実時刻表がない場合は最短時間を未計算とし、同一駅なら移動なしとする', () => {
  const result = staticJourneyResponse(network, catalog, query);
  expect(result.distance.status).toBe('available');
  expect(result.time.status).toBe('unavailable');
  expect(result.time.message).toContain('時刻表未取得');
  const same = staticJourneyResponse(network, catalog, { ...query, stops: ['A', 'A'] });
  expect(same.time.minutes).toBe(0);
  expect(same.time.arrival).toBe(new Date(query.start).toISOString());
});

it('日時の時差・乗換余裕・種別指定の形式を確認する', () => {
  for (const invalid of [
    { ...query, start: '2026-10-14T10:00:00' },
    { ...query, transferMinutes: 181 },
    { ...query, transferMinutes: 1.5 },
    { ...query, services: { short: [1] } } as unknown as StaticJourneyQuery,
  ])
    expect(() => staticJourneyResponse(network, catalog, invalid)).toThrow();
});

it('公開データの更新版と参照先を検証する', () => {
  const snapshot = { schemaVersion: 1, dataRevision: 'test-version', network };
  expect(validateStaticSnapshot(snapshot, catalog).network).toBe(network);
  expect(() => validateStaticSnapshot({ ...snapshot, dataRevision: 'old' }, catalog)).toThrow(
    '更新版',
  );
  const invalid = structuredClone(snapshot);
  invalid.network.edges[0].a = invalid.network.nodeCount;
  expect(() => validateStaticSnapshot(invalid, catalog)).toThrow('参照');
});

class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = [];
  terminated = false;
  requests: StaticJourneyWorkerRequest[] = [];
  constructor() {
    super();
    FakeWorker.instances.push(this);
  }
  postMessage(request: StaticJourneyWorkerRequest) {
    this.requests.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  respond(response: StaticJourneyWorkerResponse) {
    this.dispatchEvent(new MessageEvent('message', { data: response }));
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  FakeWorker.instances = [];
});
async function browserSearch() {
  vi.resetModules();
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubEnv('BASE_URL', '/google-maps-extended/');
  return (await import('./static-journey')).searchStaticJourneys;
}

it('サブディレクトリのデータを読み、完了後はWorkerを再利用する', async () => {
  const search = await browserSearch();
  const first = search(query, new AbortController().signal);
  const worker = FakeWorker.instances[0];
  expect(new URL(worker.requests[0].catalogUrl).pathname).toBe(
    '/google-maps-extended/data/catalog.json',
  );
  expect(new URL(worker.requests[0].networkUrl).pathname).toBe(
    '/google-maps-extended/data/journey-network.json',
  );
  const result = staticJourneyResponse(network, catalog, query);
  worker.respond({ ok: true, value: result });
  await expect(first).resolves.toEqual(result);
  const second = search(query, new AbortController().signal);
  expect(FakeWorker.instances).toHaveLength(1);
  worker.respond({ ok: true, value: result });
  await expect(second).resolves.toEqual(result);
});

it('中止したWorkerを終了し、遅れて到着した旧結果を採用しない', async () => {
  const search = await browserSearch();
  const abort = new AbortController();
  const first = search(query, abort.signal);
  const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
  const old = FakeWorker.instances[0];
  abort.abort();
  await rejected;
  expect(old.terminated).toBe(true);
  const second = search(query, new AbortController().signal);
  const result = staticJourneyResponse(network, catalog, query);
  old.respond({ ok: true, value: result });
  FakeWorker.instances[1].respond({ ok: true, value: result });
  await expect(second).resolves.toEqual(result);
});

it('並行検索を別Workerへ分け、片方の中止が他方を中止しない', async () => {
  const search = await browserSearch();
  const abort = new AbortController();
  const first = search(query, abort.signal);
  const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
  const second = search(query, new AbortController().signal);
  expect(FakeWorker.instances).toHaveLength(2);
  abort.abort();
  await rejected;
  const result = staticJourneyResponse(network, catalog, query);
  const worker = FakeWorker.instances[1];
  expect(worker.terminated).toBe(false);
  worker.respond({ ok: true, value: result });
  await expect(second).resolves.toEqual(result);
});
