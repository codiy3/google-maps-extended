import { useEffect, useState } from 'react';
import { fetchDurations } from './data';
import type { DurationResult, RouteDetail, RouteSummary, Station } from './types';

function initialTime() {
  const now = new Date();
  return new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 16);
}
const labels: Record<string, string> = {
  origin: '出発駅',
  unavailable: '時刻表未取得',
  insufficient: '時刻が不足',
  not_observed: '取得済みの便では未確認',
  out_of_period: '対象期間外',
};
export function StationDetails({
  route,
  station,
  routes,
  onNavigate,
  serviceIds,
}: {
  route: RouteDetail;
  station: Station;
  routes: RouteSummary[];
  onNavigate: (route: RouteSummary, stationId?: string) => void;
  serviceIds: string[];
}) {
  const [start, setStart] = useState(initialTime);
  const [result, setResult] = useState<DurationResult | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setResult(null);
    setError('');
    if (!start || Number.isNaN(Date.parse(`${start}:00+09:00`))) {
      setError('出発日時を入力してください。');
      return;
    }
    fetchDurations(route.id, station.id, `${start}:00+09:00`, serviceIds, controller.signal)
      .then((value) => {
        if (current) setResult(value);
      })
      .catch(() => {
        if (current) setError('所要時間を読み込めませんでした。');
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [route.id, station.id, start, serviceIds]);
  const connections = (station.connections ?? []).flatMap((connection) => {
    const target = routes.find((r) => r.id === connection.routeId);
    return target ? [{ connection, target }] : [];
  });
  return (
    <section className="station-details" aria-label={`${station.name}の駅詳細`}>
      <div className="eyebrow">STATION</div>
      <h3>{station.name}</h3>
      <h4>乗り換え・直通できる路線</h4>
      {connections.length ? (
        <ul className="connection-list">
          {connections.map(({ connection, target }) => (
            <li key={target.id}>
              <button type="button" onClick={() => onNavigate(target, connection.stationId)}>
                <span>
                  {target.name}
                  <small>
                    {target.operator} · {target.prefectures.join('・')}
                  </small>
                </span>
                <span className="connection-kind">
                  {connection.kind === 'through' ? '直通あり' : '乗り換え'} ↗
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">接続路線は収録データで確認できていません。</p>
      )}
      <p className="muted">
        直通は列車・行先によります。同一駅グループの案内には改札外の移動を含む場合があります。
      </p>
      <h4>{station.name}から各駅への所要時間</h4>
      <label className="time-field">
        出発日時（日本時間）
        <input
          type="datetime-local"
          value={start}
          onChange={(event) => setStart(event.target.value)}
        />
      </label>
      <p className="muted">
        指定時刻から2時間に出発する、選択路線・選択種別の乗換なしの便を比較します。待ち時間は含みません。
      </p>
      {error ? (
        <p role="alert">{error}</p>
      ) : !result ? (
        <p role="status">所要時間を確認中…</p>
      ) : (
        <>
          {result.status === 'unavailable' && (
            <p className="data-note">
              この路線の時刻表は未取得です。距離から所要時間を推定していません。
            </p>
          )}
          {result.note && <p className="muted">{result.note}</p>}
          <ul className="duration-list" aria-label="各駅までの所要時間">
            {route.stations.map((target) => {
              const row = result.rows.find((r) => r.stationId === target.id);
              return (
                <li key={target.id}>
                  <span>{target.name}</span>
                  <span>
                    {row?.status === 'available' ? (
                      <>
                        <strong>{row.minutes}分</strong>
                        <small>
                          {row.departure?.slice(11, 16)}発 → {row.arrival?.slice(11, 16)}着
                          {row.incomplete ? '・未確認便あり' : ''}
                        </small>
                      </>
                    ) : (
                      labels[row?.status ?? 'unavailable']
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {result.sourceUrl && (
            <a href={result.sourceUrl} target="_blank" rel="noreferrer">
              時刻表の出典 ↗
            </a>
          )}
        </>
      )}
    </section>
  );
}
