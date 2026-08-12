import assert from 'node:assert/strict'
import test from 'node:test'
import { RequestBudget } from './guardrails.js'

test('request budget resets only after its bounded window', () => {
  const budget = new RequestBudget(2, 1_000)

  assert.equal(budget.take(100).allowed, true)
  assert.equal(budget.take(200).allowed, true)
  assert.deepEqual(budget.take(300), { allowed: false, retryAfter: 1 })
  assert.equal(budget.take(1_100).allowed, true)
})
