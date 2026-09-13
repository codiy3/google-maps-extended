import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchBox } from './SearchBox';
import { routeFixture } from './test-fixtures';

afterEach(cleanup);
describe('候補の操作', () => {
  it('入力中に候補を出し、IMEのEnterでは確定しない', () => {
    const select = vi.fn();
    render(<SearchBox routes={[routeFixture()]} onSelect={select} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: '中央' } });
    expect(screen.getByRole('option').textContent).toContain('テスト鉄道A · 東京都');
    Element.prototype.scrollIntoView = vi.fn();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(select).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(select).toHaveBeenCalledOnce();
  });
  it('候補未選択のEnterでは自動確定せずEscapeで閉じる', () => {
    const select = vi.fn();
    render(<SearchBox routes={[routeFixture()]} onSelect={select} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: '中央線' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(select).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('option')).toBeNull();
  });
  it('駅名で見つかった根拠と会社を表示し、クリックで路線を確定する', () => {
    const select = vi.fn();
    const route = { ...routeFixture(), stationNames: ['新宿'] };
    render(<SearchBox routes={[route]} onSelect={select} />);
    fireEvent.change(screen.getByRole('combobox', { name: '路線・駅・鉄道会社を探す' }), {
      target: { value: '新宿駅' },
    });
    const option = screen.getByRole('option');
    expect(option.textContent).toContain('該当駅：新宿');
    expect(option.textContent).toContain('テスト鉄道A · 東京都');
    fireEvent.click(option);
    expect(select).toHaveBeenCalledWith(route);
  });
  it('鉄道会社名の検索理由を表示し、キーボードで路線を選べる', () => {
    const select = vi.fn();
    const route = routeFixture();
    render(<SearchBox routes={[route]} onSelect={select} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'テスト鉄道A' } });
    expect(screen.getByRole('option').textContent).toContain('鉄道会社名に一致');
    Element.prototype.scrollIntoView = vi.fn();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(select).toHaveBeenCalledWith(route);
  });
});
