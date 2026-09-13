"""N02を検索用索引と路線別の表示データに変換する。"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

from pyproj import Transformer
from shapely.geometry import LineString

from .n02 import (
    DATA_DATE,
    SOURCE_PAGE,
    DataError,
    build_inventory,
    coordinates,
    entry_id,
    read_archive,
)
from .operating import add_chuo_services, add_yamanote

JRE = "東日本旅客鉄道"
OPERATOR_NAMES = {
    JRE: "JR東日本",
    "東海旅客鉄道": "JR東海",
    "西日本旅客鉄道": "JR西日本",
    "北海道旅客鉄道": "JR北海道",
    "四国旅客鉄道": "JR四国",
    "九州旅客鉄道": "JR九州",
    "大阪市高速電気軌道": "Osaka Metro",
    "東京地下鉄": "東京メトロ",
}


def representative(points: list[list[float]]) -> tuple[float, float]:
    """駅の線形の中点をピン位置とする。改札や出入口の位置ではない。"""
    point = LineString(points).interpolate(0.5, normalized=True)
    return point.x, point.y


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", "utf-8")


def build_display_data(
    rail: dict[str, Any], station: dict[str, Any], regions: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Any]]:
    inventory = build_inventory(rail, station)
    transformer = Transformer.from_crs(6668, 4326, always_xy=True, allow_ballpark=False)
    rail_groups: dict[str, list[Any]] = defaultdict(list)
    station_groups: dict[str, list[Any]] = defaultdict(list)
    for feature in rail["features"]:
        props = feature["properties"]
        rail_groups[entry_id(props["N02_004"], props["N02_003"])].append(feature)
    for feature in station["features"]:
        station_groups[feature["properties"]["N02_005c"]].append(feature)

    def wgs84(point: tuple[float, float] | list[float]) -> list[float]:
        lon, lat = transformer.transform(point[0], point[1], errcheck=True)
        return [round(lon, 7), round(lat, 7)]

    details = {}
    for record in inventory["routes"]:
        # 属性不整合が疑われるレコードは利用者の候補から除外し、調査台帳に残す。
        if record["warnings"]:
            continue
        route_id = record["source_entry_id"]
        pref = regions.get("routes", {}).get(route_id, {})
        name = record["source_line_name"]
        aliases = []
        if name == "中央線" and record["operator"] in (JRE, "東海旅客鉄道"):
            name = "中央本線"
            aliases = ["中央線"]
        elif name == "4号線(中央線)" and record["operator"] == "大阪市高速電気軌道":
            name = "中央線"
            aliases = ["大阪メトロ中央線", "4号線(中央線)"]
        stations = []
        for code, info in record["stations"].items():
            # 複数ホームの線形から最長を選ぶ。同名の別駅は統合しない。
            longest = max(station_groups[code], key=lambda f: LineString(coordinates(f)).length)
            stations.append(
                {
                    "id": f"n02-25-station-{code}",
                    "name": info["name"],
                    "position": wgs84(representative(coordinates(longest))),
                    "sourceCodes": [code],
                }
            )
        geometry = [
            {"id": f"{route_id}-{i}", "coordinates": [wgs84(p) for p in coordinates(f)]}
            for i, f in enumerate(rail_groups[route_id])
        ]
        route = {
            "id": route_id,
            "name": name,
            "operator": OPERATOR_NAMES.get(record["operator"], record["operator"]),
            "officialOperator": record["operator"],
            "prefectures": pref.get("prefectures", []),
            "regionStatus": pref.get("status", "unavailable"),
            "aliases": aliases,
            "kind": "source_railway",
            "section": "国土数値情報の路線区分（運行系統は未照合）",
            "stationOrder": "name",
            "stationCount": len(stations),
            "dataDate": DATA_DATE,
            "sources": [
                {"title": "国土数値情報 鉄道データ", "url": SOURCE_PAGE},
                {
                    "title": "国土数値情報 行政区域データ",
                    "url": "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2026.html",
                },
            ],
            "services": [],
            "serviceStatus": "unavailable",
            "stations": sorted(stations, key=lambda s: s["name"]),
            "geometry": geometry,
        }
        details[route_id] = route
    station_lines = {
        code: [[wgs84(p) for p in coordinates(feature)] for feature in group]
        for code, group in station_groups.items()
    }
    add_yamanote(details, station_lines)
    add_chuo_services(details, station_lines)
    catalog = {
        "schemaVersion": 1,
        "dataDate": DATA_DATE,
        "releaseReady": False,
        "notice": "国土数値情報（鉄道データ）（国土交通省）を加工して作成",
        "routes": [
            {k: v for k, v in route.items() if k not in ("stations", "geometry")}
            for route in details.values()
        ],
    }
    return catalog, details


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--regions", type=Path, default=Path("data/catalog/route-prefectures.json"))
    parser.add_argument("--output", type=Path, default=Path("public/data"))
    args = parser.parse_args()
    try:
        rail, station = read_archive(args.archive)
        regions = json.loads(args.regions.read_text("utf-8")) if args.regions.exists() else {}
        catalog, details = build_display_data(rail, station, regions)
        for route_id, detail in details.items():
            write_json(args.output / "routes" / f"{route_id}.json", detail)
        write_json(args.output / "catalog.json", catalog)
    except (OSError, DataError) as exc:
        print(f"表示データを生成できません: {exc}", file=sys.stderr)
        return 1
    print(f"表示データ: {len(details)}候補。全国の運行系統・時刻表の照合は未完了です。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
