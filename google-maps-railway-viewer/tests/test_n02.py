import copy
import csv
import json
import tempfile
import unittest
from pathlib import Path

from railway_data.n02 import (
    SOURCE_CRS,
    DataError,
    build_inventory,
    read_archive,
    write_reports,
)


def collection(*rows):
    return {
        "type": "FeatureCollection",
        "crs": {"properties": {"name": SOURCE_CRS}},
        "features": list(rows),
    }


def feature(operator="試験鉄道", line="中央線", code=None, name="試験駅", group="000001"):
    properties = {"N02_001": "11", "N02_002": "4", "N02_003": line, "N02_004": operator}
    if code is not None:
        properties.update(N02_005=name, N02_005c=code, N02_005g=group)
    return {
        "type": "Feature",
        "properties": properties,
        "geometry": {
            "type": "LineString",
            "coordinates": [[139.0, 35.0], [139.001, 35.001]],
        },
    }


class InventoryTests(unittest.TestCase):
    def test_same_station_code_is_not_counted_twice_for_split_geometry(self):
        station = feature(code="000001")
        result = build_inventory(collection(feature()), collection(station, copy.deepcopy(station)))
        self.assertEqual(result["summary"]["counts"]["extra_station_features"], 1)
        self.assertEqual(result["routes"][0]["source_station_count"], 1)
        self.assertEqual(result["routes"][0]["station_features"], 2)

    def test_same_name_and_group_do_not_merge_different_companies(self):
        result = build_inventory(
            collection(feature(), feature(operator="別の鉄道")),
            collection(feature(code="000001"), feature(operator="別の鉄道", code="000002")),
        )
        self.assertEqual(len(result["routes"]), 2)
        self.assertEqual(result["summary"]["counts"]["source_station_codes"], 2)
        self.assertEqual(result["summary"]["counts"]["source_station_groups"], 1)
        self.assertNotEqual(
            result["routes"][0]["source_entry_id"],
            result["routes"][1]["source_entry_id"],
        )

    def test_missing_stations_and_possible_swapped_columns_are_reported_without_repair(
        self,
    ):
        result = build_inventory(
            collection(feature(), feature(operator="中央線", line="試験鉄道")),
            collection(feature(code="000001")),
        )
        flagged = next(r for r in result["routes"] if r["operator"] == "中央線")
        self.assertEqual(
            flagged["warnings"],
            ["missing_station_records", "possible_swapped_operator_and_line"],
        )
        self.assertEqual(flagged["source_station_count"], 0)

    def test_station_only_route_is_kept_as_a_gap(self):
        result = build_inventory(
            collection(feature()), collection(feature(line="別線", code="000001"))
        )
        flagged = next(r for r in result["routes"] if r["source_line_name"] == "別線")
        self.assertIn("missing_rail_geometry", flagged["warnings"])

    def test_station_code_conflict_is_an_error(self):
        with self.assertRaisesRegex(DataError, "駅コード000001"):
            build_inventory(
                collection(feature()),
                collection(feature(code="000001"), feature(code="000001", name="異なる駅")),
            )

    def test_unsupported_crs_is_not_silently_treated_as_latitude_longitude(self):
        rail = collection(feature())
        rail["crs"]["properties"]["name"] = "EPSG:3857"
        with self.assertRaisesRegex(DataError, "座標系"):
            build_inventory(rail, collection(feature(code="000001")))

    def test_invalid_geometry_and_empty_dataset_fail(self):
        for geometry in [
            None,
            {"type": "Point", "coordinates": [139, 35]},
            {"type": "LineString", "coordinates": [[35, 139], [35, 140]]},
            {"type": "LineString", "coordinates": [[True, 35], [139, 35]]},
        ]:
            with self.subTest(geometry=geometry), self.assertRaises(DataError):
                row = feature()
                row["geometry"] = geometry
                build_inventory(collection(row), collection(feature(code="000001")))
        with self.assertRaisesRegex(DataError, "空"):
            build_inventory(collection(), collection(feature(code="000001")))

    def test_input_order_does_not_change_reports_and_missing_timetable_is_explicit(
        self,
    ):
        rails = [feature(), feature(operator="別会社")]
        stations = [feature(code="000001"), feature(operator="別会社", code="000002")]
        first = build_inventory(collection(*rails), collection(*stations))
        second = build_inventory(collection(*reversed(rails)), collection(*reversed(stations)))
        self.assertEqual(first, second)
        self.assertFalse(first["summary"]["release_ready"])
        self.assertTrue(all(r["timetable"] == "not_in_source" for r in first["routes"]))
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            write_reports(first, output)
            self.assertEqual(
                json.loads((output / "n02-summary.json").read_text()), first["summary"]
            )
            with (output / "n02-route-inventory.csv").open(newline="") as stream:
                self.assertEqual(len(list(csv.DictReader(stream))), 2)

    def test_wrong_archive_version_fails_before_reading_data(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "wrong.zip"
            archive.write_bytes(b"not the verified archive")
            with self.assertRaisesRegex(DataError, "SHA-256"):
                read_archive(archive)


if __name__ == "__main__":
    unittest.main()
