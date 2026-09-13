import { displayedStops } from './services';
import type { RouteDetail, StopState } from './types';

export interface Membership {
  routeId: string;
  stationId: string;
}

export type RouteColors = Readonly<Record<string, string>>;
const palette = [
  '#18834b',
  '#2563eb',
  '#9333ea',
  '#c45b13',
  '#00818a',
  '#bd2456',
  '#675432',
  '#525f75',
];
export function assignRouteColor(colors: RouteColors, id: string): RouteColors {
  if (colors[id]) return colors;
  const index = Object.keys(colors).length;
  const color = palette[index] ?? `hsl(${((index * 137.508) % 360).toFixed(2)} 65% 38%)`;
  return { ...colors, [id]: color };
}

export function combinedGeometry(routes: RouteDetail[], colors: RouteColors = {}) {
  const geometry: RouteDetail['geometry'] = routes.flatMap((r) =>
    r.geometry.map((g) => ({ ...g, id: `${r.id}:${g.id}`, color: colors[r.id] ?? palette[0] })),
  );
  const overlaps = new Map<string, RouteDetail['geometry']>();
  for (const segment of geometry) {
    const forward = JSON.stringify(segment.coordinates);
    const reverse = JSON.stringify([...segment.coordinates].reverse());
    const key = forward < reverse ? forward : reverse;
    const group = overlaps.get(key) ?? [];
    group.push(segment);
    overlaps.set(key, group);
  }
  for (const group of overlaps.values())
    for (const [index, segment] of group.entries()) {
      // 同じ線形は太い下地から重ね、各路線の色を残す。座標はずらさない。
      segment.strokeWeight = 5 + (group.length - index - 1) * 4;
      segment.zIndex = index + 1;
    }
  return geometry;
}

/** 同一駅グループのピンは共有し、クリック元から所属路線へ戻れるようにする。 */
export function combineRoutes(
  routes: RouteDetail[],
  activeId: string | undefined,
  serviceIds: string[],
  colors: RouteColors = {},
  geometry = combinedGeometry(routes, colors),
  filters: Readonly<Record<string, string[]>> = {},
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
    const stops = displayedStops(
      route,
      filters[route.id] ?? (route.id === activeId ? serviceIds : []),
    );
    for (const station of route.stations) {
      if (!stops.has(station.id)) continue;
      const id = root(station.groupIds?.[0] ?? `${route.id}:${station.id}`);
      const previous = members.get(id) ?? [];
      members.set(id, [...previous, { routeId: route.id, stationId: station.id }]);
      const existing = stations.get(id);
      stations.set(id, {
        ...(!existing || route.id === activeId ? station : existing),
        id,
        routeNames: [...(existing?.routeNames ?? []), `${route.operator} ${route.name}`],
        routeColors: [...(existing?.routeColors ?? []), colors[route.id] ?? palette[0]],
      });
      if (!existing || route.id === activeId) visible.set(id, stops.get(station.id) ?? 'common');
    }
  }
  const first = routes[0];
  const route: RouteDetail | null = first
    ? {
        ...first,
        id: routes.map((r) => r.id).join('+'),
        name: routes.map((r) => r.name).join('・'),
        stations: [...stations.values()],
        geometry,
      }
    : null;
  return { route, visible, members };
}
