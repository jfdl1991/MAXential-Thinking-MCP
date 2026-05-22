# MAXential Thinking MCP — Development Plan

## Supersedes: V3-RESEARCH-ROADMAP.md
## Incorporates: Phase 0 Findings, Persistence Schema Design, Product Strategy Decisions

**Date:** February 15, 2026 (revised February 17, 2026)
**Author:** Kent + Claude (collaborative sessions)
**Status:** Active — Phase 1 Complete, Phase 2 Ready to Build
**Origin:** White paper "Beyond Reward Signals: Metacognitive Architecture as the Missing Layer in AI Advancement"

---

## Strategic Decision Log

| Decision | Date | Rationale |
|----------|------|-----------|
| Agent-MCP model is all three (A, B, C) depending on context | Feb 15, 2026 | Phase 0 research — see findings doc |
| SQLite with WAL mode + `busy_timeout` for persistence | Feb 15, 2026 | Handles concurrent agents, zero dependencies, sub-ms writes |
| MAXential is model-agnostic, not Claude-specific | Feb 15, 2026 | Persistence layer (SQLite file) is the universal coordination substrate — any MCP client can use it |
| "Shared vs separate process" is the core design challenge for multi-agent | Feb 15, 2026 | Must work transparently across same-process, same-machine, and future networked modes |
| Project-local DB default (`.maxential/`) with env var override | Feb 15, 2026 | Agent teammates auto-discover; global via `MAXENTIAL_DB_PATH` |
| Human-readable auto-labels for sessions | Feb 15, 2026 | "Session 2026-02-15 2:30 PM" with optional context extraction |
| Single product — no fork | Feb 16, 2026 | Multi-agent features are a deployment pattern, not a separate product. One repo, one npm package, one maintenance surface. Agent awareness is additive to the existing tool set. |
| Keep the MAXential Thinking name | Feb 16, 2026 | Already published on npm, referenced in white paper, on GitHub. Renaming costs outweigh benefits. The README explains the value, not the name. |
| SQLite as universal cross-agent read path | Feb 17, 2026 | All cross-agent operations read from SQLite, never from in-memory state. Consistent behavior in all modes — no mode detection needed. SQLite is the coordination substrate. |
| Structured/opinionated tool schemas | Feb 17, 2026 | The architecture IS the metacognition. Schema enforces discipline that weak models lack natively. Model-agnostic design — tools elevate weaker models, not just serve strong ones. |
| Handoff as permanent structured thought | Feb 17, 2026 | Compact summary for orchestrator context; full chain persists in SQLite. Never deleted — users can revisit agent reasoning at any time. |
| Pattern 1 (direct) in v2.4, Pattern 2 (proxied) in v2.5 | Feb 17, 2026 | Direct access is the foundation. Real usage reveals the right proxy API. Don't design speculatively. |
| Model-agnostic design principle | Feb 17, 2026 | MAXential must elevate weaker models, not just serve strong ones. Validates the whitepaper's thesis that architecture matters independently of model capability. |
| Automatic interjection delivery on think() | Feb 17, 2026 | Interjections are collaborative inputs to the agent's reasoning stream. The server delivers them automatically — the agent can't miss them. Architecture handles monitoring, not the model. |

---

## Product Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  MAXential Thinking MCP                                     │
│  "Metacognitive thinking tools for any AI"                  │
│  ─────────────────────────────────────────                  │
│                                                             │
│  v2.2 (shipped)    — 16 tools, in-memory thinking engine   │
│  v2.3 (shipped)    — + persistence layer, 4 session tools  │
│  v2.4 (Phase 2)    — + agent awareness, 8 multi-agent tools│
│  v2.5 (Phase 2.5)  — + proxied agent access                │
│  v3.0 (Phase 3)    — + cross-agent intelligence            │
│                                                             │
│  npm: @bam-devcrew/maxential-thinking-mcp                   │
│  Model-agnostic — works with any MCP client                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## The Core Design Challenge: Universal Process Coordination

### The Problem

When multiple AI agents need to share a thinking space, the coordination mechanism depends on how those agents relate to the MCP server process. This is a universal problem — not specific to any model or harness.

### Three Coordination Modes

```
MODE 1: SHARED PROCESS                    MODE 2: SHARED FILE
┌──────────────────────┐                  ┌──────────┐  ┌──────────┐
│   Host Application   │                  │ Agent A   │  │ Agent B   │
│  ┌────────────────┐  │                  │ ┌──────┐  │  │ ┌──────┐  │
│  │  Orchestrator   │  │                  │ │ MCP  │  │  │ │ MCP  │  │
│  │  Agent A        │──┼── same instance  │ │inst. │  │  │ │inst. │  │
│  │  Agent B        │  │                  │ └──┬───┘  │  │ └──┬───┘  │
│  └───────┬────────┘  │                  └────┼──────┘  └────┼──────┘
│     ┌────▼─────┐     │                       │              │
│     │  MCP    │     │                       ▼              ▼
│     │ (memory) │     │                  ┌────────────────────────┐
│     └──────────┘     │                  │  .maxential/thinking.db │
│                      │                  │  (SQLite + WAL)         │
└──────────────────────┘                  └────────────────────────┘

MODE 3: NETWORKED (future)
┌──────────┐  ┌──────────┐
│ Agent A   │  │ Agent B   │
│ (machine1)│  │ (machine2)│
└─────┬─────┘  └─────┬─────┘
      │              │
      ▼              ▼
┌────────────────────────┐
│  MAXential Server (HTTP)│
│  ┌──────────────────┐  │
│  │  SQLite backend   │  │
│  └──────────────────┘  │
└────────────────────────┘
```

### Known Examples of Each Mode

| Mode | Known Implementations | Behavior |
|------|----------------------|----------|
| Shared Process | Claude Code foreground subagents | Agents share MCP instance; in-memory state is automatically shared |
| Shared Process | Any MCP client with in-process subagents | Same behavior — memory is shared |
| Shared File | Claude Code Agent Teams | Each teammate loads its own MCP instances from project config; coordinates via files on disk |
| Shared File | Cursor multi-agent workflows | Separate processes, shared project directory |
| Shared File | Any multi-process MCP workflow | Multiple instances reading/writing same SQLite DB |
| No MCP Access | Claude Code background subagents | Agent has no MCP tools; orchestrator must proxy context via prompts (v2.5 addresses this) |
| Networked | Future / custom SDK builds | HTTP/SSE transport, remote connections |

### Design Principle: Transparent Mode Handling

The persistence layer handles coordination transparently without user configuration:

1. **Shared-process mode** — In-memory state is shared automatically. No detection needed.

2. **Shared-file mode** — Multiple instances hitting the same SQLite file are coordinated by WAL + `busy_timeout`. No detection needed.

3. **No-MCP mode** — The agent doesn't have our tools. v2.5 will add proxied access so the orchestrator can manage agent thinking contexts on behalf of agents without MCP access. Until then, the orchestrator handles this by reading from MAXential and injecting context into the agent's prompt.

4. **Networked mode** — Future: MAXential starts as an HTTP server instead of stdio. Configured explicitly.

**Key insight:** Modes 1 and 2 require no detection. In-memory works when processes are shared. SQLite works when they're separate. Both run in parallel (write-through). The persistence layer IS the solution for cross-process coordination, and in-memory IS the solution for same-process coordination.

---

## Development Phases

### Phase 1: v2.3 — Persistence Layer ✅ COMPLETE

**Goal:** Ship SQLite persistence. Universal benefit — sessions survive across conversations, and multi-agent coordination becomes possible as a side effect.

**Status:** Published to npm as `@bam-devcrew/maxential-thinking-mcp@2.3.0`. All deliverables complete. Dead code cleaned up.

**New files:**
- `src/persistence.ts` — SQLite operations, schema creation, WAL setup

**Modified files:**
- `src/lib.ts` — Wire `SequentialThinkingServer` to write-through to persistence
- `src/index.ts` — Add 4 new tool definitions
- `src/types/index.ts` — Minor additions (session types already exist)

**New tools (4):**
- `session_save` — Name/describe current session
- `session_load` — Restore a previous session into memory
- `session_list` — Browse available sessions
- `session_summary` — Generate compressed summary for token-efficient loading

**Configuration:**
```bash
# Default: project-local persistence
# Auto-creates .maxential/thinking.db in working directory

# Override: custom path (global or shared location)
MAXENTIAL_DB_PATH=/custom/path/thinking.db

# Disable persistence entirely (pure in-memory, v2.2 behavior)
MAXENTIAL_DB_PATH=:memory:
```

**SQLite pragmas:**
```sql
PRAGMA journal_mode = WAL;       -- concurrent readers, non-blocking writes
PRAGMA busy_timeout = 5000;      -- retry on contention for 5s before failing
```

**Schema:** 7 tables created upfront (see V3-PERSISTENCE-SCHEMA.md)
- `sessions`, `thoughts`, `branches`, `tags` — used immediately
- `thought_references`, `agents`, `syntheses` — created empty, used by Phase 2+

**Deliverables:**
- [x] `src/persistence.ts` — PersistenceLayer class
- [x] Schema creation with all 7 tables + indices
- [x] Write-through from all existing tools (think, revise, branch, tag, etc.)
- [x] `session_save` tool
- [x] `session_load` tool (hydrates in-memory state from SQLite)
- [x] `session_list` tool
- [x] `session_summary` tool
- [x] Tests: persistence round-trip, concurrent access, backward compatibility
- [x] npm publish as `@bam-devcrew/maxential-thinking-mcp@2.3.0`

---

### Phase 2: v2.4 — Agent Awareness (Direct Access)

**Goal:** Add agent lifecycle and cross-agent observation tools. Multi-agent coordination becomes a first-class feature. Agents with direct MCP access can register, think, hand off, and observe each other.

**Prerequisite:** v2.3 shipped and stable. ✅

#### Design Principles

**1. The architecture IS the metacognition.** Tools are structurally opinionated — required fields, constrained enums, structured output. The schema enforces metacognitive discipline that weaker models might lack natively. A mediocre model using MAXential should produce better reasoning than the same model without it.

**2. Model-agnostic by design.** MAXential works with any MCP client — Opus, Sonnet, Haiku, GPT, Gemini, Deepseek, or any future model. Tool schemas are simple enough for weak models to use correctly, while providing enough structure for strong models to leverage fully. Intelligence lives in the architecture, not in assumptions about the model.

**3. SQLite is the universal coordination substrate.** All cross-agent operations read from SQLite, never from in-memory state. This provides consistent behavior regardless of whether agents share a process (Mode 1) or share a file (Mode 2). No mode detection needed.

**4. Handoff data is permanent.** Agent thinking chains and handoff summaries persist in SQLite for the lifetime of the session. The orchestrator chooses how much to load into its context, but nothing is deleted. Users can revisit agent reasoning at any time.

**5. Interjections are collaborative, not directive.** Interjections are inputs to the agent's reasoning stream — like a colleague sharing a relevant observation. The server delivers them automatically on the agent's next `think()` call. The agent considers them and adjusts (or doesn't). The architecture handles delivery; the model handles reasoning.

#### Access Patterns

**Pattern 1: Direct Access (v2.4)** — Each agent has its own MCP connection (e.g., Claude Code Agent Teams, Cursor multi-agent). The agent calls tools directly. Multiple instances coordinate via shared SQLite.

**Pattern 2: Proxied Access (v2.5 — deferred)** — The orchestrator is the only MCP client. It proxies tool calls on behalf of agents that lack MCP access (e.g., Claude Code background subagents). MAXential manages multiple virtual agent contexts internally.

v2.4 builds the foundation (agent lifecycle, persistence, cross-agent reading). v2.5 layers proxied access on top using the same underlying infrastructure.

#### Agent Lifecycle

```
1. agent_register  → Agent announces itself, gets a branch, sets currentAgentId
2. think/branch/revise → Normal thinking tools, automatically attributed to agent
   └─ on each think(): server checks for new interjections, delivers them in response
3. agent_status    → Report progress (blocked, etc.)
4. agent_handoff   → Structured completion, branch closed, agent marked complete
```

The server tracks `currentAgentId` (parallel to existing `activeBranchId`). Set by `agent_register`, cleared by `agent_handoff`. All `think()` calls between register and handoff are automatically attributed to the current agent in persistence.

#### Interjection Delivery Mechanism

Interjections are collaborative inputs to the agent's reasoning stream — another agent or the orchestrator sharing an observation, correction, or redirect. The key design choice: **the server delivers interjections automatically**, not via polling.

**How it works:**

1. Another agent (or orchestrator) calls `agent_interject`, which writes a thought of type `'interjection'` into the target agent's branch in SQLite.
2. On the target agent's next `think()` call, the server checks SQLite for interjections in this agent's branch that haven't been synced to in-memory state.
3. New interjections are synced into the in-memory thought history and included in the `think()` response:

```json
{
  "thoughtNumber": 7,
  "totalThoughts": 7,
  "interjections": [
    {
      "from": "researcher-agent",
      "thought": "The dataset has a known sampling bias — see finding #3",
      "receivedAt": 1739812345678
    }
  ]
}
```

4. The agent sees the interjections as part of the tool output. Even a weak model encounters them naturally and can choose to adjust its reasoning.

**Why this matters:** This connects directly to the whitepaper's Section 2 on real-time self-monitoring — "a background process that observes the main reasoning stream and can intervene." The interjecting agent IS that background process. MAXential is the delivery mechanism that ensures the intervention reaches the agent's reasoning stream without requiring the agent to remember to check.

**Implementation detail:** The server tracks a "last synced" marker per agent (in-memory, not persisted). On each `think()`, it queries SQLite for thoughts in this agent's branch with timestamps after the marker. Any cross-instance writes (interjections or otherwise) are synced and delivered.

#### New Tools (8)

| Tool | Purpose | Key Schema Fields |
|------|---------|-------------------|
| `agent_register` | Agent announces itself, states purpose, auto-creates named branch | `name` (required), `task` (required), `parentAgentId` (optional) |
| `agent_handoff` | Structured completion optimized for orchestrator consumption | `conclusion` (required), `confidence` (enum: high/medium/low, required), `keyFindings` (array, required), `unresolvedQuestions` (array, optional) |
| `agent_status` | Report own status or query another agent's status | `agentId` (optional — omit for self), `status` (enum: active/blocked/completed/failed, optional — omit to query) |
| `agent_observe` | Read another agent's thinking chain from SQLite | `agentId` (required), `includeThoughts` (boolean, default false), `thoughtLimit` (integer, optional) |
| `agent_interject` | Write a collaborative thought into another agent's branch | `agentId` (required), `thought` (required) |
| `cross_agent_search` | Search across all agent branches | `query` (optional), `tags` (array, optional), `agentId` (optional filter), `status` (optional filter) |
| `synthesis` | Integrate multiple branch conclusions into unified analysis | `branchIds` (array, required), `content` (required) |
| `session_agents` | List all agents in current session | `status` (optional filter) |

#### Tool Design Detail

**`agent_register`** — Creates agent record in `agents` table. Auto-creates a branch named `agent-{name}`. Sets `currentAgentId` and `activeBranchId` on this server instance. Returns `agentId`, `branchId`, `registeredAt`.

**`agent_handoff`** — Creates a structured thought of type `'handoff'` in the agent's branch containing the structured completion data. Closes the branch with conclusion. Updates agent status to `'completed'`. Clears `currentAgentId` and `activeBranchId`. The orchestrator receives a compact, structured summary; the full thought chain remains in SQLite accessible via `agent_observe`.

**`agent_status`** — Dual-purpose: report own status (provide `status`), or query another agent's status (provide `agentId`). Queries always read from SQLite. Status enum: `active`, `blocked`, `completed`, `failed`.

**`agent_observe`** — Always reads from SQLite. Default mode returns agent metadata and summary (status, thought count, branch info, tags). With `includeThoughts: true`, returns the full thought chain. With `thoughtLimit`, returns the N most recent thoughts. Designed so even a weak orchestrator gets useful structured data without loading everything.

**`agent_interject`** — Writes a thought of type `'interjection'` into the target agent's branch in SQLite. In shared-file mode, the target agent sees it on their next `think()` call via the automatic delivery mechanism. In shared-process mode, it's available when the agent next runs. Interjections are collaborative inputs — observations, corrections, redirects — not commands.

**`cross_agent_search`** — Searches across all agents' thoughts in SQLite. Returns matches with agent attribution (which agent, which branch, agent status). Filters by query text, tags, specific agent, or agent status.

**`synthesis`** — Creates a record in the `syntheses` table combining conclusions from multiple agent branches. References source branch IDs (stored as JSON array). The synthesis content is the orchestrator's integrated analysis. Permanent record of cross-agent reasoning.

**`session_agents`** — Lists all agents in the current session with status, branch info, thought count, and registration/completion timestamps. Reads from SQLite.

#### Updates to Existing Tools

- `think` — Gains interjection awareness: before processing, check SQLite for new interjections in the current agent's branch. Deliver them in the response. Sync them into in-memory thought history.
- `search` — Add optional `agentId` parameter to filter by agent
- `export` — Add optional `agentId` parameter; include agent attribution in output
- `visualize` — Show agent subgraphs in mermaid/ascii diagrams

#### Implementation Changes by File

**`src/types/index.ts`** — New types:
- `AgentData` (id, name, task, parentAgentId, status, branchId, registeredAt, completedAt)
- `AgentStatus` type: `'active' | 'blocked' | 'completed' | 'failed'`
- `HandoffData` (conclusion, confidence, keyFindings, unresolvedQuestions)
- `SynthesisData` (id, sessionId, sourceBranches, content, createdAt)

**`src/persistence.ts`** — New prepared statements:
- Agent CRUD (insert, update status, get by id, list by session, query by status)
- Synthesis insert and query
- Cross-agent thought search (query across all branches with agent attribution)
- Interjection query (thoughts of type 'interjection' after a given timestamp)
- Update `insertThought` and `insertBranch` to accept `agentId` parameter (currently hardcoded to `null`)

**`src/lib.ts`** — New state and methods:
- Add `currentAgentId` field (parallel to `activeBranchId`)
- Add `lastInterjectionSync` timestamp field
- Update `addThought()` to pass `currentAgentId` to persistence
- Update `think()` to check for and deliver interjections
- 8 new public methods (one per tool)
- Update `search()`, `export()`, `visualize()` with agent filtering

**`src/index.ts`** — 8 new tool definitions + updated schemas for `search`, `export`, `visualize`

**Schema** — No changes needed. `agents`, `syntheses`, and `thought_references` tables already exist. `thoughts.agent_id` and `branches.agent_id` columns already exist (currently null). The `thoughts.type` column already supports `'interjection'` values.

#### Investigation Items (parallel with development)

- [ ] Test multi-instance SQLite coordination (two MCP instances, same DB, simultaneous writes)
- [ ] Test with Claude Code Agent Teams (shared-file mode, real multi-agent scenario)
- [ ] Document coordination patterns per client type
- [ ] Validate WAL mode handles concurrent agent writes without contention

#### Deliverables

- [ ] Agent lifecycle tools (`agent_register`, `agent_handoff`, `agent_status`, `session_agents`)
- [ ] Cross-agent observation tools (`agent_observe`, `agent_interject`, `cross_agent_search`, `synthesis`)
- [ ] Interjection delivery mechanism in `think()`
- [ ] Updated `search`, `export`, `visualize` with agent filtering
- [ ] New types in `src/types/index.ts`
- [ ] New persistence methods in `src/persistence.ts`
- [ ] Tests: agent lifecycle, cross-agent observation, interjection delivery, concurrent writes
- [ ] Updated README with multi-agent usage documentation
- [ ] npm publish as `@bam-devcrew/maxential-thinking-mcp@2.4.0`

---

### Phase 2.5: v2.5 — Proxied Agent Access

**Goal:** Enable orchestrators to manage agent thinking contexts on behalf of agents that lack direct MCP access.

**Prerequisite:** v2.4 shipped and stable. Real-world usage patterns observed.

**Core idea:** The orchestrator calls `agent_think({ agentId: "researcher", thought: "..." })` and MAXential routes the thought to the correct agent context internally. The orchestrator manages multiple virtual thinking spaces through a single MCP connection.

**Why deferred:** Pattern 1 (direct access) is the foundation. Real usage of v2.4 will reveal what the proxy API should look like. Designing it speculatively risks getting it wrong.

**Deliverables:**
- [ ] Proxy versions of thinking tools (agent_think, agent_branch, agent_revise)
- [ ] Virtual context management within single MCP instance
- [ ] Tests: orchestrator managing multiple virtual agents
- [ ] npm publish as `@bam-devcrew/maxential-thinking-mcp@2.5.0`

---

### Phase 3: v3.0 — Cross-Agent Intelligence

**Goal:** Pattern detection, automatic cross-referencing, session-spanning insights. The server itself becomes intelligent — not just storing and routing, but actively identifying patterns and contradictions.

**New capabilities:**
- Automatic contradiction detection across agent branches
- Tag-based cross-referencing (agents using similar tags = potential connection)
- Content-based similarity detection across branches
- Session-spanning pattern extraction (what works, what fails)
- Agent performance profiling (which agents produce high-value reasoning)

**Deliverables:**
- [ ] Contradiction detection in `cross_agent_search`
- [ ] Auto-tagging suggestions based on content analysis
- [ ] Session analytics tools
- [ ] Cross-session learning layer (the "super memory" concept from whitepaper)

---

### Phase 4: Networked Architecture (if needed)

**Goal:** HTTP/SSE transport for remote multi-machine coordination.

**Trigger:** Only build this if real users need agents on different machines sharing a thinking space. Don't build speculatively.

**Deliverables:**
- [ ] HTTP/SSE server mode (alternative to stdio)
- [ ] Authentication and access control
- [ ] Remote agent registration and observation
- [ ] Performance testing at scale

---

## Connection to White Paper Thesis

| White Paper Concept | Implementation | Phase |
|---|---|---|
| External metacognitive scaffolding | Thinking tools (think, branch, revise, search) | v2.x (shipped) |
| Accumulated self-knowledge | Persistent sessions, cross-session patterns | v2.3 (shipped) |
| Parallel exploration | Agent branches exploring simultaneously | v2.4 (Phase 2) |
| Real-time self-monitoring | `agent_observe` + `agent_interject` with automatic delivery | v2.4 (Phase 2) |
| Architecture as metacognition | Structured schemas enforce reasoning discipline for any model | v2.4 (Phase 2) |
| Proxied metacognition | Orchestrator manages thinking for agents without MCP access | v2.5 (Phase 2.5) |
| Interpretability-capability loop | Studying tool usage patterns to inform architecture | v3.0 (Phase 3) |
| Super memory | Cross-session learning layer | v3.0 (Phase 3) |
| Metacognitive architecture | The complete cognitive infrastructure | v3.0+ |

---

## Immediate Next Steps

1. ~~**Build:** v2.3 persistence layer~~ ✅
2. ~~**Test:** Session round-trip, concurrent access~~ ✅
3. ~~**Ship:** `@bam-devcrew/maxential-thinking-mcp@2.3.0`~~ ✅
4. **Build:** v2.4 agent awareness tools — start with types and persistence layer additions
5. **Test:** Agent lifecycle, interjection delivery, cross-agent observation
6. **Investigate:** Multi-instance SQLite coordination with real MCP clients
7. **Document:** Multi-agent usage patterns in README
8. **Ship:** `@bam-devcrew/maxential-thinking-mcp@2.4.0`

---

*This is a living document. Updated as decisions are made and findings emerge.*
