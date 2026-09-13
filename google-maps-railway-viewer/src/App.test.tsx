import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { GoogleMap } from './GoogleMap';
import { routeFixture } from './test-fixtures';
import type { RouteDetail } from './types';

vi.mock('./GoogleMap', () => ({
  GoogleMap: vi.fn(() => <div data-testid="google-map-test" />),
}));
beforeEach(() => {
  vi.stubEnv('VITE_GOOGLE_MAPS_MODE', '');
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe('外部地図への接続設定', () => {
  it('キーを保存しても接続設定がなければプレビューを表示する', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-placeholder-never-sent');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ schemaVersion: 1, routes: [] }))),
    );
    render(<App />);
    await screen.findByRole('combobox');
    expect(GoogleMap).not.toHaveBeenCalled();
    expect(screen.getByText('線形プレビュー')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '地図の設定・データ' }));
    expect(screen.getByText(/キー保存済み・Google マップ接続は無効/)).toBeTruthy();
  });
  it('キーと明示的な接続設定がそろった場合に外部地図を表示する', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-placeholder-never-sent');
    vi.stubEnv('VITE_GOOGLE_MAPS_MODE', 'google');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ schemaVersion: 1, routes: [] }))),
    );
    render(<App />);
    await screen.findByRole('combobox');
    expect(screen.getByTestId('google-map-test')).toBeTruthy();
    expect(screen.queryByText('線形プレビュー')).toBeNull();
  });
});
describe('路線と表示の同期', () => {
  it('同じ路線を選び直しても駅と線路を再表示する', async () => {
    const route = routeFixture();
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        Response.json(url.includes('catalog') ? { schemaVersion: 1, routes: [route] } : route),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    const input = await screen.findByRole('combobox');
    fireEvent.change(input, { target: { value: '中央線' } });
    fireEvent.click(screen.getByRole('option'));
    await screen.findByRole('img', { name: '中央線の線路形状' });
    fireEvent.change(input, { target: { value: '中央' } });
    fireEvent.click(screen.getByRole('option'));
    await screen.findByRole('img', { name: '中央線の線路形状' });
    expect(fetchMock.mock.calls.filter(([url]) => !url.includes('catalog'))).toHaveLength(2);
    expect(
      within(screen.getByRole('list', { name: '駅一覧' })).getAllByRole('button'),
    ).toHaveLength(3);
  });
  it('連続選択した古い取得結果で新しい路線を上書きしない', async () => {
    const a = routeFixture();
    const b = { ...routeFixture('test-b', 'テスト鉄道B'), name: '第二線', aliases: [] };
    let resolveA: ((value: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('catalog'))
          return Promise.resolve(
            Response.json({ schemaVersion: 1, routes: [a, b], notice: 'テスト用' }),
          );
        if (url.includes(a.id))
          return new Promise<Response>((resolve) => {
            resolveA = resolve;
          });
        return Promise.resolve(Response.json(b));
      }),
    );
    render(<App />);
    const input = await screen.findByRole('combobox');
    fireEvent.change(input, { target: { value: '中央線' } });
    fireEvent.click(screen.getByRole('option'));
    fireEvent.change(input, { target: { value: '第二線' } });
    fireEvent.click(screen.getByRole('option'));
    await screen.findByRole('img', { name: '第二線の線路形状' });
    await act(async () => {
      resolveA?.(Response.json(a));
    });
    expect(screen.getByRole('img', { name: '第二線の線路形状' })).toBeTruthy();
    expect(screen.queryByRole('img', { name: '中央線の線路形状' })).toBeNull();
  });
  it('検索文字を変更しても選択路線を維持し、種別と全駅を切り替える', async () => {
    const route: RouteDetail = {
      ...routeFixture(),
      serviceStatus: 'available',
      services: [
        {
          id: 'fast',
          name: 'テスト快速',
          rank: 1,
          stops: { a: 'common', b: 'none', c: 'conditional' },
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          Response.json(url.includes('catalog') ? { schemaVersion: 1, routes: [route] } : route),
        ),
      ),
    );
    render(<App />);
    const input = await screen.findByRole('combobox');
    fireEvent.change(input, { target: { value: '中央線' } });
    fireEvent.click(screen.getByRole('option'));
    const list = await screen.findByRole('list', { name: '駅一覧' });
    expect(within(list).getAllByRole('button')).toHaveLength(3);
    fireEvent.change(input, { target: { value: '別の検索' } });
    expect(screen.getByRole('img', { name: '中央線の線路形状' })).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'テスト快速' }));
    expect(within(list).getAllByRole('button')).toHaveLength(2);
    expect(within(list).getByText('一部停車')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^全駅$/ }));
    expect(within(list).getAllByRole('button')).toHaveLength(3);
  });
});
