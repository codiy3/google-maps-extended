"""検証済みの予定時刻から、同じ便で行ける全駅の所要時間を計算する。"""

import argparse
import json
import math
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from .n02 import DataError

JST = ZoneInfo("Asia/Tokyo")


def seconds(value: str) -> int:
    parts = value.split(":")
    if len(parts) != 3 or not all(p.isdigit() for p in parts):
        raise DataError("時刻は HH:MM:SS（24時以降も可）で指定してください。")
    h, m, s = map(int, parts)
    if not 0 <= h <= 167 or not 0 <= m < 60 or not 0 <= s < 60:
        raise DataError("時刻が範囲外です。")
    return h * 3600 + m * 60 + s


def validate_timetable(value: dict[str, Any], route: dict[str, Any]) -> None:
    if value.get("schemaVersion") != 1 or value.get("routeId") != route["id"]:
        raise DataError("時刻表の版または路線IDが一致しません。")
    if value.get("provider") not in ("licensed-open-data", "user-owned"):
        raise DataError("保存権限を確認した公開データまたは自前データだけを取り込めます。")
    for key in ("sourceUrl", "license", "retrievedAt", "validFrom", "validUntil"):
        if not isinstance(value.get(key), str) or not value[key]:
            raise DataError(f"時刻表の{key}がありません。")
    if date.fromisoformat(value["validUntil"]) < date.fromisoformat(value["validFrom"]):
        raise DataError("時刻表の有効期間が不正です。")
    ids = {s["id"] for s in route["stations"]}
    trips = value.get("trips")
    if not isinstance(trips, list):
        raise DataError("列車の配列がありません。")
    trip_ids = set()
    for trip in trips:
        if not isinstance(trip.get("id"), str) or trip["id"] in trip_ids:
            raise DataError("便IDが不正または重複しています。")
        trip_ids.add(trip["id"])
        if not isinstance(trip.get("serviceId"), str):
            raise DataError("列車種別IDがありません。")
        days = trip.get("serviceDates")
        if not isinstance(days, list) or not days:
            raise DataError("明示的な運転日がありません。曜日から祝日を推測しません。")
        for day in days:
            if (
                not date.fromisoformat(value["validFrom"])
                <= date.fromisoformat(day)
                <= date.fromisoformat(value["validUntil"])
            ):
                raise DataError("運転日が有効期間外です。")
        previous = -1
        if not isinstance(trip.get("stops"), list) or len(trip["stops"]) < 2:
            raise DataError("便に2駅以上の停車が必要です。")
        for stop in trip["stops"]:
            if stop.get("stationId") not in ids:
                raise DataError("路線にない駅が時刻表に含まれています。")
            for field in ("arrival", "departure"):
                v = stop.get(field)
                if v is not None:
                    sec = seconds(v)
                    if sec < previous:
                        raise DataError(
                            "停車時刻が逆転しています。深夜時刻は提供元の規則で変換してください。"
                        )
                    previous = sec
            if stop.get("precision") not in ("exact", "estimated", "unknown"):
                raise DataError("予定時刻の精度がありません。")
            if not isinstance(stop.get("pickup"), bool) or not isinstance(
                stop.get("dropoff"), bool
            ):
                raise DataError("乗降可否がありません。")


def durations(
    route: dict[str, Any],
    timetable: dict[str, Any] | None,
    origin: str,
    start: datetime,
    end: datetime,
    service_ids: list[str],
) -> dict[str, Any]:
    if origin not in {s["id"] for s in route["stations"]}:
        raise DataError("出発駅が路線に含まれません。")
    if (
        start.tzinfo is None
        or end.tzinfo is None
        or end <= start
        or end - start > timedelta(days=1)
    ):
        raise DataError("日本時間で24時間以内の正しい検索範囲を指定してください。")
    result: dict[str, Any] = {
        "originId": origin,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "status": "unavailable",
        "rows": [],
    }
    if timetable is None:
        result["rows"] = [
            {"stationId": s["id"], "status": "origin" if s["id"] == origin else "unavailable"}
            for s in route["stations"]
        ]
        return result
    validate_timetable(timetable, route)
    best: dict[str, Any] = {}
    incomparable: set[str] = set()
    for trip in timetable["trips"]:
        if service_ids and trip["serviceId"] not in service_ids:
            continue
        stops = trip["stops"]
        for day in trip["serviceDates"]:
            midnight = datetime.combine(date.fromisoformat(day), datetime.min.time(), JST)
            for i, departure in enumerate(stops):
                if departure["stationId"] != origin or not departure["pickup"]:
                    continue
                if departure.get("departure") is None:
                    incomparable.update(s["stationId"] for s in stops[i + 1 :])
                    continue
                leaves = midnight + timedelta(seconds=seconds(departure["departure"]))
                if not start <= leaves < end:
                    continue
                for arrival in stops[i + 1 :]:
                    if not arrival["dropoff"] or arrival["stationId"] == origin:
                        continue
                    destination = arrival["stationId"]
                    if (
                        departure["precision"] != "exact"
                        or arrival["precision"] != "exact"
                        or arrival.get("arrival") is None
                    ):
                        incomparable.add(destination)
                        continue
                    arrives = midnight + timedelta(seconds=seconds(arrival["arrival"]))
                    elapsed = (arrives - leaves).total_seconds()
                    if elapsed < 0:
                        continue
                    candidate = {
                        "stationId": destination,
                        "status": "available",
                        "seconds": elapsed,
                        "minutes": math.ceil(elapsed / 60),
                        "departure": leaves.isoformat(),
                        "arrival": arrives.isoformat(),
                        "tripId": trip["id"],
                        "serviceId": trip["serviceId"],
                    }
                    current = best.get(destination)
                    if current is None or (elapsed, leaves.isoformat(), trip["id"]) < (
                        current["seconds"],
                        current["departure"],
                        current["tripId"],
                    ):
                        best[destination] = candidate
    result["status"] = "available"
    result["sourceUrl"] = timetable["sourceUrl"]
    result["retrievedAt"] = timetable["retrievedAt"]
    result["note"] = "取得済みの比較可能な便の最短乗車時間。待ち時間・乗換は含みません。"
    max_offset = max(
        (
            seconds(s[f])
            for t in timetable["trips"]
            for s in t["stops"]
            for f in ("arrival", "departure")
            if s.get(f)
        ),
        default=0,
    )
    first = datetime.combine(date.fromisoformat(timetable["validFrom"]), datetime.min.time(), JST)
    last = datetime.combine(
        date.fromisoformat(timetable["validUntil"]), datetime.min.time(), JST
    ) + timedelta(seconds=max_offset)
    outside = end <= first or start > last
    result["rows"] = [
        {"stationId": s["id"], "status": "origin"}
        if s["id"] == origin
        else {**best[s["id"]], "incomplete": s["id"] in incomparable}
        if s["id"] in best
        else {
            "stationId": s["id"],
            "status": "out_of_period"
            if outside
            else "insufficient"
            if s["id"] in incomparable
            else "not_observed",
        }
        for s in route["stations"]
    ]
    return result


def main() -> None:
    from .store import Store

    parser = argparse.ArgumentParser(description="保存可能な共通形式の予定時刻表をSQLiteへ取り込む")
    parser.add_argument("file", type=Path)
    parser.add_argument("--database", type=Path, default=Path("data/local/railway.sqlite3"))
    args = parser.parse_args()
    value = json.loads(args.file.read_text())
    Store(args.database).save_timetable(value["routeId"], value)
    print("時刻表を保存しました。次の駅選択から反映します。")


if __name__ == "__main__":
    main()
