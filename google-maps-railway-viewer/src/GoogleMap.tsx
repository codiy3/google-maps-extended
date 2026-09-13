import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { useEffect, useRef, useState } from 'react';
import { stopLabels } from './services';
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
}: {
  apiKey: string;
  route: RouteDetail | null;
  visible: Map<string, StopState>;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [error, setError] = useState(false);
  const markers = useRef(new Map<string, google.maps.marker.AdvancedMarkerElement>());
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

  useEffect(() => {
    if (!map || !route) return;
    const lines = route.geometry.map(
      (segment) =>
        new google.maps.Polyline({
          map,
          path: segment.coordinates.map(([lng, lat]) => ({ lng, lat })),
          strokeColor: '#18834b',
          strokeOpacity: 0.95,
          strokeWeight: 5,
          clickable: false,
        }),
    );
    const bounds = new google.maps.LatLngBounds();
    for (const segment of route.geometry)
      for (const [lng, lat] of segment.coordinates) bounds.extend({ lng, lat });
    for (const station of route.stations)
      bounds.extend({ lng: station.position[0], lat: station.position[1] });
    if (!bounds.isEmpty()) map.fitBounds(bounds, 50);
    return () => {
      for (const line of lines) line.setMap(null);
    };
  }, [map, route]);

  useEffect(() => {
    if (!map || !route) return;
    const current = new Map<string, google.maps.marker.AdvancedMarkerElement>();
    const listeners: google.maps.MapsEventListener[] = [];
    for (const station of route.stations) {
      const state = visible.get(station.id);
      if (!state) continue;
      const pin = new google.maps.marker.PinElement({
        background: state === 'conditional' ? '#fff' : '#d63235',
        borderColor: '#b8222b',
        glyphColor: '#fff',
        glyphText: state === 'observed' ? '?' : '',
      });
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lng: station.position[0], lat: station.position[1] },
        title: `${station.name} · ${stopLabels[state]}`,
        collisionBehavior: google.maps.CollisionBehavior.REQUIRED,
      });
      marker.append(pin);
      listeners.push(marker.addListener('click', () => onSelect(station.id)));
      current.set(station.id, marker);
    }
    markers.current = current;
    return () => {
      for (const listener of listeners) listener.remove();
      for (const marker of current.values()) marker.map = null;
      markers.current = new Map();
    };
  }, [map, route, visible, onSelect]);

  useEffect(() => {
    if (!map || !route || !selected) return;
    const station = route.stations.find((s) => s.id === selected);
    if (!station || !visible.has(selected)) return;
    map.panTo({ lng: station.position[0], lat: station.position[1] });
    const content = document.createElement('div');
    content.textContent = `${station.name} · ${route.operator}`;
    const info = new google.maps.InfoWindow({ content });
    info.open({ map, anchor: markers.current.get(selected), shouldFocus: false });
    return () => info.close();
  }, [map, route, selected, visible]);
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
