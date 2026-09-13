import json
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from railway_data.journey import JourneyService
from railway_data.server import handler_for
from railway_data.store import Store
from tests.test_journey import route as fixture_route


class LocalApiTests(unittest.TestCase):
    def test_journey_api_returns_distance_and_reuses_persisted_network(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source"
            (source / "routes").mkdir(parents=True)
            a, c = [139.0, 35.0], [139.02, 35.0]
            route = fixture_route("test", [a, c], [("A", a), ("C", c)])
            (source / "catalog.json").write_text(
                json.dumps(
                    {
                        "schemaVersion": 3,
                        "dataRevision": "test-journey-v1",
                        "routes": [{"id": "test"}],
                    }
                )
            )
            (source / "routes/test.json").write_text(json.dumps(route))
            store = Store(root / "test.sqlite3")
            store.import_base(source)
            server = ThreadingHTTPServer(("127.0.0.1", 0), handler_for(store, source, "test-token"))
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            headers = {
                "X-Railway-Token": "test-token",
                "X-Railway-Request": "1",
                "Content-Type": "application/json",
            }
            query = {
                "stops": ["A", "C"],
                "start": "2026-09-14T00:00:00+09:00",
                "transferMinutes": 5,
                "services": {},
            }
            try:
                base = f"http://127.0.0.1:{server.server_port}/api/"
                with urlopen(Request(base + "stations", headers=headers), timeout=3) as response:
                    self.assertEqual([s["id"] for s in json.load(response)["stations"]], ["A", "C"])
                with self.assertRaises(HTTPError) as blocked:
                    urlopen(
                        Request(
                            base + "journeys",
                            data=json.dumps(query).encode(),
                            headers={"X-Railway-Token": "test-token"},
                        ),
                        timeout=3,
                    )
                self.assertEqual(blocked.exception.code, 403)
                with urlopen(
                    Request(base + "journeys", data=json.dumps(query).encode(), headers=headers),
                    timeout=3,
                ) as response:
                    result = json.load(response)
                    self.assertEqual(result["distance"]["status"], "available")
                    self.assertEqual(result["time"]["status"], "unavailable")
                with self.assertRaises(HTTPError) as invalid:
                    urlopen(Request(base + "journeys", data=b"[]", headers=headers), timeout=3)
                self.assertEqual(invalid.exception.code, 400)
                restarted = JourneyService(Store(root / "test.sqlite3"), root / "missing.zip")
                with patch(
                    "railway_data.journey.build_network", side_effect=AssertionError("再生成禁止")
                ):
                    self.assertEqual(restarted.search(query)["distance"], result["distance"])
            finally:
                server.shutdown()
                thread.join(timeout=3)
                server.server_close()

    def test_private_token_cross_origin_and_saved_route_round_trip(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source"
            (source / "routes").mkdir(parents=True)
            route = {"id": "test", "stations": [{"id": "a"}], "geometry": [{"id": "g"}]}
            (source / "catalog.json").write_text(
                json.dumps({"schemaVersion": 3, "routes": [{"id": "test"}]})
            )
            (source / "routes/test.json").write_text(json.dumps(route))
            store = Store(root / "test.sqlite3")
            store.import_base(source)
            server = ThreadingHTTPServer(("127.0.0.1", 0), handler_for(store, source, "test-token"))
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                url = f"http://127.0.0.1:{server.server_port}/api/routes/test"
                with self.assertRaises(HTTPError) as blocked:
                    urlopen(url, timeout=2)
                self.assertEqual(blocked.exception.code, 403)
                with self.assertRaises(HTTPError) as blocked:
                    urlopen(
                        Request(
                            url,
                            headers={
                                "X-Railway-Token": "test-token",
                                "Origin": "https://other.example",
                            },
                        ),
                        timeout=2,
                    )
                self.assertEqual(blocked.exception.code, 403)
                with urlopen(
                    Request(url, headers={"X-Railway-Token": "test-token"}), timeout=2
                ) as response:
                    self.assertEqual(json.load(response)["stations"], route["stations"])
                with store.connect() as db:
                    db.execute("UPDATE routes SET payload=?", ("broken",))
                with urlopen(
                    Request(
                        url + "/restore",
                        method="POST",
                        headers={"X-Railway-Token": "test-token", "X-Railway-Request": "1"},
                    ),
                    timeout=2,
                ) as response:
                    self.assertTrue(json.load(response)["storage"]["saved"])
            finally:
                server.shutdown()
                thread.join(timeout=3)
                server.server_close()
