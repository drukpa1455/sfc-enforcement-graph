import assert from 'node:assert/strict'
import test from 'node:test'
import app from './app.js'
import { CHAT_BODY_LIMIT } from './guardrails.js'

test('health endpoint reports readiness', async () => {
  const response = await app.request('/api/health')

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ok' })
})

test('chat rejects malformed and empty requests', async () => {
  const malformed = await app.request('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  })
  const empty = await app.request('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [] }),
  })

  assert.equal(malformed.status, 400)
  assert.equal(empty.status, 400)
})

test('chat rejects malformed SDK messages at the HTTP boundary', async () => {
  const request = (messages: unknown[]) => app.request('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages }),
  })
  const malformedMessage = await request([null])
  const malformedTool = await request([{
    id: 'message-1',
    role: 'assistant',
    parts: [{ type: 'tool-search', toolCallId: 'call-1', state: 'input-available', input: {} }],
  }])

  assert.equal(malformedMessage.status, 400)
  assert.equal(malformedTool.status, 400)
  assert.deepEqual(await malformedMessage.json(), { error: 'invalid chat request' })
})

test('chat rejects oversized requests before parsing', async () => {
  const response = await app.request('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ text: 'x'.repeat(CHAT_BODY_LIMIT) }] }),
  })

  assert.equal(response.status, 413)
})
