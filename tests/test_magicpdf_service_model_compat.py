import json
from pathlib import Path

import yaml

from docker.magicpdf import server


def _touch_model(models_dir: Path, relative_path: str) -> None:
    path = models_dir / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.touch()


def test_required_models_accept_current_official_detector_name(tmp_path: Path) -> None:
    _touch_model(tmp_path, "Layout/YOLO/doclayout_yolo_docstructbench_imgsz1280_2501.pt")
    _touch_model(tmp_path, "OCR/paddleocr_torch/Multilingual_PP-OCRv3_det_infer.pth")
    _touch_model(tmp_path, "OCR/paddleocr_torch/ch_PP-OCRv5_rec_infer.pth")

    assert server._has_required_models(tmp_path) is True


def test_chinese_ocr_config_uses_available_compatible_models(tmp_path: Path, monkeypatch) -> None:  # noqa: ANN001
    models_dir = tmp_path / "models"
    _touch_model(models_dir, "OCR/paddleocr_torch/Multilingual_PP-OCRv3_det_infer.pth")
    _touch_model(models_dir, "OCR/paddleocr_torch/ch_PP-OCRv5_rec_infer.pth")

    config_path = tmp_path / "models_config.yml"
    config_path.write_text(
        yaml.safe_dump(
            {
                "lang": {
                    "ch": {
                        "det": "ch_PP-OCRv3_det_infer.pth",
                        "rec": "ch_PP-OCRv4_rec_server_doc_infer.pth",
                        "dict": "ppocr_keys_v1.txt",
                    },
                    "ch_lite": {
                        "det": "ch_PP-OCRv3_det_infer.pth",
                        "rec": "ch_PP-OCRv5_rec_infer.pth",
                        "dict": "ppocrv5_dict.txt",
                    },
                }
            },
            sort_keys=False,
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(server, "_models_config_path", lambda: config_path)

    server._ensure_ch_doc_model_compat(models_dir)

    chinese_config = yaml.safe_load(config_path.read_text(encoding="utf-8"))["lang"]["ch"]
    assert chinese_config == {
        "det": "Multilingual_PP-OCRv3_det_infer.pth",
        "rec": "ch_PP-OCRv5_rec_infer.pth",
        "dict": "ppocrv5_dict.txt",
    }
    chinese_lite_config = yaml.safe_load(config_path.read_text(encoding="utf-8"))["lang"]["ch_lite"]
    assert chinese_lite_config == {
        "det": "Multilingual_PP-OCRv3_det_infer.pth",
        "rec": "ch_PP-OCRv5_rec_infer.pth",
        "dict": "ppocrv5_dict.txt",
    }


def test_layoutreader_resolver_accepts_huggingface_snapshot(tmp_path: Path) -> None:
    snapshot = (
        tmp_path
        / "huggingface"
        / "hub"
        / "models--hantian--layoutreader"
        / "snapshots"
        / "revision"
    )
    _touch_model(snapshot, "config.json")
    _touch_model(snapshot, "model.safetensors")

    assert server._resolve_layoutreader_models_dir(str(tmp_path)) == snapshot


def test_tools_config_uses_local_layoutreader_model(tmp_path: Path, monkeypatch) -> None:  # noqa: ANN001
    pdf_models_dir = tmp_path / "pdf-models"
    layoutreader_models_dir = tmp_path / "layoutreader"
    monkeypatch.setattr(server, "_resolve_models_dir", lambda _configured: pdf_models_dir)
    monkeypatch.setattr(
        server,
        "_resolve_layoutreader_models_dir",
        lambda _configured: layoutreader_models_dir,
    )
    monkeypatch.setattr(server, "_ensure_ch_doc_model_compat", lambda _models_dir: None)

    config_path = server._tools_config(tmp_path, device_mode="cpu")
    config = json.loads(config_path.read_text(encoding="utf-8"))

    assert config["models-dir"] == str(pdf_models_dir)
    assert config["layoutreader-model-dir"] == str(layoutreader_models_dir)
