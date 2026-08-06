import asyncio
from pathlib import Path

import pytest
import yaml
from fastapi import HTTPException

from docker.magicpdf import server as magicpdf_server
from docker.qianfanocr import server as qianfanocr_server


class _Upload:
    def __init__(self, data: bytes) -> None:
        self.data = data
        self.offset = 0

    async def read(self, size: int = -1) -> bytes:
        if size < 0:
            size = len(self.data)
        chunk = self.data[self.offset : self.offset + size]
        self.offset += len(chunk)
        return chunk


@pytest.mark.parametrize("module", [magicpdf_server, qianfanocr_server])
def test_parser_uploads_have_a_hard_streamed_limit(module: object, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(module, "_MAX_UPLOAD_BYTES", 3)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(module._read_upload(_Upload(b"four")))

    assert exc_info.value.status_code == 413


def test_parser_host_ports_bind_to_loopback() -> None:
    compose = yaml.safe_load(Path("docker/docker-compose.parsers.yml").read_text(encoding="utf-8"))

    assert compose["services"]["mimirq-marker"]["ports"] == ["127.0.0.1:2080:2080"]
    assert compose["services"]["mimirq-magicpdf"]["ports"] == ["127.0.0.1:2095:2095"]
    assert compose["services"]["mimirq-qianfanocr"]["ports"] == ["127.0.0.1:2090:2090"]


def test_backend_services_bypass_proxy_for_compose_dependencies() -> None:
    compose = yaml.safe_load(Path("docker/docker-compose.yml").read_text(encoding="utf-8"))
    no_proxy = str(compose["x-backend-env"]["NO_PROXY"])

    for hostname in (
        "mimirq-redis",
        "mimirq-postgres",
        "mimirq-minio",
        "mimirq-milvus",
        "mimirq-magicpdf",
        "mimirq-mineru",
    ):
        assert hostname in no_proxy
    assert compose["x-backend-env"]["no_proxy"] == compose["x-backend-env"]["NO_PROXY"]


def test_gpu_parsers_use_compose_compatible_device_reservations() -> None:
    compose = yaml.safe_load(Path("docker/docker-compose.parsers.yml").read_text(encoding="utf-8"))
    gpu_services = (
        "mimirq-paddlevl",
        "mimirq-mineru",
        "mimirq-mineru-vlm",
        "mimirq-olmocr",
        "mimirq-magicpdf",
    )

    expected = [{"driver": "nvidia", "count": "all", "capabilities": ["gpu"]}]
    for service_name in gpu_services:
        service = compose["services"][service_name]
        assert "gpus" not in service
        assert service["deploy"]["resources"]["reservations"]["devices"] == expected
