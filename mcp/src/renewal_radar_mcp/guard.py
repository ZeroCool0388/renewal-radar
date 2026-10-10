"""Input checks. Tool arguments and document text are data, never instructions."""

from __future__ import annotations

import re

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
CONTRACT_FILE_RE = re.compile(r"^data/contracts/[A-Za-z0-9][A-Za-z0-9._-]*\.(md|txt)$")

INJECTION_RE = re.compile(
    r"(?i)("
    r"ignore (all |any )?(previous|prior|above|earlier) (instructions|prompts|rules)|"
    r"disregard (the |all |any )?(rules|policy|approval|instructions)|"
    r"bypass (the )?(approval|policy|audit)|"
    r"without (an )?approval|"
    r"disable (the )?(audit|logging|approval)|"
    r"you are now |"
    r"system prompt|"
    r"developer message|"
    r"do not follow the (rules|policy)"
    r")"
)

SECRET_RE = re.compile(
    r"(?i)("
    r"openai[_ -]?api[_ -]?key|anthropic[_ -]?api[_ -]?key|llm[_ -]?provider|"
    r"\bsk-[a-z0-9]|"
    r"\.env\b|"
    r"(reveal|print|dump|show|leak|exfiltrat\w*|send|give|read|cat).{0,48}"
    r"(api[_ -]?key|secret|password|credential|access[_ -]?token|\.env)|"
    r"(api[_ -]?key|secret|password|credential).{0,32}(reveal|print|dump|env)"
    r")"
)

SECRET_VALUE_RE = re.compile(
    r"(?i)("
    r"sk-[a-z0-9_\-]{8,}|"
    r"bearer\s+[a-z0-9._\-]{8,}|"
    r"(api[_ -]?key|secret|password|authorization)\s*[:=]\s*\S+"
    r")"
)

SENSITIVE_KEYS = {
    "approval_token",
    "access_token",
    "anthropic_api_key",
    "api_key",
    "apikey",
    "authorization",
    "credential",
    "credentials",
    "openai_api_key",
    "password",
    "secret",
    "token",
}


def identifier_refusal(value: object) -> str | None:
    """Return a refusal code for a contract slug, or None when the shape is safe."""
    if not isinstance(value, str):
        return "invalid_argument"
    if "\x00" in value or ".." in value or "/" in value or "\\" in value or "%" in value or value.startswith("."):
        return "path_traversal"
    if value != value.strip() or len(value) > 80 or not SLUG_RE.fullmatch(value):
        return "invalid_argument"
    return None


def contract_file_refusal(relative: object) -> str | None:
    if not isinstance(relative, str) or not CONTRACT_FILE_RE.fullmatch(relative):
        return "path_traversal"
    if ".." in relative or "\\" in relative or "%" in relative or "\x00" in relative:
        return "path_traversal"
    return None


def question_refusal(text: str) -> str | None:
    if INJECTION_RE.search(text):
        return "instruction_override"
    if SECRET_RE.search(text):
        return "secret_request"
    return None


def search_refusal(text: str) -> str | None:
    if "\x00" in text or ".." in text or "\\" in text or text.startswith("/") or ".env" in text.casefold():
        return "path_traversal"
    if SECRET_RE.search(text):
        return "secret_request"
    return None
