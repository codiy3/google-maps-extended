import { describe, expect, it } from 'vitest';
import { normalize, searchRoutes } from './search';
import { routeFixture } from './test-fixtures';

describe('路線検索', () => {
  it('全半角・かな・空白を正規化して元データは変えない', () => {
    expect(normalize(' ＪＲ チュウオウセン ')).toBe('jrちゅうおうせん');
    const route = routeFixture();
    expect(searchRoutes([route], 'チュウオウセン')).toEqual([route]);
    expect(route.aliases[1]).toBe('ちゅうおうせん');
  });
  it('同名の会社・地域を統合せず完全一致と別名を先に出す', () => {
    const a = routeFixture();
    const b = { ...routeFixture('test-line-b', 'テスト鉄道B'), prefectures: ['大阪府'] };
    const alias = { ...routeFixture('test-alias'), name: '中央本線', aliases: ['中央線'] };
    const partial = { ...routeFixture('test-partial'), name: '新中央線', aliases: [] };
    expect(searchRoutes([partial, alias, b, a], '中央線').map((r) => r.id)).toEqual([
      a.id,
      b.id,
      alias.id,
      partial.id,
    ]);
  });
  it('空入力・該当なしでは勝手に先頭を選ばない', () => {
    expect(searchRoutes([routeFixture()], ' ')).toEqual([]);
    expect(searchRoutes([routeFixture()], '存在しない路線')).toEqual([]);
  });
});
