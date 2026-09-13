import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from railway_data.n02 import DataError
from railway_data.providers import OdptProvider
from railway_data.store import Store


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "source"
        (self.source / "routes").mkdir(parents=True)
        self.route = {"id": "test", "stations": [{"id": "a"}], "geometry": [{"id": "g"}]}
        self.catalog = {"schemaVersion": 3, "dataRevision": "v1", "routes": [{"id": "test"}]}
        (self.source / "catalog.json").write_text(json.dumps(self.catalog))
        (self.source / "routes/test.json").write_text(json.dumps(self.route))
        self.store = Store(self.root / "local.sqlite3")
        self.store.import_base(self.source)

    def test_restart_reads_saved_data_without_reading_details_or_network(self):
        (self.source / "routes/test.json").unlink()
        with patch("urllib.request.urlopen", side_effect=AssertionError("外部API禁止")):
            restarted = Store(self.root / "local.sqlite3")
            restarted.import_base(self.source)
            self.assertEqual(restarted.route("test")["stations"], self.route["stations"])
            self.assertTrue(restarted.route("test")["storage"]["saved"])

    def test_failed_update_preserves_previous_database(self):
        self.catalog["dataRevision"] = "v2"
        (self.source / "catalog.json").write_text(json.dumps(self.catalog))
        (self.source / "routes/test.json").write_text('{"id":"wrong"}')
        with self.assertRaises(DataError):
            self.store.import_base(self.source)
        self.assertEqual(self.store.route("test")["id"], "test")
        self.assertEqual(self.store.catalog()["dataRevision"], "v1")

    def test_manual_restore_repairs_corrupted_record_with_same_row_count(self):
        with self.store.connect() as db:
            db.execute("UPDATE routes SET payload=?", ("broken",))
        self.store.import_base(self.source, force=True)
        self.assertEqual(self.store.route("test")["id"], "test")

    def test_odpt_is_disabled_and_does_not_require_credentials(self):
        with patch("urllib.request.urlopen", side_effect=AssertionError("外部API禁止")):
            with self.assertRaisesRegex(DataError, "無効"):
                OdptProvider().refresh(self.route)
