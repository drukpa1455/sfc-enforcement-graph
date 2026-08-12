import assert from 'node:assert/strict'
import test from 'node:test'
import app from './app.js'

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
})

test('public API rejects invalid queries and unknown nodes', async () => {
  const missingQuery = await app.request('/api/v1/search')
  const excessiveDepth = await app.request('/api/v1/neighborhood?id=anything&depth=4')
  const missingNode = await app.request('/api/v1/nodes/unknown')

  assert.equal(missingQuery.status, 400)
  assert.equal(missingQuery.headers.get('cache-control'), 'no-store')
  assert.equal(excessiveDepth.status, 400)
  assert.equal(missingNode.status, 404)
})

test('graph download has a stable filename', async () => {
  const response = await app.request('/api/v1/graph?download=1')

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="sfc-enforcement-graph.json"')
})
