import { useId, useRef, useState } from 'react';
import type { StationChoice } from './journey-types';
import { normalize } from './search';

export interface StationInput {
  text: string;
  station: StationChoice | null;
}
export function StationField({
  label,
  value,
  stations,
  onChange,
}: {
  label: string;
  value: StationInput;
  stations: StationChoice[];
  onChange: (value: StationInput) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const composing = useRef(false);
  const [committed, setCommitted] = useState(value.text);
  const needle = normalize(committed).replace(/駅$/u, '');
  const candidates = needle
    ? stations
        .map((station) => {
          const names = station.names.map(normalize);
          const score = names.includes(needle)
            ? 0
            : names.some((n) => n.startsWith(needle))
              ? 1
              : names.some((n) => n.includes(needle))
                ? 2
                : Infinity;
          return { station, score };
        })
        .filter((item) => Number.isFinite(item.score))
        .sort((a, b) => a.score - b.score || a.station.name.localeCompare(b.station.name, 'ja'))
        .slice(0, 40)
        .map((item) => item.station)
    : [];
  const visible = open && Boolean(needle);
  function choose(station: StationChoice) {
    onChange({ text: station.name, station });
    setCommitted(station.name);
    setOpen(false);
    setActive(-1);
  }
  return (
    <fieldset
      className="station-field"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        role="combobox"
        value={value.text}
        autoComplete="off"
        placeholder="駅名を入力して候補から選択"
        aria-expanded={visible}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={visible && active >= 0 ? `${id}-${active}` : undefined}
        onFocus={() => setOpen(true)}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={(e) => {
          composing.current = false;
          setCommitted(e.currentTarget.value);
          setActive(-1);
        }}
        onChange={(e) => {
          onChange({ text: e.target.value, station: null });
          setOpen(true);
          setActive(-1);
          if (!composing.current) setCommitted(e.target.value);
        }}
        onKeyDown={(e) => {
          if (composing.current || e.nativeEvent.isComposing || e.keyCode === 229) return;
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
            setActive((previous) =>
              candidates.length
                ? (previous +
                    (e.key === 'ArrowDown' ? 1 : previous < 0 ? 0 : -1) +
                    candidates.length) %
                  candidates.length
                : -1,
            );
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            if (visible && active >= 0 && candidates[active]) choose(candidates[active]);
          }
        }}
      />
      {value.station && (
        <small className="chosen-station-context">
          {[...new Set(value.station.members.map((m) => `${m.operator} ${m.routeName}`))].join(
            '・',
          )}
        </small>
      )}
      {visible && (
        <div
          className="station-candidates"
          id={`${id}-list`}
          role="listbox"
          aria-label={`${label}の候補`}
        >
          {candidates.map((station, index) => (
            <div
              id={`${id}-${index}`}
              key={station.id}
              role="option"
              tabIndex={-1}
              aria-selected={active === index}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(station)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') choose(station);
              }}
            >
              <strong>{station.names.join(' / ')}</strong>
              <small>
                {[...new Set(station.members.map((m) => `${m.operator} ${m.routeName}`))].join(
                  '・',
                )}
              </small>
              <small>
                路線の地域：
                {[...new Set(station.members.flatMap((m) => m.prefectures))].join('・') || '未確認'}
              </small>
            </div>
          ))}
          {!candidates.length && <p>該当する駅がありません。</p>}
          {candidates.length === 40 && (
            <p>先頭40件を表示しています。駅名を詳しく入力してください。</p>
          )}
        </div>
      )}
    </fieldset>
  );
}
