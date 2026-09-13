"""保存済みの線路と同一駅グループによる距離探索。列車の運行は保証しない。"""

from __future__ import annotations

import heapq
import itertools
import math
from collections import defaultdict
from typing import Any

from shapely.geometry import Point
from shapely.strtree import STRtree

from .n02 import DataError
from .operating import RailGraph, distance


def station_index(routes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    parents: dict[str, str] = {}

    def root(value: str) -> str:
        if value not in parents:
            parents[value] = value
        if parents[value] != value:
            parents[value] = root(parents[value])
        return parents[value]

    def ids(route: dict[str, Any], station: dict[str, Any]) -> list[str]:
        return station.get("groupIds") or [f"{route['id']}:{station['id']}"]

    for route in routes:
        for station in route["stations"]:
            groups = ids(route, station)
            for group in groups:
                a, b = sorted((root(group), root(groups[0])))
                parents[b] = a
    result: dict[str, Any] = {}
    for route in routes:
        for station in route["stations"]:
            group_id = root(ids(route, station)[0])
            group = result.setdefault(
                group_id,
                {
                    "id": group_id,
                    "name": station["name"],
                    "names": [],
                    "position": station["position"],
                    "members": [],
                },
            )
            if station["name"] not in group["names"]:
                group["names"].append(station["name"])
            group["members"].append(
                {
                    "routeId": route["id"],
                    "stationId": station["id"],
                    "stationName": station["name"],
                    "routeName": route["name"],
                    "operator": route["operator"],
                    "prefectures": route.get("prefectures", []),
                }
            )
    return sorted(result.values(), key=lambda s: (s["name"], s["id"]))


def build_network(
    routes: list[dict[str, Any]], station_lines: dict[str, Any] | None = None
) -> dict[str, Any]:
    station_lines = station_lines or {}
    stations = station_index(routes)
    edges: list[dict[str, Any]] = []
    station_nodes: dict[str, Any] = {}
    counter = itertools.count()
    groups = {s["id"]: next(counter) for s in stations}
    memberships = {(m["routeId"], m["stationId"]): s["id"] for s in stations for m in s["members"]}
    excluded: list[dict[str, str]] = []

    def add(
        a: int,
        b: int,
        length: float,
        route_id: str | None,
        kind: str,
        coordinates: Any = None,
        station_id: str | None = None,
    ) -> None:
        edges.append(
            {
                "a": a,
                "b": b,
                "meters": length,
                "routeId": route_id,
                "kind": kind,
                "coordinates": coordinates or [],
                "stationId": station_id,
            }
        )

    for route in routes:
        route_id = route["id"]
        segments = [g["coordinates"] for g in route["geometry"]]
        segments += [
            line
            for s in route["stations"]
            for code in s.get("sourceCodes", [])
            for line in station_lines.get(code, [])
        ]
        graph = RailGraph(segments)
        nodes = list(graph.edges)
        if not nodes:
            excluded.append({"routeId": route_id, "reason": "線形がありません"})
            continue
        tree = STRtree([Point(*n) for n in nodes])
        components = {n: i for i, component in enumerate(graph.components) for n in component}
        anchors: dict[str, list[Any]] = {}
        for station in route["stations"]:
            pos = tuple(station["position"])
            near: dict[int, tuple[float, Any]] = {}
            for index in tree.query(Point(*pos).buffer(0.004)):
                node = nodes[index]
                length = distance(node, pos)
                component = components[node]
                if length <= 250 and (component not in near or length < near[component][0]):
                    near[component] = (length, node)
            anchors[station["id"]] = [value[1] for value in near.values()]
            if not near:
                excluded.append(
                    {
                        "routeId": route_id,
                        "stationId": station["id"],
                        "reason": "駅から250m以内の線形を確認できません",
                    }
                )
        keep = {n for n, neighbours in graph.edges.items() if len(neighbours) != 2}
        keep.update(n for values in anchors.values() for n in values)
        node_ids = {n: next(counter) for n in sorted(keep)}
        visited: set[frozenset[Any]] = set()
        for node in sorted(keep):
            for neighbour in graph.edges[node]:
                pair = frozenset((node, neighbour))
                if pair in visited:
                    continue
                path = [node, neighbour]
                length = graph.edges[node][neighbour]
                visited.add(pair)
                previous, current = node, neighbour
                while current not in keep:
                    following = next(n for n in graph.edges[current] if n != previous)
                    visited.add(frozenset((current, following)))
                    length += graph.edges[current][following]
                    path.append(following)
                    previous, current = current, following
                add(
                    node_ids[node],
                    node_ids[current],
                    length,
                    route_id,
                    "rail",
                    [list(n) for n in path],
                )
        for station in route["stations"]:
            station_id = station["id"]
            node_id = next(counter)
            group = memberships[(route_id, station_id)]
            station_nodes[str(node_id)] = {
                "routeId": route_id,
                "stationId": station_id,
                "stationName": station["name"],
                "groupId": group,
            }
            add(groups[group], node_id, 0, None, "group")
            for anchor in anchors[station_id]:
                add(node_id, node_ids[anchor], 0, route_id, "access", station_id=station_id)
    return {
        "schemaVersion": 1,
        "stations": stations,
        "groups": groups,
        "stationNodes": station_nodes,
        "edges": edges,
        "excluded": excluded,
        "nodeCount": next(counter),
    }


def shortest_distance(
    network: dict[str, Any],
    stops: list[str],
    filters: dict[str, list[str]],
    routes: dict[str, Any],
    route_ids: set[str] | None = None,
) -> dict[str, Any]:
    if len(stops) < 2 or any(stop not in network["groups"] for stop in stops):
        raise DataError("出発駅・到着駅・経由駅を候補から選択してください。")
    adjacency: dict[int, list[tuple[int, int]]] = defaultdict(list)
    allowed: dict[str, set[str]] = {}
    for route_id, services in filters.items():
        if not services:
            continue
        route = routes.get(route_id)
        definitions = {s["id"]: s for s in route.get("services", [])} if route else {}
        if any(s not in definitions for s in services):
            raise DataError("選択種別の停車駅データを確認できません。")
        allowed[route_id] = {
            station
            for service in services
            for station, state in definitions[service]["stops"].items()
            if state in ("common", "conditional", "observed")
        }
    for index, edge in enumerate(network["edges"]):
        if (
            route_ids is not None
            and edge["routeId"] is not None
            and edge["routeId"] not in route_ids
        ):
            continue
        if (
            edge["kind"] == "access"
            and edge["routeId"] in allowed
            and edge["stationId"] not in allowed[edge["routeId"]]
        ):
            continue
        adjacency[edge["a"]].append((edge["b"], index))
        adjacency[edge["b"]].append((edge["a"], index))
    targets = [network["groups"][s] for s in stops]

    def advance(node: int, stage: int) -> int:
        while stage < len(targets) and node == targets[stage]:
            stage += 1
        return stage

    initial = (targets[0], advance(targets[0], 1))
    costs = {initial: (0.0, 0)}
    previous: dict[Any, Any] = {}
    queue = [(0.0, 0, initial)]
    end = None
    while queue:
        meters, hops, state = heapq.heappop(queue)
        if costs.get(state) != (meters, hops):
            continue
        node, stage = state
        if stage == len(targets):
            end = state
            break
        for neighbour, edge_index in adjacency[node]:
            edge = network["edges"][edge_index]
            next_state = (neighbour, advance(neighbour, stage))
            candidate = (meters + edge["meters"], hops + 1)
            if candidate < costs.get(next_state, (math.inf, 0)):
                costs[next_state] = candidate
                previous[next_state] = (state, edge_index)
                heapq.heappush(queue, (*candidate, next_state))
    if end is None:
        return {
            "status": "unavailable",
            "message": "指定した駅と条件をつなぐ線形を確認できません。未接続の区間を直線で補っていません。",
        }
    path = []
    current = end
    while current != initial:
        parent, edge_index = previous[current]
        path.append((parent[0], current[0], edge_index))
        current = parent
    path.reverse()
    legs: list[dict[str, Any]] = []
    pending: list[Any] = []

    def flush() -> None:
        nonlocal pending
        if not pending:
            return
        rail = [item for item in pending if network["edges"][item[2]]["kind"] == "rail"]
        start = network["stationNodes"].get(str(pending[0][0]))
        finish = network["stationNodes"].get(str(pending[-1][1]))
        if rail and start and finish:
            geometry = []
            for i, (a, _, edge_index) in enumerate(rail):
                edge = network["edges"][edge_index]
                coords = (
                    edge["coordinates"] if edge["a"] == a else list(reversed(edge["coordinates"]))
                )
                geometry.append({"id": f"journey-{len(legs)}-{i}", "coordinates": coords})
            legs.append(
                {
                    "routeId": start["routeId"],
                    "fromStationId": start["stationId"],
                    "toStationId": finish["stationId"],
                    "fromName": start["stationName"],
                    "toName": finish["stationName"],
                    "geometry": geometry,
                    "meters": round(sum(network["edges"][item[2]]["meters"] for item in rail)),
                }
            )
        pending = []

    for item in path:
        if network["edges"][item[2]]["kind"] == "group":
            flush()
        else:
            pending.append(item)
    flush()
    return {
        "status": "available",
        "kind": "distance",
        "meters": round(costs[end][0]),
        "legs": legs,
        "message": "線路データ上の候補です。概算走行距離のみで比較し、乗換歩行・運転日・実際の列車の接続は確認していません。",
    }
