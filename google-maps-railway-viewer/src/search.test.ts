import { describe, expect, it } from 'vitest';
import { normalize, searchRouteMatches, searchRoutes } from './search';
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
  it('駅名と末尾の駅を付けた入力から所属路線を探し、同名駅の地域を統合しない', () => {
    const tokyo = { ...routeFixture(), stationNames: ['新宿', '南新宿'] };
    const other = { ...routeFixture('another'), stationNames: ['新宿'], prefectures: ['別地域'] };
    const unrelated = routeFixture('unrelated');
    for (const query of ['新宿', '新宿駅']) {
      const matches = searchRouteMatches([tokyo, other, unrelated], query);
      expect(new Set(matches.map(({ route }) => route.id))).toEqual(new Set([tokyo.id, other.id]));
      expect(matches.find(({ route }) => route.id === tokyo.id)?.matchedStations).toEqual([
        '新宿',
        '南新宿',
      ]);
      expect(matches.find(({ route }) => route.id === other.id)?.route.prefectures).toEqual([
        '別地域',
      ]);
    }
  });
  it('駅名の完全一致を会社名の部分一致より先に表示する', () => {
    const station = { ...routeFixture('station'), stationNames: ['新宿'] };
    const company = routeFixture('company', '新宿テスト鉄道');
    expect(searchRoutes([company, station], '新宿').map((route) => route.id)).toEqual([
      'station',
      'company',
    ]);
  });
  it('会社の表示名・正式名・確認済み略称を検索し、他社の路線を混ぜない', () => {
    const keikyu = {
      ...routeFixture(),
      operator: '京急電鉄',
      officialOperator: '京浜急行電鉄',
      operatorAliases: ['京急'],
    };
    for (const query of ['京急', '京急電鉄', '京浜急行電鉄']) {
      const matches = searchRouteMatches([keikyu, routeFixture('other')], query);
      expect(matches).toHaveLength(1);
      expect(matches[0].route).toBe(keikyu);
      expect(matches[0].matchedOperator).toBe(true);
      expect(matches[0].matchedStations).toEqual([]);
    }
  });
});
