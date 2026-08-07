from app.api.v1 import settings as settings_api
from app.core.config import settings


def test_apply_runtime_settings_updates_all_chat_model_routes(monkeypatch) -> None:
    monkeypatch.setattr(settings, "LLM_MODEL", "old-default", raising=False)
    monkeypatch.setattr(settings, "LLM_MODEL_FAST", "old-fast", raising=False)
    monkeypatch.setattr(settings, "LLM_MODEL_HEAVY", "old-heavy", raising=False)
    updated = {
        "LLM_MODEL": "gpt-5.5",
        "LLM_MODEL_FAST": "gpt-5.5",
        "LLM_MODEL_HEAVY": "gpt-5.5",
    }

    settings_api._apply_runtime_settings(updated, list(updated))

    assert settings.LLM_MODEL == "gpt-5.5"
    assert settings.LLM_MODEL_FAST == "gpt-5.5"
    assert settings.LLM_MODEL_HEAVY == "gpt-5.5"
