"""Viteからのみ利用する、ローカルSQLiteのAPI。外部APIを自動では呼ばない。"""

import json
import os
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit

from .n02 import DataError
from .store import Store
from .timetable import durations


def handler_for(store: Store, directory: Path, token: str) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: Any) -> None:
            pass  # キー・検索条件をアクセスログへ残さない。

        def send_json(self, value: Any, status: int = 200) -> None:
            encoded = json.dumps(value, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def handle_request(self, post: bool = False) -> None:
            if self.headers.get("X-Railway-Token") != token:
                self.send_json({"message": "このアクセスは許可されていません。"}, 403)
                return
            origin = self.headers.get("Origin")
            if origin and origin not in ("http://127.0.0.1:5173", "http://localhost:5173"):
                self.send_json({"message": "別サイトからのアクセスは許可されていません。"}, 403)
                return
            path = urlsplit(self.path)
            parts = path.path.strip("/").split("/")
            query = parse_qs(path.query)
            try:
                if parts == ["api", "catalog"] and not post:
                    self.send_json(store.catalog())
                    return
                if len(parts) not in (3, 4) or parts[:2] != ["api", "routes"]:
                    self.send_json({"message": "APIが見つかりません。"}, 404)
                    return
                route_id = parts[2]
                # パスはファイル名に変換せず、台帳内のIDだけ許可する。
                if route_id not in {r["id"] for r in store.catalog()["routes"]}:
                    self.send_json({"message": "路線が見つかりません。"}, 404)
                    return
                if post:
                    if parts[-1] != "restore" or self.headers.get("X-Railway-Request") != "1":
                        self.send_json({"message": "この操作は許可されていません。"}, 403)
                        return
                    # 読み込み失敗時は取得済み原典から検証してDBへ戻す。外部APIは呼ばない。
                    store.import_base(directory, force=True)
                    self.send_json(store.route(route_id))
                    return
                route = store.route(route_id)
                if len(parts) == 4 and parts[3] == "durations":
                    result = durations(
                        route,
                        store.timetable(route_id),
                        query["origin"][0],
                        datetime.fromisoformat(query["start"][0]),
                        datetime.fromisoformat(query["end"][0]),
                        query.get("service", []),
                    )
                    self.send_json(result)
                elif len(parts) == 3:
                    self.send_json(route)
                else:
                    self.send_json({"message": "APIが見つかりません。"}, 404)
            except (DataError, ValueError, KeyError, TypeError) as exc:
                self.send_json(
                    {
                        "message": str(exc)
                        if isinstance(exc, DataError)
                        else "入力・データの形式を確認できません。"
                    },
                    400,
                )
            except Exception:
                self.send_json(
                    {
                        "message": "保存データを読み込めません。ローカルの元データから再試行できます。"
                    },
                    500,
                )

        def do_GET(self) -> None:
            self.handle_request()

        def do_POST(self) -> None:
            self.handle_request(post=True)

    return Handler


def main() -> None:
    directory = Path("public/data")
    store = Store(Path("data/local/railway.sqlite3"))
    store.import_base(directory)
    token = os.environ.get("RAILWAY_API_TOKEN")
    if not token:
        raise SystemExit("npm run devから起動してください。")
    with ThreadingHTTPServer(("127.0.0.1", 0), handler_for(store, directory, token)) as server:
        print(f"RAILWAY_API_PORT={server.server_port}", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
