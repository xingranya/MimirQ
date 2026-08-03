from pathlib import Path


def test_magicpdf_pins_stringzilla_to_binary_wheel_release():
    requirements = (
        Path(__file__).resolve().parents[1] / "docker" / "magicpdf" / "requirements.txt"
    ).read_text(encoding="utf-8").splitlines()

    assert "stringzilla==4.6.1" in requirements


def test_magicpdf_supports_explicit_cpu_build_runtime():
    repository_root = Path(__file__).resolve().parents[1]
    dockerfile = (repository_root / "docker" / "magicpdf" / "Dockerfile").read_text(encoding="utf-8")
    compose = (repository_root / "docker" / "docker-compose.parsers.yml").read_text(encoding="utf-8")

    assert "ARG MAGIC_PDF_BASE_IMAGE=" in dockerfile
    assert "FROM ${MAGIC_PDF_BASE_IMAGE}" in dockerfile
    assert "ARG MAGIC_PDF_TORCH_INDEX_URL" in dockerfile
    assert "torch==2.6.0 torchvision==0.21.0" in dockerfile
    assert "MAGIC_PDF_BASE_IMAGE: ${MAGIC_PDF_BASE_IMAGE:-" in compose
    assert "MAGIC_PDF_TORCH_INDEX_URL: ${MAGIC_PDF_TORCH_INDEX_URL:-}" in compose
    assert "MAGIC_PDF_LAYOUTREADER_MODELS_DIR: ${MAGIC_PDF_LAYOUTREADER_MODELS_DIR:-" in compose
