import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchCatalog, fetchRoute, restoreRoute } from './data';
import { GoogleMap } from './GoogleMap';
import { JourneyPlanner } from './JourneyPlanner';
import { journeyGeometry, journeyStopLabels } from './journey-map';
import type { JourneySelection, ServiceFilters } from './journey-types';
import { MapPreview } from './MapPreview';
import { mapArrivalLabels } from './map-arrivals';
import { assignRouteColor, combinedGeometry, combineRoutes, type RouteColors } from './map-data';
import { SearchBox } from './SearchBox';
import { StationDetails } from './StationDetails';
import { displayedStops, sortServices, stopLabels } from './services';
import type { Catalog, RouteDetail, RouteSummary, StopState } from './types';
import { useStationTimes } from './useStationTimes';

type Load<T> =
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'error'; message: string };
const noServices: string[] = [];

export default function App() {
  const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  const useGoogleMap = import.meta.env.VITE_GOOGLE_MAPS_MODE === 'google' && Boolean(apiKey);
  const [catalog, setCatalog] = useState<Load<Catalog>>({ status: 'loading' });
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [choice, setChoice] = useState<RouteSummary | null>(null);
  const [choices, setChoices] = useState<RouteSummary[]>([]);
  const [routeColors, setRouteColors] = useState<RouteColors>({});
  const [loaded, setLoaded] = useState<Record<string, RouteDetail>>({});
  const cache = useRef(new Map<string, RouteDetail>());
  const [detail, setDetail] = useState<Load<RouteDetail>>({ status: 'loading' });
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [serviceFilters, setServiceFilters] = useState<ServiceFilters>({});
  const serviceIds = (choice && serviceFilters[choice.id]) || noServices;
  const [mode, setMode] = useState<'route' | 'journey'>('route');
  const [journey, setJourney] = useState<JourneySelection | null>(null);
  function setServiceIds(value: string[] | ((previous: string[]) => string[])) {
    if (!choice) return;
    setServiceFilters((previous) => ({
      ...previous,
      [choice.id]: typeof value === 'function' ? value(previous[choice.id] ?? noServices) : value,
    }));
  }
  const [expanded, setExpanded] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 再試行ボタンの世代番号で取得をやり直す。
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    fetchCatalog(controller.signal)
      .then((value) => {
        if (current) setCatalog({ status: 'ready', value });
      })
      .catch(() => {
        if (current)
          setCatalog({
            status: 'error',
            message: '路線一覧を読み込めませんでした。データの生成状態と接続を確認してください。',
          });
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [catalogAttempt]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 同じ路線の再選択・再試行も取得世代で区別する。
  useEffect(() => {
    if (!choice) return;
    const controller = new AbortController();
    let current = true;
    for (const selectedRoute of choices) {
      const saved = cache.current.get(selectedRoute.id);
      (saved ? Promise.resolve(saved) : fetchRoute(selectedRoute.id, controller.signal))
        .then((value) => {
          if (!current) return;
          cache.current.set(value.id, value);
          setLoaded((previous) =>
            previous[value.id] === value ? previous : { ...previous, [value.id]: value },
          );
          if (value.id === choice.id) setDetail({ status: 'ready', value });
        })
        .catch(() => {
          if (current && selectedRoute.id === choice.id)
            setDetail({
              status: 'error',
              message: '駅・線路データを読み込めませんでした。保存データから再試行できます。',
            });
        });
    }
    return () => {
      current = false;
      controller.abort();
    };
  }, [choice, choices, detailAttempt]);
  function choose(route: RouteSummary, stationId?: string) {
    setRouteColors((previous) => assignRouteColor(previous, route.id));
    setChoices((previous) =>
      previous.some((r) => r.id === route.id) ? previous : [...previous, route],
    );
    setChoice(route);
    setDetailAttempt((n) => n + 1);
    setDetail({ status: 'loading' });
    setSelected(stationId ?? null);
    setExpanded(true);
  }
  const route =
    choice && detail.status === 'ready' && choice.id === detail.value.id ? detail.value : null;
  const stops = useMemo(
    () => (route ? displayedStops(route, serviceIds) : new Map<string, StopState>()),
    [route, serviceIds],
  );
  const selectStation = useCallback((id: string) => setSelected(id), []);
  const clearStation = useCallback(() => setSelected(null), []);
  const activeStation = route?.stations.find((s) => s.id === selected && stops.has(s.id));
  const times = useStationTimes(route?.id, activeStation?.id, serviceIds);
  const displayRoutes = useMemo(
    () => choices.flatMap((r) => (loaded[r.id] ? [loaded[r.id]] : [])),
    [choices, loaded],
  );
  const baseGeometry = useMemo(
    () => combinedGeometry(displayRoutes, routeColors),
    [displayRoutes, routeColors],
  );
  const geometry = useMemo(
    () => journeyGeometry(baseGeometry, mode === 'journey' ? journey : null, routeColors),
    [baseGeometry, mode, journey, routeColors],
  );
  const mapData = useMemo(
    () =>
      combineRoutes(displayRoutes, choice?.id, serviceIds, routeColors, geometry, serviceFilters),
    [displayRoutes, choice?.id, serviceIds, geometry, routeColors, serviceFilters],
  );
  const mapSelected =
    [...mapData.members].find(([, members]) =>
      members.some((m) => m.routeId === choice?.id && m.stationId === selected),
    )?.[0] ?? null;
  const arrivals = useMemo(
    () =>
      activeStation
        ? mapArrivalLabels(mapData.members, route?.id, activeStation.id, times.result, times.error)
        : journeyStopLabels(mapData.members, mode === 'journey' ? journey : null),
    [mapData.members, route?.id, activeStation, times.result, times.error, mode, journey],
  );
  const showJourney = useCallback(
    (selection: JourneySelection | null) => {
      setJourney(selection);
      if (!selection || catalog.status !== 'ready') return;
      const ids = new Set(selection.result.legs?.map((leg) => leg.routeId));
      if (!ids.size && selection.stops[0]?.members[0])
        ids.add(selection.stops[0].members[0].routeId);
      const next = catalog.value.routes.filter((r) => ids.has(r.id));
      if (!next.length) return;
      setRouteColors((previous) =>
        next.reduce((colors, r) => assignRouteColor(colors, r.id), previous),
      );
      setChoices((previous) => [
        ...previous,
        ...next.filter((r) => !previous.some((p) => p.id === r.id)),
      ]);
      setChoice((previous) => (previous && ids.has(previous.id) ? previous : next[0]));
      setDetailAttempt((n) => n + 1);
      setDetail({ status: 'loading' });
      setSelected(null);
      setExpanded(true);
    },
    [catalog],
  );
  const selectMapStation = useCallback(
    (id: string) => {
      const memberships = mapData.members.get(id);
      const member = memberships?.find((m) => m.routeId === choice?.id) ?? memberships?.[0];
      if (!member) return;
      const next = choices.find((r) => r.id === member.routeId);
      if (!next) return;
      setChoice(next);
      setDetail({ status: 'ready', value: loaded[next.id] });
      setSelected(member.stationId);
      setExpanded(true);
    },
    [mapData.members, choices, loaded, choice?.id],
  );
  function removeRoute(id: string) {
    if (journey?.result.legs?.some((leg) => leg.routeId === id)) setJourney(null);
    const remaining = choices.filter((r) => r.id !== id);
    setChoices(remaining);
    if (choice?.id === id) {
      setChoice(remaining.at(-1) ?? null);
      setDetail({ status: 'loading' });
      setSelected(null);
    }
  }
  function throughLinks(position: 'start' | 'end' | 'middle') {
    if (!route || catalog.status !== 'ready') return null;
    const first = route.stations[0]?.id;
    const last = route.stations.at(-1)?.id;
    const links = (route.throughServices ?? []).filter((c) =>
      position === 'start'
        ? c.atStationId === first
        : position === 'end'
          ? c.atStationId === last
          : c.atStationId !== first && c.atStationId !== last,
    );
    if (!links.length) return null;
    return (
      <section className="through-links" aria-label="乗換不要の直通先">
        <span>{position === 'middle' ? '途中駅での直通' : 'この先の直通路線'}</span>
        {links.map((connection) => {
          const next = catalog.value.routes.find((r) => r.id === connection.routeId);
          return next ? (
            <button
              type="button"
              key={`${connection.atStationId}:${next.id}`}
              onClick={() => choose(next, connection.stationId)}
            >
              {connection.atStationName} ↔ {next.operator} {next.name} ↗
            </button>
          ) : null;
        })}
        <small>直通する列車・行先に限ります。</small>
      </section>
    );
  }
  function toggleService(id: string) {
    setServiceIds((previous) =>
      previous.includes(id) ? previous.filter((v) => v !== id) : [...previous, id],
    );
    setSelected(null);
  }
  return (
    <main className="app-shell">
      <header className="app-header">
        <a href="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            ↗
          </span>
          <span>
            Railway Viewer<small>沿線を見つける</small>
          </span>
        </a>
        <div className="header-actions">
          <span className="preview-label">開発版</span>
          <button
            type="button"
            className="text-button"
            onClick={() => setShowSetup(!showSetup)}
            aria-expanded={showSetup}
          >
            地図の設定・データ
          </button>
        </div>
      </header>
      <nav className="mode-switch" aria-label="検索モード">
        <button type="button" aria-pressed={mode === 'route'} onClick={() => setMode('route')}>
          路線検索
        </button>
        <button
          type="button"
          aria-pressed={mode === 'journey'}
          onClick={() => {
            setMode('journey');
            setExpanded(true);
          }}
        >
          乗換案内
        </button>
      </nav>
      {showSetup && (
        <aside className="setup-panel" aria-label="地図の設定とデータについて">
          <div>
            <strong>Google マップの設定</strong>
            <p>
              初期設定は線形プレビューです。無料のMaps Demo Keyを用意した後、READMEの手順でGoogle
              マップへの接続を有効にしてください。
            </p>
            <p>
              現在：
              {useGoogleMap
                ? 'Google マップ接続あり（認証状態は地図で確認）'
                : apiKey
                  ? 'キー保存済み・Google マップ接続は無効'
                  : 'キー未設定・線形プレビューで表示'}
            </p>
          </div>
          <div>
            <strong>収録データについて</strong>
            <p>
              国土数値情報の鉄道データを加工して表示しています。運行系統との照合が済んでいない路線、未取得の種別・時刻表があります。現在の運行状況は各社の案内を確認してください。
            </p>
            <a
              href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-2025.html"
              target="_blank"
              rel="noreferrer"
            >
              出典・利用条件を確認 ↗
            </a>
          </div>
          <button type="button" className="text-button" onClick={() => setShowSetup(false)}>
            閉じる
          </button>
        </aside>
      )}
      <div className="workspace" data-mode={mode}>
        <aside className="sidebar">
          <section className="search-section" aria-label="路線検索">
            <div className="eyebrow">EXPLORE THE RAILWAY</div>
            <h1>
              どの路線を
              <br className="desktop-only" />
              見てみますか？
            </h1>
            {catalog.status === 'ready' ? (
              <SearchBox routes={catalog.value.routes} onSelect={choose} />
            ) : catalog.status === 'loading' ? (
              <p role="status">路線一覧を読み込み中…</p>
            ) : (
              <div role="alert">
                <p>{catalog.message}</p>
                <button
                  type="button"
                  onClick={() => {
                    setCatalog({ status: 'loading' });
                    setCatalogAttempt((n) => n + 1);
                  }}
                >
                  一覧を再試行
                </button>
              </div>
            )}
            {choices.length > 0 && (
              <section className="selected-lines" aria-label="表示中の路線">
                <p>
                  {choices.length}路線を選択・{displayRoutes.length}路線を表示 · 検索して追加
                </p>
                {choices.map((line) => (
                  <div key={line.id}>
                    <button
                      type="button"
                      aria-pressed={choice?.id === line.id}
                      onClick={() => choose(line)}
                    >
                      <span
                        className="route-swatch"
                        aria-hidden="true"
                        style={{ backgroundColor: routeColors[line.id] }}
                      />
                      {line.operator} {line.name}
                    </button>
                    <button
                      type="button"
                      aria-label={`${line.operator} ${line.name}を地図から外す`}
                      onClick={() => removeRoute(line.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </section>
            )}
            {!choice && (
              <p className="search-hint">
                山手線、新宿駅、JR東日本など。
                <br />
                路線・駅・鉄道会社から探せます。
              </p>
            )}
          </section>
          <section
            className={`route-panel ${expanded ? 'expanded' : 'collapsed'}`}
            aria-label="選択路線と駅一覧"
          >
            {(choice || mode === 'journey') && (
              <button
                type="button"
                className="mobile-panel-handle"
                onClick={() => setExpanded(!expanded)}
                aria-expanded={expanded}
              >
                {mode === 'journey'
                  ? '乗換案内・路線の詳細'
                  : `${choice?.name} · ${route ? `${stops.size}駅` : '読み込み'}`}
                <span>{expanded ? '⌄' : '⌃'}</span>
              </button>
            )}
            {catalog.status === 'ready' && (
              <JourneyPlanner
                enabled={mode === 'journey'}
                routes={catalog.value.routes}
                filters={serviceFilters}
                selection={journey}
                onSelect={showJourney}
                onNavigate={choose}
              />
            )}
            {choice ? (
              <div className="route-panel-content">
                <div className="route-heading">
                  <div>
                    <div className="eyebrow">SELECTED LINE</div>
                    <h2>{choice.name}</h2>
                    <p>
                      {choice.operator} · {choice.prefectures.join('・') || '都道府県未確認'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-button"
                    aria-label="路線の選択を解除"
                    onClick={() => removeRoute(choice.id)}
                  >
                    ×
                  </button>
                </div>
                {detail.status === 'loading' && (
                  <p className="panel-message" role="status">
                    駅と線路を読み込み中…
                  </p>
                )}
                {detail.status === 'error' && (
                  <div className="panel-message" role="alert">
                    <p>{detail.message}</p>
                    <button
                      type="button"
                      onClick={async () => {
                        setDetail({ status: 'loading' });
                        try {
                          await restoreRoute(choice.id);
                          cache.current.delete(choice.id);
                          setDetailAttempt((n) => n + 1);
                        } catch {
                          setDetail({
                            status: 'error',
                            message:
                              '復元できませんでした。元データを npm run data:build で再生成してください。',
                          });
                        }
                      }}
                    >
                      路線を再試行
                    </button>
                  </div>
                )}
                {route && (
                  <>
                    <p className="section-description">{route.section}</p>
                    {route.storage?.saved && <p className="saved-badge">ローカルDBに保存済み</p>}
                    {throughLinks('middle')}
                    {activeStation && catalog.status === 'ready' && (
                      <StationDetails
                        route={route}
                        station={activeStation}
                        routes={catalog.value.routes}
                        onNavigate={choose}
                        times={times}
                        key={route.id}
                      />
                    )}
                    {route.kind === 'source_railway' && (
                      <p className="data-note">
                        基礎データの路線区分です。案内上の運行系統とは異なる場合があります。
                      </p>
                    )}
                    <div className="service-filter">
                      <div className="filter-title">
                        <h3>列車の種類</h3>
                        <span>種別順</span>
                      </div>
                      <button
                        type="button"
                        className={`filter-chip ${serviceIds.length === 0 ? 'active' : ''}`}
                        aria-pressed={serviceIds.length === 0}
                        onClick={() => {
                          setServiceIds([]);
                          setSelected(null);
                        }}
                      >
                        全駅
                      </button>
                      {sortServices(route.services).map((service) => (
                        <label
                          key={service.id}
                          className={`filter-chip ${serviceIds.includes(service.id) ? 'active' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={serviceIds.includes(service.id)}
                            onChange={() => toggleService(service.id)}
                          />
                          {service.name}
                          {service.rank === null ? '（順位未確認）' : ''}
                        </label>
                      ))}
                      {route.serviceStatus === 'unavailable' && (
                        <p className="muted">この路線の種別・停車パターンは未取得です。</p>
                      )}
                      <p className="timetable-note">
                        駅を選ぶと、乗り換え先と各駅までの所要時間を確認できます。
                      </p>
                      {serviceIds.length > 0 && (
                        <p className="muted">
                          選択した種類の停車駅をまとめています。一部停車・未確認はピンの形と文字で区別します。
                        </p>
                      )}
                    </div>
                    <div className="station-list-heading">
                      <h3>
                        表示する駅 <span>{stops.size}</span>
                      </h3>
                      <span>
                        {route.stationOrder === 'route' ? '路線順' : '駅名順・停車順未確認'}
                      </span>
                    </div>
                    {throughLinks('start')}
                    <ul className="station-list" aria-label="駅一覧">
                      {route.stations
                        .filter((station) => stops.has(station.id))
                        .map((station, index) => (
                          <li key={station.id}>
                            <button
                              type="button"
                              className={selected === station.id ? 'selected' : ''}
                              aria-pressed={selected === station.id}
                              onClick={() => selectStation(station.id)}
                            >
                              <span className="station-number">
                                {route.stationOrder === 'route'
                                  ? String(index + 1).padStart(2, '0')
                                  : '•'}
                              </span>
                              <span className="station-name">
                                {station.name}
                                {serviceIds.length > 0 && (
                                  <small>{stopLabels[stops.get(station.id) ?? 'unknown']}</small>
                                )}
                              </span>
                              <span aria-hidden="true">↗</span>
                            </button>
                          </li>
                        ))}
                    </ul>
                    {throughLinks('end')}
                    {stops.size === 0 && (
                      <p className="panel-message">
                        選択した種類で停車を確認できる駅がありません。
                      </p>
                    )}
                    <footer className="route-sources">
                      <span>鉄道データ基準日：{route.dataDate}</span>
                      {route.sources.map((source) => (
                        <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                          {source.title} ↗
                        </a>
                      ))}
                    </footer>
                  </>
                )}
              </div>
            ) : mode === 'route' ? (
              <div className="empty-selection">
                <span aria-hidden="true">◎</span>
                <p>
                  路線を選ぶと、
                  <br />
                  駅の一覧がここに表示されます。
                </p>
              </div>
            ) : null}
          </section>
          <footer className="sidebar-footer">
            全国の基礎データを収録 · 運行系統の照合を継続中
          </footer>
        </aside>
        <section className="map-area" aria-label="沿線の地図">
          {mode === 'journey' && journey && (
            <div className="journey-map-caption">太線：検索した経路 · 淡い線：路線全体</div>
          )}
          {useGoogleMap ? (
            <GoogleMap
              apiKey={apiKey}
              route={mapData.route}
              visible={mapData.visible}
              selected={mapSelected}
              onSelect={selectMapStation}
              onClear={clearStation}
              arrivals={arrivals}
            />
          ) : (
            <MapPreview
              route={mapData.route}
              visible={mapData.visible}
              selected={mapSelected}
              onSelect={selectMapStation}
              arrivals={arrivals}
            />
          )}
          {!useGoogleMap && (
            <button type="button" className="map-setup-button" onClick={() => setShowSetup(true)}>
              Google マップを設定 ↗
            </button>
          )}
          {activeStation && (
            <div className="station-card" role="status">
              <span className="red-dot" />
              <div>
                <strong>{activeStation.name}</strong>
                <span>
                  {route?.name} · {route?.operator}
                </span>
                <small>
                  {serviceIds.length > 0
                    ? stopLabels[stops.get(activeStation.id) ?? 'unknown']
                    : '路線に含まれる駅'}
                </small>
              </div>
              <button
                type="button"
                className="text-button"
                aria-label="駅の選択を解除"
                onClick={() => setSelected(null)}
              >
                ×
              </button>
            </div>
          )}
          <div className="map-attribution">
            国土数値情報（鉄道・行政区域）（国土交通省）を加工して作成
          </div>
        </section>
      </div>
    </main>
  );
}
