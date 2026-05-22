# MAXential Thinking MCP

A structured, persistent reasoning workspace for AI. Provides 20 tools for building thought chains, exploring alternatives through branching, revising earlier thinking, searching reasoning history, and persisting sessions across context window resets and server restarts.

AI's built-in reasoning is ephemeral — when context windows fill, thinking gets compressed or lost. Complex problems need exploration of multiple approaches, backtracking when paths fail, and the ability to resume where you left off. MAXential externalizes reasoning into a workspace that persists, branches, and survives.

## Origin

Forked from [Anthropic's sequential-thinking MCP server](https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking), which provided a single tool with 9 parameters. Its schema included branching parameters (`branch_from_thought`, `branch_id`) but had no tools to create, switch, or manage branches — the parameters were effectively inert.

MAXential replaced that single tool entirely and built 20 purpose-specific tools across three releases:

| Version | What was built |
|---------|---------------|
| v2.0 | Replaced the single tool with 11 focused tools: core thinking (`think`, `revise`, `complete`), full branch management (`branch`, `switch_branch`, `list_branches`, `get_branch`, `close_branch`, `merge_branch`), and navigation (`get_thought`, `get_history`) |
| v2.2 | Added 5 organization tools: `tag`, `search`, `export`, `visualize`, `reset` |
| v2.3 | Added 4 session persistence tools with SQLite storage: `session_save`, `session_load`, `session_list`, `session_summary` |

## Tools

### Core Thinking

| Tool | What it does |
|------|-------------|
| `think` | Add a thought to the reasoning chain. Thoughts are numbered and persisted automatically. |
| `revise` | Revise a previous thought when earlier thinking was flawed or incomplete. The original is preserved with revision history. |
| `complete` | Mark the thinking chain complete with a final conclusion. |
| `reset` | Clear the current session and start fresh. |

### Branching

| Tool | What it does |
|------|-------------|
| `branch` | Create a new reasoning branch to explore an alternative path without losing the main thread. |
| `switch_branch` | Switch context to a different branch, or back to main. |
| `list_branches` | List all branches with their status and thought counts. |
| `get_branch` | Retrieve complete details of a specific branch. |
| `close_branch` | Close a branch with an optional conclusion. |
| `merge_branch` | Merge insights from a branch back into main. Strategies: `conclusion_only`, `full_integration`, `summary`. |

### Navigation

| Tool | What it does |
|------|-------------|
| `get_thought` | Retrieve a specific thought by its number. |
| `get_history` | Get thought history, optionally filtered by branch. |

### Organization

| Tool | What it does |
|------|-------------|
| `tag` | Add or remove semantic tags on a thought (e.g., hypothesis, evidence, decision, finding). |
| `search` | Search thoughts by content text or by tags. |
| `export` | Export the thinking chain as markdown or JSON. |
| `visualize` | Generate ASCII or Mermaid diagrams of the thought structure and branches. |

### Session Persistence

| Tool | What it does |
|------|-------------|
| `session_save` | Name and describe the current session for later retrieval. |
| `session_load` | Restore a saved session — all thoughts, branches, and tags are loaded back into memory. |
| `session_list` | Browse available sessions, most recently updated first. |
| `session_summary` | Generate a compressed summary of a session for token-efficient context loading. |

Sessions are automatically persisted to SQLite as you work. Every `think`, `branch`, `tag`, and `revise` call writes through to disk in real time. Sessions survive server restarts, context window resets, and new conversations — pick up where you left off.

## What the original provides vs. what MAXential provides

| Capability | Anthropic sequential-thinking | MAXential Thinking |
|-----------|------------------------------|-------------------|
| Interface | 1 tool, 9 parameters | 20 focused tools |
| Branching | Parameters in schema, no implementation | Full lifecycle: create, switch, list, inspect, merge, close |
| Revision | Not supported | Revise any thought, original preserved with history |
| Persistence | None — lost on server restart | SQLite — survives restarts, context resets, new conversations |
| Tagging | Not supported | Semantic tags on any thought |
| Search | Not supported | Search by content or tags |
| Export | Not supported | Markdown, JSON, Mermaid diagrams, ASCII visualization |
| Navigation | Not supported | Retrieve any thought by number, browse filtered history |

## Browsing session history

Session data is stored in a standard SQLite database at `.maxential/thinking.db`. There are several ways to browse past reasoning sessions:

**Through the tools themselves** — ask AI to use `session_list` to browse sessions, `session_load` to restore one, or `session_summary` for a compressed overview. AI can format, search, and summarize session content conversationally.

**With a SQLite browser** — open `.maxential/thinking.db` in any SQLite viewer (VS Code/VSCodium extensions, DB Browser for SQLite, or similar). The schema is straightforward:

| Table | Contains |
|-------|----------|
| `sessions` | Session ID, name, description, status, timestamps |
| `thoughts` | Every thought with its number, content, branch, revision links |
| `branches` | Branch metadata, status, conclusions, merge history |
| `tags` | Semantic tags attached to thoughts |

**From the terminal:**
```bash
sqlite3 .maxential/thinking.db "SELECT name, status, datetime(created_at/1000, 'unixepoch', 'localtime') as created FROM sessions ORDER BY updated_at DESC LIMIT 10;"
```

## Installation

### Claude Desktop / Claude Code

Add to your MCP configuration:

**Claude Desktop** config location:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "maxential-thinking": {
      "command": "npx",
      "args": ["-y", "@bam-devcrew/maxential-thinking-mcp"]
    }
  }
}
```

### From source

```bash
git clone https://github.com/BAM-DevCrew/MAXential-Thinking-MCP.git
cd MAXential-Thinking-MCP
npm install
npm run build
```

Then configure:
```json
{
  "mcpServers": {
    "maxential-thinking": {
      "command": "node",
      "args": ["/path/to/MAXential-Thinking-MCP/dist/src/index.js"]
    }
  }
}
```

## Configuration

### Persistence

Session data is stored in SQLite. By default, the database is created at `.maxential/thinking.db` in the working directory.

```json
{
  "mcpServers": {
    "maxential-thinking": {
      "command": "npx",
      "args": ["-y", "@bam-devcrew/maxential-thinking-mcp"],
      "env": {
        "MAXENTIAL_DB_PATH": "/path/to/your/thinking.db"
      }
    }
  }
}
```

| `MAXENTIAL_DB_PATH` value | Behavior |
|---------------------------|----------|
| *(not set)* | `.maxential/thinking.db` in working directory |
| `/path/to/file.db` | Use explicit file path |
| `:memory:` | In-memory only — no persistence across restarts |

If SQLite initialization fails (permissions, native module issues), the server falls back to in-memory mode automatically — it never crashes.

Add `.maxential/` to your project's `.gitignore` to keep session data out of version control.

### Logging

```json
{
  "mcpServers": {
    "maxential-thinking": {
      "command": "npx",
      "args": ["-y", "@bam-devcrew/maxential-thinking-mcp"],
      "env": {
        "MAXENTIAL_LOG_FILE": "/path/to/error.log"
      }
    }
  }
}
```

## Usage

You don't call these tools directly — you ask your AI to use MAXential thinking, and it calls the tools as part of its reasoning. Here are examples of what that looks like in practice.

**Working through a decision:**
> *use maxential thinking for this - should we use REST or GraphQL for the new API?*

AI builds a thought chain analyzing the question, branches to explore each approach separately, adds thoughts with tradeoffs, merges the findings, and reaches a conclusion. The entire reasoning process is numbered, structured, and persisted.

**Exploring multiple approaches:**
> *think through the auth redesign using maxential - I want to see branches for JWT, session tokens, and OAuth*

AI creates three branches, reasons through each approach independently, then merges the insights back to compare. You can ask it to switch between branches, close dead ends, or dig deeper into a specific path.

**Resuming previous thinking:**
> *load up that session where you analyzed our database optimization options*

AI browses saved sessions, finds the match, restores it with all thoughts, branches, and tags intact, and continues reasoning from where it left off — even across different conversations.

**Reviewing past reasoning:**
> *search your maxential thinking history for anything tagged as a decision*

AI searches across the session's tagged thoughts and returns the results. You can also ask it to export the full chain as markdown, or generate a diagram of the thought structure.

**Getting a quick summary:**
> *give me a summary of that session - just the key findings, keep it short*

AI generates a compressed summary of the session's conclusions, tagged highlights, and branch results — useful for loading context without replaying the full chain.

## Development

```bash
npm install          # Install dependencies
npm run build        # Build TypeScript
npm run watch        # Watch mode
npm test             # Run tests with coverage
npm run test:unit    # Unit tests only
npm run test:integration  # Integration tests only
```

## License

MIT

## Contributing

Issues and PRs welcome at [github.com/BAM-DevCrew/MAXential-Thinking-MCP](https://github.com/BAM-DevCrew/MAXential-Thinking-MCP)
