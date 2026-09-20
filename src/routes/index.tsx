import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import type { FormEvent } from 'react'

import {
  createTaskFn,
  deleteTaskFn,
  listTasksFn,
  updateTaskFn,
} from '../functions/tasks.functions'
import { RELEASE } from '../lib/release'
import { taskStatusFilterSchema } from '../lib/schemas'
import type { Task, TaskPriority, TaskStatus, TaskStatusFilter } from '../lib/schemas'

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>) => ({
    status: taskStatusFilterSchema.parse(search.status),
  }),
  loaderDeps: ({ search }) => ({ status: search.status }),
  loader: ({ deps }) =>
    listTasksFn({
      data: {
        status:
          deps.status === 'all' ? undefined : (deps.status as TaskStatus),
      },
    }),
  component: TaskboardPage,
})

const FILTERS: ReadonlyArray<{ value: TaskStatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
]

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'Todo',
  in_progress: 'In progress',
  done: 'Done',
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

function TaskboardPage() {
  const tasks = Route.useLoaderData()
  const { status } = Route.useSearch()

  return (
    <main className="taskboard">
      <header className="taskboard-header">
        <h1>TanStack Taskboard</h1>
        <p className="release-marker">{RELEASE.marker}</p>
      </header>

      <nav className="filters" aria-label="Filter tasks">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            to="/"
            search={{ status: filter.value }}
            className={filter.value === status ? 'filter active' : 'filter'}
          >
            {filter.label}
          </Link>
        ))}
      </nav>

      <NewTaskForm />

      <section aria-label="Tasks" className="task-list">
        {tasks.length === 0 ? (
          <p className="empty-state">No tasks match this filter.</p>
        ) : (
          <ul>
            {tasks.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </ul>
        )}
      </section>

      <footer className="taskboard-footer">
        <span>
          {tasks.length} task{tasks.length === 1 ? '' : 's'} · {RELEASE.app} v
          {RELEASE.version}
        </span>
      </footer>
    </main>
  )
}

function NewTaskForm() {
  const router = useRouter()
  const createTask = useServerFn(createTaskFn)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!title.trim()) {
      setError('Title is required.')
      return
    }

    setSubmitting(true)
    try {
      await createTask({ data: { title, priority } })
      setTitle('')
      setPriority('medium')
      await router.invalidate({ sync: true })
    } catch (err) {
      setError(extractError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="new-task" onSubmit={handleSubmit}>
      <div className="new-task-fields">
        <label>
          <span>Title</span>
          <input
            type="text"
            name="title"
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What needs to be done?"
          />
        </label>

        <label>
          <span>Priority</span>
          <select
            name="priority"
            value={priority}
            onChange={(event) => setPriority(event.target.value as TaskPriority)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <button type="submit" disabled={submitting}>
        {submitting ? 'Adding…' : 'Add task'}
      </button>
    </form>
  )
}

function TaskItem({ task }: { task: Task }) {
  const router = useRouter()
  const updateTask = useServerFn(updateTaskFn)
  const deleteTask = useServerFn(deleteTaskFn)

  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const changeStatus = async (status: TaskStatus) => {
    setBusy(true)
    try {
      await updateTask({ data: { id: task.id, status } })
      await router.invalidate({ sync: true })
    } catch (err) {
      setError(extractError(err))
    } finally {
      setBusy(false)
    }
  }

  const saveTitle = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!title.trim()) {
      setError('Title is required.')
      return
    }

    setBusy(true)
    try {
      await updateTask({ data: { id: task.id, title } })
      setEditing(false)
      await router.invalidate({ sync: true })
    } catch (err) {
      setError(extractError(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await deleteTask({ data: { id: task.id } })
      await router.invalidate({ sync: true })
    } catch (err) {
      setError(extractError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={`task status-${task.status}`}>
      <div className="task-main">
        <span className="task-id">#{task.id}</span>

        {editing ? (
          <form className="edit-title" onSubmit={saveTitle}>
            <input
              type="text"
              value={title}
              maxLength={120}
              autoFocus
              onChange={(event) => setTitle(event.target.value)}
            />
            <button type="submit" disabled={busy}>
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <span className="task-title">{task.title}</span>
        )}
      </div>

      <div className="task-actions">
        <span className={`priority priority-${task.priority}`}>
          {PRIORITY_LABELS[task.priority]}
        </span>

        <select
          aria-label="Status"
          value={task.status}
          disabled={busy}
          onChange={(event) => changeStatus(event.target.value as TaskStatus)}
        >
          {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </select>

        {!editing ? (
          <button type="button" onClick={() => setEditing(true)}>
            Edit
          </button>
        ) : null}

        <button type="button" disabled={busy} onClick={remove}>
          Delete
        </button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
    </li>
  )
}

function extractError(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const candidate = err as {
      issues?: ReadonlyArray<{ message: string }>
      message?: string
    }

    if (Array.isArray(candidate.issues) && candidate.issues.length > 0) {
      return candidate.issues[0]?.message ?? 'Validation failed.'
    }

    if (candidate.message) return candidate.message
  }

  return 'Something went wrong.'
}