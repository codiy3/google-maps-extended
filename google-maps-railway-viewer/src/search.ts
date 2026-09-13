import type { RouteSummary } from './types';

export function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ja')
    .replace(/\s+/gu, '')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

export interface RouteMatch {
  route: RouteSummary;
  matchedStations: string[];
  matchedOperator: boolean;
}

function matchLevel(value: string, needle: string): number {
  return value === needle
    ? 0
    : value.startsWith(needle)
      ? 1
      : value.includes(needle)
        ? 2
        : Infinity;
}

function stationName(value: string): string {
  const name = normalize(value);
  return name.length > 1 ? name.replace(/駅$/u, '') : name;
}

export function searchRouteMatches(routes: RouteSummary[], query: string): RouteMatch[] {
  const needle = normalize(query);
  if (!needle) return [];
  const stationNeedle = stationName(query);
  return routes
    .map((route) => {
      const name = normalize(route.name);
      const aliases = route.aliases.map(normalize);
      const names = [name, ...aliases];
      const lineScore =
        name === needle
          ? 0
          : aliases.includes(needle)
            ? 1
            : names.some((n) => n.startsWith(needle))
              ? 4
              : names.some((n) => n.includes(needle))
                ? 7
                : Infinity;
      const stations = route.stationNames
        .map((name) => ({ name, level: matchLevel(stationName(name), stationNeedle) }))
        .filter(({ level }) => Number.isFinite(level))
        .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, 'ja'));
      const operatorLevel = Math.min(
        ...[route.operator, route.officialOperator, ...route.operatorAliases].map((name) =>
          matchLevel(normalize(name), needle),
        ),
      );
      // 完全一致を先にし、同じ一致方法なら路線名・駅名・会社名の順に並べる。
      const score = Math.min(
        lineScore,
        [2, 5, 8][stations[0]?.level ?? Infinity] ?? Infinity,
        [3, 6, 9][operatorLevel] ?? Infinity,
      );
      return {
        route,
        score,
        matchedStations: stations.map(({ name }) => name),
        matchedOperator: Number.isFinite(operatorLevel),
      };
    })
    .filter(({ score }) => Number.isFinite(score))
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.route.name.localeCompare(b.route.name, 'ja') ||
        a.route.operator.localeCompare(b.route.operator, 'ja') ||
        a.route.id.localeCompare(b.route.id),
    )
    .map(({ route, matchedStations, matchedOperator }) => ({
      route,
      matchedStations,
      matchedOperator,
    }));
}

export function searchRoutes(routes: RouteSummary[], query: string): RouteSummary[] {
  return searchRouteMatches(routes, query).map(({ route }) => route);
}
