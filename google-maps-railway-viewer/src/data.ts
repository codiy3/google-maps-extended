import type { Catalog, DurationResult, RouteDetail } from './types';

export async function fetchCatalog(signal: AbortSignal): Promise<Catalog> {
  const response = await fetch('/api/catalog', { signal });
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
  const response = await fetch(`/api/routes/${encodeURIComponent(id)}`, { signal });
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
