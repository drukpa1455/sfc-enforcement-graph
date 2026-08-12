import assert from 'node:assert/strict'
import test from 'node:test'
import graphJson from '../data/graph.json' with { type: 'json' }
import { graphSchema, inspectNode, searchGraph, selectionFromParts } from './model.js'

const graph = graphSchema.parse(graphJson)

test('search returns stable graph IDs', () => {
  assert.deepEqual(searchGraph(graph, 'person Wong').nodeIds, ['entity:wong-tim-hi'])
})

test('inspection includes immediate neighbors and evidence', () => {
  const result = inspectNode(graph, 'entity:wong-tim-hi')
  assert.ok(result)
  assert.ok(result.nodeIds.includes('entity:securities-and-futures-commission'))
  assert.ok(result.links.every((link) => link.evidence.length > 0))
})

test('tool output becomes a graph selection', () => {
  assert.deepEqual(selectionFromParts([
    { type: 'tool-search', state: 'output-available', output: { nodeIds: ['entity:wong-tim-hi'] } },
  ]), ['entity:wong-tim-hi'])
})
