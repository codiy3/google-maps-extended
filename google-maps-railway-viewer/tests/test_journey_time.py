import copy
import unittest
from datetime import datetime

from railway_data.journey_network import build_network
from railway_data.journey_time import earliest_arrival
from tests.test_journey import route
from tests.test_timetable import fixture


class JourneyTimeTests(unittest.TestCase):
    def setUp(self):
        a, b, c = [139.0, 35.0], [139.01, 35.0], [139.02, 35.0]
        self.route = route("test", [a, b, c], [("a", a), ("b", b), ("c", c)])
        for station in self.route["stations"]:
            station["id"] = station["name"]
        self.express = route("express", [b, c], [("b", b), ("c", c)])
        self.routes = {r["id"]: r for r in [self.route, self.express]}
        self.network = build_network(list(self.routes.values()))
        self.tables = {"test": fixture()}
        express = copy.deepcopy(fixture())
        express["routeId"] = "express"
        trip = express["trips"][0]
        trip["id"] = "connection"
        trip["serviceId"] = "express"
        trip["stops"] = trip["stops"][1:]
        trip["stops"][0].update(stationId="express-b", arrival=None, departure="24:33:00")
        trip["stops"][1].update(stationId="express-c", arrival="24:36:00")
        self.tables["express"] = express
        self.start = datetime.fromisoformat("2026-09-14T00:00:00+09:00")

    def search(self, stops=None, transfer=5, tables=None, filters=None):
        return earliest_arrival(
            self.network,
            self.routes,
            self.tables if tables is None else tables,
            stops or ["a", "c"],
            self.start,
            filters or {},
            transfer,
        )

    def test_previous_service_day_waiting_and_transfer_allowance(self):
        conservative = self.search(transfer=5)
        quick = self.search(transfer=1)
        self.assertEqual(conservative["arrival"], "2026-09-14T00:40:00+09:00")
        self.assertEqual(conservative["minutes"], 40)
        self.assertEqual(quick["arrival"], "2026-09-14T00:36:00+09:00")
        self.assertEqual([leg["routeId"] for leg in quick["legs"]], ["test", "express"])
        self.assertTrue(all(leg["geometry"] for leg in quick["legs"]))

    def test_waypoint_can_continue_on_same_train_without_transfer_allowance(self):
        result = self.search(["a", "b", "c"])
        self.assertEqual(result["arrival"], "2026-09-14T00:40:00+09:00")
        self.assertEqual([leg["toName"] for leg in result["legs"]], ["b", "c"])

    def test_missing_estimated_and_filtered_data_are_not_fabricated(self):
        self.tables["express"]["trips"][0]["stops"][-1]["precision"] = "estimated"
        self.assertEqual(self.search(transfer=1)["minutes"], 40)
        self.assertEqual(self.search(tables={})["status"], "unavailable")
        self.assertNotIn("arrival", self.search(tables={}))
        self.assertEqual(self.search(filters={"test": ["express"]})["status"], "unavailable")

    def test_no_travel_needs_no_timetable_but_a_roundtrip_does(self):
        result = self.search(["a", "a", "a"], tables={})
        self.assertEqual(result["minutes"], 0)
        self.assertEqual(result["arrival"], self.start.isoformat())
        self.assertEqual(result["legs"], [])
        self.assertEqual(self.search(["a", "b", "a"], tables={})["status"], "unavailable")


if __name__ == "__main__":
    unittest.main()
