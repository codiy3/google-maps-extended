import { useEffect, useRef, useState } from 'react';
import type {
  JourneyResponse,
  JourneySelection,
  ServiceFilters,
  StationChoice,
} from './journey-types';
import { StationField, type StationInput } from './StationField';
import type { RouteSummary } from './types';
import { dateLabel } from './useStationTimes';

export function JourneyPlanner({
  enabled,
  routes,
  filters,
  selection,
  onSelect,
  onNavigate,
}: {
  enabled: boolean;
  routes: RouteSummary[];
  filters: ServiceFilters;
  selection: JourneySelection | null;
  onSelect: (selection: JourneySelection | null) => void;
  onNavigate: (route: RouteSummary, stationId?: string) => void;
}) {
  const [stations, setStations] = useState<StationChoice[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [points, setPoints] = useState<(StationInput & { id: string })[]>([
    { id: 'origin', text: '', station: null },
    { id: 'destination', text: '', station: null },
  ]);
  const nextId = useRef(0);
  const [start, setStart] = useState(() =>
    new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 16),
  );
  const [transferMinutes, setTransferMinutes] = useState(5);
  const [response, setResponse] = useState<{ key: string; value: JourneyResponse } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const request = {
    stops: points.map((p) => p.station?.id ?? null),
    start: `${start}:00+09:00`,
    transferMinutes,
    services: filters,
  };
  const key = JSON.stringify(request);
  const currentKey = useRef(key);
  currentKey.current = key;
  const result = response?.key === key ? response.value : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 再試行世代とモード有効化で取得する。
  useEffect(() => {
    if (!enabled || stations.length) return;
    const abort = new AbortController();
    let current = true;
    setCatalogError('');
    fetch('/api/stations', { signal: abort.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const value = await r.json();
        if (
          !Array.isArray(value.stations) ||
          value.stations.some(
            (s: StationChoice) => !s.id || !Array.isArray(s.members) || !Array.isArray(s.names),
          )
        )
          throw new Error();
        if (current) setStations(value.stations);
      })
      .catch(() => {
        if (current) setCatalogError('駅一覧を読み込めませんでした。');
      });
    return () => {
      current = false;
      abort.abort();
    };
  }, [enabled, attempt, stations.length]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 検索条件が変わったら進行中の計算を中止する。
  useEffect(() => {
    controller.current?.abort();
    setLoading(false);
    setError('');
  }, [key]);
  useEffect(() => {
    if (selection && selection.key !== key) onSelect(null);
  }, [key, selection, onSelect]);
  useEffect(() => () => controller.current?.abort(), []);
  async function search() {
    if (points.some((p) => !p.station) || !start || !Number.isFinite(Date.parse(request.start))) {
      setError('すべての駅を候補から選び、出発日時を指定してください。');
      return;
    }
    const abort = new AbortController();
    controller.current?.abort();
    controller.current = abort;
    setLoading(true);
    setError('');
    onSelect(null);
    try {
      const http = await fetch('/api/journeys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Railway-Request': '1' },
        body: key,
        signal: abort.signal,
      });
      const value = await http.json();
      if (!http.ok) throw new Error(value.message || '経路を取得できませんでした。');
      if (
        !value.distance ||
        !value.time ||
        [value.distance, value.time].some((r) => r.status === 'available' && !Array.isArray(r.legs))
      )
        throw new Error('経路データの形式を確認できませんでした。');
      if (abort.signal.aborted || currentKey.current !== key) return;
      setResponse({ key, value });
      setEditing(false);
      const first = value.distance.status === 'available' ? value.distance : value.time;
      if (first.status === 'available')
        onSelect({
          key,
          result: first,
          stops: points.flatMap((p) => (p.station ? [p.station] : [])),
        });
    } catch (e) {
      if (!abort.signal.aborted && currentKey.current === key)
        setError(e instanceof Error ? e.message : '経路を読み込めませんでした。');
    } finally {
      if (!abort.signal.aborted && currentKey.current === key) setLoading(false);
    }
  }
  function move(index: number, delta: number) {
    setPoints((previous) => {
      const next = [...previous];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    });
  }
  return (
    <section className="journey-planner" hidden={!enabled} aria-label="乗換案内">
      <div className="journey-title">
        <h2>乗換案内</h2>
        <button type="button" onClick={() => setEditing(!editing)} aria-expanded={editing}>
          {editing ? '入力欄を閉じる' : '駅・日時を変更'}
        </button>
      </div>
      {catalogError ? (
        <p role="alert">
          {catalogError}{' '}
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>
            駅一覧を再試行
          </button>
        </p>
      ) : !stations.length ? (
        <p role="status">駅一覧を準備中…</p>
      ) : null}
      <form
        hidden={!editing}
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        {points.map((point, index) => (
          <div className="journey-point" key={point.id}>
            <StationField
              label={
                index === 0 ? '出発駅' : index === points.length - 1 ? '到着駅' : `経由駅${index}`
              }
              value={point}
              stations={stations}
              onChange={(value) =>
                setPoints((previous) =>
                  previous.map((p) => (p.id === point.id ? { ...p, ...value } : p)),
                )
              }
            />
            {index > 0 && index < points.length - 1 && (
              <div className="waypoint-controls">
                <button
                  type="button"
                  aria-label={`経由駅${index}を上へ`}
                  disabled={index === 1}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`経由駅${index}を下へ`}
                  disabled={index === points.length - 2}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`経由駅${index}を削除`}
                  onClick={() => setPoints((previous) => previous.filter((p) => p.id !== point.id))}
                >
                  削除
                </button>
              </div>
            )}
          </div>
        ))}
        <button
          type="button"
          className="add-waypoint"
          onClick={() => {
            const id = `via-${nextId.current++}`;
            setPoints((previous) => [
              ...previous.slice(0, -1),
              { id, text: '', station: null },
              previous[previous.length - 1],
            ]);
          }}
        >
          ＋ 経由駅を追加
        </button>
        <div className="journey-settings">
          <label>
            出発日時（日本時間）
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              required
            />
          </label>
          <label>
            乗換余裕時間（分）
            <input
              type="number"
              min={0}
              max={180}
              step={1}
              value={transferMinutes}
              onChange={(e) => setTransferMinutes(Number(e.target.value))}
              required
            />
          </label>
        </div>
        <p className="muted">
          経由駅は指定順・滞在なし。乗換余裕は計算上の設定で、駅構内の実測時間ではありません。
        </p>
        <button type="submit" className="journey-submit" disabled={loading || !stations.length}>
          {loading ? '経路を計算中…' : '経路を検索'}
        </button>
      </form>
      {!editing && (
        <p className="journey-summary">
          {points.map((p) => p.station?.name || p.text).join(' → ')}
          <small>{dateLabel(request.start)} 出発</small>
        </p>
      )}
      {Object.values(filters).some((v) => v.length) && (
        <p className="muted">路線の詳細で選択した列車種別を経路にも適用します。</p>
      )}
      {loading && (
        <p role="status">保存済みの線路データから探索中です。初回は経路用データを作成します。</p>
      )}
      {error && <p role="alert">{error}</p>}
      {response && !result && (
        <p className="data-note">
          検索条件が変わりました。
          <button type="button" onClick={() => void search()}>
            経路を再検索
          </button>
        </p>
      )}
      {result && (
        <div className="journey-results">
          {(['distance', 'time'] as const).map((kind) => {
            const option = result[kind];
            return (
              <div key={kind} className="journey-option">
                <button
                  type="button"
                  aria-pressed={selection?.key === key && selection.result === option}
                  disabled={option.status !== 'available'}
                  onClick={() =>
                    onSelect({
                      key,
                      result: option,
                      stops: points.flatMap((p) => (p.station ? [p.station] : [])),
                    })
                  }
                >
                  <strong>{kind === 'distance' ? '最短距離' : '最短時間'}</strong>
                  <span>
                    {option.status !== 'available'
                      ? '未計算'
                      : kind === 'distance'
                        ? `${((option.meters ?? 0) / 1000).toFixed(1)} km`
                        : `${option.minutes}分 · ${dateLabel(option.arrival)}着`}
                  </span>
                </button>
                <p>{option.message}</p>
              </div>
            );
          })}
        </div>
      )}
      {selection?.key === key && (
        <ol className="journey-legs" aria-label="通る路線">
          {selection.result.legs?.map((leg) => {
            const route = routes.find((r) => r.id === leg.routeId);
            return (
              <li
                key={`${leg.routeId}:${leg.fromStationId}:${leg.toStationId}:${leg.departure ?? leg.geometry[0]?.id}`}
              >
                <strong>
                  {leg.fromName} → {leg.toName}
                </strong>
                {route && (
                  <button type="button" onClick={() => onNavigate(route, leg.fromStationId)}>
                    {route.operator} {route.name} · 駅・種別を確認 ↗
                  </button>
                )}
                {leg.departure && (
                  <small>
                    {dateLabel(leg.departure)}発 → {dateLabel(leg.arrival)}着
                  </small>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
