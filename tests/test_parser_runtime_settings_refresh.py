import threading

from app.api.v1 import settings as settings_api
from app.parsing import factory as parser_factory_module


def test_reset_parser_factory_replaces_cached_instance(monkeypatch) -> None:
    first = object()
    second = object()
    monkeypatch.setattr(parser_factory_module, "_PARSER_FACTORY", first)
    monkeypatch.setattr(parser_factory_module, "ParserFactory", lambda: second)

    parser_factory_module.reset_parser_factory()

    assert parser_factory_module.get_parser_factory() is second
    assert parser_factory_module.get_parser_factory() is second


def test_reset_and_get_parser_factory_are_thread_safe(monkeypatch) -> None:
    class FakeParserFactory:
        pass

    monkeypatch.setattr(parser_factory_module, "_PARSER_FACTORY", None)
    monkeypatch.setattr(parser_factory_module, "ParserFactory", FakeParserFactory)
    errors: list[Exception] = []

    def refresh_factory() -> None:
        try:
            for _ in range(20):
                parser_factory_module.reset_parser_factory()
                assert isinstance(parser_factory_module.get_parser_factory(), FakeParserFactory)
        except Exception as error:  # pragma: no cover - 仅在并发回归时记录
            errors.append(error)

    threads = [threading.Thread(target=refresh_factory) for _ in range(4)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=2)

    assert errors == []
    assert all(not thread.is_alive() for thread in threads)
    assert isinstance(parser_factory_module.get_parser_factory(), FakeParserFactory)


def test_textin_runtime_settings_apply_and_reset_parser_factory(monkeypatch) -> None:
    updated = {
        "TEXTIN_ENABLED": "true",
        "TEXTIN_API_URL": "https://textin.example.test/parse",
        "TEXTIN_APP_ID": "app-id",
        "TEXTIN_SECRET_CODE": "secret-code",
        "TEXTIN_TIMEOUT_SEC": "240",
        "TEXTIN_PARSE_MODE": "vlm",
        "TEXTIN_TABLE_FLAVOR": "markdown",
        "TEXTIN_APPLY_DOCUMENT_TREE": "false",
        "TEXTIN_MARKDOWN_DETAILS": "false",
        "TEXTIN_GET_IMAGE": "pages",
        "TEXTIN_DPI": "192",
        "TEXTIN_PAGE_COUNT": "8",
    }
    for key in updated:
        monkeypatch.setattr(settings_api.settings, key, None, raising=False)

    reset_calls: list[None] = []
    monkeypatch.setattr(
        parser_factory_module,
        "reset_parser_factory",
        lambda: reset_calls.append(None),
    )

    settings_api._apply_runtime_settings(updated, list(updated))

    assert settings_api.settings.TEXTIN_ENABLED is True
    assert settings_api.settings.TEXTIN_API_URL == "https://textin.example.test/parse"
    assert settings_api.settings.TEXTIN_APP_ID == "app-id"
    assert settings_api.settings.TEXTIN_SECRET_CODE == "secret-code"
    assert settings_api.settings.TEXTIN_TIMEOUT_SEC == 240
    assert settings_api.settings.TEXTIN_PARSE_MODE == "vlm"
    assert settings_api.settings.TEXTIN_TABLE_FLAVOR == "markdown"
    assert settings_api.settings.TEXTIN_APPLY_DOCUMENT_TREE is False
    assert settings_api.settings.TEXTIN_MARKDOWN_DETAILS is False
    assert settings_api.settings.TEXTIN_GET_IMAGE == "pages"
    assert settings_api.settings.TEXTIN_DPI == 192
    assert settings_api.settings.TEXTIN_PAGE_COUNT == 8
    assert reset_calls == [None]


def test_parser_config_change_discards_cached_factory(monkeypatch) -> None:
    cached_factory = object()
    monkeypatch.setattr(parser_factory_module, "_PARSER_FACTORY", cached_factory)
    monkeypatch.setattr(settings_api.settings, "MARKER_API_URL", "", raising=False)

    settings_api._apply_runtime_settings(
        {"MARKER_API_URL": "https://marker.example.test/convert"},
        ["MARKER_API_URL"],
    )

    assert settings_api.settings.MARKER_API_URL == "https://marker.example.test/convert"
    assert parser_factory_module._PARSER_FACTORY is None


def test_unrelated_runtime_change_keeps_cached_parser_factory(monkeypatch) -> None:
    cached_factory = object()
    monkeypatch.setattr(parser_factory_module, "_PARSER_FACTORY", cached_factory)
    monkeypatch.setattr(settings_api.settings, "UPLOAD_DEDUP_ENABLED", False, raising=False)

    settings_api._apply_runtime_settings(
        {"UPLOAD_DEDUP_ENABLED": "true"},
        ["UPLOAD_DEDUP_ENABLED"],
    )

    assert settings_api.settings.UPLOAD_DEDUP_ENABLED is True
    assert parser_factory_module._PARSER_FACTORY is cached_factory
