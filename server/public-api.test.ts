import assert from 'node:assert/strict'
import test from 'node:test'
import graphJson from '../data/graph.json' with { type: 'json' }
import { analyzeGraph } from '../shared/analytics.js'
import { sourceGraphSchema } from '../shared/graph.js'
import app from './app.js'

const graph = analyzeGraph(sourceGraphSchema.parse(graphJson))

test('public API describes the current graph with cache and CORS headers', async () => {
  const response = await app.request('/api/v1/metrics', {
    headers: { origin: 'https://example.com' },
  })
  const metrics = await response.json() as {
    counts: { nodes: number; links: number; components: number }
    rankableMetrics: string[]
  }

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('access-control-allow-origin'), '*')
  assert.match(response.headers.get('access-control-expose-headers') ?? '', /X-API-Version/i)
  assert.equal(response.headers.get('x-api-version'), '1')
  assert.match(response.headers.get('cache-control') ?? '', /stale-while-revalidate/)
  assert.ok(metrics.counts.nodes > 0)
  assert.ok(metrics.counts.links > 0)
  assert.ok(metrics.counts.components > 0)
  assert.deepEqual(metrics.rankableMetrics, ['pagerank', 'betweenness', 'core', 'degree', 'releaseCount'])
})

test('public API discovery is canonical with or without a trailing slash', async () => {
  for (const path of ['/api/v1', '/api/v1/']) {
    const response = await app.request(path)
    const discovery = await response.json() as { endpoints: string[] }

    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type') ?? '', /application\/json/)
    assert.ok(discovery.endpoints.includes('expand'))
    assert.ok(discovery.endpoints.includes('trace'))
    assert.ok(discovery.endpoints.includes('openapi.json'))
  }
})

test('OpenAPI describes every public graph operation', async () => {
  const response = await app.request('/api/v1/openapi.json')
  const document = await response.json() as {
    openapi: string
    servers: Array<{ url: string }>
    paths: Record<string, unknown>
  }

  assert.equal(response.status, 200)
  assert.match(document.openapi, /^3\.1\./)
  assert.deepEqual(document.servers, [{ url: '/api/v1' }])
  assert.deepEqual(Object.keys(document.paths).toSorted(), [
    '/', '/communities/{id}', '/components/{id}', '/expand', '/graph', '/metrics',
    '/neighborhood', '/nodes/{id}', '/rank', '/search', '/trace',
  ])
  const operations = Object.values(document.paths).map((path) => (path as { get: { operationId: string } }).get.operationId)
  assert.equal(new Set(operations).size, operations.length)
})

test('public search and inspection preserve source evidence', async () => {
  const search = await app.request('/api/v1/search?q=Futu%20Securities&limit=2')
  const searchResult = await search.json() as {
    nodeIds: string[]
    nodes: Array<{ label: string }>
  }
  const id = searchResult.nodeIds[0]
  const inspection = await app.request(`/api/v1/nodes/${encodeURIComponent(id)}`)
  const inspected = await inspection.json() as {
    node: { id: string }
    links: Array<{ evidence?: string; releaseRef?: string }>
    releases: unknown[]
  }

  assert.equal(search.status, 200)
  assert.ok(searchResult.nodes.length <= 2)
  assert.equal(searchResult.nodes[0].label, 'Futu Securities International (Hong Kong) Limited')
  assert.equal(inspection.status, 200)
  assert.equal(inspected.node.id, id)
  assert.ok(inspected.links.every((link) => link.evidence && link.releaseRef))
  assert.ok(inspected.releases.length > 0)
})

test('public structural queries stay bounded', async () => {
  const search = await app.request('/api/v1/search?q=Futu%20Securities')
  const { nodeIds } = await search.json() as { nodeIds: string[] }
  const neighborhood = await app.request(
    `/api/v1/neighborhood?id=${encodeURIComponent(nodeIds[0])}&depth=3&limit=20`,
  )
  const nearby = await neighborhood.json() as {
    nodes: unknown[]
    people: Array<{ hops?: number }>
  }
  const community = await app.request(`/api/v1/communities/${encodeURIComponent(nodeIds[0])}`)
  const clustered = await community.json() as { nodes: unknown[]; community: number | null }
  const component = await app.request(`/api/v1/components/${encodeURIComponent(nodeIds[0])}`)
  const connected = await component.json() as { nodes: unknown[]; component: string | null }
  const rank = await app.request('/api/v1/rank?metric=degree&kind=person&limit=3')
  const ranked = await rank.json() as {
    metric: string
    nodes: Array<{ kind?: string }>
  }
  const expanded = await app.request(`/api/v1/expand?ids=${encodeURIComponent(nodeIds[0])}`)
  const expansion = await expanded.json() as { nodeIds: string[]; links: unknown[] }
  const target = expansion.nodeIds.find((id) => id !== nodeIds[0])
  assert.ok(target)
  const traced = await app.request(
    `/api/v1/trace?source=${encodeURIComponent(nodeIds[0])}&target=${encodeURIComponent(target)}`,
  )
  const trace = await traced.json() as { nodeIds: string[]; links: unknown[] }

  assert.equal(neighborhood.status, 200)
  assert.ok(nearby.nodes.length <= 20)
  assert.ok(nearby.people.every((person) => person.hops !== undefined && person.hops <= 3))
  assert.equal(community.status, 200)
  assert.ok(clustered.community === null || clustered.nodes.length > 0)
  assert.equal(component.status, 200)
  assert.ok(connected.component === null || connected.nodes.length > 0)
  assert.ok(connected.nodes.length <= 80)
  assert.equal(rank.status, 200)
  assert.equal(ranked.metric, 'degree')
  assert.ok(ranked.nodes.length <= 3)
  assert.ok(ranked.nodes.every((node) => node.kind === 'person'))
  assert.equal(expanded.status, 200)
  assert.ok(expansion.nodeIds.length > 1)
  assert.ok(expansion.links.length > 0)
  assert.equal(traced.status, 200)
  assert.deepEqual([trace.nodeIds[0], trace.nodeIds.at(-1)], [nodeIds[0], target])
  assert.ok(trace.links.length > 0)
})

test('trace reports when known nodes are disconnected', async () => {
  const source = graphNode('Futu Securities International (Hong Kong) Limited')
  const target = graph.nodes.find((node) => node.id === 'release:26PR123')
  assert.ok(target)

  const response = await app.request(
    `/api/v1/trace?source=${encodeURIComponent(source.id)}&target=${encodeURIComponent(target.id)}`,
  )

  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { error: 'No path found' })
})

test('public API rejects invalid queries and unknown nodes', async () => {
  const missingQuery = await app.request('/api/v1/search')
  const excessiveDepth = await app.request('/api/v1/neighborhood?id=anything&depth=4')
  const missingNode = await app.request('/api/v1/nodes/unknown')
  const missingRoute = await app.request('/api/v1/not-a-route')

  assert.equal(missingQuery.status, 400)
  assert.equal(missingQuery.headers.get('cache-control'), 'no-store')
  assert.equal(excessiveDepth.status, 400)
  assert.equal(missingNode.status, 404)
  assert.equal(missingRoute.status, 404)
  assert.match(missingRoute.headers.get('content-type') ?? '', /application\/json/)
})

test('graph download has a stable filename', async () => {
  const response = await app.request('/api/v1/graph?download=1')

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="sfc-enforcement-graph.json"')
})

function graphNode(label: string) {
  const node = graph.nodes.find((candidate) => candidate.label === label)
  assert.ok(node)
  return node
}
