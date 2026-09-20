import { createServerFn } from '@tanstack/react-start'
import type { z } from 'zod'

import { createTaskSchema, taskIdSchema, updateTaskSchema } from '../lib/schemas'
import {
  createTask,
  deleteTask,
  listTasks,
  updateTask,
} from '../lib/tasks.server'

export const listTasksFn = createServerFn({ method: 'GET' })
  .validator((data: { status?: 'todo' | 'in_progress' | 'done' }) => data)
  .handler(async ({ data }) => {
    return listTasks(data?.status)
  })

export const createTaskFn = createServerFn({ method: 'POST' })
  .validator((data: unknown) => createTaskSchema.parse(data))
  .handler(async ({ data }) => {
    return createTask(data)
  })

export const updateTaskFn = createServerFn({ method: 'POST' })
  .validator((data: unknown) => updateTaskSchema.parse(data))
  .handler(async ({ data }) => {
    return updateTask(data)
  })

export const deleteTaskFn = createServerFn({ method: 'POST' })
  .validator((data: unknown) => taskIdSchema.parse(data))
  .handler(async ({ data }) => {
    return deleteTask(data.id)
  })

export type CreateTaskInput = z.infer<typeof createTaskSchema>
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>
export type DeleteTaskInput = z.infer<typeof taskIdSchema>