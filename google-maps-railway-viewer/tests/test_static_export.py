import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from railway_data.journey_network import shortest_distance
from railway_data.n02 import DataError
from railway_data.static_export import export_static, validate_network
from tests.test_journey import route


class StaticExportTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root / "public/data"
        (self.source / "routes").mkdir(parents=True)
        self.archive = self.root / "N02.zip"
        self.archive.write_bytes(b"mock archive")
        self.route = route(
            "test",
            [[139.0, 35.0], [139.01, 35.0]],
            [("A", [139.0, 35.0]), ("B", [139.01, 35.0])],
        )
        self.catalog = {"schemaVersion": 3, "dataRevision": "version-1", "routes": [{"id": "test"}]}
        (self.source / "catalog.json").write_text(json.dumps(self.catalog), encoding="utf-8")
        (self.source / "routes/test.json").write_text(json.dumps(self.route), encoding="utf-8")

    def test_export_contains_only_public_snapshots_and_matching_revision(self):
        (self.source / "routes/orphan.json").write_text('{"id":"old"}', encoding="utf-8")
        (self.source / "routes/notes.txt").write_text("other file", encoding="utf-8")
        with (
            patch("railway_data.journey.station_shapes", return_value={}) as shapes,
            patch("urllib.request.urlopen", side_effect=AssertionError("外部APIを呼ばない")),
        ):
            counts = export_static(self.source, self.archive)
        shapes.assert_called_once_with(self.archive)
        stations = json.loads((self.source / "stations.json").read_text())
        snapshot = json.loads((self.source / "journey-network.json").read_text())
        self.assertEqual(stations["schemaVersion"], 1)
        self.assertEqual(snapshot["schemaVersion"], 1)
        self.assertEqual(stations["dataRevision"], self.catalog["dataRevision"])
        self.assertEqual(snapshot["dataRevision"], self.catalog["dataRevision"])
        self.assertEqual(counts["stations"], 2)
        self.assertEqual(counts["excluded"], 0)
        self.assertNotIn("stations", snapshot["network"])
        self.assertNotIn("metadata", snapshot)
        self.assertFalse(list(self.root.rglob("*.sqlite3")))
        self.assertFalse((self.source / "routes/orphan.json").exists())
        self.assertTrue((self.source / "routes/test.json").exists())
        self.assertTrue((self.source / "routes/notes.txt").exists())
        result = shortest_distance(snapshot["network"], ["A", "B"], {}, {"test": self.route})
        self.assertEqual(result["status"], "available")

    def test_missing_archive_fails_before_writing_incomplete_network(self):
        with self.assertRaisesRegex(DataError, "N02原典"):
            export_static(self.source, self.root / "missing.zip")
        self.assertFalse((self.source / "journey-network.json").exists())

    def test_missing_revision_fails_before_publishing(self):
        del self.catalog["dataRevision"]
        (self.source / "catalog.json").write_text(json.dumps(self.catalog), encoding="utf-8")
        with self.assertRaisesRegex(DataError, "更新版"):
            export_static(self.source, self.archive)
        self.assertFalse((self.source / "stations.json").exists())

    def test_invalid_network_is_rejected(self):
        with patch("railway_data.journey.station_shapes", return_value={}):
            export_static(self.source, self.archive)
        snapshot = json.loads((self.source / "journey-network.json").read_text())
        network = snapshot["network"]
        network["stations"] = json.loads((self.source / "stations.json").read_text())["stations"]
        for field, invalid in (("meters", -1), ("a", network["nodeCount"]), ("routeId", "unknown")):
            changed = copy.deepcopy(network)
            changed["edges"][0][field] = invalid
            with self.subTest(field=field), self.assertRaises(DataError):
                validate_network(changed, self.catalog)
        changed = copy.deepcopy(network)
        changed["stations"] = []
        with self.assertRaisesRegex(DataError, "一致"):
            validate_network(changed, self.catalog)

    def test_shared_browser_fixtures_remain_identical_to_python_solver(self):
        path = Path(__file__).resolve().parent.parent / "src/static-journey.fixture.json"
        fixture = json.loads(path.read_text(encoding="utf-8"))
        for case in fixture["cases"]:
            with self.subTest(case=case["name"]):
                result = shortest_distance(
                    fixture["network"], case["stops"], case["filters"], fixture["routes"]
                )
                self.assertEqual(result, case["expected"])


if __name__ == "__main__":
    unittest.main()
