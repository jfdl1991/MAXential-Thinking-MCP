import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { PersistenceLayer, resolveDbPath } from './persistence.js';
import { SequentialThinkingServer } from './lib.js';

describe('PersistenceLayer & SequentialThinkingServer (sql.js)', () => {
  const testDbPath = path.resolve('./.maxential/test_thinking.db');

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('creates in-memory database and handles session operations', async () => {
    const db = await PersistenceLayer.create(':memory:');
    const sessionId = db.createSession('Test Session', 'A description');
    expect(sessionId).toBeDefined();

    const session = db.getSession(sessionId);
    expect(session).not.toBeNull();
    expect(session?.name).toBe('Test Session');
    expect(session?.description).toBe('A description');

    db.close();
  });

  it('saves database file to disk and resolves path correctly', async () => {
    const db = await PersistenceLayer.create(testDbPath);
    const sessionId = db.createSession('Disk Session');

    db.insertThought(sessionId, {
      thought: 'First persisted thought',
      thoughtNumber: 1,
      totalThoughts: 1,
      nextThoughtNeeded: true,
    });

    expect(fs.existsSync(testDbPath)).toBe(true);

    const thoughts = db.getThoughts(sessionId);
    expect(thoughts.length).toBe(1);
    expect(thoughts[0].thought).toBe('First persisted thought');

    db.close();
  });

  it('SequentialThinkingServer initializes async persistence and executes thinking tools', async () => {
    process.env.MAXENTIAL_DB_PATH = testDbPath;
    const server = new SequentialThinkingServer();
    await server.initializePersistence();

    const thinkRes = server.think({ thought: 'Testing thought 1' });
    expect(thinkRes.isError).toBeUndefined();

    const historyRes = server.getHistory({});
    expect(historyRes.isError).toBeUndefined();
    const historyData = JSON.parse(historyRes.content[0].text);
    expect(historyData.totalCount).toBe(1);
    expect(historyData.thoughts[0].thought).toBe('Testing thought 1');
  });

  it('resolveDbPath expands ~ and resolves Windows/Linux paths correctly', () => {
    const oldEnv = process.env.MAXENTIAL_DB_PATH;
    const oldHome = process.env.HOME;
    const oldUserProfile = process.env.USERPROFILE;

    process.env.MAXENTIAL_DB_PATH = '~/test_dir/db.sqlite';
    process.env.HOME = '/home/testuser';
    delete process.env.USERPROFILE;

    const resolvedUnix = resolveDbPath();
    expect(resolvedUnix).toContain('testuser');
    expect(resolvedUnix).toContain('test_dir');

    process.env.MAXENTIAL_DB_PATH = oldEnv;
    process.env.HOME = oldHome;
    process.env.USERPROFILE = oldUserProfile;
  });
});
