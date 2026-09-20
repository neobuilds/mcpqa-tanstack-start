import { z } from 'zod'

export const taskStatusSchema = z.enum(['todo', 'in_progress', 'done'])

export const taskPrioritySchema = z.enum(['low', 'medium', 'high'])

export const taskStatusFilterSchema = z
  .enum(['all', 'todo', 'in_progress', 'done'])
  .default('all')
  .catch('all')

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(120, 'Title is too long (max 120 characters)'),
  status: taskStatusSchema.default('todo'),
  priority: taskPrioritySchema.default('medium'),
})

export const updateTaskSchema = z.object({
  id: z.number({ error: 'id must be a number' }).int().positive(),
  title: z.string().trim().min(1, 'Title is required').max(120, 'Title is too long (max 120 characters)').optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
})

export const taskIdSchema = z.object({
  id: z.number({ error: 'id must be a number' }).int().positive(),
})

export const filterTaskSchema = z.object({
  status: taskStatusSchema.or(z.literal('all')).optional(),
})

export type TaskStatus = z.infer<typeof taskStatusSchema>
export type TaskPriority = z.infer<typeof taskPrioritySchema>
export type TaskStatusFilter = z.infer<typeof taskStatusFilterSchema>
export type Task = {
  id: number
  title: string
  status: TaskStatus
  priority: TaskPriority
  createdAt: string
  updatedAt: string
}