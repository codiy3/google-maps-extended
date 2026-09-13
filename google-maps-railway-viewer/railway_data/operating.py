"""出典で確認した運行系統を、元データの路線区分と分離して定義する。"""

from __future__ import annotations

import copy
import heapq
import math
from collections import defaultdict
from typing import Any

from shapely import get_parts, union_all
from shapely.geometry import LineString

from .n02 import DataError

JRE = "東日本旅客鉄道"
YAMANOTE_NAMES = "品川 大崎 五反田 目黒 恵比寿 渋谷 原宿 代々木 新宿 新大久保 高田馬場 目白 池袋 大塚 巣鴨 駒込 田端 西日暮里 日暮里 鶯谷 上野 御徒町 秋葉原 神田 東京 有楽町 新橋 浜松町 田町 高輪ゲートウェイ".split()
YAMANOTE_SOURCE = "https://media.jreast.co.jp/articles/1214"
TOKYO_MAP = "https://www.jreast.co.jp/map/pdf/map_tokyo.pdf"
Node = tuple[float, float]


def distance(a: Node, b: Node) -> float:
    """短い区間の探索用距離。列車の所要時間には使わない。"""
    x = (a[0] - b[0]) * math.cos(math.radians((a[1] + b[1]) / 2))
    y = a[1] - b[1]
    return math.hypot(x, y) * 111_320


class RailGraph:
    def __init__(self, segments: list[list[list[float]]]):
        self.edges: dict[Node, dict[Node, float]] = defaultdict(dict)
        # 同じ原典路線内の重なる線分を分割し、駅線形との接点を作る。
        merged = union_all([LineString(segment) for segment in segments])
        for part in get_parts(merged):
            if not isinstance(part, LineString):
                raise DataError("接続処理で線以外の形状が生成されました。")
            segment = list(part.coords)
            points = [(round(p[0], 7), round(p[1], 7)) for p in segment]
            for a, b in zip(points, points[1:]):
                if a != b:
                    self.edges[a][b] = self.edges[b][a] = distance(a, b)
        self.components: list[set[Node]] = []
        seen: set[Node] = set()
        for node in self.edges:
            if node in seen:
                continue
            component: set[Node] = set()
            pending = [node]
            while pending:
                current = pending.pop()
                if current in seen:
                    continue
                seen.add(current)
                component.add(current)
                pending.extend(self.edges[current])
            self.components.append(component)

    def path(self, start: Node, end: Node) -> list[list[float]]:
        candidates = []
        for component in self.components:
            a = min(component, key=lambda node: (distance(node, start), node))
            b = min(component, key=lambda node: (distance(node, end), node))
            if max(distance(a, start), distance(b, end)) <= 250:
                candidates.append((distance(a, start) + distance(b, end), a, b))
        if not candidates:
            raise DataError("駅と線路が250m以上離れています。手動照合が必要です。")
        # 同じ駅の別ホーム・並行線に吸着して断線させない。同じ連続線形内で照合する。
        _, a, b = min(candidates)
        costs = {a: 0.0}
        previous: dict[Node, Node] = {}
        queue = [(0.0, a)]
        while queue:
            cost, current = heapq.heappop(queue)
            if current == b:
                path = [b]
                while path[-1] != a:
                    path.append(previous[path[-1]])
                return [list(p) for p in reversed(path)]
            if cost != costs[current]:
                continue
            for neighbour, length in self.edges[current].items():
                candidate = cost + length
                if candidate < costs.get(neighbour, math.inf):
                    costs[neighbour] = candidate
                    previous[neighbour] = current
                    heapq.heappush(queue, (candidate, neighbour))
        raise DataError("駅間の線形が接続していません。直線で補わず、元データを確認してください。")


def add_yamanote(
    details: dict[str, Any], station_lines: dict[str, list[list[list[float]]]]
) -> None:
    sources = {
        name: next(
            r for r in details.values() if r["officialOperator"] == JRE and r["name"] == name
        )
        for name in ("山手線", "東北線", "東海道線")
    }
    graphs = {}
    for name, route in sources.items():
        graphs[name] = RailGraph(
            [g["coordinates"] for g in route["geometry"]]
            + [
                segment
                for station in route["stations"]
                for code in station["sourceCodes"]
                for segment in station_lines[code]
            ]
        )
    stations = []
    for i, name in enumerate(YAMANOTE_NAMES):
        line = "山手線" if i <= 16 else "東北線" if i <= 24 else "東海道線"
        matches = [s for s in sources[line]["stations"] if s["name"] == name]
        if len(matches) != 1:
            raise DataError(f"山手線の{name}を一意に照合できません。")
        stations.append({**matches[0], "id": f"jr-east-yamanote-{i + 1:02}"})
    geometry = []
    for i, a in enumerate(stations):
        b = stations[(i + 1) % len(stations)]
        line = "山手線" if i < 16 else "東北線" if i < 24 else "東海道線"
        try:
            path = graphs[line].path(tuple(a["position"]), tuple(b["position"]))
        except DataError as exc:
            raise DataError(f"{a['name']}〜{b['name']}: {exc}") from exc
        length = sum(distance((x[0], x[1]), (y[0], y[1])) for x, y in zip(path, path[1:]))
        if length > 5_000:
            raise DataError(f"山手線の{a['name']}〜{b['name']}の経路が長すぎます。")
        geometry.append({"id": f"jr-east-yamanote-leg-{i + 1}", "coordinates": path})
    result = copy.deepcopy(sources["山手線"])
    result.update(
        {
            "id": "jr-east-yamanote",
            "name": "山手線",
            "kind": "operating_service",
            "aliases": ["やまのてせん", "JR山手線", "yamanote"],
            "section": "環状運転・全30駅（内回り／外回り）",
            "stationOrder": "route",
            "stationCount": len(stations),
            "stations": stations,
            "geometry": geometry,
            "prefectures": ["東京都"],
            "regionStatus": "complete",
            "sources": [
                *result["sources"],
                {"title": "JR東日本 山手線の駅一覧", "url": YAMANOTE_SOURCE},
            ],
        }
    )
    # 原典の山手線は運行系統とは別物。検索時に17駅を全駅と誤認させない。
    del details[sources["山手線"]["id"]]
    details[result["id"]] = result


def add_chuo_services(
    details: dict[str, Any], station_lines: dict[str, list[list[list[float]]]]
) -> None:
    """直通区間を含めない東京〜高尾、三鷹〜千葉を明示的に定義する。"""
    source = {
        name: next(
            r for r in details.values() if r["officialOperator"] == JRE and r["name"] == name
        )
        for name in ("中央本線", "総武線", "東北線")
    }
    rapid = "東京 神田 御茶ノ水 四ツ谷 新宿 中野 高円寺 阿佐ヶ谷 荻窪 西荻窪 吉祥寺 三鷹 武蔵境 東小金井 武蔵小金井 国分寺 西国分寺 国立 立川 日野 豊田 八王子 西八王子 高尾".split()
    local_west = "三鷹 吉祥寺 西荻窪 荻窪 阿佐ヶ谷 高円寺 中野 東中野 大久保 新宿 代々木 千駄ヶ谷 信濃町 四ツ谷 市ヶ谷 飯田橋 水道橋 御茶ノ水".split()
    local_east = "秋葉原 浅草橋 両国 錦糸町 亀戸 平井 新小岩 小岩 市川 本八幡 下総中山 西船橋 船橋 東船橋 津田沼 幕張本郷 幕張 新検見川 稲毛 西千葉 千葉".split()
    definitions = [
        (
            "jr-east-chuo-rapid",
            "中央線（快速）",
            [(name, "東北線" if name == "東京" else "中央本線") for name in rapid],
            ["東京都"],
            "東京〜高尾（青梅・大月方面などの直通区間は含まない）",
            ["中央線", "中央線快速", "ちゅうおうせんかいそく"],
        ),
        (
            "jr-east-chuo-sobu-local",
            "中央・総武線各駅停車",
            [(name, "中央本線") for name in local_west] + [(name, "総武線") for name in local_east],
            ["東京都", "千葉県"],
            "三鷹〜千葉（地下鉄東西線の直通区間は含まない）",
            ["中央線", "中央総武線", "総武線", "中央・総武線", "ちゅうおうそうぶせん"],
        ),
    ]
    graphs = {}
    for name, route in source.items():
        graphs[name] = RailGraph(
            [g["coordinates"] for g in route["geometry"]]
            + [
                segment
                for station in route["stations"]
                for code in station["sourceCodes"]
                for segment in station_lines[code]
            ]
        )
    for route_id, name, assignments, prefectures, section, aliases in definitions:
        stations = []
        for index, (station_name, line) in enumerate(assignments):
            matches = [s for s in source[line]["stations"] if s["name"] == station_name]
            if len(matches) != 1:
                raise DataError(f"{name}の{station_name}を一意に照合できません。")
            stations.append({**matches[0], "id": f"{route_id}-{index + 1:02}"})
        geometry = []
        for index, (a, b) in enumerate(zip(stations, stations[1:])):
            # 御茶ノ水から東は総武線。駅名の一致だけで全路線を混合しない。
            line = assignments[index + 1][1]
            if route_id == "jr-east-chuo-rapid" and index == 0:
                line = "東北線"
            path = graphs[line].path(tuple(a["position"]), tuple(b["position"]))
            if sum(distance((x[0], x[1]), (y[0], y[1])) for x, y in zip(path, path[1:])) > 10_000:
                raise DataError(f"{name}の{a['name']}〜{b['name']}の経路が長すぎます。")
            geometry.append({"id": f"{route_id}-leg-{index + 1}", "coordinates": path})
        details[route_id] = {
            **copy.deepcopy(source["中央本線"]),
            "id": route_id,
            "name": name,
            "kind": "operating_service",
            "aliases": aliases,
            "section": section,
            "prefectures": prefectures,
            "regionStatus": "complete",
            "stationOrder": "route",
            "stationCount": len(stations),
            "stations": stations,
            "geometry": geometry,
            "sources": [
                *source["中央本線"]["sources"],
                {"title": "JR東日本 東京近郊路線図", "url": TOKYO_MAP},
            ],
        }
