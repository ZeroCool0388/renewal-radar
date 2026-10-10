"""Append-only JSONL audit log. Records status and arguments, never secret values."""

from __future__ import annotations

import json
import threading
from collections.abc import Iterable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from renewal_radar_mcp.guard import SECRET_VALUE_RE, SENSITIVE_KEYS

_MAX_STRING = 500


def _sensitive_key(key: object) -> bool:
    normalised = str(key).casefold().replace("-", "_").replace(" ", "_")
    return normalised in SENSITIVE_KEYS


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): "[redacted]" if _sensitive_key(key) else redact(item) for key, item in value.items()}
    if isinstance(value, list):
        return [redact(item) for item in value]
    if isinstance(value, str):
        cleaned = SECRET_VALUE_RE.sub("[redacted]", value)
        if len(cleaned) > _MAX_STRING:
            return cleaned[:_MAX_STRING] + "…"
        return cleaned
    if isinstance(value, bool) or value is None or isinstance(value, int | float):
        return value
    return str(value)


class AuditLog:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._lock = threading.Lock()

    def write(self, tool: str, args: dict[str, Any], status: str, hide: Iterable[str] = ()) -> None:
        safe_args = redact(args)
        encoded = json.dumps(safe_args, ensure_ascii=False, sort_keys=True)
        for secret in hide:
            if secret:
                encoded = encoded.replace(secret, "[redacted]")
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "tool": tool,
            "args": json.loads(encoded),
            "status": status,
        }
        line = json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n"
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._lock:
            with self.path.open("a", encoding="utf-8") as handle:
                handle.write(line)
