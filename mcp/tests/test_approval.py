from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone


def test_write_requires_a_matching_token_and_confirm(service) -> None:
    denied = service.add_note("orbit-hris", "Review the notice window.", "", True)
    assert denied["status"] == "refused"
    assert denied["reason"] == "approval_required"
    unconfirmed = service.add_note("orbit-hris", "Review the notice window.", "", False)
    assert unconfirmed["reason"] == "confirm_required"
    assert not service.annotations_path.exists()

    pending = service.request_write_approval(
        tool="add_note",
        slug="orbit-hris",
        note="Review the notice window.",
    )
    assert pending["status"] == "pending"
    assert not service.annotations_path.exists()

    held = service.add_note("orbit-hris", "Review the notice window.", pending["approval_token"], False)
    assert held["reason"] == "confirm_required"
    assert not service.annotations_path.exists()

    saved = service.add_note("orbit-hris", "Review the notice window.", pending["approval_token"], True)
    assert saved["status"] == "ok"
    assert saved["wrote"] == "demo_annotations"
    stored = json.loads(service.annotations_path.read_text(encoding="utf-8"))
    assert stored["notes"] == [
        {
            "slug": "orbit-hris",
            "text": "Review the notice window.",
            "created_at": "2026-10-10T12:00:00+00:00",
        }
    ]
    assert stored["flags"] == []

    replay = service.add_note("orbit-hris", "Review the notice window.", pending["approval_token"], True)
    assert replay["reason"] == "approval_replayed"
    assert len(json.loads(service.annotations_path.read_text(encoding="utf-8"))["notes"]) == 1


def test_flag_uses_its_own_approval(service) -> None:
    pending = service.request_write_approval(
        tool="flag_contract",
        slug="sterling-fintech",
        flagged=True,
        reason="Notice deadline has passed.",
    )
    wrong_tool = service.add_note(
        "sterling-fintech",
        "Notice deadline has passed.",
        pending["approval_token"],
        True,
    )
    assert wrong_tool["reason"] == "approval_mismatch"
    saved = service.flag_contract(
        "sterling-fintech",
        True,
        "Notice deadline has passed.",
        pending["approval_token"],
        True,
    )
    assert saved["status"] == "ok"
    detail = service.get_contract("sterling-fintech")
    assert detail["demo_flag"]["flagged"] is True
    assert detail["demo_flag"]["reason"] == "Notice deadline has passed."


def test_changed_note_does_not_match_the_token(service) -> None:
    pending = service.request_write_approval(tool="add_note", slug="apex-biolabs", note="First wording.")
    changed = service.add_note("apex-biolabs", "Second wording.", pending["approval_token"], True)
    assert changed["reason"] == "approval_mismatch"
    assert not service.annotations_path.exists()


def test_expired_token_does_not_write(service) -> None:
    now = {"at": datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc)}
    service._clock = lambda: now["at"]
    service.approvals._clock = service._clock
    pending = service.request_write_approval(tool="add_note", slug="apex-biolabs", note="Still pending.")
    now["at"] = now["at"] + timedelta(minutes=10)
    expired = service.add_note("apex-biolabs", "Still pending.", pending["approval_token"], True)
    assert expired["reason"] == "approval_expired"
    assert not service.annotations_path.exists()


def test_approval_is_not_issued_for_a_read_or_unknown_target(service) -> None:
    read_tool = service.request_write_approval(tool="list_contracts", slug="orbit-hris", note="No.")
    assert read_tool["reason"] == "unsupported_tool"
    missing = service.request_write_approval(tool="add_note", slug="not-real", note="No.")
    assert missing["reason"] == "unknown_contract"
    assert "approval_token" not in read_tool
    assert "approval_token" not in missing
