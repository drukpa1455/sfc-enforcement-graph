import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { compress } from 'hono/compress'
import api from './app.js'

const http = new Hono({ strict: false })

http.use('*', compress())
http.route('/', api)
http.get('/docs', (context) => context.redirect('/docs/'))
http.use('*', serveStatic({ root: './dist' }))
http.get('*', serveStatic({ path: './dist/index.html' }))

export default http
