import { describe, expect, it } from 'vitest';
import { assignRouteColor, combinedGeometry, combineRoutes } from './map-data';
import { routeFixture } from './test-fixtures';

describe('複数路線のピンと選択先', () => {
  it('同じ名前の別地域の駅を統合せず、線分も連結しない', () => {
    const a = routeFixture('a');
    const b = routeFixture('b');
    const result = combineRoutes([a, b], 'a', []);
    expect(result.route?.stations).toHaveLength(6);
    expect(result.route?.geometry).toHaveLength(2);
    expect(new Set(result.route?.geometry.map((g) => g.id)).size).toBe(2);
  });
  it('公式の同一駅グループでピンを共有し、両方の路線へ戻れる', () => {
    const a = routeFixture('a');
    const b = routeFixture('b');
    a.stations[0].groupIds = ['same'];
    b.stations[0].groupIds = ['different', 'same'];
    const result = combineRoutes([a, b], 'b', []);
    expect(result.route?.stations).toHaveLength(5);
    expect([...result.members.values()].find((members) => members.length === 2)).toEqual([
      { routeId: 'a', stationId: 'a' },
      { routeId: 'b', stationId: 'a' },
    ]);
    expect(a.stations[0].id).toBe('a');
  });
  it('選択路線のフィルターを他路線へ適用せず、共有ピンを残す', () => {
    const a = routeFixture('a');
    const b = routeFixture('b');
    a.stations[0].groupIds = ['same'];
    b.stations[0].groupIds = ['same'];
    a.services = [
      { id: 'fast', name: '架空快速', rank: 1, stops: { a: 'none', b: 'common', c: 'none' } },
    ];
    const result = combineRoutes([a, b], 'a', ['fast']);
    expect(result.route?.stations).toHaveLength(4);
    expect(result.members.get('same')).toEqual([{ routeId: 'b', stationId: 'a' }]);
  });
});

it('ピンの路線名は所属する路線だけで構成する', () => {
  const a = routeFixture('a', '会社A');
  const b = { ...routeFixture('b', '会社B'), name: '第二線' };
  a.stations[0].groupIds = ['shared'];
  b.stations[0].groupIds = ['shared'];
  const { route } = combineRoutes([a, b], 'a', []);
  expect(route?.stations.find((s) => s.id === 'shared')?.routeNames).toEqual([
    '会社A 中央線',
    '会社B 第二線',
  ]);
  expect(route?.stations.find((s) => s.id === 'a:b')?.routeNames).toEqual(['会社A 中央線']);
});

it('逆向きの共用線形にも両路線の色を残し、原典を変更しない', () => {
  const a = routeFixture('a');
  const b = routeFixture('b');
  b.geometry[0].coordinates = [...a.geometry[0].coordinates].reverse();
  a.stations[0].groupIds = ['shared'];
  b.stations[0].groupIds = ['shared'];
  const colors = assignRouteColor(assignRouteColor({}, 'a'), 'b');
  const geometry = combinedGeometry([a, b], colors);
  expect(colors.a).not.toBe(colors.b);
  expect(geometry.map((g) => g.color)).toEqual([colors.a, colors.b]);
  expect(geometry[0].strokeWeight).toBeGreaterThan(geometry[1].strokeWeight ?? 0);
  expect(geometry[0].zIndex).toBeLessThan(geometry[1].zIndex ?? 0);
  expect(a.geometry[0].color).toBeUndefined();
  const { route } = combineRoutes([a, b], 'b', [], colors);
  expect(route?.stations.find((s) => s.id === 'shared')?.routeColors).toEqual([colors.a, colors.b]);
});
