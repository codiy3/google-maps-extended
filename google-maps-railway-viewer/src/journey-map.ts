import type { JourneySelection } from './journey-types';
import type { Membership, RouteColors } from './map-data';
import type { RouteDetail } from './types';

export function journeyGeometry(
  base: RouteDetail['geometry'],
  selection: JourneySelection | null,
  colors: RouteColors,
): RouteDetail['geometry'] {
  if (!selection) return base;
  return [
    ...base.map((g) => ({ ...g, context: true, opacity: 0.2, strokeWeight: 3 })),
    ...(selection.result.legs ?? []).flatMap((leg, index) =>
      leg.geometry.map((g) => ({
        ...g,
        id: `journey-${index}-${g.id}`,
        color: colors[leg.routeId] ?? '#18834b',
        opacity: 1,
        strokeWeight: 6,
        zIndex: 100 + index,
      })),
    ),
  ];
}

export function journeyStopLabels(
  members: ReadonlyMap<string, Membership[]>,
  selection: JourneySelection | null,
): ReadonlyMap<string, string> {
  const labels = new Map<string, string>();
  if (!selection) return labels;
  selection.stops.forEach((stop, index) => {
    const label =
      index === 0 ? '出発' : index === selection.stops.length - 1 ? '到着' : `経由 ${index}`;
    for (const [id, group] of members) {
      if (
        group.some((m) =>
          stop.members.some((s) => s.routeId === m.routeId && s.stationId === m.stationId),
        )
      )
        labels.set(id, [labels.get(id), label].filter(Boolean).join('・'));
    }
  });
  return labels;
}
