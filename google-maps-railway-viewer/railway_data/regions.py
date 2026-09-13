"""N03の区域と鉄道地物を照合し、都道府県名だけを保存する。"""

from __future__ import annotations

import argparse
import io
import json
from collections import defaultdict
from pathlib import Path
from typing import Any
from zipfile import ZipFile

import shapefile  # type: ignore[import-untyped]  # pyshpには公開の型定義がない。
from pyproj import CRS
from shapely import STRtree
from shapely.geometry import LineString, box, shape

from .export import write_json
from .n02 import DataError, archive_digest, coordinates, entry_id, read_archive

N03_SHA256 = "1f714fca019e22e6f84012dba420384fc7b49c6ad8bd0a867ab1cfb593a78477"
N03_PAGE = "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2026.html"
N03_URL = "https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-2026/N03-20260101_GML.zip"
N03_STEM = "N03-20260101_prefecture"


def build_regions(n03: Path, rail: dict[str, Any], station: dict[str, Any]) -> dict[str, Any]:
    if archive_digest(n03) != N03_SHA256:
        raise DataError("調査済みN03のSHA-256と一致しません。")
    features = rail["features"] + station["features"]
    ids = [entry_id(f["properties"]["N02_004"], f["properties"]["N02_003"]) for f in features]
    tree = STRtree([LineString(coordinates(f)) for f in features])
    route_prefs: dict[str, set[str]] = defaultdict(set)
    matched: set[int] = set()
    with ZipFile(n03) as archive:
        source_crs = CRS.from_wkt(archive.read(f"{N03_STEM}.prj").decode("utf-8"))
        if not source_crs.equals(CRS.from_epsg(6668), ignore_axis_order=True):
            raise DataError("N03の座標系がJGD2011ではありません。")
        with shapefile.Reader(
            shp=io.BytesIO(archive.read(f"{N03_STEM}.shp")),
            dbf=io.BytesIO(archive.read(f"{N03_STEM}.dbf")),
            encoding="utf-8",
        ) as reader:
            for record in reader.iterShapeRecords():
                if len(tree.query(box(*record.shape.bbox))) == 0:
                    continue
                prefecture = record.record["N03_001"]
                polygon = shape(record.shape.__geo_interface__)
                for index in tree.query(polygon, predicate="intersects"):
                    route_prefs[ids[index]].add(prefecture)
                    matched.add(int(index))
    missing: dict[str, int] = defaultdict(int)
    for index, route_id in enumerate(ids):
        if index not in matched:
            missing[route_id] += 1
    return {
        "source": {
            "page": N03_PAGE,
            "url": N03_URL,
            "sha256": N03_SHA256,
            "dataDate": "2026-01-01",
        },
        "method": "同じJGD2011座標系の鉄道線形・駅線形とN03区域の交差を集計。区域外は推定しない。",
        "notice": "国土数値情報（行政区域データ）（国土交通省）を加工し、都道府県名のみを集計。境界形状は出力しない。",
        "routes": {
            route_id: {
                "prefectures": sorted(route_prefs[route_id]),
                "status": "partial" if missing[route_id] else "complete",
                "unmatchedFeatures": missing[route_id],
            }
            for route_id in sorted(set(ids))
        },
        "counts": {
            "features": len(features),
            "matchedFeatures": len(matched),
            "unmatchedFeatures": len(features) - len(matched),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--n03", type=Path, required=True)
    parser.add_argument("--n02", type=Path, default=Path("data/raw/N02-25_GML.zip"))
    parser.add_argument("--output", type=Path, default=Path("data/catalog/route-prefectures.json"))
    args = parser.parse_args()
    rail, station = read_archive(args.n02)
    result = build_regions(args.n03, rail, station)
    write_json(args.output, result)
    print(json.dumps(result["counts"], ensure_ascii=False))


if __name__ == "__main__":
    main()
