import type { Catalog, RouteDetail } from './types';

export async function fetchCatalog(signal: AbortSignal): Promise<Catalog> {
  const response = await fetch('/data/catalog.json', { signal });
  if (!response.ok) throw new Error('路線一覧を取得できませんでした。');
  const value = (await response.json()) as Catalog;
  if (
    value.schemaVersion !== 2 ||
    !Array.isArray(value.routes) ||
    value.routes.some(
      (r) =>
        typeof r.id !== 'string' ||
        !Array.isArray(r.aliases) ||
        !Array.isArray(r.prefectures) ||
        !Array.isArray(r.stationNames) ||
        r.stationNames.some((name) => typeof name !== 'string'),
    )
  )
    throw new Error('路線一覧の形式を確認できませんでした。');
  return value;
}

export async function fetchRoute(id: string, signal: AbortSignal): Promise<RouteDetail> {
  const response = await fetch(`/data/routes/${encodeURIComponent(id)}.json`, { signal });
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
