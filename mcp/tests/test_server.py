from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from renewal_radar_mcp.server import build_server

READ_ONLY = {
    "list_contracts",
    "get_contract",
    "upcoming_deadlines",
    "search_clauses",
    "answer_question",
    "request_write_approval",
}
WRITES = {"add_note", "flag_contract"}


def test_registered_tools_declare_read_and_write_hints(service) -> None:
    server = build_server(service)
    tools = asyncio.run(server.list_tools())
    by_name = {tool.name: tool for tool in tools}
    assert set(by_name) == READ_ONLY | WRITES
    for name in READ_ONLY:
        assert by_name[name].annotations is not None
        assert by_name[name].annotations.read_only_hint is True
        assert by_name[name].annotations.open_world_hint is False
    for name in WRITES:
        assert by_name[name].annotations is not None
        assert by_name[name].annotations.read_only_hint is False
        assert by_name[name].annotations.destructive_hint is False
        assert by_name[name].annotations.open_world_hint is False
    listed = asyncio.run(server.call_tool("list_contracts", {}))
    assert listed.is_error is False
    assert listed.structured_content["status"] == "ok"
    assert len(listed.structured_content["contracts"]) == 9


def test_stdio_transport_lists_tools(tmp_path: Path) -> None:
    repo = Path(__file__).resolve().parents[2]

    async def run() -> list[str]:
        parameters = StdioServerParameters(
            command=sys.executable,
            args=["-m", "renewal_radar_mcp"],
            cwd=repo,
            env={
                "RENEWAL_RADAR_ROOT": str(repo),
                "RENEWAL_RADAR_AUDIT_LOG": str(tmp_path / "audit.jsonl"),
                "RENEWAL_RADAR_ANNOTATIONS": str(tmp_path / "annotations.json"),
            },
        )
        async with stdio_client(parameters) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                listed = await session.list_tools()
                return [tool.name for tool in listed.tools]

    names = asyncio.run(run())
    assert set(names) == READ_ONLY | WRITES
    assert not (tmp_path / "annotations.json").exists()
