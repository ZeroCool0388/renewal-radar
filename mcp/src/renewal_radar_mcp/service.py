"""Tool implementations. Reads are the default. Writes need a matching approval token."""

from __future__ import annotations

import json
import os
import re
from collections.abc import Callable
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from renewal_radar_mcp.approval import WRITE_TOOLS, ApprovalStore, canonical_payload
from renewal_radar_mcp.audit import AuditLog
from renewal_radar_mcp.corpus import Contract, CorpusError, load_corpus, load_fixtures, normalise_text, quote_in_text
from renewal_radar_mcp.dates import resolve_relative_dates
from renewal_radar_mcp.guard import identifier_refusal, question_refusal, search_refusal

_ENV_ROOT = "RENEWAL_RADAR_ROOT"
_ENV_AUDIT = "RENEWAL_RADAR_AUDIT_LOG"
_ENV_ANNOTATIONS = "RENEWAL_RADAR_ANNOTATIONS"
_ALLOWED_ENV = frozenset({_ENV_ROOT, _ENV_AUDIT, _ENV_ANNOTATIONS})

_HEADING = re.compile(r"^##\s+(.+)$", re.MULTILINE)
_MAX_NOTE = 2000
_MAX_REASON = 500
_MAX_QUERY = 200
_MAX_QUESTION = 1000
_MAX_WITHIN_DAYS = 3650
_MAX_SEARCH_RESULTS = 25

_MESSAGES = {
    "approval_required": "This write needs a one-time approval token from request_write_approval.",
    "approval_replayed": "That approval token was already used.",
    "approval_expired": "That approval token has expired.",
    "approval_mismatch": "That approval token does not match this write.",
    "confirm_required": "Set confirm to true to run this approved write.",
    "instruction_override": "Instructions inside the question are not followed.",
    "secret_request": "Secrets and credentials are not available.",
    "path_traversal": "That path is outside the synthetic agreements.",
    "invalid_argument": "The arguments are not valid for this tool.",
    "unknown_contract": "That agreement is not in the synthetic corpus.",
    "unsupported_tool": "That tool does not accept writes.",
}


def refused(reason: str, message: str | None = None) -> dict[str, Any]:
    return {"status": "refused", "reason": reason, "message": message or _MESSAGES.get(reason, reason)}


def _env_path(name: str) -> Path | None:
    if name not in _ALLOWED_ENV:
        return None
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return None
    return Path(raw)


class RenewalService:
    def __init__(
        self,
        repo_root: Path,
        audit_path: Path,
        annotations_path: Path,
        today: date | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.repo_root = repo_root.resolve()
        self.today = today or date.today()
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self.audit = AuditLog(audit_path)
        self.annotations_path = annotations_path.resolve()
        self.approvals = ApprovalStore(self._clock)
        self._guard_output_paths()
        self.contracts = load_corpus(self.repo_root, self.today)
        self.fixtures = load_fixtures(self.repo_root)
        self._by_slug = {contract.slug: contract for contract in self.contracts}

    @classmethod
    def from_environment(cls) -> RenewalService:
        from renewal_radar_mcp.corpus import find_repo_root

        root = _env_path(_ENV_ROOT) or find_repo_root(Path(__file__))
        audit_path = _env_path(_ENV_AUDIT) or (root / "mcp" / "var" / "audit.jsonl")
        annotations_path = _env_path(_ENV_ANNOTATIONS) or (root / "mcp" / "var" / "annotations.json")
        return cls(root, audit_path, annotations_path)

    def _guard_output_paths(self) -> None:
        data_dir = (self.repo_root / "data").resolve()
        for path in (self.annotations_path, self.audit.path):
            if path.name.startswith(".env") or path.is_relative_to(data_dir):
                raise CorpusError("audit and demo files must stay outside the synthetic data directory")

    def _run(self, tool: str, args: dict[str, Any], fn: Callable[[], dict[str, Any]]) -> dict[str, Any]:
        try:
            result = fn()
            status = result.get("status") if isinstance(result, dict) else "error"
            if status not in {"ok", "refused", "error", "pending"}:
                status = "error"
                result = {"status": "error", "reason": "tool_failed", "message": "The tool failed."}
        except CorpusError:
            status = "error"
            result = {"status": "error", "reason": "corpus_error", "message": "The synthetic corpus could not be used."}
        except Exception:
            status = "error"
            result = {"status": "error", "reason": "tool_failed", "message": "The tool failed."}
        self.audit.write(tool, args, status, hide=self.approvals.live_tokens())
        return result

    def list_contracts(self) -> dict[str, Any]:
        return self._run("list_contracts", {}, self._list_contracts)

    def get_contract(self, slug: str, include_text: bool = False) -> dict[str, Any]:
        return self._run("get_contract", {"slug": slug, "include_text": include_text}, lambda: self._get_contract(slug, include_text))

    def upcoming_deadlines(self, within_days: int) -> dict[str, Any]:
        return self._run("upcoming_deadlines", {"within_days": within_days}, lambda: self._upcoming_deadlines(within_days))

    def search_clauses(self, query: str, limit: int = 10) -> dict[str, Any]:
        return self._run("search_clauses", {"query": query, "limit": limit}, lambda: self._search_clauses(query, limit))

    def answer_question(self, question: str) -> dict[str, Any]:
        return self._run("answer_question", {"question": question}, lambda: self._answer_question(question))

    def request_write_approval(
        self,
        tool: str,
        slug: str,
        note: str = "",
        flagged: bool = False,
        reason: str = "",
    ) -> dict[str, Any]:
        args = {"tool": tool, "slug": slug, "note": note, "flagged": flagged, "reason": reason}
        return self._run("request_write_approval", args, lambda: self._request_write_approval(tool, slug, note, flagged, reason))

    def add_note(self, slug: str, note: str, approval_token: str, confirm: bool) -> dict[str, Any]:
        args = {"slug": slug, "note": note, "approval_token": approval_token, "confirm": confirm}
        return self._run("add_note", args, lambda: self._add_note(slug, note, approval_token, confirm))

    def flag_contract(self, slug: str, flagged: bool, reason: str, approval_token: str, confirm: bool) -> dict[str, Any]:
        args = {
            "slug": slug,
            "flagged": flagged,
            "reason": reason,
            "approval_token": approval_token,
            "confirm": confirm,
        }
        return self._run("flag_contract", args, lambda: self._flag_contract(slug, flagged, reason, approval_token, confirm))

    def _list_contracts(self) -> dict[str, Any]:
        return {
            "status": "ok",
            "as_of": self.today.isoformat(),
            "synthetic": True,
            "contracts": [self._summary(contract) for contract in self.contracts],
        }

    def _summary(self, contract: Contract) -> dict[str, Any]:
        return {
            "slug": contract.slug,
            "supplier": contract.supplier,
            "category": contract.category,
            "annual_value_gbp": contract.annual_value_gbp,
            "sector_tags": contract.sector_tags,
            "end_date": contract.extraction.get("endDate"),
            "auto_renew": contract.extraction.get("autoRenew"),
            "notice_period_days": contract.extraction.get("noticePeriodDays"),
            **contract.deadline,
        }

    def _known(self, slug: object) -> tuple[Contract | None, dict[str, Any] | None]:
        code = identifier_refusal(slug)
        if code:
            return None, refused(code)
        contract = self._by_slug.get(str(slug))
        if contract is None:
            return None, refused("unknown_contract")
        return contract, None

    def _get_contract(self, slug: str, include_text: bool) -> dict[str, Any]:
        if not isinstance(include_text, bool):
            return refused("invalid_argument", "include_text must be a boolean.")
        contract, error = self._known(slug)
        if error or contract is None:
            return error or refused("unknown_contract")
        annotations = self._annotations_for(contract.slug)
        payload: dict[str, Any] = {
            "status": "ok",
            "as_of": self.today.isoformat(),
            "synthetic": True,
            "content_role": "data",
            **self._summary(contract),
            "extraction": contract.extraction,
            "demo_notes": annotations["notes"],
            "demo_flag": annotations["flag"],
        }
        if include_text:
            payload["text"] = contract.text
        return payload

    def _upcoming_deadlines(self, within_days: int) -> dict[str, Any]:
        if isinstance(within_days, bool) or not isinstance(within_days, int):
            return refused("invalid_argument", "within_days must be an integer.")
        if within_days < 0 or within_days > _MAX_WITHIN_DAYS:
            return refused("invalid_argument", "within_days must be between 0 and 3650.")
        renewals: list[dict[str, Any]] = []
        notices: list[dict[str, Any]] = []
        for contract in self.contracts:
            summary = self._summary(contract)
            days_to_renew = contract.deadline["days_to_renew"]
            days_to_notice = contract.deadline["days_to_notice"]
            if isinstance(days_to_renew, int) and 0 <= days_to_renew <= within_days:
                renewals.append(summary)
            if isinstance(days_to_notice, int) and 0 <= days_to_notice <= within_days:
                notices.append(summary)
        return {
            "status": "ok",
            "as_of": self.today.isoformat(),
            "within_days": within_days,
            "renewals": renewals,
            "notice_deadlines": notices,
        }

    def _search_clauses(self, query: str, limit: int) -> dict[str, Any]:
        if not isinstance(query, str):
            return refused("invalid_argument", "query must be a string.")
        cleaned = query.strip()
        if not cleaned or len(cleaned) > _MAX_QUERY:
            return refused("invalid_argument", "query must be 1 to 200 characters.")
        refusal = search_refusal(cleaned)
        if refusal:
            return refused(refusal)
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= _MAX_SEARCH_RESULTS:
            return refused("invalid_argument", "limit must be an integer from 1 to 25.")
        needle = cleaned.casefold()
        matches: list[dict[str, Any]] = []
        for contract in self.contracts:
            for heading, body in _clauses(contract.text):
                index = body.casefold().find(needle)
                if index < 0:
                    continue
                matches.append(
                    {
                        "slug": contract.slug,
                        "supplier": contract.supplier,
                        "heading": heading,
                        "snippet": _snippet(body, index, len(cleaned)),
                        "content_role": "data",
                    }
                )
                if len(matches) >= limit:
                    break
            if len(matches) >= limit:
                break
        return {
            "status": "ok",
            "query": cleaned,
            "treated_as_data": True,
            "message": "Query text is searched as data and is not an instruction.",
            "matches": matches,
        }

    def _answer_question(self, question: str) -> dict[str, Any]:
        if not isinstance(question, str):
            return refused("invalid_argument", "question must be a string.")
        cleaned = " ".join(question.split())
        if not cleaned or len(cleaned) > _MAX_QUESTION:
            return refused("invalid_argument", "question must be 1 to 1000 characters.")
        refusal = question_refusal(cleaned)
        if refusal:
            return refused(refusal)
        key = _fixture_key(self.fixtures, cleaned)
        if key is None:
            return {
                "status": "ok",
                "matched": False,
                "as_of": self.today.isoformat(),
                "summary": "No fixture covers that question. Ask one of the supported questions.",
                "available_questions": list(self.fixtures),
                "matches": [],
            }
        fixture = self.fixtures[key]
        if not isinstance(fixture, dict):
            return {"status": "error", "reason": "corpus_error", "message": "The question fixture is invalid."}
        matches: list[dict[str, Any]] = []
        for example in fixture.get("exampleMatches") or []:
            if not isinstance(example, dict):
                continue
            contract = self._by_slug.get(str(example.get("contractId")))
            if contract is None:
                continue
            citations = []
            for citation in example.get("citations") or []:
                if not isinstance(citation, dict) or not isinstance(citation.get("quote"), str):
                    continue
                quote = resolve_relative_dates(citation["quote"], self.today)
                if not quote_in_text(quote, contract.text):
                    continue
                citations.append(
                    {
                        "field": citation.get("field"),
                        "quote": quote,
                        "location": citation.get("location"),
                    }
                )
            if citations:
                matches.append(
                    {
                        "contract_id": contract.slug,
                        "supplier": contract.supplier,
                        "reason": example.get("reason"),
                        "citations": citations,
                    }
                )
        summary = fixture.get("summary") if matches else (
            "Some answer evidence could not be verified. Only verified source matches are shown."
        )
        return {
            "status": "ok",
            "matched": bool(matches),
            "as_of": self.today.isoformat(),
            "question": key,
            "intent": fixture.get("intent"),
            "summary": summary,
            "matches": matches,
            "caveat": "Synthetic demo data. Confirm notice delivery and commercial decisions before acting.",
        }

    def _request_write_approval(
        self,
        tool: str,
        slug: str,
        note: str,
        flagged: bool,
        reason: str,
    ) -> dict[str, Any]:
        if tool not in WRITE_TOOLS:
            return refused("unsupported_tool", "Approval is only issued for add_note or flag_contract.")
        payload, error = self._write_payload(tool, slug, note, flagged, reason)
        if error or payload is None:
            return error or refused("invalid_argument")
        token, expires_at = self.approvals.issue(tool, payload)
        return {
            "status": "pending",
            "tool": tool,
            "slug": payload["slug"],
            "approval_token": token,
            "expires_at": expires_at.isoformat(),
            "message": (
                f"Approval is pending for {tool} on {payload['slug']}. "
                "Call that tool again with this token and confirm set to true. "
                "The write is limited to the local demo annotations file."
            ),
        }

    def _add_note(self, slug: str, note: str, approval_token: str, confirm: bool) -> dict[str, Any]:
        payload, error = self._write_payload("add_note", slug, note, False, "")
        if error or payload is None:
            return error or refused("invalid_argument")
        gate = self._consume_write("add_note", payload, approval_token, confirm)
        if gate:
            return gate
        data = self._load_annotations()
        data["notes"].append(
            {"slug": payload["slug"], "text": payload["note"], "created_at": self._clock().isoformat()}
        )
        self._save_annotations(data)
        return {
            "status": "ok",
            "wrote": "demo_annotations",
            "slug": payload["slug"],
            "message": "The note was appended to the local demo annotations file.",
        }

    def _flag_contract(
        self,
        slug: str,
        flagged: bool,
        reason: str,
        approval_token: str,
        confirm: bool,
    ) -> dict[str, Any]:
        payload, error = self._write_payload("flag_contract", slug, "", flagged, reason)
        if error or payload is None:
            return error or refused("invalid_argument")
        gate = self._consume_write("flag_contract", payload, approval_token, confirm)
        if gate:
            return gate
        data = self._load_annotations()
        data["flags"] = [item for item in data["flags"] if item.get("slug") != payload["slug"]]
        data["flags"].append(
            {
                "slug": payload["slug"],
                "flagged": payload["flagged"],
                "reason": payload["reason"],
                "created_at": self._clock().isoformat(),
            }
        )
        self._save_annotations(data)
        return {
            "status": "ok",
            "wrote": "demo_annotations",
            "slug": payload["slug"],
            "flagged": payload["flagged"],
            "message": "The flag was stored in the local demo annotations file.",
        }

    def _write_payload(
        self,
        tool: str,
        slug: object,
        note: object,
        flagged: object,
        reason: object,
    ) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
        _, error = self._known(slug)
        if error:
            return None, error
        if tool == "add_note":
            cleaned, note_error = _bounded_text(note, _MAX_NOTE, "note")
            if note_error or cleaned is None:
                return None, note_error
            return canonical_payload(tool, str(slug), note=cleaned), None
        if not isinstance(flagged, bool):
            return None, refused("invalid_argument", "flagged must be a boolean.")
        cleaned, reason_error = _bounded_text(reason, _MAX_REASON, "reason")
        if reason_error or cleaned is None:
            return None, reason_error
        return canonical_payload(tool, str(slug), flagged=flagged, reason=cleaned), None

    def _consume_write(
        self,
        tool: str,
        payload: dict[str, Any],
        approval_token: object,
        confirm: object,
    ) -> dict[str, Any] | None:
        if confirm is not True:
            return refused("confirm_required")
        code = self.approvals.consume(tool, payload, approval_token)
        if code:
            return refused(code)
        return None

    def _annotations_for(self, slug: str) -> dict[str, Any]:
        data = self._load_annotations()
        notes = [item for item in data["notes"] if item.get("slug") == slug]
        flags = [item for item in data["flags"] if item.get("slug") == slug]
        return {"notes": notes, "flag": flags[-1] if flags else None}

    def _load_annotations(self) -> dict[str, Any]:
        empty: dict[str, Any] = {"version": 1, "notes": [], "flags": []}
        if not self.annotations_path.is_file():
            return empty
        try:
            loaded = json.loads(self.annotations_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError):
            return empty
        if not isinstance(loaded, dict):
            return empty
        notes = loaded.get("notes")
        flags = loaded.get("flags")
        return {
            "version": 1,
            "notes": notes if isinstance(notes, list) else [],
            "flags": flags if isinstance(flags, list) else [],
        }

    def _save_annotations(self, data: dict[str, Any]) -> None:
        path = self.annotations_path
        data_dir = (self.repo_root / "data").resolve()
        if path.name.startswith(".env") or path.resolve().is_relative_to(data_dir):
            raise CorpusError("refusing to write inside the synthetic data directory")
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(f"{path.name}.tmp")
        temporary.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        temporary.replace(path)


def _bounded_text(value: object, limit: int, label: str) -> tuple[str | None, dict[str, Any] | None]:
    if not isinstance(value, str) or "\x00" in value:
        return None, refused("invalid_argument", f"{label} must be a string.")
    cleaned = value.strip()
    if not cleaned or len(cleaned) > limit:
        return None, refused("invalid_argument", f"{label} must be 1 to {limit} characters.")
    return cleaned, None


def _fixture_key(fixtures: dict[str, Any], question: str) -> str | None:
    wanted = normalise_text(question)
    for key in fixtures:
        if normalise_text(key) == wanted:
            return key
    return None


def _clauses(text: str) -> list[tuple[str, str]]:
    matches = list(_HEADING.finditer(text))
    if not matches:
        return [("Contract overview", text)]
    chunks: list[tuple[str, str]] = []
    if matches[0].start() > 0:
        chunks.append(("Contract overview", text[: matches[0].start()]))
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        chunks.append((match.group(1).strip(), text[match.start() : end]))
    return chunks


def _snippet(body: str, index: int, query_length: int) -> str:
    start = max(0, index - 80)
    end = min(len(body), index + query_length + 160)
    snippet = " ".join(body[start:end].split())
    return snippet
