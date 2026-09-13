import json
import unittest
from pathlib import Path
from typing import Any, ClassVar

from shapely import union_all
from shapely.geometry import LineString

from railway_data.export import build_display_data
from railway_data.n02 import DataError, read_archive
from railway_data.operating import RailGraph


class GeometryTests(unittest.TestCase):
    def test_station_overlap_is_connected_without_inventing_a_straight_segment(self):
        segments = [
            [[139.0, 35.0], [139.01, 35.0]],
            [[139.005, 35.0], [139.006, 35.001]],
            [[139.006, 35.001], [139.007, 35.002]],
        ]
        path = RailGraph(segments).path((139.0, 35.0), (139.007, 35.002))
        self.assertIn([139.005, 35.0], path)
        self.assertLess(
            LineString(path).difference(union_all([LineString(s) for s in segments])).length, 1e-8
        )

    def test_disconnected_geometry_is_rejected(self):
        graph = RailGraph([[[139.0, 35.0], [139.01, 35.0]], [[139.04, 35.0], [139.05, 35.0]]])
        with self.assertRaises(DataError):
            graph.path((139.0, 35.0), (139.05, 35.0))


@unittest.skipUnless(
    Path("data/raw/N02-25_GML.zip").exists(), "公式ZIPが必要: python -m railway_data --download"
)
class OfficialDisplayTests(unittest.TestCase):
    catalog: ClassVar[dict[str, Any]]
    details: ClassVar[dict[str, Any]]

    @classmethod
    def setUpClass(cls):
        rail, station = read_archive(Path("data/raw/N02-25_GML.zip"))
        regions = json.loads(Path("data/catalog/route-prefectures.json").read_text("utf-8"))
        cls.catalog, cls.details = build_display_data(rail, station, regions)

    def test_yamanote_is_thirty_distinct_stations_including_takanawa_gateway(self):
        route = self.details["jr-east-yamanote"]
        self.assertEqual(len(route["stations"]), 30)
        self.assertEqual(len({s["id"] for s in route["stations"]}), 30)
        self.assertIn("高輪ゲートウェイ", [s["name"] for s in route["stations"]])
        self.assertEqual(len(route["geometry"]), 30)
        self.assertEqual(route["prefectures"], ["東京都"])

    def test_chuo_candidates_have_distinct_operators_sections_and_regions(self):
        routes = [r for r in self.catalog["routes"] if r["name"].startswith("中央")]
        self.assertTrue(
            any(r["operator"] == "Osaka Metro" and r["prefectures"] == ["大阪府"] for r in routes)
        )
        self.assertTrue(
            any(r["operator"] == "JR東海" and "愛知県" in r["prefectures"] for r in routes)
        )
        self.assertEqual(self.details["jr-east-chuo-rapid"]["stationCount"], 24)
        self.assertEqual(self.details["jr-east-chuo-sobu-local"]["stationCount"], 39)
        self.assertEqual(len({r["id"] for r in routes}), len(routes))

    def test_every_candidate_has_display_data_and_does_not_claim_timetable_coverage(self):
        self.assertFalse(self.catalog["releaseReady"])
        for route in self.catalog["routes"]:
            detail = self.details[route["id"]]
            self.assertTrue(detail["stations"])
            self.assertTrue(detail["geometry"])
            self.assertTrue(detail["prefectures"])
            self.assertEqual(route["stationCount"], len(detail["stations"]))
            self.assertEqual(route["services"], [])
            self.assertEqual(route["serviceStatus"], "unavailable")
            for segment in detail["geometry"]:
                self.assertGreaterEqual(len(segment["coordinates"]), 2)
                for lon, lat in segment["coordinates"]:
                    self.assertTrue(122 <= lon <= 154 and 20 <= lat <= 46)


if __name__ == "__main__":
    unittest.main()
