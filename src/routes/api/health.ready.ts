import { createFileRoute } from '@tanstack/react-router'
import { checkDatabase } from '../../lib/db.server'

export const Route = createFileRoute('/api/health/ready')({
  server: {
    handlers: {
      GET: () => {
        const dbOk = checkDatabase()

        if (!dbOk) {
          return Response.json(
            { status: 'not_ready', db: 'error' },
            { status: 503 },
          )
        }

        return Response.json({ status: 'ready', db: 'ok' })
      },
    },
  },
})