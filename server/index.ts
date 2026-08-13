import { serve } from '@hono/node-server'
import http from './http.js'

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: http.fetch, port }, ({ port: listeningPort }) => {
  console.log(`http://localhost:${listeningPort}`)
})
