import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
  allowRequestsWithoutOriginCheck: true,
})

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware],
}))