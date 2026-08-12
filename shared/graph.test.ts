import assert from 'node:assert/strict'
import test from 'node:test'
import graphJson from '../data/graph.json' with { type: 'json' }
import { describeGraphContext, expandNodes, focusGraph, graphSchema, inspectNode, normalizeGraphContext, overviewGraph, releaseSchema, searchGraph, tracePath, viewEventFromMessage, viewFromParts } from './graph.js'

const graph = graphSchema.parse(graphJson)
const suspected = graph.nodes.find((node) => node.label === 'an entity suspected to be involved in a fraudulent scheme')?.id ?? ''
const regulator = graph.nodes.find((node) => node.label === 'Securities and Futures Commission' && node.releaseRefs.includes('26PR119'))?.id ?? ''
const broker = graph.nodes.find((node) => node.label === 'Futu Securities International (Hong Kong) Limited')?.id ?? ''
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
  assert.ok(focused.releases.some((release) => release.ref === '26PR119'))
})

test('overview keeps the latest sources and their concrete primary subjects', () => {
  const overview = overviewGraph(graph)
  const ids = new Set(overview.nodes.map((node) => node.id))
  assert.ok(overview.nodes.every((node) => ['release', 'person', 'organization', 'fund', 'instrument'].includes(node.kind)))
  assert.ok(overview.nodes
    .filter((node) => node.kind !== 'release')
    .every((node) => graph.links.some((link) =>
      link.kind === 'primary_mention' && link.target === node.id && ids.has(link.source),
    )))
  assert.equal(overview.nodes.filter((node) => node.kind === 'release').length, 50)
  assert.ok(overview.links.every((link) => ids.has(link.source) && ids.has(link.target)))
  assert.ok(overview.nodes.length < graph.nodes.length)
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
  assert.deepEqual(result.nodeIds, [broker, regulator])
  assert.equal(result.links.length, 1)
})

test('tool output becomes an explicit graph view', () => {
  assert.deepEqual(viewFromParts([
    { type: 'tool-search', state: 'output-available', output: {
      view: { mode: 'focus', nodeIds: [broker, action], selectedNodeIds: [broker] },
    } },
  ]), { mode: 'focus', nodeIds: [broker, action], selectedNodeIds: [broker] })
})

test('only the latest assistant message can change the graph view', () => {
  const assistant = {
    id: 'assistant-1', role: 'assistant', parts: [{
      type: 'tool-search', toolCallId: 'call-1', state: 'output-available', output: {
        view: { mode: 'focus', nodeIds: [broker, action], selectedNodeIds: [broker] },
      },
    }],
  }
  assert.equal(viewEventFromMessage(assistant)?.key, 'call-1')
  assert.equal(viewEventFromMessage({ ...assistant, id: 'user-2', role: 'user' }), undefined)
})

test('graph context keeps only canonical selections', () => {
  const link = graph.links.find((candidate) => candidate.source === broker && candidate.target === action)
  assert.ok(link)
  const context = normalizeGraphContext(graph, {
    selectedNodeIds: [broker, 'unknown', broker],
    view: { mode: 'focus', nodeIds: [broker, action, 'unknown'] },
    selectedLink: { source: link.source, target: link.target, kind: link.kind },
  })
  assert.deepEqual(context.selectedNodeIds, [broker])
  assert.deepEqual(context.view, { mode: 'focus', nodeIds: [broker, action] })
  assert.equal(context.selectedLink?.kind, link.kind)
  assert.match(describeGraphContext(graph, context), /Futu/)
})

test('complete view context does not pretend a truncated sample is visible', () => {
  const context = normalizeGraphContext(graph, { selectedNodeIds: [], view: { mode: 'all' } })
  assert.deepEqual(context.view, { mode: 'all' })
  assert.match(describeGraphContext(graph, context), new RegExp(`all ${graph.nodes.length} nodes`))
})

test('release links reject executable URL schemes', () => {
  assert.equal(releaseSchema.safeParse({
    ref: 'unsafe',
    title: 'Unsafe release',
    issueDate: '2026-01-01',
    url: 'javascript:alert(1)',
  }).success, false)
  assert.equal(releaseSchema.safeParse({
    ref: 'malformed',
    title: 'Malformed release',
    issueDate: '2026-01-01',
    url: 'not-a-url',
  }).success, false)
})
