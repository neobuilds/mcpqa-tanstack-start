import { createFileRoute } from '@tanstack/react-router'

import { createTaskSchema, filterTaskSchema, taskIdSchema, updateTaskSchema } from '../../lib/schemas'
import {
  createTask,
  deleteTask,
  listTasks,
  TaskNotFoundError,
  updateTask,
} from '../../lib/tasks.server'

export const Route = createFileRoute('/api/tasks')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const rawStatus = url.searchParams.get('status')

        const parsed = filterTaskSchema.safeParse({
          status: rawStatus === null ? undefined : rawStatus,
        })

        if (!parsed.success) {
          return jsonError('Invalid status filter', parsed.error, 400)
        }

        const status =
          parsed.data.status && parsed.data.status !== 'all'
            ? parsed.data.status
            : undefined

        return Response.json({ tasks: listTasks(status) })
      },

      POST: async ({ request }) => {
        const body = await readJson(request)
        const parsed = createTaskSchema.safeParse(body)

        if (!parsed.success) {
          return jsonError('Invalid task', parsed.error, 400)
        }

        const task = createTask(parsed.data)
        return Response.json(task, { status: 201 })
      },

      PATCH: async ({ request }) => {
        const body = await readJson(request)
        const parsed = updateTaskSchema.safeParse(body)

        if (!parsed.success) {
          return jsonError('Invalid task update', parsed.error, 400)
        }

        try {
          const task = updateTask(parsed.data)
          return Response.json(task)
        } catch (error) {
          if (error instanceof TaskNotFoundError) {
            return jsonError(error.message, undefined, 404)
          }
          throw error
        }
      },

      DELETE: async ({ request }) => {
        const url = new URL(request.url)
        const rawId = url.searchParams.get('id')

        const parsed = taskIdSchema.safeParse({
          id: rawId === null ? undefined : Number(rawId),
        })

        if (!parsed.success) {
          return jsonError('Invalid task id', parsed.error, 400)
        }

        const result = deleteTask(parsed.data.id)
        if (!result.deleted) {
          return jsonError(`Task ${parsed.data.id} not found`, undefined, 404)
        }

        return Response.json({ ...result, deleted: true })
      },
    },
  },
})

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function jsonError(
  error: string,
  zodError: { issues: ReadonlyArray<{ message: string }> } | undefined,
  status: number,
): Response {
  const issues = zodError?.issues.map((issue) => issue.message) ?? []

  return Response.json({ error, issues }, { status })
}