import assert from 'node:assert/strict'
import test from 'node:test'
import graphJson from '../data/graph.json' with { type: 'json' }
import { focusGraph, graphSchema, inspectNode, searchGraph, viewFromParts } from './model.js'

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

test('focus keeps only nodes, internal links, and their releases', () => {
  const focused = focusGraph(graph, ['entity:wong-tim-hi', 'entity:securities-and-futures-commission'])
  assert.deepEqual(focused.nodes.map((node) => node.id), [
    'entity:wong-tim-hi',
    'entity:securities-and-futures-commission',
  ])
  assert.equal(focused.links.length, 1)
  assert.deepEqual(focused.releases.map((release) => release.ref), ['26PR104'])
})

test('tool output becomes an explicit graph view', () => {
  assert.deepEqual(viewFromParts([
    { type: 'tool-search', state: 'output-available', output: {
      view: { mode: 'focus', nodeIds: ['entity:wong-tim-hi'] },
    } },
  ]), { mode: 'focus', nodeIds: ['entity:wong-tim-hi'] })
})
