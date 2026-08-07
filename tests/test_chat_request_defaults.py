from app.api.schemas.chat import ChatRAGConfig
from app.core.config import settings


def test_chat_default_max_tokens_uses_runtime_setting(monkeypatch) -> None:  # noqa: ANN001
    monkeypatch.setattr(settings, "CHAT_DEFAULT_MAX_TOKENS", 512, raising=False)

    assert ChatRAGConfig().max_tokens == 512
    assert ChatRAGConfig(max_tokens=2048).max_tokens == 2048
