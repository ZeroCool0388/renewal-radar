"""One-time approval tokens bound to a single write payload."""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

TOKEN_TTL = timedelta(minutes=10)
WRITE_TOOLS = frozenset({"add_note", "flag_contract"})


def canonical_payload(tool: str, slug: str, note: str = "", flagged: bool = False, reason: str = "") -> dict[str, Any]:
    if tool == "add_note":
        return {"note": note, "slug": slug, "tool": tool}
    if tool == "flag_contract":
        return {"flagged": flagged, "reason": reason, "slug": slug, "tool": tool}
    raise ValueError("unsupported write tool")


def payload_hash(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


@dataclass
class _Pending:
    tool: str
    payload_hash: str
    expires_at: datetime
    used: bool = False


class ApprovalStore:
    def __init__(self, clock: Callable[[], datetime]) -> None:
        self._clock = clock
        self._pending: dict[str, _Pending] = {}

    def issue(self, tool: str, payload: dict[str, Any]) -> tuple[str, datetime]:
        token = secrets.token_urlsafe(32)
        expires_at = self._clock() + TOKEN_TTL
        self._pending[token] = _Pending(tool=tool, payload_hash=payload_hash(payload), expires_at=expires_at)
        return token, expires_at

    def consume(self, tool: str, payload: dict[str, Any], token: object) -> str | None:
        """Return a refusal code, or None after the token is spent."""
        if not isinstance(token, str) or token.strip() == "":
            return "approval_required"
        pending = self._pending.get(token)
        if pending is None:
            return "approval_required"
        if pending.used:
            return "approval_replayed"
        if self._clock() >= pending.expires_at:
            return "approval_expired"
        digest = payload_hash(payload)
        if pending.tool != tool or not hmac.compare_digest(pending.payload_hash, digest):
            return "approval_mismatch"
        pending.used = True
        return None

    def live_tokens(self) -> list[str]:
        return [token for token, pending in self._pending.items() if not pending.used]
