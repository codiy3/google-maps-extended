import { useMemo } from 'react';
import type { RouteDetail, StopState } from './types';

function project([lon, lat]: [number, number]): [number, number] {
  return [(lon * Math.PI) / 180, -Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))];
}

export function MapPreview({
  route,
  visible,
  selected,
  onSelect,
}: {
  route: RouteDetail | null;
  visible: Map<string, StopState>;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const drawing = useMemo(() => {
    if (!route) return null;
    const positions = [
      ...route.stations.map((s) => s.position),
      ...route.geometry.flatMap((g) => g.coordinates),
    ].map(project);
    let xMin = Infinity;
    let yMin = Infinity;
    let xMax = -Infinity;
    let yMax = -Infinity;
    for (const [x, y] of positions) {
      xMin = Math.min(xMin, x);
      xMax = Math.max(xMax, x);
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
    }
    const size = Math.max(xMax - xMin, yMax - yMin, 0.00001);
    const locate = (pos: [number, number]) => {
      const [x, y] = project(pos);
      return [
        50 + (800 * (x - (xMin + xMax) / 2)) / size,
        50 + (800 * (y - (yMin + yMax) / 2)) / size,
      ];
    };
    // 900角の座標に余白を加える。背景地図を模倣せず実際の線形だけを描く。
    const point = (pos: [number, number]) => {
      const [x, y] = locate(pos);
      return [x + 400, y + 400];
    };
    return {
      point,
      paths: route.geometry.map((g) => ({
        id: g.id,
        color: g.color ?? '#218556',
        strokeWeight: g.strokeWeight ?? 4,
        points: g.coordinates.map((p) => point(p).join(',')).join(' '),
      })),
    };
  }, [route]);
  return (
    <div className="map-preview">
      <div className="preview-badge">
        線形プレビュー <span>背景地図なし</span>
      </div>
      {route && drawing ? (
        <div className="preview-square">
          <svg viewBox="0 0 900 900" role="img" aria-label={`${route.name}の線路形状`}>
            <title>{route.name}の線路形状</title>
            {drawing.paths.map((path) => (
              <polyline
                key={path.id}
                points={path.points}
                fill="none"
                stroke={path.color}
                strokeWidth={path.strokeWeight}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
          {route.stations
            .filter((s) => visible.has(s.id))
            .map((station, index) => {
              const [x, y] = drawing.point(station.position);
              return (
                <button
                  type="button"
                  key={station.id}
                  className={`preview-pin ${index % 2 ? 'label-left' : ''} ${selected === station.id ? 'selected' : ''} ${visible.get(station.id)}`}
                  style={{ left: `${x / 9}%`, top: `${y / 9}%` }}
                  title={station.name}
                  aria-label={`${station.name}を選択`}
                  aria-pressed={selected === station.id}
                  onClick={() => onSelect(station.id)}
                >
                  <svg viewBox="0 0 24 32" aria-hidden="true">
                    <path d="M12 32C10 27 1 19 1 12a11 11 0 0 1 22 0c0 7-9 15-11 20Z" />
                    {visible.get(station.id) === 'observed' && (
                      <text x="12" y="17" textAnchor="middle">
                        ?
                      </text>
                    )}
                  </svg>
                  <span className="station-name-label">
                    {station.routeColors?.map((color) => (
                      <i key={color} className="route-dot" style={{ backgroundColor: color }} />
                    ))}
                    {station.name}
                  </span>
                </button>
              );
            })}
        </div>
      ) : (
        <div className="map-welcome">
          <div className="line-symbol" aria-hidden="true">
            ↗
          </div>
          <h2>
            ひとつの路線から、
            <br />
            沿線を見渡す。
          </h2>
          <p>
            路線名を入力して、会社と地域から
            <br />
            お探しの路線を選んでください。
          </p>
          <div className="legend">
            <span>
              <i className="red-dot" />駅
            </span>
            <span>
              <i className="green-line" />
              線路
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
