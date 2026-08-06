from pathlib import Path

from app.parsing.parsers.magic_pdf_parser import MagicPDFParser
from app.parsing.parsers.service_url_fallback import is_direct_parser_service_url


class _Response:
    status_code = 200


class _RecordingSession:
    def __init__(self) -> None:
        self.urls: list[str] = []

    def post(self, url: str, **_kwargs):  # noqa: ANN003, ANN201
        self.urls.append(url)
        return _Response()


def test_docker_parser_service_url_bypasses_environment_proxy() -> None:
    assert is_direct_parser_service_url(
        "http://mimirq-magicpdf:2095/convert",
        service_hostnames={"mimirq-magicpdf"},
    )
    assert is_direct_parser_service_url(
        "http://127.0.0.1:2095/convert",
        service_hostnames={"mimirq-magicpdf"},
    )
    assert not is_direct_parser_service_url(
        "https://parser.example.com/convert",
        service_hostnames={"mimirq-magicpdf"},
    )


def test_magicpdf_uses_direct_session_for_compose_service(monkeypatch, tmp_path: Path) -> None:
    parser = MagicPDFParser()
    proxied = _RecordingSession()
    direct = _RecordingSession()
    parser._session = proxied
    parser._direct_session = direct
    parser._api_url = "http://mimirq-magicpdf:2095/convert"
    monkeypatch.setattr(parser, "_candidate_api_urls", lambda: [parser._api_url])

    file_path = tmp_path / "sample.pdf"
    file_path.write_bytes(b"%PDF-1.4\n")
    parser._post_service_multipart(file_path=file_path, document_id="doc-1")

    assert direct.urls == ["http://mimirq-magicpdf:2095/convert"]
    assert proxied.urls == []
