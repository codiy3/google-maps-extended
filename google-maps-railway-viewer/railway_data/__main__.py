"""uv run --locked python -m railway_data --archive /path/to/N02-25_GML.zip"""

import argparse
import sys
from pathlib import Path

from .n02 import DataError, build_inventory, download_archive, read_archive, write_reports


def main() -> int:
    parser = argparse.ArgumentParser(
        description="公式N02の収録状況を検証し、全国の調査台帳を生成します。"
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--archive", type=Path, help="取得済みN02-25_GML.zipの保存先")
    source.add_argument("--download", action="store_true", help="公式ZIPを安全に取得・再利用する")
    parser.add_argument("--output", type=Path, default=Path("data/catalog"))
    args = parser.parse_args()
    try:
        archive = (
            download_archive(Path("data/raw/N02-25_GML.zip")) if args.download else args.archive
        )
        rail, station = read_archive(archive)
        inventory = build_inventory(rail, station)
        write_reports(inventory, args.output)
    except (DataError, OSError) as exc:
        print(f"データ調査に失敗しました: {exc}", file=sys.stderr)
        return 1
    counts = inventory["summary"]["counts"]
    print(f"元データの会社・路線の組み合わせ: {counts['source_operator_line_pairs']}件")
    print(f"駅の地物: {counts['station_features']}件、駅コード: {counts['source_station_codes']}件")
    print(f"要確認の組み合わせ: {len(inventory['summary']['routes_with_warnings'])}件")
    print(f"保存先: {args.output.resolve()}（全国対応の完了判定ではありません）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
