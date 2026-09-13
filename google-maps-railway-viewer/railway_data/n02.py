"""N02の元データを変更せず、会社・路線ごとの収録状況を調べる。"""

from __future__ import annotations

import csv
import hashlib
import json
import math
from pathlib import Path
from typing import Any
from zipfile import BadZipFile, ZipFile

SOURCE_PAGE = "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-2025.html"
ARCHIVE_URL = "https://nlftp.mlit.go.jp/ksj/gml/data/N02/N02-25/N02-25_GML.zip"
ARCHIVE_SHA256 = "aaf76af133b2e771e538fabc4646d2e443dc1d5a67b221382a28d744e706cc9f"
SOURCE_CRS = "urn:ogc:def:crs:EPSG::6668"
DATA_DATE = "2025-12-31"
MEMBERS = {
    "rail": "N02-25_GML/UTF-8/N02-25_RailroadSection.geojson",
    "station": "N02-25_GML/UTF-8/N02-25_Station.geojson",
}
MAX_MEMBER_BYTES = 40_000_000


class DataError(ValueError):
    """元データの版・形・値が期待する仕様と異なる。"""


def archive_digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def read_archive(path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    """調査済みの版だけを読む。ZIP内のファイルをディスクへ展開しない。"""
    if archive_digest(path) != ARCHIVE_SHA256:
        raise DataError("N02-25のSHA-256が一致しません。配布元の更新・取得失敗を確認してください。")
    try:
        with ZipFile(path) as archive:
            documents = []
            for member in MEMBERS.values():
                if archive.getinfo(member).file_size > MAX_MEMBER_BYTES:
                    raise DataError("GeoJSONの容量が想定を超えています。")
                documents.append(json.loads(archive.read(member).decode("utf-8-sig")))
    except (BadZipFile, KeyError, UnicodeError, json.JSONDecodeError) as exc:
        raise DataError(f"N02のZIPまたはGeoJSONを読み込めません: {exc}") from exc
    return documents[0], documents[1]


def text_field(properties: dict[str, Any], name: str) -> str:
    value = properties.get(name)
    if not isinstance(value, str) or not value.strip():
        raise DataError(f"{name}は空でない文字列が必要です。")
    return value


def features(document: dict[str, Any], label: str) -> list[dict[str, Any]]:
    if not isinstance(document, dict) or document.get("type") != "FeatureCollection":
        raise DataError(f"{label}: FeatureCollectionではありません。")
    if document.get("crs", {}).get("properties", {}).get("name") != SOURCE_CRS:
        raise DataError(f"{label}: 対応していない座標系です。")
    rows = document.get("features")
    if not isinstance(rows, list) or not rows:
        raise DataError(f"{label}: 地物が空、または配列ではありません。")
    return rows


def coordinates(feature: dict[str, Any]) -> list[list[float]]:
    geometry = feature.get("geometry")
    if not isinstance(geometry, dict) or geometry.get("type") != "LineString":
        raise DataError("線路・駅の地物にはLineStringが必要です。")
    points = geometry.get("coordinates")
    if not isinstance(points, list) or len(points) < 2:
        raise DataError("LineStringには2点以上が必要です。")
    for point in points:
        if not isinstance(point, list) or len(point) != 2:
            raise DataError("座標は経度・緯度の2要素が必要です。")
        if any(
            isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v)
            for v in point
        ):
            raise DataError("座標に有限の数値以外が含まれています。")
        if not -180 <= point[0] <= 180 or not -90 <= point[1] <= 90:
            raise DataError("経度・緯度が範囲外です。")
    return points


def entry_id(operator: str, line: str) -> str:
    # 元データ内の照合用。名称変更をまたぐアプリの恒久IDとしては使わない。
    key = json.dumps([operator, line], ensure_ascii=False, separators=(",", ":"))
    return "n02-25-" + hashlib.sha256(key.encode()).hexdigest()[:16]


def build_inventory(rail: dict[str, Any], station: dict[str, Any]) -> dict[str, Any]:
    routes: dict[tuple[str, str], dict[str, Any]] = {}
    station_identity: dict[str, tuple[str, str, str, str]] = {}
    counts = {"rail_features": 0, "station_features": 0}
    for kind, document in (("rail", rail), ("station", station)):
        for index, feature in enumerate(features(document, kind)):
            try:
                if not isinstance(feature, dict) or feature.get("type") != "Feature":
                    raise DataError("Featureではありません。")
                properties = feature.get("properties")
                if not isinstance(properties, dict):
                    raise DataError("属性がありません。")
                operator = text_field(properties, "N02_004")
                line = text_field(properties, "N02_003")
                key = (operator, line)
                points = coordinates(feature)
                route = routes.setdefault(
                    key,
                    {
                        "source_entry_id": entry_id(*key),
                        "operator": operator,
                        "source_line_name": line,
                        "rail_features": 0,
                        "station_features": 0,
                        "stations": {},
                        "railway_types": set(),
                        "operator_types": set(),
                        "bounds": [180.0, 90.0, -180.0, -90.0],
                        "warnings": [],
                    },
                )
                route["railway_types"].add(text_field(properties, "N02_001"))
                route["operator_types"].add(text_field(properties, "N02_002"))
                for lon, lat in points:
                    bounds = route["bounds"]
                    bounds[:] = [
                        min(bounds[0], lon),
                        min(bounds[1], lat),
                        max(bounds[2], lon),
                        max(bounds[3], lat),
                    ]
                route[f"{kind}_features"] += 1
                counts[f"{kind}_features"] += 1
                if kind == "station":
                    code = text_field(properties, "N02_005c")
                    group = text_field(properties, "N02_005g")
                    name = text_field(properties, "N02_005")
                    identity = (operator, line, name, group)
                    if code in station_identity and station_identity[code] != identity:
                        raise DataError(
                            f"駅コード{code}に異なる会社・路線・駅名・グループが混在しています。"
                        )
                    station_identity[code] = identity
                    route["stations"][code] = {"name": name, "group": group}
            except DataError as exc:
                raise DataError(f"{kind}[{index}]: {exc}") from exc

    records = []
    for key, route in sorted(routes.items()):
        if not route["rail_features"]:
            route["warnings"].append("missing_rail_geometry")
        if not route["station_features"]:
            route["warnings"].append("missing_station_records")
            reverse = routes.get((key[1], key[0]))
            if reverse and reverse["station_features"]:
                route["warnings"].append("possible_swapped_operator_and_line")
        records.append(
            {
                **route,
                "stations": dict(sorted(route["stations"].items())),
                "railway_types": sorted(route["railway_types"]),
                "operator_types": sorted(route["operator_types"]),
                "source_station_count": len(route["stations"]),
                "prefectures": "not_in_source",
                "operating_service_mapping": "not_reviewed",
                "train_types": "not_in_source",
                "stop_patterns": "not_in_source",
                "timetable": "not_in_source",
            }
        )
    summary = {
        "source": {
            "page": SOURCE_PAGE,
            "archive_url": ARCHIVE_URL,
            "sha256": ARCHIVE_SHA256,
            "data_date": DATA_DATE,
            "source_crs": SOURCE_CRS,
            "license": "CC-BY-4.0",
            "notice": "国土数値情報（鉄道データ）（国土交通省）を集計・加工して作成",
        },
        "counts": {
            **counts,
            "source_operator_names": len({r[0] for r in routes}),
            "source_operator_line_pairs": len(routes),
            "source_station_codes": len(station_identity),
            "source_station_groups": len({v[3] for v in station_identity.values()}),
            "extra_station_features": counts["station_features"] - len(station_identity),
        },
        "routes_with_warnings": [
            {
                "source_entry_id": r["source_entry_id"],
                "operator": r["operator"],
                "source_line_name": r["source_line_name"],
                "warnings": r["warnings"],
            }
            for r in records
            if r["warnings"]
        ],
        "release_ready": False,
        "limitations": [
            "名称は元データの表記で、利用者向け運行系統との照合は未完了。",
            "駅コード・駅グループの数は実在する駅の総数ではない。",
            "都道府県、列車種別、停車パターン、時刻表はN02に含まれない。",
            "地物を取得できたことは現在の営業状況・接続・所属の検証完了を意味しない。",
        ],
    }
    return {"summary": summary, "routes": records}


def write_reports(inventory: dict[str, Any], output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    (output / "n02-summary.json").write_text(
        json.dumps(inventory["summary"], ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    fields = [
        "source_entry_id",
        "operator",
        "source_line_name",
        "rail_features",
        "station_features",
        "source_station_count",
        "railway_types",
        "operator_types",
        "prefectures",
        "operating_service_mapping",
        "train_types",
        "stop_patterns",
        "timetable",
        "warnings",
    ]
    with (output / "n02-route-inventory.csv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        for route in inventory["routes"]:
            writer.writerow(
                {
                    key: "|".join(route[key]) if isinstance(route[key], list) else route[key]
                    for key in fields
                }
            )
