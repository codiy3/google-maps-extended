import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { routeFixture } from './test-fixtures';
import type { RouteDetail } from './types';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('路線と表示の同期', () => {
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
