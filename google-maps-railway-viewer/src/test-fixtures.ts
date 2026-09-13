import type { RouteDetail } from './types';

export function routeFixture(id = 'test-line-a', operator = 'テスト鉄道A'): RouteDetail {
  return {
    id,
    name: '中央線',
    operator,
    officialOperator: operator,
    prefectures: ['東京都'],
    regionStatus: 'complete',
    aliases: ['中央本線', 'ちゅうおうせん'],
    kind: 'source_railway',
    section: 'テスト用区間',
    stationOrder: 'route',
    stationCount: 3,
    dataDate: '2025-12-31',
    sources: [],
    services: [],
    serviceStatus: 'unavailable',
    stations: [
      { id: 'a', name: '始点駅', position: [139.7, 35.7], sourceCodes: ['1'] },
      { id: 'b', name: '中間駅', position: [139.71, 35.71], sourceCodes: ['2'] },
      { id: 'c', name: '終点駅', position: [139.72, 35.7], sourceCodes: ['3'] },
    ],
    geometry: [
      {
        id: 'g1',
        coordinates: [
          [139.7, 35.7],
          [139.71, 35.71],
          [139.72, 35.7],
        ],
      },
    ],
  };
}
