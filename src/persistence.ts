import initSqlJs, { Database as SqlJsDatabase, SqlValue } from 'sql.js';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  ThoughtData,
  BranchData,
  SessionMetadata,
  SessionState,
} from './types/index.js';

// =============================================================================
// Schema
// =============================================================================

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    status      TEXT NOT NULL DEFAULT 'active',
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS thoughts (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id          TEXT NOT NULL REFERENCES sessions(id),
    thought_number      INTEGER NOT NULL,
    thought             TEXT NOT NULL,
    type                TEXT NOT NULL DEFAULT 'thought',
    branch_id           TEXT,
    agent_id            TEXT,
    is_revision         INTEGER NOT NULL DEFAULT 0,
    revises_thought     INTEGER,
    branch_from_thought INTEGER,
    created_at          INTEGER NOT NULL,
    UNIQUE(session_id, thought_number)
);

CREATE INDEX IF NOT EXISTS idx_thoughts_session_branch
    ON thoughts(session_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_thoughts_session_agent
    ON thoughts(session_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_thoughts_type
    ON thoughts(session_id, type);

CREATE TABLE IF NOT EXISTS branches (
    id              TEXT NOT NULL,
    session_id      TEXT NOT NULL REFERENCES sessions(id),
    origin_thought  INTEGER NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active',
    conclusion      TEXT,
    agent_id        TEXT,
    merge_strategy  TEXT,
    created_at      INTEGER NOT NULL,
    closed_at       INTEGER,
    merged_at       INTEGER,
    PRIMARY KEY (session_id, id)
);

CREATE TABLE IF NOT EXISTS tags (
    session_id      TEXT NOT NULL,
    thought_number  INTEGER NOT NULL,
    tag             TEXT NOT NULL,
    PRIMARY KEY (session_id, thought_number, tag)
);

CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);

CREATE TABLE IF NOT EXISTS thought_references (
    session_id      TEXT NOT NULL,
    from_thought    INTEGER NOT NULL,
    to_thought      INTEGER NOT NULL,
    PRIMARY KEY (session_id, from_thought, to_thought)
);

CREATE TABLE IF NOT EXISTS agents (
    id              TEXT NOT NULL,
    session_id      TEXT NOT NULL REFERENCES sessions(id),
    name            TEXT NOT NULL,
    description     TEXT,
    parent_agent_id TEXT,
    status          TEXT NOT NULL DEFAULT 'active',
    branch_id       TEXT,
    registered_at   INTEGER NOT NULL,
    completed_at    INTEGER,
    PRIMARY KEY (session_id, id)
);

CREATE INDEX IF NOT EXISTS idx_agents_status
    ON agents(session_id, status);

CREATE TABLE IF NOT EXISTS syntheses (
    id              TEXT PRIMARY KEY,
    session_id      TEXT NOT NULL REFERENCES sessions(id),
    source_branches TEXT NOT NULL,
    content         TEXT NOT NULL,
    created_at      INTEGER NOT NULL
);
`;

// =============================================================================
// PersistenceLayer (sql.js)
// =============================================================================

export class PersistenceLayer {
  private db: SqlJsDatabase;
  private dbPath: string;

  private constructor(db: SqlJsDatabase, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
    this.db.run('PRAGMA foreign_keys = ON;');
    this.db.run(SCHEMA_SQL);
    this.save();
  }

  public static async create(dbPath: string): Promise<PersistenceLayer> {
    const SQL = await initSqlJs();

    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (dir && dir !== '.' && !fs.existsSync(dir)) {
        try {
          fs.mkdirSync(dir, { recursive: true });
        } catch (error) {
          throw new Error(
            `Cannot create database directory: ${dir}. Check folder permissions.`
          );
        }
      }
    }

    let db: SqlJsDatabase;
    if (dbPath !== ':memory:' && fs.existsSync(dbPath)) {
      try {
        const fileBuffer = fs.readFileSync(dbPath);
        db = new SQL.Database(fileBuffer);
      } catch (e) {
        db = new SQL.Database();
      }
    } else {
      db = new SQL.Database();
    }

    return new PersistenceLayer(db, dbPath);
  }

  public save(): void {
    if (this.dbPath !== ':memory:') {
      try {
        const data = this.db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(this.dbPath, buffer);
      } catch (error) {
        console.error('Failed to save database to disk:', error);
      }
    }
  }

  // ===========================================================================
  // Session Operations
  // ===========================================================================

  createSession(name: string, description?: string): string {
    const id = randomUUID();
    const now = Date.now();
    this.db.run(
      'INSERT INTO sessions (id, name, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, name, description || null, 'active', now, now]
    );
    this.save();
    return id;
  }

  updateSessionName(id: string, name: string, description?: string): void {
    const now = Date.now();
    this.db.run(
      'UPDATE sessions SET name = ?, description = ?, updated_at = ? WHERE id = ?',
      [name, description ?? null, now, id]
    );
    this.save();
  }

  updateSessionTimestamp(id: string): void {
    this.db.run('UPDATE sessions SET updated_at = ? WHERE id = ?', [
      Date.now(),
      id,
    ]);
    this.save();
  }

  updateSessionStatus(id: string, status: string): void {
    this.db.run('UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?', [
      status,
      Date.now(),
      id,
    ]);
    this.save();
  }

  getSession(id: string): SessionMetadata | null {
    const stmt = this.db.prepare(`
      SELECT s.*,
        (SELECT COUNT(*) FROM thoughts WHERE session_id = s.id) as thought_count,
        (SELECT COUNT(*) FROM branches WHERE session_id = s.id) as branch_count
      FROM sessions s WHERE s.id = ?
    `);
    stmt.bind([id]);
    if (stmt.step()) {
      const row = stmt.getAsObject() as unknown as SessionRow;
      stmt.free();
      return this.rowToSessionMetadata(row);
    }
    stmt.free();
    return null;
  }

  listSessions(options?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): SessionMetadata[] {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    let sql = `
      SELECT s.*,
        (SELECT COUNT(*) FROM thoughts WHERE session_id = s.id) as thought_count,
        (SELECT COUNT(*) FROM branches WHERE session_id = s.id) as branch_count
      FROM sessions s
    `;
    const params: SqlValue[] = [];

    if (options?.status) {
      sql += ' WHERE s.status = ?';
      params.push(options.status);
    }

    sql += ' ORDER BY s.updated_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(sql);
    stmt.bind(params);

    const rows: SessionRow[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as SessionRow);
    }
    stmt.free();

    return rows.map((row) => this.rowToSessionMetadata(row));
  }

  countSessions(status?: string): number {
    let sql = 'SELECT COUNT(*) as count FROM sessions';
    const params: SqlValue[] = [];
    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }

    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    let count = 0;
    if (stmt.step()) {
      const res = stmt.getAsObject() as { count: number };
      count = res.count;
    }
    stmt.free();
    return count;
  }

  // ===========================================================================
  // Thought Operations
  // ===========================================================================

  insertThought(sessionId: string, thought: ThoughtData): void {
    const type = this.classifyThoughtType(thought);
    this.db.run(
      `INSERT INTO thoughts (session_id, thought_number, thought, type, branch_id, agent_id,
       is_revision, revises_thought, branch_from_thought, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        thought.thoughtNumber,
        thought.thought,
        type,
        thought.branchId || null,
        null,
        thought.isRevision ? 1 : 0,
        thought.revisesThought || null,
        thought.branchFromThought || null,
        Date.now(),
      ]
    );

    if (thought.tags && thought.tags.length > 0) {
      this.setTags(sessionId, thought.thoughtNumber, thought.tags);
    }

    this.updateSessionTimestamp(sessionId);
  }

  getThoughts(sessionId: string, branchId?: string): ThoughtData[] {
    let sql = 'SELECT * FROM thoughts WHERE session_id = ?';
    const params: SqlValue[] = [sessionId];

    if (branchId) {
      sql += ' AND branch_id = ?';
      params.push(branchId);
    }
    sql += ' ORDER BY thought_number ASC';

    const stmt = this.db.prepare(sql);
    stmt.bind(params);

    const rows: ThoughtRow[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as ThoughtRow);
    }
    stmt.free();

    const allTags = this.getTagsBySession(sessionId);
    return rows.map((row) => this.rowToThoughtData(row, allTags));
  }

  // ===========================================================================
  // Branch Operations
  // ===========================================================================

  insertBranch(sessionId: string, branch: BranchData): void {
    this.db.run(
      `INSERT INTO branches (id, session_id, origin_thought, status, conclusion, agent_id,
       merge_strategy, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        branch.branchId,
        sessionId,
        branch.originThought,
        branch.status,
        branch.conclusion || null,
        null,
        null,
        branch.createdAt,
      ]
    );
    this.updateSessionTimestamp(sessionId);
  }

  updateBranchClose(
    sessionId: string,
    branchId: string,
    conclusion: string | undefined,
    closedAt: number
  ): void {
    this.db.run(
      `UPDATE branches SET status = ?, conclusion = ?, closed_at = ?
       WHERE session_id = ? AND id = ?`,
      ['closed', conclusion || null, closedAt, sessionId, branchId]
    );
    this.updateSessionTimestamp(sessionId);
  }

  updateBranchMerge(
    sessionId: string,
    branchId: string,
    strategy: string,
    mergedAt: number
  ): void {
    this.db.run(
      'UPDATE branches SET status = ?, merge_strategy = ?, merged_at = ? WHERE session_id = ? AND id = ?',
      ['merged', strategy, mergedAt, sessionId, branchId]
    );
    this.updateSessionTimestamp(sessionId);
  }

  getBranches(sessionId: string): BranchData[] {
    const stmt = this.db.prepare(
      'SELECT * FROM branches WHERE session_id = ? ORDER BY created_at ASC'
    );
    stmt.bind([sessionId]);

    const rows: BranchRow[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as BranchRow);
    }
    stmt.free();

    return rows.map((row) => this.rowToBranchData(row));
  }

  // ===========================================================================
  // Tag Operations
  // ===========================================================================

  setTags(sessionId: string, thoughtNumber: number, tags: string[]): void {
    this.db.run(
      'DELETE FROM tags WHERE session_id = ? AND thought_number = ?',
      [sessionId, thoughtNumber]
    );
    for (const tag of tags) {
      this.db.run(
        'INSERT OR IGNORE INTO tags (session_id, thought_number, tag) VALUES (?, ?, ?)',
        [sessionId, thoughtNumber, tag]
      );
    }
    this.updateSessionTimestamp(sessionId);
  }

  private getTagsBySession(sessionId: string): Map<number, string[]> {
    const stmt = this.db.prepare(
      'SELECT thought_number, tag FROM tags WHERE session_id = ? ORDER BY thought_number ASC'
    );
    stmt.bind([sessionId]);

    const tagMap = new Map<number, string[]>();
    while (stmt.step()) {
      const row = stmt.getAsObject() as unknown as TagRow;
      const existing = tagMap.get(row.thought_number);
      if (existing) {
        existing.push(row.tag);
      } else {
        tagMap.set(row.thought_number, [row.tag]);
      }
    }
    stmt.free();
    return tagMap;
  }

  // ===========================================================================
  // Full Session Load (hydration)
  // ===========================================================================

  loadSession(
    id: string
  ): { metadata: SessionMetadata; state: SessionState } | null {
    const metadata = this.getSession(id);
    if (!metadata) return null;

    const thoughts = this.getThoughts(id);
    const branches = this.getBranches(id);

    const branchRecord: Record<string, BranchData> = {};
    for (const branch of branches) {
      branch.thoughts = thoughts.filter((t) => t.branchId === branch.branchId);
      branchRecord[branch.branchId] = branch;
    }

    return {
      metadata,
      state: {
        thoughtHistory: thoughts,
        branches: branchRecord,
        summaries: [],
        checkpoints: [],
      },
    };
  }

  close(): void {
    this.save();
    this.db.close();
  }

  // ===========================================================================
  // Internal Helpers
  // ===========================================================================

  private classifyThoughtType(thought: ThoughtData): string {
    if (thought.type) return thought.type;
    if (thought.thought.startsWith('CONCLUSION:')) return 'conclusion';
    if (thought.thought.startsWith('BRANCH START:')) return 'branch_start';
    return 'thought';
  }

  private rowToSessionMetadata(row: SessionRow): SessionMetadata {
    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      thoughtCount: Number(row.thought_count),
      branchCount: Number(row.branch_count),
    };
  }

  private rowToThoughtData(
    row: ThoughtRow,
    tagMap: Map<number, string[]>
  ): ThoughtData {
    const thought: ThoughtData = {
      thought: row.thought,
      thoughtNumber: Number(row.thought_number),
      totalThoughts: Number(row.thought_number),
      nextThoughtNeeded: true,
    };

    if (row.is_revision) thought.isRevision = true;
    if (row.revises_thought) thought.revisesThought = Number(row.revises_thought);
    if (row.branch_from_thought)
      thought.branchFromThought = Number(row.branch_from_thought);
    if (row.branch_id) thought.branchId = row.branch_id;
    if (row.type && row.type !== 'thought')
      thought.type = row.type as ThoughtData['type'];

    const tags = tagMap.get(Number(row.thought_number));
    if (tags && tags.length > 0) thought.tags = tags;

    return thought;
  }

  private rowToBranchData(row: BranchRow): BranchData {
    const branch: BranchData = {
      branchId: row.id,
      originThought: Number(row.origin_thought),
      thoughts: [],
      status: row.status as BranchData['status'],
      createdAt: Number(row.created_at),
    };

    if (row.conclusion) branch.conclusion = row.conclusion;
    if (row.closed_at) branch.closedAt = Number(row.closed_at);
    if (row.merged_at) branch.mergedAt = Number(row.merged_at);

    return branch;
  }
}

// =============================================================================
// Row Types
// =============================================================================

interface SessionRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: number;
  updated_at: number;
  thought_count: number;
  branch_count: number;
}

interface ThoughtRow {
  id: number;
  session_id: string;
  thought_number: number;
  thought: string;
  type: string;
  branch_id: string | null;
  agent_id: string | null;
  is_revision: number;
  revises_thought: number | null;
  branch_from_thought: number | null;
  created_at: number;
}

interface BranchRow {
  id: string;
  session_id: string;
  origin_thought: number;
  status: string;
  conclusion: string | null;
  agent_id: string | null;
  merge_strategy: string | null;
  created_at: number;
  closed_at: number | null;
  merged_at: number | null;
}

interface TagRow {
  thought_number: number;
  tag: string;
}

// =============================================================================
// Path Resolution
// =============================================================================

export function resolveDbPath(): string {
  const envPath = process.env.MAXENTIAL_DB_PATH;

  if (envPath === ':memory:') {
    return ':memory:';
  }

  if (envPath) {
    if (envPath.startsWith('~')) {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      const relativePart = envPath.slice(1).replace(/^[/\\]+/, '');
      return path.resolve(path.join(homeDir, relativePart));
    }
    return path.resolve(envPath);
  }

  return path.resolve(path.join(process.cwd(), '.maxential', 'thinking.db'));
}
