"""明示的な運転日と乗換余裕時間の条件内で最早到着を探索する。"""

from __future__ import annotations

import bisect
import heapq
import itertools
import math
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any

from .journey_network import shortest_distance
from .n02 import DataError
from .timetable import JST, seconds, validate_timetable


def earliest_arrival(
    network: dict[str, Any],
    routes: dict[str, Any],
    timetables: dict[str, Any],
    stops: list[str],
    start: datetime,
    filters: dict[str, list[str]],
    transfer_minutes: int,
) -> dict[str, Any]:
    if (
        start.tzinfo is None
        or isinstance(transfer_minutes, bool)
        or not isinstance(transfer_minutes, int)
        or not 0 <= transfer_minutes <= 180
    ):
        raise DataError("出発日時には時差、乗換余裕時間には0〜180分の整数が必要です。")
    if len(stops) < 2 or any(s not in network["groups"] for s in stops):
        raise DataError("駅を候補から選択してください。")
    if len(set(stops)) == 1:
        return {
            "status": "available",
            "kind": "time",
            "legs": [],
            "arrival": start.astimezone(JST).isoformat(),
            "minutes": 0,
            "message": "すべて同一駅のため鉄道での移動はありません。駅構内の移動時間は含みません。",
        }
    if not timetables:
        return {
            "status": "unavailable",
            "message": "時刻表未取得のため最短時間経路は未計算です。距離から時間を推定していません。",
        }
    start = start.astimezone(JST)
    horizon = start + timedelta(days=1)
    station_groups = {
        (m["routeId"], m["stationId"]): s["id"] for s in network["stations"] for m in s["members"]
    }
    events: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for route_id, snapshot in timetables.items():
        if route_id not in routes:
            continue
        validate_timetable(snapshot, routes[route_id])
        for trip in snapshot["trips"]:
            if filters.get(route_id) and trip["serviceId"] not in filters[route_id]:
                continue
            for service_date in trip["serviceDates"]:
                day = datetime.fromisoformat(service_date).replace(tzinfo=JST)
                for index, origin in enumerate(trip["stops"]):
                    if origin["precision"] != "exact" or not origin.get("departure"):
                        continue
                    departure = day + timedelta(seconds=seconds(origin["departure"]))
                    if not start <= departure < horizon:
                        continue
                    for target in trip["stops"][index + 1 :]:
                        if (
                            target["precision"] != "exact"
                            or not target["dropoff"]
                            or not target.get("arrival")
                        ):
                            continue
                        arrival = day + timedelta(seconds=seconds(target["arrival"]))
                        events[station_groups[(route_id, origin["stationId"])]].append(
                            {
                                "routeId": route_id,
                                "tripId": trip["id"],
                                "tripKey": f"{route_id}/{trip['id']}/{service_date}",
                                "serviceId": trip["serviceId"],
                                "pickup": origin["pickup"],
                                "fromStationId": origin["stationId"],
                                "toStationId": target["stationId"],
                                "fromGroup": station_groups[(route_id, origin["stationId"])],
                                "toGroup": station_groups[(route_id, target["stationId"])],
                                "departure": departure.timestamp(),
                                "arrival": arrival.timestamp(),
                            }
                        )
    departures = {}
    for group, values in events.items():
        values.sort(key=lambda event: (event["departure"], event["arrival"], event["tripKey"]))
        departures[group] = [event["departure"] for event in values]

    def advance(group: str, stage: int) -> int:
        while stage < len(stops) and group == stops[stage]:
            stage += 1
        return stage

    initial = (stops[0], advance(stops[0], 1), "")
    costs = {initial: start.timestamp()}
    counter = itertools.count()
    queue = [(start.timestamp(), next(counter), initial)]
    previous: dict[Any, Any] = {}
    end = None
    while queue:
        at, _, state = heapq.heappop(queue)
        if at != costs[state]:
            continue
        group, stage, last_trip = state
        if stage == len(stops):
            end = state
            break
        first = bisect.bisect_left(departures.get(group, []), at)
        for event in events[group][first:]:
            if not event["pickup"] and last_trip != event["tripKey"]:
                continue
            ready = at + (
                transfer_minutes * 60 if last_trip and last_trip != event["tripKey"] else 0
            )
            if event["departure"] < ready:
                continue
            following = (event["toGroup"], advance(event["toGroup"], stage), event["tripKey"])
            if event["arrival"] < costs.get(following, math.inf):
                costs[following] = event["arrival"]
                previous[following] = (state, event)
                heapq.heappush(queue, (event["arrival"], next(counter), following))
    if end is None:
        return {
            "status": "unavailable",
            "message": "取得済み時刻表の24時間の出発範囲と指定条件では、全経由駅をつなぐ経路を確認できません。列車が存在しないとは判断していません。",
        }
    path = []
    current = end
    while current != initial:
        current, event = previous[current]
        path.append(event)
    path.reverse()
    legs = []
    for event in path:
        route_id = event["routeId"]
        shape = shortest_distance(
            network, [event["fromGroup"], event["toGroup"]], {}, routes, {route_id}
        )
        route_stations = {s["id"]: s["name"] for s in routes[route_id]["stations"]}
        legs.append(
            {
                **{
                    k: event[k]
                    for k in ("routeId", "tripId", "serviceId", "fromStationId", "toStationId")
                },
                "fromName": route_stations[event["fromStationId"]],
                "toName": route_stations[event["toStationId"]],
                "departure": datetime.fromtimestamp(event["departure"], JST).isoformat(),
                "arrival": datetime.fromtimestamp(event["arrival"], JST).isoformat(),
                "geometry": [g for leg in shape.get("legs", []) for g in leg["geometry"]],
                "meters": shape.get("meters"),
            }
        )
    return {
        "status": "available",
        "kind": "time",
        "legs": legs,
        "arrival": datetime.fromtimestamp(costs[end], JST).isoformat(),
        "minutes": math.ceil((costs[end] - start.timestamp()) / 60),
        "message": f"収録時刻表と乗換余裕{transfer_minutes}分の条件内での最早到着です。待ち時間を含みます。未収録の便・別路線をまたぐ同一列車の同定は含みません。線路形状は原典上の候補です。",
    }
