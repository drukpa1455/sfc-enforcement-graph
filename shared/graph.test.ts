import assert from 'node:assert/strict'
import test from 'node:test'
import graphJson from '../data/graph.json' with { type: 'json' }
import { analyzeGraph } from './analytics.js'
import { communityGraph, componentGraph, describeGraphContext, EDGE_FAMILIES, expandNodes, filterGraph, focusGraph, graphView, inspectNode, neighborhood, NODE_KINDS, normalizeGraphContext, overviewGraph, rankGraph, releaseSchema, searchGraph, sourceGraphSchema, tracePath } from './graph.js'

const graph = analyzeGraph(sourceGraphSchema.parse(graphJson))
const suspected = graph.nodes.find((node) => node.label === 'an entity suspected to be involved in a fraudulent scheme')?.id ?? ''
const regulator = graph.nodes.find((node) => node.label === 'Securities and Futures Commission' && node.releaseRefs.includes('26PR119'))?.id ?? ''
const broker = graph.nodes.find((node) => node.label === 'Futu Securities International (Hong Kong) Limited')?.id ?? ''
const centralActor = graph.nodes.find((node) => node.label === 'Mr Wong Pak Ming')?.id ?? ''
const action = 'action:26PR119:action_1'
const filters = {
  nodeKinds: [...NODE_KINDS],
  edgeFamilies: [...EDGE_FAMILIES],
}

test('search returns projection identities', () => {
  assert.equal(searchGraph(graph, 'Futu organization').nodeIds[0], broker)
})

test('search includes preserved facets and facts', () => {
  const candidate = graph.nodes.find((node) => node.facts.some((fact) => fact.name === 'stock_code'))
  assert.ok(candidate)
  const stockCode = candidate.facts.find((fact) => fact.name === 'stock_code')?.value
  assert.ok(stockCode)
  assert.ok(searchGraph(graph, `${stockCode} stock_code`).nodeIds.includes(candidate.id))
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

test('graph view keeps canonical nodes and includes its selection', () => {
  assert.deepEqual(graphView(graph, [action, 'missing', action], [broker, 'missing']), {
    mode: 'focus',
    nodeIds: [broker, action],
    selectedNodeIds: [broker],
  })
})

test('ego graph view includes a selected entity and its direct relationships', () => {
  const view = graphView(graph, [centralActor], [centralActor], 'ego')
  const focused = focusGraph(graph, view.nodeIds)

  assert.deepEqual(view.selectedNodeIds, [centralActor])
  assert.ok(view.nodeIds.length > 1)
  assert.ok(focused.links.some((link) => link.source === centralActor || link.target === centralActor))
})

test('overview keeps recent sources, primary subjects, and assertions', () => {
  const overview = overviewGraph(graph)
  const ids = new Set(overview.nodes.map((node) => node.id))
  assert.ok(['matter', 'risk', 'action'].every((kind) => overview.nodes.some((node) => node.kind === kind)))
  assert.equal(overview.nodes.filter((node) => node.kind === 'release').length, 50)
  assert.ok(overview.links.every((link) => ids.has(link.source) && ids.has(link.target)))
  assert.ok(overview.nodes.length < graph.nodes.length)
})

test('filters node kinds and semantic edge families', () => {
  const filtered = filterGraph(
    graph,
    new Set(['release', 'risk', 'action']),
    new Set(['evidence']),
  )
  const ids = new Set(filtered.nodes.map((node) => node.id))

  assert.ok(filtered.nodes.every((node) => ['release', 'risk', 'action'].includes(node.kind)))
  assert.ok(filtered.links.every((link) =>
    ids.has(link.source) && ids.has(link.target) && link.family === 'evidence',
  ))
  assert.ok(filtered.links.some((link) => link.kind === 'asserts'))
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
  assert.equal(result.nodeIds[0], broker)
  assert.equal(result.nodeIds.at(-1), regulator)
  assert.equal(result.links.length, result.nodeIds.length - 1)
  assert.ok(result.links.every((link) => link.family !== 'evidence' && link.evidence.length > 0))
})

test('neighborhood traverses real paths without authority hubs', () => {
  const result = neighborhood(graph, [broker], 3)
  assert.ok(result.nodeIds.includes(broker))
  assert.ok(!result.nodeIds.includes(regulator))
  assert.ok(result.people.length > 0)
  assert.ok(result.people.every((person) => person.hops !== undefined && person.hops <= 3))
  assert.ok(result.links.every((link) => link.family !== 'evidence'))
  assert.ok(result.nodes.every((node) => node.metrics.degree <= 40))
})

test('rank exposes one metric without combining unlike signals', () => {
  const result = rankGraph(graph, 'betweenness', ['person'], 5)
  assert.equal(result.metric, 'betweenness')
  assert.ok(result.nodes.length > 0)
  assert.ok(result.nodes.every((node) => node.kind === 'person'))
  assert.ok(result.nodes.every((node, index) => index === 0 || result.nodes[index - 1].metrics.betweenness >= node.metrics.betweenness))
})

test('community exposes a structural cluster without inventing edges', () => {
  const result = communityGraph(graph, broker)
  assert.notEqual(result.community, null)
  assert.ok(result.nodeIds.includes(broker))
  assert.ok(result.nodes.every((node) => node.metrics.community === result.community))
  assert.ok(result.links.every((link) => result.nodeIds.includes(link.source) && result.nodeIds.includes(link.target)))
})

test('component exposes a bounded connected subgraph', () => {
  const result = componentGraph(graph, broker)
  assert.notEqual(result.component, null)
  assert.ok(result.nodeIds.includes(broker))
  assert.ok(result.nodes.every((node) => node.metrics.component === result.component))
  assert.equal(result.nodes.length, Math.min(result.nodes[0].metrics.componentSize, 80))
})

test('analytics excludes releases and authority hubs', () => {
  const authority = graph.nodes.find((node) => node.id === regulator)
  const release = graph.nodes.find((node) => node.kind === 'release')
  assert.ok(authority)
  assert.ok(release)
  assert.deepEqual(
    [authority, release].map((node) => [node.metrics.degree, node.metrics.pagerank, node.metrics.component, node.metrics.community]),
    [[0, 0, null, null], [0, 0, null, null]],
  )
})

test('graph context keeps only canonical selections', () => {
  const link = graph.links.find((candidate) => candidate.source === broker && candidate.target === action)
  assert.ok(link)
  const context = normalizeGraphContext(graph, {
    selectedNodeIds: [broker, 'unknown', broker],
    view: { mode: 'focus', nodeIds: [broker, action, 'unknown'], ...filters },
    selectedLink: { source: link.source, target: link.target, kind: link.kind },
  })
  assert.deepEqual(context.selectedNodeIds, [broker])
  assert.deepEqual(context.view, { mode: 'focus', nodeIds: [broker, action], ...filters })
  assert.equal(context.selectedLink?.kind, link.kind)
  assert.match(describeGraphContext(graph, context), /Futu/)
})

test('complete view context does not pretend a truncated sample is visible', () => {
  const context = normalizeGraphContext(graph, { selectedNodeIds: [], view: { mode: 'all', ...filters } })
  assert.deepEqual(context.view, { mode: 'all', ...filters })
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
