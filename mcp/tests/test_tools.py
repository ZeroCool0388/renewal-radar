from __future__ import annotations

from datetime import date

from renewal_radar_mcp.dates import resolve_relative_dates

FIXED_DAY = date(2026, 10, 10)


def test_relative_dates_match_the_demo_calendar() -> None:
    assert resolve_relative_dates("{{TODAY+55}}", FIXED_DAY) == "2026-12-04"
    assert resolve_relative_dates("{{TODAY+22}}", FIXED_DAY) == "2026-11-01"
    assert resolve_relative_dates("{{START:55:12}}", FIXED_DAY) == "2025-12-04"
    assert resolve_relative_dates("{{Q1:03-12}}", FIXED_DAY) == "2027-03-12"
    assert resolve_relative_dates("{{Q1START:03-12:12}}", FIXED_DAY) == "2026-03-12"


def test_list_contracts_returns_the_nine_agreements(service) -> None:
    result = service.list_contracts()
    assert result["status"] == "ok"
    assert result["as_of"] == "2026-10-10"
    slugs = [item["slug"] for item in result["contracts"]]
    assert slugs == [
        "northwind-logistics",
        "apex-biolabs",
        "helix-pharma",
        "sterling-fintech",
        "cedar-fleet-telematics",
        "lumen-analytics",
        "orbit-hris",
        "brightpath-consulting",
        "novapay-gateway",
    ]
    northwind = result["contracts"][0]
    assert northwind["end_date"] == "2026-12-04"
    assert northwind["days_to_renew"] == 55
    assert northwind["renewal_status"] == "Notice missed – will auto-renew"
    sterling = next(item for item in result["contracts"] if item["slug"] == "sterling-fintech")
    assert sterling["days_to_renew"] == 22
    orbit = next(item for item in result["contracts"] if item["slug"] == "orbit-hris")
    assert orbit["days_to_notice"] == 12
    assert orbit["renewal_status"] == "Notice window open"


def test_get_contract_resolves_dates_and_can_include_source(service) -> None:
    brief = service.get_contract("helix-pharma")
    assert brief["status"] == "ok"
    assert "text" not in brief
    assert brief["end_date"] == "2027-03-12"
    assert brief["extraction"]["endDate"] == "2027-03-12"
    full = service.get_contract("helix-pharma", include_text=True)
    assert full["text"].startswith("SYNTHETIC DEMO DATA. Fictional company. Not real.")
    assert "{{" not in full["text"]
    assert "2027-03-12" in full["text"]


def test_unknown_slug_is_refused(service) -> None:
    result = service.get_contract("not-in-the-corpus")
    assert result["status"] == "refused"
    assert result["reason"] == "unknown_contract"


def test_upcoming_deadlines_within_30_and_90_days(service) -> None:
    soon = service.upcoming_deadlines(30)
    assert soon["status"] == "ok"
    assert [item["slug"] for item in soon["renewals"]] == ["sterling-fintech"]
    assert [item["slug"] for item in soon["notice_deadlines"]] == ["orbit-hris", "novapay-gateway"]

    quarter = service.upcoming_deadlines(90)
    renewal_slugs = [item["slug"] for item in quarter["renewals"]]
    assert renewal_slugs == ["northwind-logistics", "sterling-fintech", "orbit-hris", "novapay-gateway"]
    total = sum(item["annual_value_gbp"] for item in quarter["renewals"])
    assert total == 420_000

    assert service.upcoming_deadlines(-1)["status"] == "refused"
    assert service.upcoming_deadlines(3651)["status"] == "refused"


def test_search_clauses_returns_source_snippets(service) -> None:
    result = service.search_clauses("Termination for convenience: Yes")
    assert result["status"] == "ok"
    assert result["treated_as_data"] is True
    slugs = {item["slug"] for item in result["matches"]}
    assert "helix-pharma" in slugs
    assert "brightpath-consulting" in slugs
    assert all(item["content_role"] == "data" for item in result["matches"])
    assert service.search_clauses("")["reason"] == "invalid_argument"


def test_answer_question_uses_fixtures_and_verified_citations(service) -> None:
    result = service.answer_question("Which suppliers can we exit in Q1?")
    assert result["status"] == "ok"
    assert result["matched"] is True
    assert result["intent"] == "q1"
    assert [item["contract_id"] for item in result["matches"]] == [
        "apex-biolabs",
        "helix-pharma",
        "brightpath-consulting",
    ]
    for match in result["matches"]:
        assert match["citations"]
        for citation in match["citations"]:
            assert "{{" not in citation["quote"]
            assert citation["location"]
    missed = service.answer_question("Which contracts auto-renew with less than 60 days' notice?")
    assert [item["contract_id"] for item in missed["matches"]] == ["sterling-fintech", "orbit-hris"]
    unknown = service.answer_question("What is the weather today?")
    assert unknown["matched"] is False
    assert unknown["matches"] == []
    assert len(unknown["available_questions"]) == 5
