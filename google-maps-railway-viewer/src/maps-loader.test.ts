import { setOptions } from '@googlemaps/js-api-loader';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@googlemaps/js-api-loader', () => ({
  setOptions: vi.fn(),
  importLibrary: vi.fn(async () => ({})),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.resetModules();
});

it('同時に地図を読み込んでも設定を一度だけ行う', async () => {
  vi.stubGlobal('google', undefined);
  const { loadMaps } = await import('./maps-loader');
  const first = loadMaps('test-placeholder-never-sent');
  expect(loadMaps('test-placeholder-never-sent')).toBe(first);
  await first;
  expect(setOptions).toHaveBeenCalledTimes(1);
});

it('初期化済みのページではモジュール再読込後も設定値を再送しない', async () => {
  const load = vi.fn(async () => ({}));
  vi.stubGlobal('google', { maps: { importLibrary: load } });
  await (await import('./maps-loader')).loadMaps('test-placeholder-never-sent');
  expect(setOptions).not.toHaveBeenCalled();
  expect(load.mock.calls).toEqual([['maps'], ['marker']]);
});
