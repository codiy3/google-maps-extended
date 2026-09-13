import { useEffect, useState } from 'react';
import { fetchDurations } from './data';
import type { DurationResult } from './types';

export function dateLabel(value?: string) {
  if (!value || Number.isNaN(Date.parse(value))) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
}
function initialTime() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 16);
}

/** 駅一覧と地図は同じ条件・同じ応答を参照する。 */
export function useStationTimes(
  routeId: string | undefined,
  originId: string | undefined,
  serviceIds: string[],
) {
  const [start, setStart] = useState(initialTime);
  const key = JSON.stringify([routeId, originId, start, serviceIds]);
  const [response, setResponse] = useState<{ key: string; value: DurationResult } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const result = response?.key === key ? response.value : null;
  const error = failure?.key === key ? failure.message : '';
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setResponse(null);
    setFailure(null);
    if (!routeId || !originId) return;
    if (!start || Number.isNaN(Date.parse(`${start}:00+09:00`))) {
      setFailure({ key, message: '出発日時を入力してください。' });
      return;
    }
    fetchDurations(routeId, originId, `${start}:00+09:00`, serviceIds, controller.signal)
      .then((value) => {
        if (current) setResponse({ key, value });
      })
      .catch(() => {
        if (current) setFailure({ key, message: '所要時間を読み込めませんでした。' });
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [routeId, originId, start, serviceIds, key]);
  return { start, setStart, result, error };
}
export type StationTimes = ReturnType<typeof useStationTimes>;
