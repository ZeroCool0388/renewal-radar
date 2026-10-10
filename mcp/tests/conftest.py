from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest

from renewal_radar_mcp.service import RenewalService
from tests.support import FIXED_DAY, REPO_ROOT


@pytest.fixture
def service(tmp_path: Path) -> RenewalService:
    return RenewalService(
        repo_root=REPO_ROOT,
        audit_path=tmp_path / "audit.jsonl",
        annotations_path=tmp_path / "annotations.json",
        today=FIXED_DAY,
        clock=lambda: datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc),
    )
