"""東京メトロの公式駅順とN02線形を照合する。共用区間も運行路線へ含める。"""

import copy
from typing import Any

from .n02 import DataError
from .operating import RailGraph, distance

DEFINITIONS = [
    (
        "yurakucho",
        "有楽町線",
        "和光市 地下鉄成増 地下鉄赤塚 平和台 氷川台 小竹向原 千川 要町 池袋 東池袋 護国寺 江戸川橋 飯田橋 市ヶ谷 麹町 永田町 桜田門 有楽町 銀座一丁目 新富町 月島 豊洲 辰巳 新木場",
    ),
    (
        "fukutoshin",
        "副都心線",
        "和光市 地下鉄成増 地下鉄赤塚 平和台 氷川台 小竹向原 千川 要町 池袋 雑司が谷 西早稲田 東新宿 新宿三丁目 北参道 明治神宮前 渋谷",
    ),
    (
        "chiyoda",
        "千代田線",
        "代々木上原 代々木公園 明治神宮前 表参道 乃木坂 赤坂 国会議事堂前 霞ヶ関 日比谷 二重橋前 大手町 新御茶ノ水 湯島 根津 千駄木 西日暮里 町屋 北千住 綾瀬 北綾瀬",
    ),
]


def add_metro(details: dict[str, Any], station_lines: dict[str, Any]) -> None:
    sources = {
        r["name"]: copy.deepcopy(r)
        for r in details.values()
        if r["officialOperator"] == "東京地下鉄"
    }
    graphs = {}
    for _, name, _ in DEFINITIONS:
        route = sources[name]
        graphs[name] = RailGraph(
            [g["coordinates"] for g in route["geometry"]]
            + [
                p
                for s in route["stations"]
                for code in s["sourceCodes"]
                for p in station_lines[code]
            ]
        )
    for slug, name, names in DEFINITIONS:
        stations = []
        assignments = []
        for index, station_name in enumerate(names.split()):
            line = "有楽町線" if slug == "fukutoshin" and index < 5 else name
            matches = [s for s in sources[line]["stations"] if s["name"] == station_name]
            if len(matches) != 1:
                raise DataError(f"{name}: {station_name}を一意に照合できません。")
            station = copy.deepcopy(matches[0])
            station["id"] = f"tokyo-metro-{slug}-{index + 1:02}"
            stations.append(station)
            assignments.append(line)
        if slug == "fukutoshin":
            # 公式駅一覧で池袋の有楽町線との乗換を確認。N02では別グループ。
            ikebukuro = next(s for s in sources["有楽町線"]["stations"] if s["name"] == "池袋")
            stations[8]["groupIds"] = sorted(set(stations[8]["groupIds"] + ikebukuro["groupIds"]))
        geometry = []
        for index, (a, b) in enumerate(zip(stations, stations[1:])):
            line = assignments[index]
            path = graphs[line].path(tuple(a["position"]), tuple(b["position"]))
            if sum(distance((x[0], x[1]), (y[0], y[1])) for x, y in zip(path, path[1:])) > 7000:
                raise DataError(f"{name}: {a['name']}〜{b['name']}の線形が迂回しています。")
            geometry.append({"id": f"metro-{slug}-{index}", "coordinates": path})
        result = sources[name]
        old_id = result["id"]
        result.update(
            {
                "id": f"tokyo-metro-{slug}",
                "kind": "operating_service",
                "stations": stations,
                "stationCount": len(stations),
                "geometry": geometry,
                "stationOrder": "route",
                "section": f"{stations[0]['name']}〜{stations[-1]['name']}",
                "prefectures": ["東京都", "埼玉県"] if slug != "chiyoda" else ["東京都"],
                "regionStatus": "complete",
            }
        )
        result["sources"].append(
            {
                "title": f"東京メトロ {name}の公式駅一覧",
                "url": f"https://www.tokyometro.jp/station/line_{slug}/index.html",
            }
        )
        del details[old_id]
        details[result["id"]] = result
