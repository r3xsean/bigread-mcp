# bigread-mcp

Fixes Claude Code's **"Output too large"** file truncation problem.

When Claude Code reads a file larger than ~50K characters, the `persisted-output` mechanism truncates the result to a 2KB preview — the AI loses access to the full content. `bigread` calculates optimal chunk offsets so Claude can re-read the file in correctly-sized pieces using its built-in Read tool, preserving full Read/Edit/Write compatibility.

**No file content is returned** — just the reading plan (offsets, limits, chunk count). Claude's own Read tool does the actual reading, so you keep full editing capabilities on the file.

## Install

```bash
claude mcp add --transport stdio --scope user bigread -- npx -y github:r3xsean/bigread-mcp
```

One command. Works on Windows, macOS, and Linux.

## Setup

Add this to your `CLAUDE.md` so the AI uses it automatically when truncation occurs:

```markdown
# File Reading

When using the Read tool, do NOT pass a `limit` parameter unless the file is known to be
extremely large (10,000+ lines). Omitting `limit` reads the entire file, which is almost
always what the user wants.

When a Read tool result shows `Output too large` with a `persisted-output` tag, the full
content was NOT loaded into your context — you only received a ~2KB preview. To get the full
file, call the `bigread` MCP tool with the file path — it returns pre-calculated chunk offsets
and limits sized to fit under the truncation threshold. Then read all chunks in parallel using
the Read tool with the returned `offset` and `limit` values. Do NOT tell the user the file was
truncated or ask them to split it — just seamlessly call bigread and re-read in chunks.
```

### Recommended environment variables

Add these to `~/.claude/settings.json` alongside `bigread` for complete coverage:

```json
{
  "env": {
    "CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS": "500000",
    "MAX_MCP_OUTPUT_TOKENS": "500000",
    "BASH_MAX_OUTPUT_LENGTH": "200000"
  }
}
```

These raise separate, earlier limits (token cap and bash output cap) that can also cause truncation. `bigread` fixes the persisted-output character cap — the one that's not configurable via env vars.

## The Problem

Claude Code has a hardcoded **50,000 character per-tool output cap**. Any tool result exceeding this triggers `persisted-output`:

- Full content is saved to a temp file on disk
- The AI receives only a **2KB preview** (2,000 characters)
- The AI **cannot see the rest of the file** in its context
- Reading the temp file triggers the same cap — infinite loop

Setting `CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS` does **not** fix this — that controls a separate, earlier token limit. The 50K character cap is a different system entirely and has no env var override.

## How It Works

```
AI tries to read large-file.md → gets "Output too large" with 2KB preview
                                    ↓
AI calls bigread({ filePath: "/path/to/large-file.md" })
                                    ↓
bigread returns: {
  totalLines: 756,
  totalChars: 60428,
  charsPerLine: 80,
  linesPerChunk: 500,
  chunks: [
    { offset: 1, limit: 500 },
    { offset: 501, limit: 256 }
  ]
}
                                    ↓
AI reads all chunks in parallel using built-in Read tool with those offsets
                                    ↓
Full file in context. No truncation. Full edit/write capability preserved.
```

1. Reads the file to get total character count and line count
2. Calculates average characters-per-line for that specific file
3. Computes how many lines fit in 40K characters (safe margin under the 50K threshold)
4. Returns chunk definitions with 1-based `offset` and `limit` matching the Read tool's API

If the file is small enough to fit in one read (<40K chars), it says so — no unnecessary chunking.

## Why Not Just Use offset/limit Manually?

You could instruct the AI to run `wc`, calculate chunk sizes, and build offset/limit pairs itself. But that's 4 steps the AI has to execute and get right every time, burning context and tool calls on arithmetic. `bigread` does it in one call and returns exactly what the Read tool needs.

## Why Not Return File Content Directly?

Claude Code only tracks files for editing when they're read through the built-in Read tool. If an MCP server returns file content directly, Claude can read it but can't Edit or Write to it afterward. By returning only the reading plan, Claude uses its own Read tool for the actual reading — keeping full read/edit/write compatibility intact.

## Technical Details

| Constant | Value | What it controls |
|----------|-------|-----------------|
| Persisted-output threshold | 50,000 chars | When tool results get truncated to 2KB preview |
| Preview size | 2,000 chars | How much of the truncated result the AI can see |
| bigread chunk target | 40,000 chars | Safe size per chunk (10K margin under threshold) |
| Token estimation | ~4 chars/token | How Claude Code estimates tokens from character count |

## License

MIT
