# Campaign Tracker MCP Server

Exposes your local Campaign Tracker SQLite database as an MCP (Model Context Protocol) server over stdio, giving AI assistants (Claude Code, Codex, etc.) read and write access to campaigns, lines, and performance data.

## Installation

```bash
npm install
cd mcp && npm install
```

No build step is needed — the server is run directly via `tsx`. Install both the repository root dependencies and the `mcp/` package dependencies because the MCP server reuses shared code from `src/core/`.

## Prerequisites and important notes

### Before writing (create / update / import)

- **Close Campaign Tracker first.** The app keeps its own in-memory copy of the database. If you write via MCP while the app is open, the app will overwrite your changes the next time it saves.
- **Restart Campaign Tracker after writing.** The app caches the database in memory on startup; changes made via MCP will not appear until you quit and reopen the app.

### Automatic backups

Every write operation (`create_campaign`, `update_campaign`, `import_performance`) creates a timestamped safety backup in the same directory as the database before modifying anything:

```
campaign-tracker-before-mcp-<timestamp>.db
```

You can delete these backup files periodically once you are confident the writes were correct.

### Read tools may also write to disk

The read tools (`list_campaigns`, `get_campaign`, `find_campaign`, `query_performance`) sync campaign statuses based on today's date every time they run. This is identical to what the app itself does and is idempotent. As long as the app is not open at the same time, there are no side effects.

## Tools

| Tool | Description |
|------|-------------|
| `list_campaigns` | List all campaigns with whether they have performance data |
| `get_campaign` | Get one campaign with its lines, flights and deals |
| `find_campaign` | Fuzzy-find campaigns by name, client, or TTD campaign ID |
| `query_performance` | Query performance rows for a campaign, with optional date range |
| `create_campaign` | Create a new campaign with at least one line |
| `update_campaign` | Patch a campaign and/or its lines; omitted existing lines are preserved |
| `preview_import` | Parse a TTD Excel/CSV and report column mapping WITHOUT writing to the DB; optional `sheet_name` |
| `import_performance` | Import performance data from a file into a campaign line (replaces existing rows for that line); optional `sheet_name` |

## Client configuration

### Claude Code (project-level, automatic)

The repository includes `.mcp.json` at the project root. When you start Claude Code from the `Campaign-Tracker` directory, the MCP server is loaded automatically — no extra configuration needed.

```json
{
  "mcpServers": {
    "campaign-tracker": {
      "command": "npx",
      "args": ["tsx", "./mcp/src/index.ts"]
    }
  }
}
```

The server auto-detects the database location on macOS, Linux, and Windows. If the database is not at a default location, set `CAMPAIGN_TRACKER_DB` to its full path.

### Codex

Add the following snippet to `~/.codex/config.toml`:

```toml
[mcp_servers.campaign-tracker]
command = "npx"
args = ["tsx", "/Users/derrick/Desktop/Campaign-Tracker/mcp/src/index.ts"]
env = { CAMPAIGN_TRACKER_DB = "/Users/derrick/Library/Application Support/campaign-tracker/campaign-tracker.db" }
```

Adjust the path if your database or project is in a different location. On Windows, use absolute paths for both the project and database:

```toml
[mcp_servers.campaign-tracker]
command = "npx"
args = ["tsx", "C:\\Users\\derrick.liu\\OneDrive - The Trade Desk\\Works\\Campaign Tracker\\mcp\\src\\index.ts"]
env = { CAMPAIGN_TRACKER_DB = "C:\\Users\\derrick.liu\\AppData\\Roaming\\campaign-tracker\\campaign-tracker.db" }
```

## Environment variables

| Variable | Description |
|----------|-------------|
| `CAMPAIGN_TRACKER_DB` | Full path to `campaign-tracker.db`. If not set, the server auto-detects by checking `~/Library/Application Support/{campaign-tracker,Campaign Tracker}/` and `~/.config/{campaign-tracker,Campaign Tracker}/` on macOS/Linux, plus `%APPDATA%/{campaign-tracker,Campaign Tracker}/` on Windows (covers both dev and packaged installs). |

## Running manually

```bash
CAMPAIGN_TRACKER_DB="/path/to/campaign-tracker.db" npx tsx mcp/src/index.ts
```

The server communicates via stdin/stdout (JSON-RPC). All diagnostic output goes to stderr.

## Import notes

For workbooks with multiple sheets, `preview_import` and `import_performance` automatically scan sheets and choose the first one with a header row containing the required `Date` and `Impressions` columns. You can pass `sheet_name` to force a specific sheet.
