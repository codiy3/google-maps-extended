import { useId, useRef, useState } from 'react';
import { searchRoutes } from './search';
import type { RouteSummary } from './types';

export function SearchBox({
  routes,
  onSelect,
}: {
  routes: RouteSummary[];
  onSelect: (route: RouteSummary) => void;
}) {
  const [query, setQuery] = useState('');
  const [committed, setCommitted] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const composing = useRef(false);
  const listId = useId();
  const results = searchRoutes(routes, committed);
  const visible = open && committed.trim() !== '';
  function choose(route: RouteSummary) {
    setQuery(route.name);
    setCommitted(route.name);
    setOpen(false);
    setActive(-1);
    onSelect(route);
  }
  return (
    <fieldset
      className="search-box"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={`${listId}-input`}>路線を探す</label>
      <div className="search-input-wrap">
        <span className="search-icon" aria-hidden="true">
          ⌕
        </span>
        <input
          id={`${listId}-input`}
          type="text"
          role="combobox"
          autoComplete="off"
          placeholder="路線名を入力（例：中央線）"
          value={query}
          aria-expanded={visible}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={visible && active >= 0 ? `${listId}-${active}` : undefined}
          onFocus={() => setOpen(true)}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={(e) => {
            composing.current = false;
            setCommitted(e.currentTarget.value);
            setActive(-1);
            setOpen(true);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(-1);
            setOpen(true);
            if (!composing.current) setCommitted(e.target.value);
          }}
          onKeyDown={(e) => {
            if (composing.current || e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === 'Escape') {
              setOpen(false);
              setActive(-1);
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setOpen(true);
              const next = results.length
                ? (active + (e.key === 'ArrowDown' ? 1 : active < 0 ? 0 : -1) + results.length) %
                  results.length
                : -1;
              setActive(next);
              document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: 'nearest' });
            }
            if (e.key === 'Enter' && visible && active >= 0 && results[active]) {
              e.preventDefault();
              choose(results[active]);
            }
          }}
        />
        {query && (
          <button
            type="button"
            className="clear-search"
            aria-label="検索文字を消す"
            onClick={() => {
              setQuery('');
              setCommitted('');
              setActive(-1);
            }}
          >
            ×
          </button>
        )}
      </div>
      <span className="sr-only" role="status">
        {visible ? `${results.length}件の候補` : ''}
      </span>
      {visible && (
        <div className="suggestions">
          <div className="suggestion-count">
            候補 {results.length}件<span>会社・地域を確認して選択</span>
          </div>
          <div className="candidate-list" id={listId} role="listbox" aria-label="路線候補">
            {results.map((route, index) => (
              <div
                key={route.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(route)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') choose(route);
                }}
              >
                <strong>{route.name}</strong>
                <span>
                  {route.operator} · {route.prefectures.join('・') || '都道府県未確認'}
                  {route.regionStatus === 'partial' ? '（一部未確認）' : ''}
                </span>
                <small>{route.section}</small>
              </div>
            ))}
          </div>
          {results.length === 0 && (
            <p className="no-results">該当する路線がありません。別の表記で入力してください。</p>
          )}
        </div>
      )}
    </fieldset>
  );
}
