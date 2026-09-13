import { describe, expect, it } from 'vitest';
import { combineRoutes } from './map-data';
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
