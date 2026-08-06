
from urllib.parse import urlsplit, urlunsplit

DOCKER_LOCALHOST_FALLBACK = "127.0.0.1"
LOCALHOST_NAMES = {"127.0.0.1", "localhost"}


def is_direct_parser_service_url(raw_url: str, *, service_hostnames: set[str]) -> bool:
    """判断解析侧车地址是否应绕过系统代理。"""
    raw = (raw_url or "").strip()
    if not raw:
        return False
    try:
        hostname = (urlsplit(raw).hostname or "").strip().lower()
    except Exception:
        return False
    normalized_services = {name.strip().lower() for name in service_hostnames if name.strip()}
    return hostname in LOCALHOST_NAMES or hostname in normalized_services


def build_docker_service_url_candidates(raw_url: str, *, service_hostnames: set[str]) -> list[str]:
    """
    Build candidate URLs for parser sidecars.

    Parser sidecars have used two deployment shapes:
    - separate containers on the compose network, reachable by service hostname;
    - containers sharing the API network namespace, reachable by 127.0.0.1.

    Keep both candidates so an env file from one shape does not silently break
    the other during Docker rebuild/restart workflows.
    """
    raw = (raw_url or "").strip()
    if not raw:
        return []

    candidates: list[str] = [raw]
    try:
        parts = urlsplit(raw)
    except Exception:
        return candidates

    hostname = (parts.hostname or "").strip().lower()
    normalized_services = sorted({name.strip().lower() for name in service_hostnames if name.strip()})
    if not normalized_services:
        return candidates

    def _append_candidate(netloc_host: str) -> None:
        netloc = netloc_host
        if parts.port:
            netloc = f"{netloc}:{parts.port}"
        fallback = urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))
        if fallback and fallback not in candidates:
            candidates.append(fallback)

    if hostname in normalized_services:
        _append_candidate(DOCKER_LOCALHOST_FALLBACK)
    elif hostname in LOCALHOST_NAMES:
        for service in normalized_services:
            _append_candidate(service)
    return candidates
