import { displayedStops } from './services';
import type { RouteDetail, StopState } from './types';

export interface Membership {
  routeId: string;
  stationId: string;
}

/** 同一駅グループのピンは共有し、クリック元から所属路線へ戻れるようにする。 */
export function combineRoutes(
  routes: RouteDetail[],
  activeId: string | undefined,
  serviceIds: string[],
) {
  const groups = new Map<string, string>();
  function root(id: string): string {
    const parent = groups.get(id);
    if (!parent || parent === id) return id;
    const result = root(parent);
    groups.set(id, result);
    return result;
  }
  for (const route of routes)
    for (const station of route.stations) {
      const ids = station.groupIds?.length ? station.groupIds : [`${route.id}:${station.id}`];
      for (const id of ids) groups.set(root(id), root(ids[0]));
    }
  const members = new Map<string, Membership[]>();
  const visible = new Map<string, StopState>();
  const stations = new Map<string, RouteDetail['stations'][number]>();
  for (const route of routes) {
    const stops = displayedStops(route, route.id === activeId ? serviceIds : []);
    for (const station of route.stations) {
      if (!stops.has(station.id)) continue;
      const id = root(station.groupIds?.[0] ?? `${route.id}:${station.id}`);
      const previous = members.get(id) ?? [];
      members.set(id, [...previous, { routeId: route.id, stationId: station.id }]);
      if (!stations.has(id) || route.id === activeId) {
        stations.set(id, { ...station, id });
        visible.set(id, stops.get(station.id) ?? 'common');
      }
    }
  }
  const first = routes[0];
  const route: RouteDetail | null = first
    ? {
        ...first,
        id: routes.map((r) => r.id).join('+'),
        name: routes.map((r) => r.name).join('・'),
        stations: [...stations.values()],
        geometry: routes.flatMap((r) => r.geometry.map((g) => ({ ...g, id: `${r.id}:${g.id}` }))),
      }
    : null;
  return { route, visible, members };
}
