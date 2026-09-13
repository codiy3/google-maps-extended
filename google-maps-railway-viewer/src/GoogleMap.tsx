import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { useEffect, useRef, useState } from 'react';
import type { RouteDetail, StopState } from './types';

let loading: Promise<void> | undefined;
function loadMaps(key: string) {
  if (!loading) {
    setOptions({ key, v: 'quarterly', language: 'ja', region: 'JP' });
    loading = Promise.all([importLibrary('maps'), importLibrary('marker')]).then(() => {});
  }
  return loading;
}

export function GoogleMap({
  apiKey,
  route,
  visible,
  selected,
  onSelect,
  onClear,
  arrivals,
}: {
  apiKey: string;
  route: RouteDetail | null;
  visible: Map<string, StopState>;
  selected: string | null;
  onSelect: (id: string) => void;
  onClear?: () => void;
  arrivals?: ReadonlyMap<string, string>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [error, setError] = useState(false);
  const markers = useRef(new Map<string, google.maps.marker.AdvancedMarkerElement>());
  const arrivalElements = useRef(new Map<string, HTMLElement>());
  useEffect(() => {
    let disposed = false;
    const timer = window.setTimeout(() => {
      if (!disposed) setError(true);
    }, 20000);
    const failed = () => {
      if (!disposed) setError(true);
    };
    const target = window as Window & { gm_authFailure?: () => void };
    const previous = target.gm_authFailure;
    target.gm_authFailure = failed;
    loadMaps(apiKey)
      .then(() => {
        if (disposed || !container.current) return;
        clearTimeout(timer);
        setError(false);
        setMap(
          new google.maps.Map(container.current, {
            center: { lat: 36.2, lng: 138.25 },
            zoom: 5,
            mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID',
            streetViewControl: false,
            fullscreenControl: false,
            mapTypeControl: false,
            gestureHandling: 'greedy',
          }),
        );
      })
      .catch(failed);
    return () => {
      disposed = true;
      clearTimeout(timer);
      if (target.gm_authFailure === failed) target.gm_authFailure = previous;
    };
  }, [apiKey]);

  const geometry = route?.geometry;
  useEffect(() => {
    if (!map) return;
    if (!geometry?.length) {
      map.setCenter({ lat: 36.2, lng: 138.25 });
      map.setZoom(5);
      return;
    }
    const lines = geometry.map(
      (segment) =>
        new google.maps.Polyline({
          map,
          path: segment.coordinates.map(([lng, lat]) => ({ lng, lat })),
          strokeColor: segment.color ?? '#18834b',
          strokeOpacity: segment.opacity ?? 0.95,
          strokeWeight: segment.strokeWeight ?? 5,
          zIndex: segment.zIndex,
          clickable: false,
        }),
    );
    const bounds = new google.maps.LatLngBounds();
    const focus = geometry.filter((g) => !g.context);
    for (const segment of focus.length ? focus : geometry)
      for (const [lng, lat] of segment.coordinates) bounds.extend({ lng, lat });
    const fitRoute = () => {
      const element = container.current;
      if (!element || bounds.isEmpty()) return;
      const search = document.querySelector('.search-section')?.getBoundingClientRect();
      const mapBox = element.getBoundingClientRect();
      const top =
        window.innerWidth <= 800 && search ? Math.max(25, search.bottom - mapBox.top + 15) : 40;
      map.fitBounds(bounds, { top, right: 70, bottom: 35, left: 70 });
    };
    fitRoute();
    const observer = new ResizeObserver(fitRoute);
    if (container.current) observer.observe(container.current);
    return () => {
      observer.disconnect();
      for (const line of lines) line.setMap(null);
    };
  }, [map, geometry]);

  useEffect(() => {
    if (!map || !route) return;
    const current = new Map<string, google.maps.marker.AdvancedMarkerElement>();
    const listeners: google.maps.MapsEventListener[] = [];
    for (const station of route.stations) {
      const state = visible.get(station.id);
      if (!state) continue;
      const pin = new google.maps.marker.PinElement({
        scale: 0.65,
        background: state === 'conditional' ? '#fff' : '#d63235',
        borderColor: '#b8222b',
        glyphColor: '#fff',
        glyphText: state === 'observed' ? '?' : '',
      });
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lng: station.position[0], lat: station.position[1] },
        title: `${station.name} · ${station.routeNames?.join('・') ?? route.name}`,
        collisionBehavior: google.maps.CollisionBehavior.REQUIRED,
      });
      const content = document.createElement('div');
      content.className = `station-marker ${current.size % 2 ? 'label-left' : ''}`;
      const label = document.createElement('span');
      label.className = 'station-name-label';
      const title = document.createElement('span');
      title.className = 'station-label-title';
      for (const color of station.routeColors ?? []) {
        const swatch = document.createElement('i');
        swatch.className = 'route-dot';
        swatch.style.backgroundColor = color;
        title.append(swatch);
      }
      title.append(document.createTextNode(station.name));
      const arrival = document.createElement('small');
      arrival.className = 'station-arrival-label';
      arrival.hidden = true;
      arrivalElements.current.set(station.id, arrival);
      label.append(title, arrival);
      content.append(pin, label);
      marker.append(content);
      listeners.push(marker.addListener('click', () => onSelect(station.id)));
      current.set(station.id, marker);
    }
    markers.current = current;
    return () => {
      for (const listener of listeners) listener.remove();
      for (const marker of current.values()) marker.map = null;
      markers.current = new Map();
      arrivalElements.current.clear();
    };
  }, [map, route, visible, onSelect]);

  // ピンを作り直さずラベルだけ更新し、地図の位置と吹き出しを維持する。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 地図とピンの再生成後もラベルを反映する。
  useEffect(() => {
    for (const [id, element] of arrivalElements.current) {
      element.textContent = arrivals?.get(id) ?? '';
      element.hidden = !element.textContent;
    }
  }, [arrivals, map, route, visible, onSelect]);

  useEffect(() => {
    if (!map || !route || !selected) return;
    const station = route.stations.find((s) => s.id === selected);
    if (!station || !visible.has(selected)) return;
    map.panTo({ lng: station.position[0], lat: station.position[1] });
    const content = document.createElement('div');
    content.className = 'station-info-body';
    content.textContent = station.routeNames?.join(' / ') ?? route.operator;
    const header = document.createElement('h3');
    header.className = 'station-info-heading';
    header.textContent = `${station.name}${station.name.endsWith('駅') ? '' : '駅'}`;
    const note = document.createElement('p');
    note.textContent = '出発駅 · 各駅の到着時刻を地図に表示';
    content.append(note);
    const info = new google.maps.InfoWindow({
      content,
      headerContent: header,
      ariaLabel: header.textContent,
      maxWidth: 300,
    });
    const listener = info.addListener('close', () => onClear?.());
    info.open({ map, anchor: markers.current.get(selected), shouldFocus: false });
    return () => {
      listener.remove();
      info.close();
    };
  }, [map, route, selected, visible, onClear]);
  return (
    <>
      <section ref={container} className="google-map" aria-label="Google マップ" />
      {!map && !error && (
        <div className="map-message" role="status">
          Google マップを読み込み中…
        </div>
      )}
      {error && (
        <div className="map-message" role="alert">
          <strong>Google マップを読み込めませんでした</strong>
          <p>
            接続、キーの種類・利用上限、APIの有効化とリファラー制限を確認してください。Demo
            Keyの日次上限に達した場合は翌日まで待ちます。設定手順はREADMEに記載しています。
          </p>
          <button type="button" onClick={() => window.location.reload()}>
            再読み込み
          </button>
        </div>
      )}
    </>
  );
}
