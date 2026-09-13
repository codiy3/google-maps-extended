"""将来の公開データAPIを、画面やDBを変えずに追加するための境界。"""

from typing import Any, Protocol

from .n02 import DataError


class RailwayProvider(Protocol):
    """各実装でライセンス・保存期限・更新頻度を検証し、共通形式へ変換する。"""

    name: str

    def refresh(self, route: dict[str, Any]) -> dict[str, Any]: ...


class OdptProvider:
    name = "odpt"
    enabled = False

    def refresh(self, route: dict[str, Any]) -> dict[str, Any]:
        # ユーザーの希望で登録・キー・API通信を一切前提にしない。
        # 将来の導入時に駅ID対応、運転日、利用規約、失効時の扱いを実装する。
        raise DataError("ODPTは無効です。現在の起動・検索には必要ありません。")


PROVIDERS: dict[str, RailwayProvider] = {}
