import { describe, expect, it } from 'vitest';
import { displayedStops, sortServices } from './services';
import { routeFixture } from './test-fixtures';

describe('停車の集約', () => {
  it('全駅は種別データ不足でもすべての駅を表示する', () => {
    expect([...displayedStops(routeFixture(), []).keys()]).toEqual(['a', 'b', 'c']);
  });
  it('停車の証拠を残し、未確認を通過とみなさない', () => {
    const route = routeFixture();
    route.services = [
      { id: 'fast', name: '種別A', rank: 0, stops: { a: 'common', b: 'none', c: 'common' } },
      { id: 'local', name: '種別B', rank: 1, stops: { a: 'common', b: 'common', c: 'unknown' } },
    ];
    expect(Object.fromEntries(displayedStops(route, ['fast', 'local']))).toEqual({
      a: 'common',
      b: 'conditional',
      c: 'observed',
    });
    expect(Object.fromEntries(displayedStops(route, ['fast']))).toEqual({
      a: 'common',
      c: 'common',
    });
  });
  it('停車の証拠がない駅を停車駅として追加しない', () => {
    const route = routeFixture();
    route.services = [
      { id: 'x', name: '未確認の種別', rank: null, stops: { a: 'unknown', b: 'none' } },
    ];
    expect(displayedStops(route, ['x']).size).toBe(0);
  });
  it('確認済み種別順位を優先し、順位未確認は末尾に置く', () => {
    const services = [
      { id: 'x', name: '不明', rank: null, stops: {} },
      { id: 's', name: '普通', rank: 2, stops: {} },
      { id: 'f', name: '快速', rank: 1, stops: {} },
    ];
    expect(sortServices(services).map((s) => s.id)).toEqual(['f', 's', 'x']);
    expect(services[0].id).toBe('x');
  });
});
