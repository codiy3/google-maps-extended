import type { RouteSummary } from './types';

export function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ja')
    .replace(/\s+/gu, '')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

export function searchRoutes(routes: RouteSummary[], query: string): RouteSummary[] {
  const needle = normalize(query);
  if (!needle) return [];
  return routes
    .map((route) => {
      const name = normalize(route.name);
      const aliases = route.aliases.map(normalize);
      const names = [name, ...aliases];
      const score =
        name === needle
          ? 0
          : aliases.includes(needle)
            ? 1
            : names.some((n) => n.startsWith(needle))
              ? 2
              : names.some((n) => n.includes(needle))
                ? 3
                : 4;
      return { route, score };
    })
    .filter(({ score }) => score < 4)
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.route.name.localeCompare(b.route.name, 'ja') ||
        a.route.operator.localeCompare(b.route.operator, 'ja') ||
        a.route.id.localeCompare(b.route.id),
    )
    .map(({ route }) => route);
}
