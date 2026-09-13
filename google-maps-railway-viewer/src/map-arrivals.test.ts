import { expect, it } from 'vitest';
import { mapArrivalLabels } from './map-arrivals';
import type { DurationResult } from './types';

const members = new Map([
  ['pin-a', [{ routeId: 'line', stationId: 'a' }]],
  [
    'pin-b',
    [
      { routeId: 'line', stationId: 'b' },
      { routeId: 'other', stationId: 'x' },
    ],
  ],
  ['pin-c', [{ routeId: 'other', stationId: 'c' }]],
]);
const result: DurationResult = {
  originId: 'a',
  start: '2026-09-13T23:00:00+09:00',
  end: '2026-09-14T01:00:00+09:00',
  status: 'available',
  rows: [
    { stationId: 'a', status: 'origin' },
    {
      stationId: 'b',
      status: 'available',
      minutes: 30,
      departure: '2026-09-13T23:50:00+09:00',
      arrival: '2026-09-14T00:20:00+09:00',
    },
  ],
};
it('同一路線の到着時刻を日付付きで表示し、他路線へ流用しない', () => {
  const labels = mapArrivalLabels(members, 'line', 'a', result, '');
  expect(labels.get('pin-a')).toBe('出発駅');
  expect(labels.get('pin-b')).toBe('9/14 00:20着 · 30分');
  expect(labels.has('pin-c')).toBe(false);
  expect(mapArrivalLabels(members, 'line', undefined, result, '').size).toBe(0);
});
it('前の起点の結果や未取得のデータを到着時刻として表示しない', () => {
  expect(mapArrivalLabels(members, 'line', 'b', result, '').get('pin-a')).toBe('到着時刻を確認中…');
  const unavailable: DurationResult = { ...result, status: 'unavailable', rows: [] };
  expect(mapArrivalLabels(members, 'line', 'a', unavailable, '').get('pin-b')).toBe(
    '到着時刻未取得',
  );
  expect(mapArrivalLabels(members, 'line', 'a', null, '取得失敗').get('pin-b')).toBe(
    '到着時刻を取得できません',
  );
});
