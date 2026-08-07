import errno

from app.api.v1 import settings as settings_api


def test_write_env_file_falls_back_for_docker_bind_mount(monkeypatch, tmp_path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("# 服务配置\nLLM_MODEL=old-model\n", encoding="utf-8")
    monkeypatch.setattr(settings_api, "ENV_FILE", env_file)

    def reject_atomic_replace(_source: str, _target: str) -> None:
        raise OSError(errno.EBUSY, "Device or resource busy")

    monkeypatch.setattr(settings_api.os, "replace", reject_atomic_replace)

    settings_api.write_env_file(
        {
            "LLM_MODEL": "gpt-5.5",
            "SELF_REGISTRATION_ENABLED": "true",
        }
    )

    assert env_file.read_text(encoding="utf-8") == (
        "# 服务配置\nLLM_MODEL=gpt-5.5\nSELF_REGISTRATION_ENABLED=true\n"
    )
    assert list(tmp_path.glob(".env.*.tmp")) == []
