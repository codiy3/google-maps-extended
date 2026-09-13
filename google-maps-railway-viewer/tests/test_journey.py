import unittest

from railway_data.journey_network import build_network, shortest_distance


def route(route_id, points, names):
    return {
        "id": route_id,
        "name": route_id,
        "operator": "テスト鉄道",
        "prefectures": ["テスト地域"],
        "geometry": [{"id": "line", "coordinates": points}],
        "services": [],
        "stations": [
            {
                "id": f"{route_id}-{name}",
                "name": name,
                "position": point,
                "groupIds": [name],
                "sourceCodes": [],
            }
            for name, point in names
        ],
    }


class JourneyNetworkTests(unittest.TestCase):
    def setUp(self):
        self.a = [139.0, 35.0]
        self.x = [139.01, 35.02]
        self.c = [139.02, 35.0]
        self.slow = route(
            "detour", [self.a, self.x, self.c], [("A", self.a), ("X", self.x), ("C", self.c)]
        )
        self.short = route("short", [self.a, self.c], [("A", self.a), ("C", self.c)])
        self.routes = {r["id"]: r for r in [self.slow, self.short]}
        self.network = build_network(list(self.routes.values()))

    def test_shortest_distance_and_ordered_waypoint_choose_different_paths(self):
        direct = shortest_distance(self.network, ["A", "C"], {}, self.routes)
        via = shortest_distance(self.network, ["A", "X", "C"], {}, self.routes)
        self.assertEqual([leg["routeId"] for leg in direct["legs"]], ["short"])
        self.assertGreater(via["meters"], direct["meters"])
        self.assertEqual([leg["toName"] for leg in via["legs"]], ["X", "C"])
        self.assertTrue(all(leg["geometry"] for leg in via["legs"]))

    def test_round_trip_and_repeated_waypoints_do_not_skip_required_visits(self):
        result = shortest_distance(self.network, ["A", "X", "X", "A"], {}, self.routes)
        self.assertGreater(result["meters"], 0)
        self.assertEqual(result["legs"][-1]["toName"], "A")
        zero = shortest_distance(self.network, ["A", "A"], {}, self.routes)
        self.assertEqual(zero["meters"], 0)
        self.assertEqual(zero["legs"], [])

    def test_filter_can_exclude_boarding_without_hiding_other_routes(self):
        self.short["services"] = [{"id": "fast", "stops": {"short-A": "none", "short-C": "common"}}]
        result = shortest_distance(self.network, ["A", "C"], {"short": ["fast"]}, self.routes)
        self.assertEqual([leg["routeId"] for leg in result["legs"]], ["detour"])

    def test_nearby_crossing_different_routes_are_not_transfer_points(self):
        crossing = route(
            "crossing",
            [[139.01, 34.99], [139.01, 35.01]],
            [("D", [139.01, 34.99]), ("E", [139.01, 35.01])],
        )
        routes = [self.short, crossing]
        network = build_network(routes)
        result = shortest_distance(network, ["A", "E"], {}, {r["id"]: r for r in routes})
        self.assertEqual(result["status"], "unavailable")


if __name__ == "__main__":
    unittest.main()
