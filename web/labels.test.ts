import assert from 'node:assert/strict'
import test from 'node:test'
import { priorityLabelIds } from './labels.js'

const nodes = Array.from({ length: 57 }, (_, index) => ({
  id: `node-${index}`,
  label: `Node ${index}`,
  metrics: { degree: index, pagerank: index / 100 },
}))

test('label priority fits a readable subset to the canvas', () => {
  const labels = priorityLabelIds(nodes, 660)

  assert.equal(labels.size, 6)
  assert.ok(labels.has('node-56'))
  assert.ok(!labels.has('node-0'))
})

test('small focused graphs keep every label', () => {
  assert.equal(priorityLabelIds(nodes.slice(0, 40), 320).size, 40)
})
