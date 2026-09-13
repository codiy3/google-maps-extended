"""同駅の所属路線と、公式資料で確認した直通運転を分けて記録する。"""

from collections import defaultdict
from typing import Any

from .n02 import DataError

METRO = "東京地下鉄"
# 接続地点の線路構造だけから直通を推測しない。乗換案内とは別の台帳。
THROUGH = [
    (
        METRO,
        "千代田線",
        "小田急電鉄",
        "小田原線",
        "代々木上原",
        "https://www.odakyu.jp/town-life/feature/",
    ),
    (
        METRO,
        "千代田線",
        "東日本旅客鉄道",
        "常磐線",
        "綾瀬",
        "https://www.odakyu.jp/town-life/feature/",
    ),
    (
        METRO,
        "有楽町線",
        "東武鉄道",
        "東上本線",
        "和光市",
        "https://www.tokyometro.jp/station/line_yurakucho/index.html",
    ),
    (
        METRO,
        "有楽町線",
        "西武鉄道",
        "西武有楽町線",
        "小竹向原",
        "https://www.tokyometro.jp/corporate/newsletter/2014/153316.html",
    ),
    (
        METRO,
        "副都心線",
        "東武鉄道",
        "東上本線",
        "和光市",
        "https://www.tokyometro.jp/station/line_fukutoshin/index.html",
    ),
    (
        METRO,
        "副都心線",
        "西武鉄道",
        "西武有楽町線",
        "小竹向原",
        "https://www.tokyometro.jp/corporate/newsletter/2014/153316.html",
    ),
    (
        METRO,
        "副都心線",
        "東急電鉄",
        "東横線",
        "渋谷",
        "https://www.tokyometro.jp/station/line_fukutoshin/index.html",
    ),
]


def add_connections(details: dict[str, Any]) -> None:
    groups: dict[str, list[tuple[Any, Any]]] = defaultdict(list)
    for route in details.values():
        route["throughServices"] = []
        for station in route["stations"]:
            station["connections"] = []
            for group in station["groupIds"]:
                groups[group].append((route, station))
    for route in details.values():
        for station in route["stations"]:
            found = {}
            for group in station["groupIds"]:
                for other, target in groups[group]:
                    if other["id"] == route["id"]:
                        continue
                    found[other["id"]] = {
                        "routeId": other["id"],
                        "stationId": target["id"],
                        "stationName": target["name"],
                        "kind": "transfer",
                        "source": "国土数値情報の同一駅グループ",
                    }
            station["connections"] = sorted(found.values(), key=lambda c: c["routeId"])
    for op_a, name_a, op_b, name_b, station_name, source in THROUGH:
        pair = [
            next(
                (r for r in details.values() if r["officialOperator"] == op and r["name"] == name),
                None,
            )
            for op, name in ((op_a, name_a), (op_b, name_b))
        ]
        if any(r is None for r in pair):
            raise DataError(f"直通路線を照合できません: {name_a} / {name_b}")
        for route, other in (pair, list(reversed(pair))):
            assert route is not None and other is not None
            station = next(s for s in route["stations"] if s["name"] == station_name)
            target = next(s for s in other["stations"] if s["name"] == station_name)
            connection = {
                "routeId": other["id"],
                "stationId": target["id"],
                "stationName": target["name"],
                "kind": "through",
                "source": source,
            }
            station["connections"] = [
                c for c in station["connections"] if c["routeId"] != other["id"]
            ] + [connection]
            route["throughServices"].append(
                {**connection, "atStationId": station["id"], "atStationName": station_name}
            )
