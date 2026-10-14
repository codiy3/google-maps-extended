import { expect, it } from 'vitest';
import { mapInsets, stationLabel } from './OpenMap';

it('駅名・時刻・路線色を表示し、データ中のHTMLは実行しない', () => {
  const label = stationLabel(
    {
      id: 'a',
      name: '<img src=x onerror=alert(1)>',
      position: [139, 35],
      sourceCodes: [],
      routeColors: ['#123456'],
    },
    '12:34',
  );
  expect(label.textContent).toContain('<img src=x onerror=alert(1)>');
  expect(label.querySelector('img')).toBeNull();
  expect(label.querySelector('small')?.textContent).toBe('12:34');
  expect(label.querySelector('.route-dot')).toBeTruthy();
});

it('検索欄と駅カードが地図に重なる時だけ表示余白を確保する', () => {
  const map = new DOMRect(0, 100, 390, 600);
  expect(mapInsets(map, new DOMRect(0, 100, 390, 120), new DOMRect(30, 590, 330, 80))).toEqual({
    top: 132,
    bottom: 122,
  });
  expect(mapInsets(new DOMRect(400, 100, 900, 600), new DOMRect(0, 100, 400, 120))).toEqual({
    top: 20,
    bottom: 35,
  });
});
