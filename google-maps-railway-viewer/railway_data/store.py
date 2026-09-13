"""永続保存できる自前の表示データをSQLiteで管理する。Googleの応答は保存しない。"""

import hashlib
import json
import sqlite3
from pathlib import Path
from typing import Any

from .n02 import DataError


class Store:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS routes (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS timetables (route_id TEXT PRIMARY KEY, payload TEXT NOT NULL);
            """)

    def connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path, timeout=30)

    def import_base(self, directory: Path, force: bool = False) -> None:
        raw = (directory / "catalog.json").read_bytes()
        catalog = json.loads(raw)
        if catalog.get("schemaVersion") != 3:
            raise DataError("表示データを npm run data:build で更新してください。")
        # 版の更新を確認する。既存DBが完全なら詳細JSONの再読込は不要。
        digest = hashlib.sha256(raw).hexdigest()
        with self.connect() as db:
            previous = db.execute("SELECT value FROM metadata WHERE key='base_digest'").fetchone()
            count = db.execute("SELECT COUNT(*) FROM routes").fetchone()[0]
            if not force and previous and previous[0] == digest and count == len(catalog["routes"]):
                return
        records = []
        for route in catalog["routes"]:
            payload = (directory / "routes" / f"{route['id']}.json").read_text()
            value = json.loads(payload)
            if (
                value.get("id") != route["id"]
                or not value.get("stations")
                or not value.get("geometry")
            ):
                raise DataError("駅・線路データが不完全です。既存DBは更新しません。")
            records.append((route["id"], payload))
        with self.connect() as db:
            db.execute("DELETE FROM routes")
            db.executemany("INSERT INTO routes VALUES (?, ?)", records)
            db.execute("INSERT OR REPLACE INTO metadata VALUES (?, ?)", ("catalog", raw.decode()))
            db.execute("INSERT OR REPLACE INTO metadata VALUES (?, ?)", ("base_digest", digest))

    def catalog(self) -> dict[str, Any]:
        with self.connect() as db:
            row = db.execute("SELECT value FROM metadata WHERE key='catalog'").fetchone()
        if row is None:
            raise DataError("路線一覧が未保存です。")
        return json.loads(row[0])

    def route(self, route_id: str) -> dict[str, Any]:
        with self.connect() as db:
            row = db.execute("SELECT payload FROM routes WHERE id=?", (route_id,)).fetchone()
        if row is None:
            raise DataError("この路線の保存データがありません。")
        value = json.loads(row[0])
        value["storage"] = {"provider": "local", "saved": True}
        return value

    def timetable(self, route_id: str) -> dict[str, Any] | None:
        with self.connect() as db:
            row = db.execute(
                "SELECT payload FROM timetables WHERE route_id=?", (route_id,)
            ).fetchone()
        return json.loads(row[0]) if row else None

    def save_timetable(self, route_id: str, timetable: dict[str, Any]) -> None:
        # 外部プロバイダの正規化後のデータ専用。任意のGoogle応答を受け入れない。
        from .timetable import validate_timetable

        validate_timetable(timetable, self.route(route_id))
        with self.connect() as db:
            db.execute(
                "INSERT OR REPLACE INTO timetables VALUES (?, ?)",
                (route_id, json.dumps(timetable, ensure_ascii=False)),
            )
