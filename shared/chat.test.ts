import assert from 'node:assert/strict'
import test from 'node:test'
import { compactChatHistory } from './chat.js'

test('follow-ups retain conversation text without completed tool payloads', () => {
  const messages = [
    { role: 'user', parts: [{ type: 'text', text: "who's the most central actor?" }] },
    { role: 'assistant', parts: [
      { type: 'tool-rank', output: 'x'.repeat(100_000) },
      { type: 'text', text: 'Mr Wong Pak Ming is the most central actor.' },
    ] },
    { role: 'user', parts: [{ type: 'text', text: 'tell me about him' }] },
  ]

  const compacted = compactChatHistory(messages)

  assert.equal(compacted.length, 3)
  assert.deepEqual(compacted[1].parts, [
    { type: 'text', text: 'Mr Wong Pak Ming is the most central actor.' },
  ])
  assert.ok(JSON.stringify(compacted).length < 1_000)
})

test('tool-only history is removed while the active message stays intact', () => {
  const active = { role: 'assistant', parts: [{ type: 'tool-search', output: 'active' }] }
  const compacted = compactChatHistory([
    { role: 'assistant', parts: [{ type: 'tool-rank', output: 'complete' }] },
    active,
  ])

  assert.deepEqual(compacted, [active])
})
