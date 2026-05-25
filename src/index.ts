#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { SequentialThinkingServer } from "./lib.js";

// =============================================================================
// THINKING TOOLS
// =============================================================================

const THINK_TOOL: Tool = {
  name: "think",
  description: "Add a numbered thought to your reasoning chain. Each call persists to SQLite automatically. On first call, a new session is created. Use for any multi-step reasoning — analysis, debugging, design, research. Subsequent thoughts are appended to the active branch (main by default). Do not use for simple, single-step answers.",
  inputSchema: {
    type: "object",
    properties: {
      thought: {
        type: "string",
        description: "Your current thinking step"
      }
    },
    required: ["thought"]
  }
};

const REVISE_TOOL: Tool = {
  name: "revise",
  description: "Replace a previous thought with updated reasoning. The original thought is preserved in revision history. Use when earlier thinking was wrong, incomplete, or superseded by new information. Persists to SQLite. Do not use to add new thoughts — use think instead.",
  inputSchema: {
    type: "object",
    properties: {
      thought: { type: "string", description: "Your revised thinking" },
      revisesThought: { type: "integer", description: "The thought number being revised", minimum: 1 }
    },
    required: ["thought", "revisesThought"]
  }
};

const COMPLETE_TOOL: Tool = {
  name: "complete",
  description: "Mark the thinking chain as complete with a final conclusion. Sets the session status to 'complete'. Use when reasoning has reached a definitive answer. The session remains accessible via session_load and session_list. Do not call if you plan to continue thinking — you can always add more thoughts.",
  inputSchema: {
    type: "object",
    properties: {
      conclusion: { type: "string", description: "Your final conclusion or answer" }
    },
    required: ["conclusion"]
  }
};


const RESET_TOOL: Tool = {
  name: "reset",
  description: "Clear the in-memory thinking state and start a fresh session. The previous session's data is NOT deleted — it remains in SQLite and can be loaded later with session_load. Destructive to in-memory state only. Returns confirmation. Use when switching to an unrelated problem where carrying the old context would be noise. Requires confirm=true to prevent accidental clearing.",
  inputSchema: {
    type: "object",
    properties: {
      confirm: { type: "boolean", description: "Must be true to confirm reset (prevents accidental clearing)" }
    },
    required: ["confirm"]
  }
};

// =============================================================================
// BRANCHING TOOLS
// =============================================================================

const BRANCH_TOOL: Tool = {
  name: "branch",
  description: "Create a new reasoning branch and switch to it. Subsequent think calls go to this branch until you switch_branch. Use to explore an alternative approach without affecting the main thread. Each branch maintains its own thought sequence. Persists to SQLite. Use close_branch when a path is exhausted, or merge_branch to bring insights back to main.",
  inputSchema: {
    type: "object",
    properties: {
      branchId: { type: "string", description: "A short identifier for this branch" },
      reason: { type: "string", description: "Why you are branching" }
    },
    required: ["branchId", "reason"]
  }
};

const SWITCH_BRANCH_TOOL: Tool = {
  name: "switch_branch",
  description: "Switch which branch receives new thoughts. Omit branchId to return to main. After switching, all think and revise calls apply to the active branch. Read-only tools (get_thought, search, get_history) can access any branch regardless of which is active. Does not modify any data.",
  inputSchema: {
    type: "object",
    properties: {
      branchId: { type: "string", description: "The branch to switch to, or omit for main" }
    },
    required: []
  }
};

const LIST_BRANCHES_TOOL: Tool = {
  name: "list_branches",
  description: "List all reasoning branches in the current session. Read-only. Returns for each branch: branch ID, origin thought number, status (active/closed/merged), conclusion if set, thought count, and timestamps. Use to see what reasoning paths exist before switching, merging, or closing. The main branch is always included. No parameters — operates on the active session.",
  inputSchema: { type: "object", properties: {}, required: [] }
};

const GET_BRANCH_TOOL: Tool = {
  name: "get_branch",
  description: "Retrieve a specific branch's metadata and full thought history. Read-only. Returns: branch ID, origin thought, status (active/closed/merged), conclusion if set, all thoughts in the branch with their numbers and content, and timestamps. Use to deeply inspect a branch's reasoning before deciding to merge, close, or continue it. Use list_branches first to get the branch ID.",
  inputSchema: {
    type: "object",
    properties: {
      branchId: { type: "string", description: "The ID of the branch to retrieve" }
    },
    required: ["branchId"]
  }
};

const CLOSE_BRANCH_TOOL: Tool = {
  name: "close_branch",
  description: "Close a branch, marking it as no longer active. Optionally include a conclusion summarizing what was learned. Closed branches and their thoughts are preserved and remain readable. Use when a line of reasoning is exhausted or the answer is clear. Cannot be reopened. To bring findings back to main first, use merge_branch instead.",
  inputSchema: {
    type: "object",
    properties: {
      branchId: { type: "string", description: "The ID of the branch to close" },
      conclusion: { type: "string", description: "Summary or conclusion" }
    },
    required: ["branchId"]
  }
};

const MERGE_BRANCH_TOOL: Tool = {
  name: "merge_branch",
  description: "Merge findings from a branch back into the main thread as a new thought on main. The branch is marked as merged afterward. Strategies: conclusion_only — adds only the branch conclusion to main; full_integration — adds all branch thoughts to main; summary — generates a condensed summary of the branch on main. Use after a branch has produced useful findings you want on the main thread.",
  inputSchema: {
    type: "object",
    properties: {
      branchId: { type: "string", description: "The ID of the branch to merge" },
      strategy: { type: "string", enum: ["conclusion_only", "full_integration", "summary"], description: "How to merge" }
    },
    required: ["branchId", "strategy"]
  }
};

// =============================================================================
// NAVIGATION TOOLS
// =============================================================================

const GET_THOUGHT_TOOL: Tool = {
  name: "get_thought",
  description: "Retrieve a specific thought by its number, including any tags and revision history. Read-only. Use to reference or review earlier reasoning without scrolling through the full history.",
  inputSchema: {
    type: "object",
    properties: {
      thoughtNumber: { type: "integer", description: "The thought number to retrieve", minimum: 1 }
    },
    required: ["thoughtNumber"]
  }
};

const GET_HISTORY_TOOL: Tool = {
  name: "get_history",
  description: "Retrieve the thought history for the current active session. Read-only. Returns thoughts in chronological order with their numbers, content, tags, branch assignments, and any revision links. Optionally filter to a specific branch with branchId, or cap results with limit. Use to review the full reasoning chain or to find context before adding the next thought.",
  inputSchema: {
    type: "object",
    properties: {
      branchId: { type: "string", description: "Optional: filter by branch" },
      limit: { type: "integer", description: "Optional: limit results", minimum: 1 }
    },
    required: []
  }
};


// =============================================================================
// ORGANIZATION TOOLS (v2.2)
// =============================================================================

const TAG_TOOL: Tool = {
  name: "tag",
  description: "Add or remove semantic tags on a thought. Tags are searchable via the search tool. Common tags: hypothesis, evidence, decision, finding, question, risk. Persists to SQLite. At least one of 'add' or 'remove' should be provided.",
  inputSchema: {
    type: "object",
    properties: {
      thoughtNumber: { type: "integer", description: "The thought to tag", minimum: 1 },
      add: { type: "array", items: { type: "string" }, description: "Tags to add" },
      remove: { type: "array", items: { type: "string" }, description: "Tags to remove" }
    },
    required: ["thoughtNumber"]
  }
};

const SEARCH_TOOL: Tool = {
  name: "search",
  description: "Search the current session's thoughts by text content, tags, or both. Text search is case-insensitive substring matching. Tag search requires all specified tags to be present. Optionally limit to a specific branch. Read-only. Returns matching thoughts with their numbers, content, and tags.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Text to search for (case-insensitive)" },
      tags: { type: "array", items: { type: "string" }, description: "Filter by tags (must have all specified)" },
      branchId: { type: "string", description: "Limit search to specific branch" }
    },
    required: []
  }
};

const EXPORT_TOOL: Tool = {
  name: "export",
  description: "Export the current session's thinking chain as formatted text. Read-only. Markdown format produces a human-readable document with section headers per thought, branch headings, and tags as inline markers — suitable for handoffs or documentation. JSON format produces machine-parseable output including all thoughts, branches, tags, and metadata. Optionally export a single branch by providing branchId. Default format is markdown. Use when sharing reasoning with humans or other systems.",
  inputSchema: {
    type: "object",
    properties: {
      format: { type: "string", enum: ["markdown", "json"], description: "Output format (default: markdown)" },
      branchId: { type: "string", description: "Export only a specific branch" }
    },
    required: []
  }
};

const VISUALIZE_TOOL: Tool = {
  name: "visualize",
  description: "Generate a visual diagram of the thinking chain showing thoughts, branches, branch points, and revisions. Read-only. Returns a single text block ready to display. Mermaid format produces a graph for rendering in GitHub, Obsidian, or markdown documentation. ASCII format produces a plain-text tree for terminal or inline display in conversation. Default format is mermaid. Use to share the reasoning structure or to orient in a long chain. Set showContent=true to include thought preview text in nodes (default false for compactness).",
  inputSchema: {
    type: "object",
    properties: {
      format: { type: "string", enum: ["ascii", "mermaid"], description: "Output format (default: mermaid)" },
      showContent: { type: "boolean", description: "Include thought content preview (default: false)" }
    },
    required: []
  }
};

// =============================================================================
// SESSION TOOLS (v2.3)
// =============================================================================

const SESSION_SAVE_TOOL: Tool = {
  name: "session_save",
  description: "Name and describe the active thinking session for later retrieval. The session and all its thoughts are already persisted to SQLite automatically — this only adds a human-readable name and optional description. Persists session metadata. Use when you want to find this session later via session_list. Without session_save, the session keeps an auto-generated timestamp name.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "A descriptive name for this session (e.g., 'Debugging auth flow')" },
      description: { type: "string", description: "Optional longer description of the session's purpose or context" }
    },
    required: ["name"]
  }
};

const SESSION_LOAD_TOOL: Tool = {
  name: "session_load",
  description: "Restore a previously saved thinking session into memory, replacing the current in-memory state. All thoughts, branches, and tags from the saved session are loaded. The current session's data is not lost — it remains in SQLite and can be loaded later. Use after session_list to find the session UUID. Replaces current working state.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "The session UUID to load (from session_list)" }
    },
    required: ["id"]
  }
};

const SESSION_LIST_TOOL: Tool = {
  name: "session_list",
  description: "List previously saved thinking sessions in the SQLite database. Read-only. Returns: session UUID, name, description, status (active/complete/archived), created/updated timestamps, thought count, branch count. Sorted by most recently updated first. Use to find a session UUID before calling session_load or session_summary. Filter by status to find specifically complete or archived work.",
  inputSchema: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["active", "complete", "archived"], description: "Filter by session status" },
      limit: { type: "integer", description: "Max sessions to return (default: 20)", minimum: 1, maximum: 100 }
    },
    required: []
  }
};

const SESSION_SUMMARY_TOOL: Tool = {
  name: "session_summary",
  description: "Generate a compressed text summary of a saved session for token-efficient context loading. Read-only. Returns: session metadata, key findings extracted from conclusions and tagged thoughts, branch results, and final conclusion. Use when you want context from a previous session without loading the full thought history. For full restoration use session_load instead. Default summary length is 2000 characters, adjustable via maxLength.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "The session UUID to summarize" },
      maxLength: { type: "integer", description: "Target summary length in characters (default: 2000)", minimum: 100 }
    },
    required: ["id"]
  }
};

// =============================================================================
// SERVER SETUP
// =============================================================================

const server = new Server(
  { name: "maxential-thinking-server", version: "2.3.0" },
  { capabilities: { tools: {} } }
);

const thinkingServer = new SequentialThinkingServer();

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    THINK_TOOL, REVISE_TOOL, COMPLETE_TOOL, RESET_TOOL,
    BRANCH_TOOL, SWITCH_BRANCH_TOOL, LIST_BRANCHES_TOOL, GET_BRANCH_TOOL, CLOSE_BRANCH_TOOL, MERGE_BRANCH_TOOL,
    GET_THOUGHT_TOOL, GET_HISTORY_TOOL,
    TAG_TOOL, SEARCH_TOOL, EXPORT_TOOL, VISUALIZE_TOOL,
    SESSION_SAVE_TOOL, SESSION_LOAD_TOOL, SESSION_LIST_TOOL, SESSION_SUMMARY_TOOL,
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "think": return thinkingServer.think(request.params.arguments);
    case "revise": return thinkingServer.revise(request.params.arguments);
    case "complete": return thinkingServer.complete(request.params.arguments);
    case "reset": return thinkingServer.reset(request.params.arguments);
    case "branch": return thinkingServer.branch(request.params.arguments);
    case "switch_branch": return thinkingServer.switchBranch(request.params.arguments);
    case "list_branches": return thinkingServer.listBranches();
    case "get_branch": return thinkingServer.getBranch(request.params.arguments);
    case "close_branch": return thinkingServer.closeBranch(request.params.arguments);
    case "merge_branch": return thinkingServer.mergeBranch(request.params.arguments);
    case "get_thought": return thinkingServer.getThought(request.params.arguments);
    case "get_history": return thinkingServer.getHistory(request.params.arguments);
    case "tag": return thinkingServer.tag(request.params.arguments);
    case "search": return thinkingServer.search(request.params.arguments);
    case "export": return thinkingServer.export(request.params.arguments);
    case "visualize": return thinkingServer.visualize(request.params.arguments);
    case "session_save": return thinkingServer.sessionSave(request.params.arguments);
    case "session_load": return thinkingServer.sessionLoad(request.params.arguments);
    case "session_list": return thinkingServer.sessionList(request.params.arguments);
    case "session_summary": return thinkingServer.sessionSummary(request.params.arguments);
    default:
      return { content: [{ type: "text", text: "Unknown tool: " + request.params.name }], isError: true };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MAXential Thinking MCP Server v2.3.0 running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
