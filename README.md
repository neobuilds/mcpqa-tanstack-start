# mcpqa-tanstack-start

Minimal TanStack Start (React SSR) fixture app for xCloud git-deployment QA.
Scaffolded with `create-start-app@latest` (`--framework react --blank`,
Nitro server adapter, no Tailwind, no examples, no toolchain, no git).

## Commands a host should run

- Install: `npm ci`
- Build: `npm run build`
- Start: `npm run start` (runs `HOST=0.0.0.0 node .output/server/index.mjs`)

The production server listens on `process.env.PORT` (default `3000`) bound
to `0.0.0.0`, e.g. `PORT=8080 npm run start`.

## Marker

The index route (`src/routes/index.tsx`) renders the exact text
`mcpqa-tanstack-start OK`.
