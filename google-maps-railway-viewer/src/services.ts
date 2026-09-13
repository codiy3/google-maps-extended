import type { RouteDetail, StopState, TrainService } from './types';

export function sortServices(services: TrainService[]): TrainService[] {
  return [...services].sort(
    (a, b) =>
      (a.rank ?? Infinity) - (b.rank ?? Infinity) ||
      a.name.localeCompare(b.name, 'ja') ||
      a.id.localeCompare(b.id),
  );
}

// 複数種別で確認できた停車の和集合。欠測を通過とみなさない。
export function displayedStops(route: RouteDetail, selected: string[]): Map<string, StopState> {
  if (selected.length === 0) return new Map(route.stations.map((s) => [s.id, 'common']));
  const services = route.services.filter((s) => selected.includes(s.id));
  const result = new Map<string, StopState>();
  for (const station of route.stations) {
    const evidence = services.map((s) => s.stops[station.id] ?? 'unknown');
    const observed = evidence.some((s) => ['common', 'conditional', 'observed'].includes(s));
    if (!observed) continue;
    const state = evidence.some((s) => s === 'unknown' || s === 'observed')
      ? 'observed'
      : evidence.every((s) => s === 'common')
        ? 'common'
        : 'conditional';
    result.set(station.id, state);
  }
  return result;
}

export const stopLabels: Record<StopState, string> = {
  common: '共通停車',
  conditional: '一部停車',
  observed: '停車あり・一部未確認',
  unknown: '未確認',
  none: '通過',
};
