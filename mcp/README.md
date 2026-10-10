# Renewal Radar MCP server

A local [Model Context Protocol](https://modelcontextprotocol.io) server for the nine synthetic agreements in `data/`. It answers from those files and the question fixtures. It does not call a model, does not read provider keys, and does not use the network.

## Tools

| Tool | Effect |
| --- | --- |
| `list_contracts` | List the agreements with resolved end dates, notice deadlines, and renewal status. |
| `get_contract` | Read one agreement by slug. Source text is included only when `include_text` is true. |
| `upcoming_deadlines` | Renewals and notice deadlines that fall within the next `within_days` calendar days. |
| `search_clauses` | Literal search of agreement text. The query is treated as data. |
| `answer_question` | Match a question to `data/qa-fixtures.json` and return citations that occur in the source. |
| `request_write_approval` | Issue a one-time token for a single `add_note` or `flag_contract` call. This does not write. |
| `add_note` | Append a note to the local demo file after approval. |
| `flag_contract` | Store a review flag in the local demo file after approval. |

Date tokens such as `{{TODAY+55}}` are resolved on load with the same calendar rules as the dashboard.

## Run it in Cursor

From the repository root, with [uv](https://docs.astral.sh/uv/) installed:

```bash
uv --directory mcp sync
uv --directory mcp run renewal-radar-mcp
```

Example `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "renewal-radar": {
      "command": "uv",
      "args": ["--directory", "mcp", "run", "renewal-radar-mcp"]
    }
  }
}
```

The server locates the repository by walking up from the package until it finds `data/contracts/index.json`. Optional path settings, none of which are credentials:

| Variable | Purpose |
| --- | --- |
| `RENEWAL_RADAR_ROOT` | Repository root, when it cannot be discovered from the package path. |
| `RENEWAL_RADAR_AUDIT_LOG` | JSONL audit log. Default: `mcp/var/audit.jsonl`. |
| `RENEWAL_RADAR_ANNOTATIONS` | Demo notes and flags. Default: `mcp/var/annotations.json`. |

`mcp/var/` is gitignored. The synthetic files under `data/` are not modified.

## Safety design

- The server speaks stdio only. Tool code does not import an HTTP, model, or shell client.
- Contract identifiers must be slugs from the index. `..`, slashes, backslashes, percent-encoding, null bytes, and absolute paths are refused before any file is opened. Index paths must stay inside `data/contracts/`.
- Agreement text and search queries are data. A sentence such as "ignore previous instructions" is returned as a snippet and does not change what the server will do.
- Questions that try to override those rules, or that ask for keys, `.env` contents, or other credentials, are refused. Environment values are not read for that purpose and are not copied into results or the audit log.
- `add_note` and `flag_contract` write only to the configured demo annotations file, and only when `confirm` is true and a one-time token from `request_write_approval` matches that tool and those arguments. Tokens expire after 10 minutes and cannot be reused. A missing, expired, replayed, or mismatched token does not write.
- Every tool call appends one JSONL record: `timestamp`, `tool`, `args`, and `status`. Secret-shaped values and approval tokens are redacted. The record does not include the tool result body.

## Tests

```bash
uv --directory mcp sync --locked --all-groups
uv --directory mcp run pytest
```

GitHub Actions workflow: `.github/workflows/mcp.yml`.

## Measured test results

Recorded from this command in `mcp/` on Python 3.12.3:

```bash
uv run pytest
```

```text
.....................................                                    [100%]
37 passed in 1.55s
```

The 37 tests cover the read tools, the approval gate, the audit log, server registration over stdio, and 20 red-team cases. The server package does not call a model.
