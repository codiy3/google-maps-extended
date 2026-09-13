"""ローカル経路検索の準備とキャッシュ。利用者の検索内容は保存しない。"""

from __future__ import annotations

import threading
from datetime import datetime
from pathlib import Path
from typing import Any

from pyproj import Transformer

from .journey_network import build_network, shortest_distance, station_index
from .journey_time import earliest_arrival
from .n02 import DataError, coordinates, read_archive
from .store import Store


def station_shapes(archive: Path) -> dict[str, Any]:
    if not archive.exists():
        return {}
    _, stations = read_archive(archive)
    transformer = Transformer.from_crs(6668, 4326, always_xy=True, allow_ballpark=False)
    result: dict[str, Any] = {}
    for feature in stations["features"]:
        code = feature["properties"]["N02_005c"]
        points = [
            [round(c, 7) for c in transformer.transform(point[0], point[1], errcheck=True)]
            for point in coordinates(feature)
        ]
        result.setdefault(code, []).append(points)
    return result


class JourneyService:
    def __init__(self, store: Store, archive: Path):
        self.store = store
        self.archive = archive
        self.lock = threading.Lock()
        self.revision: str | None = None
        self.routes: dict[str, Any] = {}
        self.stations: list[dict[str, Any]] = []
        self.network: dict[str, Any] | None = None

    def prepare(self, with_network: bool = False) -> None:
        with self.lock:
            revision = self.store.catalog().get("dataRevision", "unknown")
            if self.revision != revision:
                records = self.store.routes()
                self.routes = {r["id"]: r for r in records}
                self.stations = station_index(records)
                self.revision = revision
                self.network = None
            if not with_network or self.network is not None:
                return
            cached = self.store.cache("journey-network-v1")
            if (
                cached
                and cached.get("revision") == revision
                and cached.get("network", {}).get("schemaVersion") == 1
            ):
                self.network = cached["network"]
                return
            network = build_network(list(self.routes.values()), station_shapes(self.archive))
            self.store.save_cache("journey-network-v1", {"revision": revision, "network": network})
            self.network = network

    def station_catalog(self) -> dict[str, Any]:
        self.prepare()
        return {"stations": self.stations}

    def search(self, query: dict[str, Any]) -> dict[str, Any]:
        stops = query.get("stops")
        filters = query.get("services", {})
        if (
            not isinstance(stops, list)
            or len(stops) < 2
            or not all(isinstance(s, str) for s in stops)
        ):
            raise DataError("出発駅・到着駅・経由駅を候補から選択してください。")
        if not isinstance(filters, dict) or not all(
            isinstance(k, str) and isinstance(v, list) and all(isinstance(s, str) for s in v)
            for k, v in filters.items()
        ):
            raise DataError("種別の指定を確認してください。")
        start = datetime.fromisoformat(query.get("start", ""))
        transfer = query.get("transferMinutes", 5)
        if (
            start.tzinfo is None
            or isinstance(transfer, bool)
            or not isinstance(transfer, int)
            or not 0 <= transfer <= 180
        ):
            raise DataError("出発日時には時差、乗換余裕時間には0〜180分の整数が必要です。")
        self.prepare(with_network=True)
        if self.network is None:
            raise DataError("経路用データを準備できませんでした。")
        return {
            "distance": shortest_distance(self.network, stops, filters, self.routes),
            "time": earliest_arrival(
                self.network,
                self.routes,
                self.store.timetables(),
                stops,
                start,
                filters,
                transfer,
            ),
            "dataRevision": self.revision,
        }
