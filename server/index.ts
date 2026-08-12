import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { compress } from 'hono/compress'
import api from './app.js'

const app = new Hono()
app.use('*', compress())
app.route('/', api)
app.use('*', serveStatic({ root: './dist' }))
app.get('*', serveStatic({ path: './dist/index.html' }))

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port }, ({ port: listeningPort }) => {
  console.log(`http://localhost:${listeningPort}`)
})
