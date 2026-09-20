import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/health/live')({
  server: {
    handlers: {
      GET: () => {
        return Response.json({
          status: 'ok',
          uptime: Math.round(process.uptime()),
        })
      },
    },
  },
})