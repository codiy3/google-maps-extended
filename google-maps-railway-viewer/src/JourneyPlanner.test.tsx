import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { JourneyPlanner } from './JourneyPlanner';
import type { JourneyResponse, JourneySelection, StationChoice } from './journey-types';
import { routeFixture } from './test-fixtures';

const route = routeFixture();
const stations: StationChoice[] = route.stations.map((s) => ({
  id: s.id,
  name: s.name,
  names: [s.name],
  position: s.position,
  members: [
    {
      routeId: route.id,
      stationId: s.id,
      stationName: s.name,
      routeName: route.name,
      operator: route.operator,
      prefectures: route.prefectures,
    },
  ],
}));
const sample: JourneyResponse = {
  distance: {
    status: 'available',
    kind: 'distance',
    meters: 2400,
    message: '線路データ上の候補',
    legs: [
      {
        routeId: route.id,
        fromStationId: 'a',
        toStationId: 'c',
        fromName: '始点駅',
        toName: '終点駅',
        geometry: route.geometry,
      },
    ],
  },
  time: { status: 'unavailable', message: '時刻表未取得のため未計算です。' },
};
function Harness() {
  const [selection, onSelect] = useState<JourneySelection | null>(null);
  return (
    <JourneyPlanner
      enabled
      routes={[route]}
      filters={{}}
      selection={selection}
      onSelect={onSelect}
      onNavigate={() => {}}
    />
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mockFetch(journeys: (body: string) => Promise<Response>, choices = stations) {
  const mock = vi.fn((url: string, options?: RequestInit) =>
    url === '/api/stations'
      ? Promise.resolve(Response.json({ stations: choices }))
      : journeys(String(options?.body)),
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}
async function station(label: string, name: string) {
  const input = await screen.findByRole('combobox', { name: label });
  fireEvent.change(input, { target: { value: name } });
  fireEvent.click(
    await within(screen.getByRole('listbox', { name: `${label}の候補` })).findByRole('option'),
  );
}

it('同名駅の会社と地域を区別し、IME確定中に選択しない', async () => {
  mockFetch(
    async () => Response.json(sample),
    [
      stations[0],
      {
        ...stations[0],
        id: 'other',
        members: [{ ...stations[0].members[0], operator: '別会社', prefectures: ['大阪府'] }],
      },
    ],
  );
  render(<Harness />);
  const input = await screen.findByRole('combobox', { name: '出発駅' });
  await act(async () => {});
  fireEvent.change(input, { target: { value: '始点' } });
  const options = await screen.findAllByRole('option');
  expect(options).toHaveLength(2);
  expect(options[0].textContent).toContain('東京都');
  expect(options[1].textContent).toContain('別会社');
  expect(options[1].textContent).toContain('大阪府');
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.compositionStart(input);
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  expect(screen.getAllByRole('option')).toHaveLength(2);
  fireEvent.compositionEnd(input);
  fireEvent.click(options[1]);
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(screen.getByText('別会社 中央線')).toBeTruthy();
});

it('経由駅を指定順に並べ替え、削除した条件をAPIへ渡す', async () => {
  const requests: string[][] = [];
  mockFetch(async (body) => {
    requests.push(JSON.parse(body).stops);
    return Response.json(sample);
  });
  render(<Harness />);
  await station('出発駅', '始点駅');
  await station('到着駅', '終点駅');
  fireEvent.click(screen.getByRole('button', { name: '＋ 経由駅を追加' }));
  await station('経由駅1', '中間駅');
  fireEvent.click(screen.getByRole('button', { name: '＋ 経由駅を追加' }));
  await station('経由駅2', '始点駅');
  fireEvent.click(screen.getByRole('button', { name: '経由駅2を上へ' }));
  expect((screen.getByRole('combobox', { name: '経由駅1' }) as HTMLInputElement).value).toBe(
    '始点駅',
  );
  fireEvent.click(screen.getByRole('button', { name: '経路を検索' }));
  await screen.findByRole('button', { name: /最短距離/ });
  expect(requests[0]).toEqual(['a', 'a', 'b', 'c']);
  fireEvent.click(screen.getByRole('button', { name: '駅・日時を変更' }));
  fireEvent.click(screen.getByRole('button', { name: '経由駅1を削除' }));
  expect(screen.queryByRole('button', { name: /最短距離/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '経路を検索' }));
  await screen.findByRole('button', { name: /最短距離/ });
  expect(requests[1]).toEqual(['a', 'b', 'c']);
  expect((screen.getByRole('button', { name: /最短時間/ }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});

it('検索条件変更後に古い応答が到着しても結果を表示しない', async () => {
  let resolve: ((r: Response) => void) | undefined;
  mockFetch(
    () =>
      new Promise<Response>((r) => {
        resolve = r;
      }),
  );
  render(<Harness />);
  await station('出発駅', '始点駅');
  await station('到着駅', '終点駅');
  fireEvent.click(screen.getByRole('button', { name: '経路を検索' }));
  await station('到着駅', '中間駅');
  await act(async () => resolve?.(Response.json(sample)));
  expect(screen.queryByRole('button', { name: /最短距離/ })).toBeNull();
  expect(screen.getByRole('button', { name: '経路を検索' })).toBeTruthy();
});
