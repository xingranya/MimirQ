from app.core.openai_compat import (
    is_local_openai_compatible_base_url,
    resolve_openai_compatible_api_key,
)


def test_local_openai_compatible_hosts_can_use_sdk_placeholder() -> None:
    for base_url in (
        "http://localhost:11434/v1",
        "http://127.0.0.1:11434/v1",
        "http://192.168.1.20:11434/v1",
        "http://host.docker.internal:11434/v1",
        "http://mimirq-ollama:11434/v1",
    ):
        assert is_local_openai_compatible_base_url(base_url) is True
        assert resolve_openai_compatible_api_key(api_key="", base_url=base_url) == "local-endpoint-no-auth"


def test_public_openai_compatible_host_still_requires_explicit_key() -> None:
    base_url = "https://api.openai.com/v1"

    assert is_local_openai_compatible_base_url(base_url) is False
    assert resolve_openai_compatible_api_key(api_key="", base_url=base_url) == ""
    assert resolve_openai_compatible_api_key(api_key="real-key", base_url=base_url) == "real-key"
