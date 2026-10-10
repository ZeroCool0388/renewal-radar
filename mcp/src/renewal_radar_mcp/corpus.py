"""Load the synthetic agreements. Paths come from the index and stay inside data/."""

from __future__ import annotations

import json
import unicodedata
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

from renewal_radar_mcp.dates import deadlines, resolve_relative_dates, resolve_value
from renewal_radar_mcp.guard import SLUG_RE, contract_file_refusal

_QUOTE_MAP = str.maketrans(
    {
        "\u201c": '"',
        "\u201d": '"',
        "\u2018": "'",
        "\u2019": "'",
        "\u2013": "-",
        "\u2014": "-",
    }
)


class CorpusError(Exception):
    """Raised when the local corpus cannot be loaded safely."""


@dataclass(frozen=True)
class Contract:
    slug: str
    supplier: str
    category: str
    annual_value_gbp: int | None
    sector_tags: list[str]
    text: str
    extraction: dict[str, Any]
    deadline: dict[str, Any]


def find_repo_root(start: Path) -> Path:
    for candidate in (start, *start.parents):
        if (candidate / "data" / "contracts" / "index.json").is_file():
            return candidate
    raise CorpusError("synthetic agreement index was not found")


def normalise_text(text: str) -> str:
    cleaned = unicodedata.normalize("NFKC", text).translate(_QUOTE_MAP)
    return " ".join(cleaned.split()).casefold()


def quote_in_text(quote: str, text: str) -> bool:
    needle = normalise_text(quote)
    return len(needle) >= 4 and needle in normalise_text(text)


def _read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise CorpusError("synthetic data file could not be read") from exc


def _safe_contract_file(repo_root: Path, relative: str) -> Path:
    root = repo_root.resolve()
    path = (root / relative).resolve()
    contracts_root = (root / "data" / "contracts").resolve()
    if not path.is_relative_to(contracts_root) or path.parent != contracts_root:
        raise CorpusError("refusing an agreement path outside data/contracts")
    return path


def load_corpus(repo_root: Path, today: date) -> list[Contract]:
    root = repo_root.resolve()
    index_path = root / "data" / "contracts" / "index.json"
    if not index_path.is_file():
        raise CorpusError("synthetic agreement index was not found")
    index = _read_json(index_path)
    if not isinstance(index, list) or not index:
        raise CorpusError("synthetic agreement index is empty")
    fixtures_path = root / "data" / "qa-fixtures.json"
    if not fixtures_path.is_file():
        raise CorpusError("question fixtures were not found")

    contracts: list[Contract] = []
    seen: set[str] = set()
    for entry in index:
        if not isinstance(entry, dict):
            raise CorpusError("synthetic agreement index is invalid")
        slug = entry.get("slug")
        relative = entry.get("filePath")
        if not isinstance(slug, str) or not SLUG_RE.fullmatch(slug) or slug in seen:
            raise CorpusError("synthetic agreement index contains an invalid identifier")
        if contract_file_refusal(relative):
            raise CorpusError("refusing an unsafe path in the agreement index")
        seen.add(slug)
        source = _safe_contract_file(root, str(relative))
        if not source.is_file():
            raise CorpusError("synthetic agreement could not be read")
        try:
            raw_text = source.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as exc:
            raise CorpusError("synthetic agreement could not be read") from exc
        extraction_path = (root / "data" / "extractions" / f"{slug}.json").resolve()
        extractions_root = (root / "data" / "extractions").resolve()
        if extraction_path.parent != extractions_root or not extraction_path.is_file():
            raise CorpusError("extraction template is missing")
        extraction = _read_json(extraction_path)
        if not isinstance(extraction, dict):
            raise CorpusError("extraction template is invalid")
        text = resolve_relative_dates(raw_text, today)
        resolved = resolve_value(extraction, today)
        annual = entry.get("annualValueGBP")
        tags = entry.get("sectorTags")
        contracts.append(
            Contract(
                slug=slug,
                supplier=str(entry.get("supplier") or resolved.get("supplier") or slug),
                category=str(entry.get("category") or resolved.get("category") or ""),
                annual_value_gbp=annual if isinstance(annual, int) and not isinstance(annual, bool) else None,
                sector_tags=[str(tag) for tag in tags] if isinstance(tags, list) else [],
                text=text,
                extraction=resolved,
                deadline=deadlines(resolved, today),
            )
        )
    return contracts


def load_fixtures(repo_root: Path) -> dict[str, Any]:
    path = repo_root.resolve() / "data" / "qa-fixtures.json"
    fixtures = _read_json(path)
    if not isinstance(fixtures, dict):
        raise CorpusError("question fixtures are invalid")
    return fixtures
