"""保存可能な表示データを、サーバー不要の公開デモ用に書き出す。"""

from __future__ import annotations

import argparse
import json
import math
import sys
import tempfile
from pathlib import Path
from typing import Any

from .export import write_json
from .journey import JourneyService
from .n02 import DataError
from .store import Store


def validate_network(network: dict[str, Any], catalog: dict[str, Any]) -> None:
    """公開前に辺・駅・カタログの参照を確認する。接続を推測して補わない。"""
    routes = {route["id"]: route for route in catalog["routes"]}
    count = network.get("nodeCount")
    if (
        network.get("schemaVersion") != 1
        or not isinstance(count, int)
        or isinstance(count, bool)
        or count < 1
    ):
        raise DataError("経路データの版または頂点数が不正です。")

    def node(value: Any) -> bool:
        return isinstance(value, int) and not isinstance(value, bool) and 0 <= value < count

    groups = network.get("groups", {})
    if not groups or any(not node(value) for value in groups.values()):
        raise DataError("駅グループの頂点が不正です。")
    for edge in network.get("edges", []):
        if not node(edge["a"]) or not node(edge["b"]):
            raise DataError("線形が存在しない頂点を参照しています。")
        length = edge["meters"]
        if (
            not isinstance(length, (float, int))
            or isinstance(length, bool)
            or not math.isfinite(length)
            or length < 0
        ):
            raise DataError("線形の距離が不正です。")
        if edge["routeId"] is not None and edge["routeId"] not in routes:
            raise DataError("線形がカタログにない路線を参照しています。")
        if edge["kind"] not in ("rail", "access", "group"):
            raise DataError("線形の接続種別が不正です。")
    for key, station in network.get("stationNodes", {}).items():
        if (
            not key.isdecimal()
            or not node(int(key))
            or station["routeId"] not in routes
            or station["groupId"] not in groups
        ):
            raise DataError("経路上の駅の参照が不正です。")
    station_ids = {station["id"] for station in network.get("stations", [])}
    if station_ids != set(groups):
        raise DataError("駅候補と経路用グループが一致しません。")


def export_static(directory: Path, archive: Path) -> dict[str, int]:
    """ローカルDBを公開せず、一時DBから検証済みの接続情報だけを生成する。"""
    if not archive.is_file():
        # 原典の駅ホーム線形を省くと、有効な接続が途切れることがある。
        raise DataError("駅ホーム線形を含むN02原典がありません。先にデータを取得してください。")
    with tempfile.TemporaryDirectory(prefix="railway-static-") as temporary:
        store = Store(Path(temporary) / "railway.sqlite3")
        store.import_base(directory)
        catalog = store.catalog()
        revision = catalog.get("dataRevision")
        if not isinstance(revision, str) or not revision:
            raise DataError("表示データの更新版がありません。先にdata:buildを実行してください。")
        journeys = JourneyService(store, archive)
        journeys.prepare(with_network=True)
        network = journeys.network
        if network is None or journeys.revision != revision:
            raise DataError("表示データと経路データの更新版が一致しません。")
        validate_network(network, catalog)
        stations = {
            "schemaVersion": 1,
            "dataRevision": revision,
            "stations": network["stations"],
        }
        # 駅候補は別ファイルで必要時に読み、探索用ファイルでは二重に配布しない。
        snapshot = {
            "schemaVersion": 1,
            "dataRevision": revision,
            "network": {key: value for key, value in network.items() if key != "stations"},
        }
        # この生成ディレクトリのJSONだけを整理し、旧版の未参照路線を公開しない。
        route_ids = {route["id"] for route in catalog["routes"]}
        for path in (directory / "routes").glob("*.json"):
            if path.stem not in route_ids and path.is_file():
                path.unlink()
        write_json(directory / "stations.json", stations)
        write_json(directory / "journey-network.json", snapshot)
    return {
        "stations": len(stations["stations"]),
        "edges": len(network["edges"]),
        "excluded": len(network["excluded"]),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=Path("public/data"))
    parser.add_argument("--archive", type=Path, required=True)
    args = parser.parse_args()
    try:
        counts = export_static(args.directory, args.archive)
    except (OSError, DataError, ValueError, KeyError, TypeError) as exc:
        print(f"公開用データを生成できません: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(counts, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
