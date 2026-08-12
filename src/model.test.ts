import assert from 'node:assert/strict'
import test from 'node:test'
import graphJson from '../data/graph.json' with { type: 'json' }
import { expandNodes, focusGraph, graphSchema, inspectNode, searchGraph, tracePath, viewFromParts } from './model.js'

const graph = graphSchema.parse(graphJson)
const suspected = 'mention:26PR119:mention_3'
const regulator = 'mention:26PR119:mention_1'
const broker = 'mention:26PR119:mention_2'
const action = 'action:26PR119:action_1'

test('search returns projection identities', () => {
  assert.equal(searchGraph(graph, 'Futu organization').nodeIds[0], broker)
})

test('inspection includes immediate neighbors and evidence', () => {
  const result = inspectNode(graph, suspected)
  assert.ok(result)
  assert.ok(result.nodeIds.includes(action))
  assert.ok(result.links.every((link) => link.evidence.length > 0))
})

test('focus keeps only nodes, internal links, and their releases', () => {
  const focused = focusGraph(graph, [broker, action])
  assert.deepEqual(focused.nodes.map((node) => node.id), [broker, action])
  assert.equal(focused.links.length, 1)
  assert.deepEqual(focused.releases.map((release) => release.ref), ['26PR119'])
})

test('expansion adds exactly one relationship hop', () => {
  const result = expandNodes(graph, [action])
  assert.ok(result.nodeIds.includes(regulator))
  assert.ok(result.nodeIds.includes(broker))
  assert.ok(result.nodeIds.includes(suspected))
  assert.equal(result.truncated, false)
})

test('trace returns the shortest evidence-backed path', () => {
  const result = tracePath(graph, broker, regulator)
  assert.deepEqual(result.nodeIds, [broker, action, regulator])
  assert.equal(result.links.length, 2)
})

test('tool output becomes an explicit graph view', () => {
  assert.deepEqual(viewFromParts([
    { type: 'tool-search', state: 'output-available', output: {
      view: { mode: 'focus', nodeIds: [broker] },
    } },
  ]), { mode: 'focus', nodeIds: [broker] })
})
