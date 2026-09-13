import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { StationDetails as Details } from './StationDetails';
import { routeFixture } from './test-fixtures';
import { useStationTimes } from './useStationTimes';

function StationDetails(
  props: Omit<ComponentProps<typeof Details>, 'times'> & { serviceIds: string[] },
) {
  const times = useStationTimes(props.route.id, props.station.id, props.serviceIds);
  return <Details {...props} times={times} />;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('接続先へ駅を指定して移動し、未取得の所要時間を0分にしない', async () => {
  const route = routeFixture();
  const other = { ...routeFixture('other'), name: '接続線' };
  const station = {
    ...route.stations[0],
    connections: [
      {
        routeId: 'other',
        stationId: 'b',
        stationName: '中間駅',
        kind: 'through' as const,
        source: '公式確認資料',
      },
    ],
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        Response.json({
          originId: 'a',
          status: 'unavailable',
          rows: route.stations.map((s) => ({
            stationId: s.id,
            status: s.id === 'a' ? 'origin' : 'unavailable',
          })),
        }),
      ),
    ),
  );
  const navigate = vi.fn();
  render(
    <StationDetails
      route={route}
      station={station}
      routes={[other]}
      onNavigate={navigate}
      serviceIds={[]}
    />,
  );
  const list = await screen.findByRole('list', { name: '各駅までの所要時間' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(3);
  expect(within(list).queryByText('0分')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /接続線/ }));
  expect(navigate).toHaveBeenCalledWith(other, 'b');
});
it('先の駅の遅い応答を新しい駅の所要時間へ混ぜない', async () => {
  const route = routeFixture();
  let finishA: ((r: Response) => void) | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url.includes('origin=a')
        ? new Promise<Response>((resolve) => {
            finishA = resolve;
          })
        : Promise.resolve(Response.json({ originId: 'b', status: 'unavailable', rows: [] })),
    ),
  );
  const props = { route, routes: [], onNavigate: vi.fn(), serviceIds: [] };
  const view = render(<StationDetails {...props} station={route.stations[0]} />);
  view.rerender(<StationDetails {...props} station={route.stations[1]} />);
  await screen.findByRole('list', { name: '各駅までの所要時間' });
  await act(async () => {
    finishA?.(
      Response.json({
        originId: 'a',
        status: 'available',
        rows: [{ stationId: 'c', status: 'available', minutes: 99 }],
      }),
    );
  });
  expect(screen.queryByText('99分')).toBeNull();
});

it('翌日の到着と検索期間を日本時間の日付付きで表示する', async () => {
  const route = routeFixture();
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        Response.json({
          originId: 'a',
          status: 'available',
          start: '2026-09-13T23:00:00+09:00',
          end: '2026-09-13T16:00:00Z',
          rows: [
            {
              stationId: 'b',
              status: 'available',
              minutes: 30,
              departure: '2026-09-13T23:50:00+09:00',
              arrival: '2026-09-14T00:20:00+09:00',
            },
          ],
        }),
      ),
    ),
  );
  render(
    <StationDetails
      route={route}
      station={route.stations[0]}
      routes={[]}
      onNavigate={vi.fn()}
      serviceIds={[]}
    />,
  );
  expect(await screen.findByText('9/13 23:50発 → 9/14 00:20着')).toBeTruthy();
  expect(screen.getByText('検索範囲：9/13 23:00〜9/14 01:00（日本時間）')).toBeTruthy();
});
