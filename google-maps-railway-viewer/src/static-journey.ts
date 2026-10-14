import type { JourneyResponse, JourneyResult, ServiceFilters } from './journey-types';
import type { Catalog, Position, RouteSummary } from './types';

export interface StaticJourneyQuery {
  stops: string[];
  start: string;
  transferMinutes: number;
  services: Record<string, string[]>;
}
interface NetworkEdge {
  a: number;
  b: number;
  meters: number;
  routeId: string | null;
  kind: 'rail' | 'access' | 'group';
  coordinates: Position[];
  stationId: string | null;
}
export interface StaticNetwork {
  schemaVersion: 1;
  groups: Record<string, number>;
  stationNodes: Record<
    string,
    { routeId: string; stationId: string; stationName: string; groupId: string }
  >;
  edges: NetworkEdge[];
  nodeCount: number;
}
export interface StaticNetworkSnapshot {
  schemaVersion: 1;
  dataRevision: string;
  network: StaticNetwork;
}
export interface StaticJourneyWorkerRequest {
  query: StaticJourneyQuery;
  networkUrl: string;
  catalogUrl: string;
}
export type StaticJourneyWorkerResponse =
  | { ok: true; value: JourneyResponse }
  | { ok: false; message: string };

const stopError = '出発駅・到着駅・経由駅を候補から選択してください。';

export function validateStaticSnapshot(value: unknown, catalog: Catalog): StaticNetworkSnapshot {
  const snapshot = value as StaticNetworkSnapshot | null;
  const revision = (catalog as Catalog & { dataRevision?: string }).dataRevision;
  const network = snapshot?.network;
  if (
    snapshot?.schemaVersion !== 1 ||
    !revision ||
    snapshot.dataRevision !== revision ||
    network?.schemaVersion !== 1 ||
    !Number.isInteger(network.nodeCount) ||
    network.nodeCount < 1 ||
    !network.groups ||
    Object.keys(network.groups).length === 0 ||
    !network.stationNodes ||
    !Array.isArray(network.edges)
  )
    throw new Error('表示データと経路データの形式・更新版が一致しません。再読み込みしてください。');
  const routes = new Set(catalog.routes.map((route) => route.id));
  const node = (id: unknown): id is number =>
    typeof id === 'number' && Number.isInteger(id) && id >= 0 && id < network.nodeCount;
  if (
    Object.values(network.groups).some((id) => !node(id)) ||
    Object.entries(network.stationNodes).some(
      ([id, station]) =>
        !/^\d+$/.test(id) ||
        !node(Number(id)) ||
        !station ||
        !routes.has(station.routeId) ||
        typeof station.stationId !== 'string' ||
        typeof station.stationName !== 'string' ||
        !Object.hasOwn(network.groups, station.groupId),
    ) ||
    network.edges.some(
      (edge) =>
        !edge ||
        !node(edge.a) ||
        !node(edge.b) ||
        !Number.isFinite(edge.meters) ||
        edge.meters < 0 ||
        (edge.routeId !== null && !routes.has(edge.routeId)) ||
        !['rail', 'access', 'group'].includes(edge.kind) ||
        !Array.isArray(edge.coordinates) ||
        edge.coordinates.some(
          (point) =>
            !Array.isArray(point) || point.length !== 2 || point.some((v) => !Number.isFinite(v)),
        ),
    )
  )
    throw new Error('経路データの頂点・線形・路線の参照を確認できません。');
  return snapshot;
}

type State = [node: number, stage: number];
type QueueItem = [meters: number, hops: number, node: number, stage: number];
type PathItem = [from: number, to: number, edge: number];
function compare(a: QueueItem, b: QueueItem) {
  for (let index = 0; index < a.length; index++) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}
class MinHeap {
  private values: QueueItem[] = [];
  get length() {
    return this.values.length;
  }
  push(value: QueueItem) {
    let index = this.values.length;
    this.values.push(value);
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (compare(this.values[parent], value) <= 0) break;
      this.values[index] = this.values[parent];
      index = parent;
    }
    this.values[index] = value;
  }
  pop(): QueueItem {
    const first = this.values[0];
    const last = this.values.pop();
    if (this.values.length && last) {
      let index = 0;
      while (index * 2 + 1 < this.values.length) {
        let child = index * 2 + 1;
        if (
          child + 1 < this.values.length &&
          compare(this.values[child + 1], this.values[child]) < 0
        )
          child++;
        if (compare(last, this.values[child]) <= 0) break;
        this.values[index] = this.values[child];
        index = child;
      }
      this.values[index] = last;
    }
    return first;
  }
}
const stateKey = ([node, stage]: State) => `${node}:${stage}`;
// Pythonのroundと同じく、ちょうど0.5mでは最も近い偶数へ丸める。
function roundMeters(value: number) {
  const lower = Math.floor(value);
  return value - lower === 0.5 ? lower + (lower % 2) : Math.round(value);
}

/** Python版と同じ、線形上の距離・辺数・頂点順による探索。運行時刻は推測しない。 */
export function shortestDistance(
  network: StaticNetwork,
  stops: string[],
  filters: ServiceFilters,
  routes: Readonly<Record<string, Pick<RouteSummary, 'services'>>>,
  routeIds?: ReadonlySet<string>,
): JourneyResult {
  if (stops.length < 2 || stops.some((stop) => !Object.hasOwn(network.groups, stop)))
    throw new Error(stopError);
  const allowed = new Map<string, Set<string>>();
  for (const [routeId, services] of Object.entries(filters)) {
    if (!services.length) continue;
    const definitions = new Map(routes[routeId]?.services.map((service) => [service.id, service]));
    if (services.some((id) => !definitions.has(id)))
      throw new Error('選択種別の停車駅データを確認できません。');
    allowed.set(
      routeId,
      new Set(
        services.flatMap((id) =>
          Object.entries(definitions.get(id)?.stops ?? {})
            .filter(([, state]) => ['common', 'conditional', 'observed'].includes(state))
            .map(([station]) => station),
        ),
      ),
    );
  }
  const adjacency = new Map<number, [number, number][]>();
  network.edges.forEach((edge, index) => {
    if (routeIds && edge.routeId !== null && !routeIds.has(edge.routeId)) return;
    if (
      edge.kind === 'access' &&
      edge.routeId !== null &&
      allowed.has(edge.routeId) &&
      !allowed.get(edge.routeId)?.has(edge.stationId ?? '')
    )
      return;
    for (const [from, to] of [
      [edge.a, edge.b],
      [edge.b, edge.a],
    ]) {
      const list = adjacency.get(from) ?? [];
      list.push([to, index]);
      adjacency.set(from, list);
    }
  });
  const targets = stops.map((stop) => network.groups[stop]);
  function advance(node: number, stage: number) {
    while (stage < targets.length && node === targets[stage]) stage++;
    return stage;
  }
  const initial: State = [targets[0], advance(targets[0], 1)];
  const costs = new Map<string, [number, number]>([[stateKey(initial), [0, 0]]]);
  const previous = new Map<string, { parent: State; edge: number }>();
  const queue = new MinHeap();
  queue.push([0, 0, ...initial]);
  let end: State | undefined;
  while (queue.length) {
    const [meters, hops, node, stage] = queue.pop();
    const state: State = [node, stage];
    const cost = costs.get(stateKey(state));
    if (cost?.[0] !== meters || cost?.[1] !== hops) continue;
    if (stage === targets.length) {
      end = state;
      break;
    }
    for (const [neighbour, edgeIndex] of adjacency.get(node) ?? []) {
      const next: State = [neighbour, advance(neighbour, stage)];
      const nextKey = stateKey(next);
      const candidate: [number, number] = [meters + network.edges[edgeIndex].meters, hops + 1];
      const old = costs.get(nextKey);
      if (!old || candidate[0] < old[0] || (candidate[0] === old[0] && candidate[1] < old[1])) {
        costs.set(nextKey, candidate);
        previous.set(nextKey, { parent: state, edge: edgeIndex });
        queue.push([...candidate, ...next]);
      }
    }
  }
  if (!end)
    return {
      status: 'unavailable',
      message: '指定した駅と条件をつなぐ線形を確認できません。未接続の区間を直線で補っていません。',
    };
  const path: PathItem[] = [];
  let current = end;
  while (stateKey(current) !== stateKey(initial)) {
    const step = previous.get(stateKey(current));
    if (!step) throw new Error('経路の復元に失敗しました。');
    path.push([step.parent[0], current[0], step.edge]);
    current = step.parent;
  }
  path.reverse();
  const legs: NonNullable<JourneyResult['legs']> = [];
  let pending: PathItem[] = [];
  function flush() {
    if (!pending.length) return;
    const rail = pending.filter((item) => network.edges[item[2]].kind === 'rail');
    const start = network.stationNodes[String(pending[0][0])];
    const finish = network.stationNodes[String(pending.at(-1)?.[1])];
    if (rail.length && start && finish)
      legs.push({
        routeId: start.routeId,
        fromStationId: start.stationId,
        toStationId: finish.stationId,
        fromName: start.stationName,
        toName: finish.stationName,
        geometry: rail.map(([from, , edgeIndex], index) => {
          const edge = network.edges[edgeIndex];
          return {
            id: `journey-${legs.length}-${index}`,
            coordinates: edge.a === from ? edge.coordinates : [...edge.coordinates].reverse(),
          };
        }),
        meters: roundMeters(rail.reduce((sum, item) => sum + network.edges[item[2]].meters, 0)),
      });
    pending = [];
  }
  for (const item of path) {
    if (network.edges[item[2]].kind === 'group') flush();
    else pending.push(item);
  }
  flush();
  return {
    status: 'available',
    kind: 'distance',
    meters: roundMeters(costs.get(stateKey(end))?.[0] ?? 0),
    legs,
    message:
      '線路データ上の候補です。概算走行距離のみで比較し、乗換歩行・運転日・実際の列車の接続は確認していません。',
  };
}

export function staticJourneyResponse(
  network: StaticNetwork,
  catalog: Catalog,
  query: StaticJourneyQuery,
): JourneyResponse {
  if (
    !Array.isArray(query.stops) ||
    query.stops.some((stop) => typeof stop !== 'string') ||
    !query.services ||
    typeof query.services !== 'object' ||
    Array.isArray(query.services) ||
    Object.values(query.services).some(
      (services) => !Array.isArray(services) || services.some((id) => typeof id !== 'string'),
    )
  )
    throw new Error(stopError);
  if (
    typeof query.start !== 'string' ||
    !/(Z|[+-]\d{2}:\d{2})$/.test(query.start) ||
    !Number.isFinite(Date.parse(query.start)) ||
    !Number.isInteger(query.transferMinutes) ||
    query.transferMinutes < 0 ||
    query.transferMinutes > 180
  )
    throw new Error('出発日時には時差、乗換余裕時間には0〜180分の整数が必要です。');
  const distance = shortestDistance(
    network,
    query.stops,
    query.services,
    Object.fromEntries(catalog.routes.map((route) => [route.id, route])),
  );
  const time: JourneyResult =
    new Set(query.stops).size === 1
      ? {
          status: 'available',
          kind: 'time',
          legs: [],
          arrival: new Date(query.start).toISOString(),
          minutes: 0,
          message: 'すべて同一駅のため鉄道での移動はありません。駅構内の移動時間は含みません。',
        }
      : {
          status: 'unavailable',
          message: '時刻表未取得のため最短時間経路は未計算です。距離から時間を推定していません。',
        };
  return { distance, time };
}

let idleWorker: Worker | undefined;

/** 実行中のWorkerを検索ごとに専有し、中止時には計算自体も終了する。 */
export async function searchStaticJourneys(
  query: StaticJourneyQuery,
  signal: AbortSignal,
): Promise<JourneyResponse> {
  signal.throwIfAborted();
  const worker =
    idleWorker ??
    new Worker(new URL('./static-journey.worker.ts', import.meta.url), { type: 'module' });
  idleWorker = undefined;
  return new Promise<JourneyResponse>((resolve, reject) => {
    function cleanup() {
      signal.removeEventListener('abort', abort);
      worker.removeEventListener('message', message);
      worker.removeEventListener('error', failure);
      worker.removeEventListener('messageerror', failure);
    }
    function abort() {
      cleanup();
      worker.terminate();
      reject(signal.reason ?? new DOMException('検索を中止しました。', 'AbortError'));
    }
    function failure() {
      cleanup();
      worker.terminate();
      reject(new Error('経路の計算を実行できませんでした。再試行してください。'));
    }
    function message(event: MessageEvent<StaticJourneyWorkerResponse>) {
      if (signal.aborted) {
        abort();
        return;
      }
      cleanup();
      if (!idleWorker) idleWorker = worker;
      else worker.terminate();
      if (event.data.ok) resolve(event.data.value);
      else reject(new Error(event.data.message));
    }
    signal.addEventListener('abort', abort, { once: true });
    worker.addEventListener('message', message);
    worker.addEventListener('error', failure);
    worker.addEventListener('messageerror', failure);
    const base = new URL(import.meta.env.BASE_URL, window.location.href);
    const request: StaticJourneyWorkerRequest = {
      query,
      networkUrl: new URL('data/journey-network.json', base).href,
      catalogUrl: new URL('data/catalog.json', base).href,
    };
    try {
      worker.postMessage(request);
    } catch {
      failure();
    }
  });
}
