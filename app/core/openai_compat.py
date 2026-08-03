"""
OpenAI-compatible URL normalization helpers.

Why:
- Different parts of the codebase (LangChain ChatOpenAI, OpenAIEmbeddings, direct http clients)
  expect slightly different base URL shapes.
- In practice users often paste full endpoints like ".../v1/chat/completions" or ".../v1/embeddings".

These helpers normalize URLs so we keep consistent, provider-compatible behavior.
"""

from ipaddress import ip_address
from urllib.parse import urlsplit

_STRIP_SUFFIXES = (
    "/chat/completions",
    "/completions",
    "/embeddings",
    "/responses",
)

_LOCAL_OPENAI_COMPAT_HOSTS = frozenset(
    {
        "localhost",
        "host.docker.internal",
        "ollama",
        "mimirq-ollama",
    }
)
_LOCAL_API_KEY_PLACEHOLDER = "local-endpoint-no-auth"  # noqa: S105


def normalize_openai_compatible_base_url(base_url: str | None) -> str:
    """
    Normalize an OpenAI-compatible base URL to a root (typically ending with "/v1").

    Examples:
      - "https://api.openai.com/v1/chat/completions" -> "https://api.openai.com/v1"
      - "http://localhost:8000/v1/embeddings" -> "http://localhost:8000/v1"
      - "https://dashscope.aliyuncs.com/compatible-mode/v1/" -> "https://dashscope.aliyuncs.com/compatible-mode/v1"
    """
    raw = str(base_url or "").strip()
    if not raw:
        return ""

    # Drop query/fragment to avoid accidental cache busting and odd client behavior.
    raw = raw.split("#", 1)[0].split("?", 1)[0].strip()

    # Normalize trailing slashes first.
    norm = raw.rstrip("/")

    # Strip known endpoint suffixes (best-effort).
    for suffix in _STRIP_SUFFIXES:
        if norm.endswith(suffix):
            norm = norm[: -len(suffix)].rstrip("/")
            break

    return norm


def is_local_openai_compatible_base_url(base_url: str | None) -> bool:
    """判断地址是否明确属于本机、私网或容器内部服务。"""
    try:
        hostname = str(urlsplit(str(base_url or "").strip()).hostname or "").strip().lower()
    except ValueError:
        return False
    if not hostname:
        return False
    if hostname in _LOCAL_OPENAI_COMPAT_HOSTS or hostname.endswith((".local", ".internal")):
        return True
    try:
        address = ip_address(hostname)
    except ValueError:
        # Docker Compose 服务名通常是无点的单标签主机名。
        return "." not in hostname
    return bool(address.is_loopback or address.is_private or address.is_link_local)


def resolve_openai_compatible_api_key(*, api_key: str | None, base_url: str | None) -> str:
    """保留显式密钥，仅为明确的本地免鉴权端点提供 SDK 占位值。"""
    resolved = str(api_key or "").strip()
    if resolved:
        return resolved
    if is_local_openai_compatible_base_url(base_url):
        return _LOCAL_API_KEY_PLACEHOLDER
    return ""


__all__ = [
    "is_local_openai_compatible_base_url",
    "normalize_openai_compatible_base_url",
    "resolve_openai_compatible_api_key",
]
