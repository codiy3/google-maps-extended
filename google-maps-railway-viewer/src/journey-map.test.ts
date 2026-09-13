import { expect, it } from 'vitest';
import { journeyGeometry, journeyStopLabels } from './journey-map';
import type { JourneySelection } from './journey-types';
import { combineRoutes } from './map-data';
import { routeFixture } from './test-fixtures';

it('検索区間だけを強調し、全線の座標と所属色を保持する', () => {
  const route = routeFixture();
  const selection: JourneySelection = {
    key: 'test',
    stops: [],
    result: {
      status: 'available',
      message: '',
      legs: [
        {
          routeId: route.id,
          fromStationId: 'a',
          toStationId: 'b',
          fromName: 'A',
          toName: 'B',
          geometry: [{ id: 'short', coordinates: route.geometry[0].coordinates.slice(0, 2) }],
        },
      ],
    },
  };
  const result = journeyGeometry(route.geometry, selection, { [route.id]: '#123456' });
  expect(result[0].context).toBe(true);
  expect(result[0].opacity).toBeLessThan(result[1].opacity ?? 0);
  expect(result[1].color).toBe('#123456');
  expect(result[1].coordinates).toHaveLength(2);
  expect(route.geometry[0].context).toBeUndefined();
  expect(journeyGeometry(route.geometry, null, {})).toBe(route.geometry);
});

it('路線ごとのフィルターを保持し、乗換案内の駅ラベルを共有駅へ割り当てる', () => {
  const a = routeFixture('a');
  const b = routeFixture('b');
  a.services = [
    { id: 'fast', name: '架空快速', rank: 1, stops: { a: 'common', b: 'none', c: 'common' } },
  ];
  const combined = combineRoutes([a, b], 'b', [], {}, undefined, { a: ['fast'] });
  expect(combined.members.has('a:b')).toBe(false);
  expect(combined.members.has('b:b')).toBe(true);
  const stop = {
    id: 'origin',
    name: '始点駅',
    names: ['始点駅'],
    position: a.stations[0].position,
    members: [
      {
        routeId: 'a',
        stationId: 'a',
        stationName: '始点駅',
        routeName: a.name,
        operator: a.operator,
        prefectures: a.prefectures,
      },
    ],
  };
  const labels = journeyStopLabels(combined.members, {
    key: '',
    result: { status: 'available', message: '' },
    stops: [stop, stop],
  });
  expect(labels.get('a:a')).toBe('出発・到着');
  expect(labels.has('b:a')).toBe(false);
});
