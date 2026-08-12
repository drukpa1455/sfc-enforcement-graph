import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { z } from 'zod'
import {
  componentGraph,
  communityGraph,
  GRAPH_METRICS,
  type GraphData,
  inspectNode,
  neighborhood,
  NODE_KINDS,
  rankGraph,
  searchGraph,
} from '../shared/graph.js'

const queryLimit = z.coerce.number().int().min(1).max(50).default(12)
const includeHubs = z.enum(['true', 'false']).default('false').transform((value) => value === 'true')
const searchQuery = z.object({ q: z.string().trim().min(1).max(200), limit: queryLimit })
const neighborhoodQuery = z.object({
  id: z.string().trim().min(1).max(300),
  depth: z.coerce.number().int().min(1).max(3).default(2),
  limit: z.coerce.number().int().min(1).max(200).default(80),
  includeHubs,
})
const rankQuery = z.object({
  metric: z.enum(GRAPH_METRICS),
  kind: z.enum(NODE_KINDS).optional(),
  limit: queryLimit,
  includeHubs,
})

export function publicApi(graph: GraphData) {
  const api = new Hono()
  const metrics = summarize(graph)

  api.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'OPTIONS'],
    exposeHeaders: ['Content-Disposition', 'X-API-Version'],
    maxAge: 86_400,
  }))
  api.use('*', async (context, next) => {
    await next()
    context.header('Cache-Control', context.res.ok
      ? 'public, max-age=300, stale-while-revalidate=3600'
      : 'no-store')
    context.header('X-API-Version', '1')
  })

  api.get('/', (context) => context.json({
    name: 'SFC Enforcement Graph API',
    version: 1,
    endpoints: ['graph', 'metrics', 'search', 'nodes/:id', 'neighborhood', 'communities/:id', 'components/:id', 'rank'],
  }))
  api.get('/graph', (context) => {
    if (context.req.query('download') === '1') {
      context.header('Content-Disposition', 'attachment; filename="sfc-enforcement-graph.json"')
    }
    return context.json(graph)
  })
  api.get('/metrics', (context) => context.json(metrics))
  api.get('/search', (context) => {
    const query = searchQuery.safeParse(context.req.query())
    return query.success
      ? context.json(searchGraph(graph, query.data.q, query.data.limit))
      : invalidQuery(context, query.error)
  })
  api.get('/nodes/:id', (context) => {
    const result = inspectNode(graph, context.req.param('id'))
    return result ? context.json(result) : context.json({ error: 'node not found' }, 404)
  })
  api.get('/neighborhood', (context) => {
    const query = neighborhoodQuery.safeParse(context.req.query())
    if (!query.success) return invalidQuery(context, query.error)
    const { id, depth, limit, includeHubs } = query.data
    if (!graph.nodes.some((node) => node.id === id)) return context.json({ error: 'node not found' }, 404)
    return context.json(neighborhood(graph, [id], depth, limit, includeHubs))
  })
  api.get('/communities/:id', (context) => {
    const id = context.req.param('id')
    if (!graph.nodes.some((node) => node.id === id)) return context.json({ error: 'node not found' }, 404)
    return context.json(communityGraph(graph, id))
  })
  api.get('/components/:id', (context) => {
    const id = context.req.param('id')
    if (!graph.nodes.some((node) => node.id === id)) return context.json({ error: 'node not found' }, 404)
    return context.json(componentGraph(graph, id))
  })
  api.get('/rank', (context) => {
    const query = rankQuery.safeParse(context.req.query())
    if (!query.success) return invalidQuery(context, query.error)
    const { metric, kind, limit, includeHubs } = query.data
    return context.json(rankGraph(graph, metric, kind ? [kind] : undefined, limit, includeHubs))
  })

  return api
}

function summarize(graph: GraphData) {
  const componentIds = new Set(graph.nodes.flatMap((node) =>
    node.metrics.component === null ? [] : [node.metrics.component],
  ))
  const componentSizes = graph.nodes.flatMap((node) =>
    node.metrics.component === null ? [] : [node.metrics.componentSize],
  )
  const issueDates = graph.releases.map((release) => release.issueDate.slice(0, 10)).toSorted()
  return {
    schemaVersion: 1,
    coverage: { from: issueDates[0], through: issueDates.at(-1) },
    counts: {
      nodes: graph.nodes.length,
      links: graph.links.length,
      releases: graph.releases.length,
      nodeKinds: Object.fromEntries(count(graph.nodes.map((node) => node.kind))),
      edgeFamilies: Object.fromEntries(count(graph.links.map((link) => link.family))),
      components: componentIds.size,
      outsideTopology: graph.nodes.length - componentSizes.length,
      largestComponent: Math.max(0, ...componentSizes),
    },
    nodeMetrics: {
      degree: 'Direct semantic neighbors; evidence edges and authority hubs are excluded.',
      releaseCount: 'Distinct source releases attached to the node.',
      componentSize: 'Nodes in the same semantic connected component.',
      component: "Stable identifier derived from the component's canonical first node.",
      pagerank: 'PageRank over the semantic graph after hub exclusions.',
      betweenness: 'Normalized exact betweenness centrality over the semantic graph.',
      core: 'Highest k-core containing the node.',
      community: 'Louvain community identifier; null when the node is outside semantic topology.',
    },
    rankableMetrics: GRAPH_METRICS,
  }
}

function count<T>(values: T[]) {
  const result = new Map<T, number>()
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1)
  return result
}

function invalidQuery(context: Context, error: z.ZodError) {
  return context.json({
    error: 'invalid query',
    issues: error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
  }, 400)
}
