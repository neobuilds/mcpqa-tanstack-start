import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import fs from 'node:fs'

const DEFAULT_DB_PATH = './data/taskboard.db'
const SCHEMA_VERSION = 1

let db: DatabaseSync | null = null

function resolveDbPath(): string {
  const configured = process.env.DATABASE_PATH
  if (!configured) return DEFAULT_DB_PATH
  if (path.isAbsolute(configured)) return configured
  return path.resolve(process.cwd(), configured)
}

export function getDb(): DatabaseSync {
  if (db) return db

  const dbPath = resolveDbPath()
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  const connection = new DatabaseSync(dbPath)
  db = connection

  schemaInit(connection)

  return connection
}

export function getDbPath(): string {
  return resolveDbPath()
}

function schemaInit(connection: DatabaseSync): void {
  connection.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'todo'
        CHECK (status IN ('todo', 'in_progress', 'done')),
      priority TEXT NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);

    PRAGMA user_version = ${SCHEMA_VERSION};
  `)

  seedIfEmpty(connection)
}

function seedIfEmpty(connection: DatabaseSync): void {
  const row = connection.prepare('SELECT COUNT(*) AS count FROM tasks').get() as {
    count: number
  }
  if (row.count > 0) return

  const seeds = [
    { title: 'Design the board layout', status: 'done', priority: 'medium' },
    { title: 'Build the SSR task list', status: 'in_progress', priority: 'high' },
    { title: 'Wire server-side create form', status: 'in_progress', priority: 'high' },
    { title: 'Add status filter', status: 'todo', priority: 'low' },
  ]

  const insert = connection.prepare(`
    INSERT INTO tasks (title, status, priority, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `)

  for (const [index, task] of seeds.entries()) {
    const timestamp = `2026-01-0${index + 1}T09:00:00.000Z`
    insert.run(task.title, task.status, task.priority, timestamp, timestamp)
  }
}

export function checkDatabase(): boolean {
  try {
    const connection = getDb()
    connection.prepare('SELECT 1 AS ok').get()
    return true
  } catch {
    return false
  }
}