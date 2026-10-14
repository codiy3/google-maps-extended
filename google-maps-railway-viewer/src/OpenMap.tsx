import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import type { RouteDetail, Station, StopState } from './types';

export function mapInsets(box: DOMRect, search?: DOMRect, card?: DOMRect) {
  const overlaps = (item?: DOMRect) =>
    item &&
    item.right > box.left &&
    item.left < box.right &&
    item.bottom > box.top &&
    item.top < box.bottom;
  return {
    top: overlaps(search) && search ? Math.max(20, search.bottom - box.top + 12) : 20,
    bottom: overlaps(card) && card ? Math.max(35, box.bottom - card.top + 12) : 35,
  };
}

function insets(element: HTMLElement | null) {
  const box = element?.getBoundingClientRect();
  return box
    ? mapInsets(
        box,
        document.querySelector('.search-section')?.getBoundingClientRect(),
        document.querySelector('.station-card')?.getBoundingClientRect(),
      )
    : { top: 20, bottom: 35 };
}

export function stationLabel(station: Station, arrival?: string): HTMLElement {
  const label = document.createElement('span');
  label.className = 'osm-station-label';
  const title = document.createElement('strong');
  for (const color of station.routeColors ?? []) {
    const dot = document.createElement('i');
    dot.className = 'route-dot';
    dot.style.backgroundColor = color;
    title.append(dot);
  }
  title.append(document.createTextNode(station.name));
  label.append(title);
  if (arrival) {
    const time = document.createElement('small');
    time.textContent = arrival;
    label.append(time);
  }
  return label;
}

export function OpenMap({
  route,
  visible,
  selected,
  onSelect,
  onClear,
  arrivals,
}: {
  route: RouteDetail | null;
  visible: Map<string, StopState>;
  selected: string | null;
  onSelect: (id: string) => void;
  onClear: () => void;
  arrivals?: ReadonlyMap<string, string>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const [tileError, setTileError] = useState(false);
  const markers = useRef(new Map<string, L.Marker>());
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, { zoomControl: false }).setView([36.2, 138.25], 5);
    L.control.zoom({ position: 'topright' }).addTo(instance);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(instance);
    tiles.on('tileerror', () => setTileError(true));
    tiles.on('tileload', () => setTileError(false));
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(container.current);
    setMap(instance);
    return () => {
      observer.disconnect();
      instance.remove();
    };
  }, []);

  const geometry = route?.geometry;
  useEffect(() => {
    if (!map) return;
    const layer = L.layerGroup().addTo(map);
    if (!geometry?.length) {
      map.setView([36.2, 138.25], 5);
      return () => {
        layer.remove();
      };
    }
    for (const segment of geometry) {
      L.polyline(
        segment.coordinates.map(([lon, lat]) => [lat, lon] as L.LatLngTuple),
        {
          color: segment.color ?? '#18834b',
          opacity: segment.opacity ?? 0.95,
          weight: segment.strokeWeight ?? 5,
          interactive: false,
        },
      ).addTo(layer);
    }
    const focus = geometry.filter((g) => !g.context);
    const bounds = L.latLngBounds(
      (focus.length ? focus : geometry).flatMap((g) =>
        g.coordinates.map(([lon, lat]) => [lat, lon] as L.LatLngTuple),
      ),
    );
    const fitRoute = (initial = false) => {
      if (!bounds.isValid() || (!initial && selectedRef.current)) return;
      const { top, bottom } = insets(container.current);
      map.fitBounds(bounds, {
        paddingTopLeft: [65, top + 25],
        paddingBottomRight: [65, bottom + 15],
        maxZoom: 15,
        animate: false,
      });
    };
    fitRoute(true);
    const observer = new ResizeObserver(() => fitRoute());
    if (container.current) observer.observe(container.current);
    const search = document.querySelector('.search-section');
    if (search) observer.observe(search);
    return () => {
      observer.disconnect();
      layer.remove();
    };
  }, [map, geometry]);

  useEffect(() => {
    if (!map || !route) return;
    const layer = L.layerGroup().addTo(map);
    const current = new Map<string, L.Marker>();
    for (const station of route.stations) {
      const state = visible.get(station.id);
      if (!state) continue;
      const pin = document.createElement('span');
      pin.className = `osm-pin ${state}`;
      pin.textContent = state === 'observed' ? '?' : '';
      const marker = L.marker([station.position[1], station.position[0]], {
        icon: L.divIcon({
          html: pin,
          className: 'osm-marker',
          iconSize: [18, 24],
          iconAnchor: [9, 24],
        }),
        title: `${station.name}を選択`,
        alt: station.name,
        keyboard: true,
      }).addTo(layer);
      marker.on('click', () => onSelect(station.id));
      marker.bindTooltip(stationLabel(station), {
        permanent: true,
        direction: 'right',
        offset: [8, -15],
        className: 'osm-tooltip',
      });
      current.set(station.id, marker);
    }
    markers.current = current;
    return () => {
      layer.remove();
      markers.current = new Map();
    };
  }, [map, route, visible, onSelect]);

  useEffect(() => {
    if (!route) return;
    for (const station of route.stations)
      if (visible.has(station.id))
        markers.current
          .get(station.id)
          ?.setTooltipContent(stationLabel(station, arrivals?.get(station.id)));
  }, [route, visible, arrivals]);

  useEffect(() => {
    if (!map || !route || !selected) return;
    const station = route.stations.find((s) => s.id === selected);
    if (!station || !visible.has(selected)) return;
    const content = document.createElement('div');
    const heading = document.createElement('h3');
    heading.className = 'station-info-heading';
    heading.textContent = `${station.name}駅`;
    content.append(heading);
    const body = document.createElement('p');
    body.textContent = (station.routeNames ?? [route.name]).join('・');
    content.append(body);
    const { top, bottom } = insets(container.current);
    const popup = L.popup({
      autoPanPaddingTopLeft: [20, top],
      autoPanPaddingBottomRight: [20, bottom],
      maxWidth: 280,
    })
      .setLatLng([station.position[1], station.position[0]])
      .setContent(content)
      .openOn(map);
    const close = () => onClear();
    popup.on('remove', close);
    let frame = 0;
    const reveal = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!map.hasLayer(popup)) return;
        const next = insets(container.current);
        popup.options.autoPanPaddingTopLeft = L.point(20, next.top);
        popup.options.autoPanPaddingBottomRight = L.point(20, next.bottom);
        popup.update();
      });
    };
    const observer = new ResizeObserver(reveal);
    if (container.current) observer.observe(container.current);
    for (const selector of ['.search-section', '.station-card']) {
      const overlay = document.querySelector(selector);
      if (overlay) observer.observe(overlay);
    }
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      popup.off('remove', close);
      popup.remove();
    };
  }, [map, route, visible, selected, onClear]);

  return (
    <>
      <section ref={container} className="osm-map" aria-label="OpenStreetMapの地図" />
      {tileError && (
        <p className="osm-tile-error" role="status">
          背景地図を読み込めない部分があります。駅と線路の表示は利用できます。
        </p>
      )}
    </>
  );
}
