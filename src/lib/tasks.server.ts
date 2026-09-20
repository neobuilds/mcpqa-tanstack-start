import { getDb } from './db.server'
import type { Task, TaskPriority, TaskStatus } from './schemas'

type TaskRow = {
  id: number
  title: string
  status: TaskStatus
  priority: TaskPriority
  createdAt: string
  updatedAt: string
}

const SELECT_COLUMNS = `
  id,
  title,
  status,
  priority,
  created_at AS createdAt,
  updated_at AS updatedAt
`

function mapRow(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function listTasks(status?: TaskStatus): Task[] {
  const db = getDb()

  if (status) {
    const rows = db
      .prepare(
        `
        SELECT ${SELECT_COLUMNS}
        FROM tasks
        WHERE status = ?
        ORDER BY created_at ASC, id ASC
        `,
      )
      .all(status) as unknown as TaskRow[]
    return rows.map(mapRow)
  }

  const rows = db
    .prepare(
      `
      SELECT ${SELECT_COLUMNS}
      FROM tasks
      ORDER BY created_at ASC, id ASC
      `,
    )
    .all() as unknown as TaskRow[]
  return rows.map(mapRow)
}

export function getTask(id: number): Task | null {
  const db = getDb()
  const row = db
    .prepare(
      `
      SELECT ${SELECT_COLUMNS}
      FROM tasks
      WHERE id = ?
      `,
    )
    .get(id) as TaskRow | undefined
  return row ? mapRow(row) : null
}

export function createTask(input: {
  title: string
  status?: TaskStatus
  priority?: TaskPriority
}): Task {
  const db = getDb()
  const now = new Date().toISOString()
  const result = db
    .prepare(
      `
      INSERT INTO tasks (title, status, priority, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      `,
    )
    .run(input.title, input.status ?? 'todo', input.priority ?? 'medium', now, now) as {
    lastInsertRowid: number | bigint
  }

  const created = getTask(Number(result.lastInsertRowid))
  if (!created) throw new Error('Failed to create task')
  return created
}

export function updateTask(input: {
  id: number
  title?: string
  status?: TaskStatus
  priority?: TaskPriority
}): Task {
  const db = getDb()
  const existing = getTask(input.id)
  if (!existing) throw new TaskNotFoundError(input.id)

  const title = input.title ?? existing.title
  const status = input.status ?? existing.status
  const priority = input.priority ?? existing.priority
  const now = new Date().toISOString()

  db.prepare(
    `
    UPDATE tasks
    SET title = ?, status = ?, priority = ?, updated_at = ?
    WHERE id = ?
    `,
  ).run(title, status, priority, now, input.id)

  const updated = getTask(input.id)
  if (!updated) throw new Error('Failed to update task')
  return updated
}

export function deleteTask(id: number): { id: number; deleted: boolean } {
  const db = getDb()
  const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(id) as {
    changes: number
  }
  return { id, deleted: result.changes > 0 }
}

export class TaskNotFoundError extends Error {
  readonly id: number

  constructor(id: number) {
    super(`Task ${id} not found`)
    this.id = id
    this.name = 'TaskNotFoundError'
  }
}