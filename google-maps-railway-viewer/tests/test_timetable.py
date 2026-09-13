import copy
import unittest
from datetime import datetime

from railway_data.n02 import DataError
from railway_data.timetable import durations, validate_timetable


def fixture():
    # 実在しない列車・駅の検証データ。アプリの配信データへ入れない。
    return {
        "schemaVersion": 1,
        "routeId": "test",
        "provider": "user-owned",
        "sourceUrl": "https://example.invalid/test",
        "license": "test-only",
        "retrievedAt": "2026-09-13T12:00:00+09:00",
        "validFrom": "2026-09-13",
        "validUntil": "2026-09-13",
        "trips": [
            {
                "id": "night",
                "serviceId": "local",
                "serviceDates": ["2026-09-13"],
                "stops": [
                    {
                        "stationId": "a",
                        "arrival": None,
                        "departure": "24:10:00",
                        "precision": "exact",
                        "pickup": True,
                        "dropoff": False,
                    },
                    {
                        "stationId": "b",
                        "arrival": "24:30:00",
                        "departure": "24:32:00",
                        "precision": "exact",
                        "pickup": True,
                        "dropoff": True,
                    },
                    {
                        "stationId": "c",
                        "arrival": "24:40:00",
                        "departure": None,
                        "precision": "exact",
                        "pickup": False,
                        "dropoff": True,
                    },
                ],
            }
        ],
    }


class TimetableTests(unittest.TestCase):
    route = {"id": "test", "stations": [{"id": x} for x in "abc"]}

    def query(
        self,
        value,
        start="2026-09-14T00:00:00+09:00",
        end="2026-09-14T00:40:00+09:00",
        services=None,
    ):
        return durations(
            self.route,
            value,
            "a",
            datetime.fromisoformat(start),
            datetime.fromisoformat(end),
            services or [],
        )

    def test_previous_service_day_and_arrival_after_window(self):
        result = self.query(fixture(), end="2026-09-14T00:20:00+09:00")
        self.assertEqual([r.get("minutes") for r in result["rows"]], [None, 20, 30])
        self.assertEqual(result["rows"][0]["status"], "origin")

    def test_end_exclusive_and_different_service_are_not_reported_as_no_trains(self):
        result = self.query(fixture(), end="2026-09-14T00:10:00+09:00")
        self.assertEqual(result["rows"][1]["status"], "not_observed")
        self.assertEqual(
            self.query(fixture(), services=["express"])["rows"][2]["status"], "not_observed"
        )

    def test_estimated_time_not_ranked_and_missing_timetable_not_zero(self):
        value = fixture()
        value["trips"][0]["stops"][1]["precision"] = "estimated"
        rows = self.query(value)["rows"]
        self.assertEqual(rows[1]["status"], "insufficient")
        self.assertNotIn("minutes", rows[1])
        self.assertEqual(rows[2]["minutes"], 30)
        self.assertEqual(self.query(None)["rows"][2]["status"], "unavailable")

    def test_repeated_station_uses_occurrence_after_departure_and_respects_pickup(self):
        value = fixture()
        value["trips"][0]["stops"].insert(
            0,
            {
                "stationId": "b",
                "arrival": None,
                "departure": "24:00:00",
                "precision": "exact",
                "pickup": True,
                "dropoff": False,
            },
        )
        self.assertEqual(self.query(value)["rows"][1]["minutes"], 20)
        value["trips"][0]["stops"][1]["pickup"] = False
        self.assertEqual(self.query(value)["rows"][2]["status"], "not_observed")

    def test_invalid_decreasing_times_unknown_stations_and_unlicensed_provider_are_rejected(self):
        invalid = fixture()
        invalid["trips"][0]["stops"][1]["arrival"] = "00:30:00"
        with self.assertRaises(DataError):
            validate_timetable(invalid, self.route)
        invalid = fixture()
        invalid["provider"] = "google"
        with self.assertRaises(DataError):
            validate_timetable(invalid, self.route)
        invalid = fixture()
        invalid["trips"][0]["stops"][1]["stationId"] = "elsewhere"
        with self.assertRaises(DataError):
            validate_timetable(invalid, self.route)

    def test_unconfirmed_faster_trip_does_not_replace_exact_schedule(self):
        value = fixture()
        faster = copy.deepcopy(value["trips"][0])
        faster["id"] = "inexact"
        faster["stops"][2]["arrival"] = "24:35:00"
        faster["stops"][2]["precision"] = "estimated"
        value["trips"].append(faster)
        row = self.query(value)["rows"][2]
        self.assertEqual(row["minutes"], 30)
        self.assertTrue(row["incomplete"])
