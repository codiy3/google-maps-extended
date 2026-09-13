import type { Membership } from './map-data';
import type { DurationResult } from './types';
import { dateLabel } from './useStationTimes';

export function mapArrivalLabels(
  members: Map<string, Membership[]>,
  routeId: string | undefined,
  originId: string | undefined,
  result: DurationResult | null,
  error: string,
) {
  const labels = new Map<string, string>();
  if (!routeId || !originId) return labels;
  const current = result?.originId === originId ? result : null;
  for (const [id, routes] of members) {
    const member = routes.find((r) => r.routeId === routeId);
    if (!member) continue;
    const row = current?.rows.find((r) => r.stationId === member.stationId);
    labels.set(
      id,
      member.stationId === originId
        ? '出発駅'
        : error
          ? '到着時刻を取得できません'
          : !current
            ? '到着時刻を確認中…'
            : row?.status === 'available' &&
                dateLabel(row.arrival) &&
                typeof row.minutes === 'number' &&
                Number.isFinite(row.minutes) &&
                row.minutes >= 0
              ? `${dateLabel(row.arrival)}着 · ${row.minutes}分${row.incomplete ? '（一部便未確認）' : ''}`
              : row?.status === 'not_observed'
                ? '取得済みの便では未確認'
                : row?.status === 'out_of_period'
                  ? '時刻表の対象期間外'
                  : '到着時刻未取得',
    );
  }
  return labels;
}
