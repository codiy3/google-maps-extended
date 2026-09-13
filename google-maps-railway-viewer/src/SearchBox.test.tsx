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
});
