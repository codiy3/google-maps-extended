import type { JourneyResponse, StationChoice } from './journey-types';
import type { StaticJourneyQuery } from './static-journey';
import type { Catalog, DurationResult, RouteDetail } from './types';

export function isStaticMode(): boolean {
  return import.meta.env.VITE_DATA_MODE === 'static';
}

export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}data/${path}`;
}

function routeAsset(id: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('路線IDが不正です。');
  return assetUrl(`routes/${id}.json`);
}

export async function fetchCatalog(signal: AbortSignal): Promise<Catalog> {
  const response = await fetch(isStaticMode() ? assetUrl('catalog.json') : '/api/catalog', {
    signal,
  });
  if (!response.ok) throw new Error('路線一覧を取得できませんでした。');
  const value = (await response.json()) as Catalog;
  if (
    value.schemaVersion !== 3 ||
    !Array.isArray(value.routes) ||
    value.routes.some(
      (r) =>
        typeof r.id !== 'string' ||
        !Array.isArray(r.aliases) ||
        !Array.isArray(r.operatorAliases) ||
        !Array.isArray(r.prefectures) ||
        !Array.isArray(r.stationNames) ||
        r.stationNames.some((name) => typeof name !== 'string'),
    )
  )
    throw new Error('路線一覧の形式を確認できませんでした。');
  return value;
}

export async function fetchRoute(id: string, signal: AbortSignal): Promise<RouteDetail> {
  const response = await fetch(
    isStaticMode() ? routeAsset(id) : `/api/routes/${encodeURIComponent(id)}`,
    { signal },
  );
  if (!response.ok) throw new Error('駅・線路データを取得できませんでした。');
  const value = (await response.json()) as RouteDetail;
  if (
    value.id !== id ||
    !Array.isArray(value.stations) ||
    !Array.isArray(value.geometry) ||
    !Array.isArray(value.services)
  )
    throw new Error('路線データの形式を確認できませんでした。');
  return value;
}

export async function restoreRoute(id: string): Promise<void> {
  if (isStaticMode()) {
    const response = await fetch(routeAsset(id), { cache: 'reload' });
    if (!response.ok) throw new Error('公開データを再取得できませんでした。');
    return;
  }
  const response = await fetch(`/api/routes/${encodeURIComponent(id)}/restore`, {
    method: 'POST',
    headers: { 'X-Railway-Request': '1' },
  });
  if (!response.ok) throw new Error('保存データを復元できませんでした。');
}
export async function fetchDurations(
  id: string,
  origin: string,
  start: string,
  services: string[],
  signal: AbortSignal,
): Promise<DurationResult> {
  const end = new Date(Date.parse(start) + 2 * 3600000).toISOString();
  if (isStaticMode()) {
    const route = await fetchRoute(id, signal);
    if (!route.stations.some((s) => s.id === origin))
      throw new Error('出発駅が路線に含まれません。');
    return {
      originId: origin,
      start,
      end,
      status: 'unavailable',
      note: '公開版には実時刻表を収録していません。',
      rows: route.stations.map((s) => ({
        stationId: s.id,
        status: s.id === origin ? 'origin' : 'unavailable',
      })),
    };
  }
  const query = new URLSearchParams({ origin, start, end });
  for (const service of services) query.append('service', service);
  const response = await fetch(`/api/routes/${encodeURIComponent(id)}/durations?${query}`, {
    signal,
  });
  if (!response.ok) throw new Error('所要時間を取得できませんでした。');
  const value = (await response.json()) as DurationResult;
  if (value.originId !== origin || !Array.isArray(value.rows))
    throw new Error('所要時間の形式が不正です。');
  return value;
}

export async function fetchStations(signal: AbortSignal): Promise<StationChoice[]> {
  const response = await fetch(isStaticMode() ? assetUrl('stations.json') : '/api/stations', {
    signal,
  });
  if (!response.ok) throw new Error('駅一覧を読み込めませんでした。');
  const value = await response.json();
  if (
    !Array.isArray(value.stations) ||
    value.stations.some(
      (s: StationChoice) => !s.id || !Array.isArray(s.members) || !Array.isArray(s.names),
    )
  )
    throw new Error('駅一覧の形式を確認できませんでした。');
  if (isStaticMode()) {
    const catalog = await fetchCatalog(signal);
    if (
      value.schemaVersion !== 1 ||
      !value.dataRevision ||
      value.dataRevision !== catalog.dataRevision
    )
      throw new Error('公開データの版が一致しません。ページを再読み込みしてください。');
  }
  return value.stations;
}

export async function searchJourneys(
  query: StaticJourneyQuery,
  signal: AbortSignal,
): Promise<JourneyResponse> {
  if (isStaticMode()) {
    const { searchStaticJourneys } = await import('./static-journey');
    return searchStaticJourneys(query, signal);
  }
  const response = await fetch('/api/journeys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Railway-Request': '1' },
    body: JSON.stringify(query),
    signal,
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.message || '経路を取得できませんでした。');
  return value;
}
