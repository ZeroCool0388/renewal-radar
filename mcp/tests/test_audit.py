from __future__ import annotations

import json
from pathlib import Path


def _lines(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def test_every_call_is_logged_with_status_and_without_the_token(service) -> None:
    service.list_contracts()
    pending = service.request_write_approval(tool="add_note", slug="orbit-hris", note="Logged note.")
    service.add_note("orbit-hris", "Logged note.", pending["approval_token"], True)
    rows = _lines(service.audit.path)
    assert [row["tool"] for row in rows] == ["list_contracts", "request_write_approval", "add_note"]
    assert [row["status"] for row in rows] == ["ok", "pending", "ok"]
    for row in rows:
        assert set(row) == {"timestamp", "tool", "args", "status"}
        assert row["timestamp"].startswith("20")
        blob = json.dumps(row)
        assert pending["approval_token"] not in blob
        assert "approval_token" not in row["args"] or row["args"]["approval_token"] == "[redacted]"
    assert rows[2]["args"]["approval_token"] == "[redacted]"
    assert rows[2]["args"]["note"] == "Logged note."


def test_secret_shaped_arguments_are_redacted(service) -> None:
    service.add_note(
        "orbit-hris",
        "api_key=sk-live-secret-value password=hunter2",
        "not-a-token",
        True,
    )
    row = _lines(service.audit.path)[-1]
    blob = json.dumps(row)
    assert "sk-live-secret-value" not in blob
    assert "hunter2" not in blob
    assert "[redacted]" in blob
    assert row["status"] == "refused"


def test_server_modules_do_not_call_models_or_the_network() -> None:
    root = Path(__file__).resolve().parents[1] / "src" / "renewal_radar_mcp"
    forbidden = (
        "import urllib",
        "import httpx",
        "import requests",
        "import socket",
        "import openai",
        "import anthropic",
        "subprocess",
        "os.system",
        "eval(",
        "exec(",
        "streamable-http",
        "run_sse",
    )
    for path in root.glob("*.py"):
        source = path.read_text(encoding="utf-8")
        for snippet in forbidden:
            assert snippet not in source, f"{path.name} contains {snippet}"
    server = (root / "server.py").read_text(encoding="utf-8")
    assert 'transport="stdio"' in server
