import { createFileRoute } from '@tanstack/react-router'
import { checkDatabase } from '../../lib/db.server'
import { RELEASE } from '../../lib/release'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: () => {
        const dbOk = checkDatabase()

        return Response.json({
          status: dbOk ? 'ok' : 'degraded',
          db: dbOk ? 'ok' : 'error',
          release: RELEASE,
          uptime: Math.round(process.uptime()),
        })
      },
    },
  },
})