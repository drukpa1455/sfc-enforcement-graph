import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import {
  componentGraph,
  communityGraph,
  expandNodes,
  GRAPH_METRICS,
  graphLinkSchema,
  graphNodeSchema,
  graphSchema,
  type GraphData,
  inspectNode,
  neighborhood,
  NODE_KINDS,
  rankGraph,
  releaseSchema,
  searchGraph,
  tracePath,
} from '../shared/graph.js'

const queryLimit = z.coerce.number().int().min(1).max(50).default(12)
const includeHubs = z.enum(['true', 'false']).default('false').transform((value: string) => value === 'true')
const nodeId = z.string().trim().min(1).max(300)
const pathId = z.object({ id: nodeId.openapi({ param: { name: 'id', in: 'path' } }) })
const searchQuery = z.object({ q: z.string().trim().min(1).max(200), limit: queryLimit })
const neighborhoodQuery = z.object({
  id: nodeId,
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
const expandQuery = z.object({
  ids: z.string().trim().min(1).max(7_200).transform((value: string, context: z.RefinementCtx) => {
    const result = z.array(nodeId).min(1).max(24).safeParse(value.split(',').map((id: string) => id.trim()))
    if (result.success) return result.data
    context.addIssue({ code: 'custom', message: 'ids must contain 1–24 comma-separated graph IDs' })
    return z.NEVER
  }),
})
const traceQuery = z.object({ source: nodeId, target: nodeId })

const errorSchema = z.object({
  error: z.string(),
  issues: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
}).openapi('Error')
const subgraphSchema = z.object({
  nodeIds: z.array(z.string()),
  nodes: z.array(graphNodeSchema),
  links: z.array(graphLinkSchema),
  releases: z.array(releaseSchema),
}).openapi('Subgraph')
const discoverySchema = z.object({
  name: z.string(),
  version: z.number().int(),
  endpoints: z.array(z.string()),
})
const metricsSchema = z.object({
  schemaVersion: z.number().int(),
  coverage: z.object({ from: z.string().optional(), through: z.string().optional() }),
  counts: z.object({
    nodes: z.number().int(), links: z.number().int(), releases: z.number().int(),
    nodeKinds: z.record(z.string(), z.number().int()),
    edgeFamilies: z.record(z.string(), z.number().int()),
    components: z.number().int(), outsideTopology: z.number().int(), largestComponent: z.number().int(),
  }),
  nodeMetrics: z.record(z.string(), z.string()),
  rankableMetrics: z.array(z.enum(GRAPH_METRICS)),
})
const searchResultSchema = z.object({ nodeIds: z.array(z.string()), nodes: z.array(graphNodeSchema) })
const inspectionSchema = subgraphSchema.extend({ node: graphNodeSchema })
const expansionSchema = subgraphSchema.extend({ truncated: z.boolean() })
const neighborhoodSchema = expansionSchema.extend({
  people: z.array(z.object({ id: z.string(), label: z.string(), hops: z.number().int().optional() })),
  depth: z.number().int(),
})
const communitySchema = expansionSchema.extend({ community: z.number().int().nullable() })
const componentSchema = expansionSchema.extend({ component: z.string().nullable() })
const rankResultSchema = searchResultSchema.extend({ metric: z.enum(GRAPH_METRICS) })

const success = (schema: z.ZodType, description: string) => ({
  content: { 'application/json': { schema } }, description,
})
const failures = {
  400: success(errorSchema, 'Invalid query'),
  404: success(errorSchema, 'Node not found'),
}
const routes = {
  discover: createRoute({
    method: 'get', path: '/', operationId: 'discoverApi', summary: 'Discover the API',
    responses: { 200: success(discoverySchema, 'API discovery') },
  }),
  graph: createRoute({
    method: 'get', path: '/graph', operationId: 'getGraph', summary: 'Get the complete graph',
    request: { query: z.object({ download: z.literal('1').optional() }) },
    responses: { 200: success(graphSchema, 'Complete graph') },
  }),
  metrics: createRoute({
    method: 'get', path: '/metrics', operationId: 'getMetrics', summary: 'Get graph coverage and metrics',
    responses: { 200: success(metricsSchema, 'Graph coverage and metrics') },
  }),
  search: createRoute({
    method: 'get', path: '/search', operationId: 'searchNodes', summary: 'Search graph nodes', request: { query: searchQuery },
    responses: { 200: success(searchResultSchema, 'Matching nodes'), ...failures },
  }),
  inspect: createRoute({
    method: 'get', path: '/nodes/{id}', operationId: 'inspectNode', summary: 'Inspect a graph node', request: { params: pathId },
    responses: { 200: success(inspectionSchema, 'Node, relationships, and evidence'), 404: failures[404] },
  }),
  expand: createRoute({
    method: 'get', path: '/expand', operationId: 'expandNodes', summary: 'Expand nodes by one relationship hop', request: { query: expandQuery },
    responses: { 200: success(expansionSchema, 'One-hop expansion'), ...failures },
  }),
  trace: createRoute({
    method: 'get', path: '/trace', operationId: 'tracePath', summary: 'Trace the shortest path between two nodes', request: { query: traceQuery },
    responses: { 200: success(subgraphSchema, 'Shortest evidence-backed path'), ...failures },
  }),
  neighborhood: createRoute({
    method: 'get', path: '/neighborhood', operationId: 'getNeighborhood', summary: 'Traverse a bounded neighborhood', request: { query: neighborhoodQuery },
    responses: { 200: success(neighborhoodSchema, 'Bounded semantic neighborhood'), ...failures },
  }),
  community: createRoute({
    method: 'get', path: '/communities/{id}', operationId: 'getCommunity', summary: "Get a node's Louvain community", request: { params: pathId },
    responses: { 200: success(communitySchema, 'Louvain community'), 404: failures[404] },
  }),
  component: createRoute({
    method: 'get', path: '/components/{id}', operationId: 'getComponent', summary: "Get a node's connected component", request: { params: pathId },
    responses: { 200: success(componentSchema, 'Connected component'), 404: failures[404] },
  }),
  rank: createRoute({
    method: 'get', path: '/rank', operationId: 'rankNodes', summary: 'Rank nodes by one structural metric', request: { query: rankQuery },
    responses: { 200: success(rankResultSchema, 'Nodes ranked by one structural metric'), 400: failures[400] },
  }),
}

const discovery = {
  name: 'SFC Enforcement Graph API',
  version: 1,
  endpoints: ['openapi.json', 'graph', 'metrics', 'search', 'nodes/:id', 'expand', 'trace', 'neighborhood', 'communities/:id', 'components/:id', 'rank'],
}
const openapi = {
  openapi: '3.1.0' as const,
  info: {
    title: 'SFC Enforcement Graph API',
    version: '1.0.0',
    description: 'Public, read-only access to an evidence-linked projection of Hong Kong SFC enforcement releases.',
  },
  servers: [{ url: '/api/v1' }],
  security: [],
}

export function publicApi(graph: GraphData) {
  const api = new OpenAPIHono({
    defaultHook: (result, context) => result.success ? undefined : invalidQuery(context, result.error),
  })
  const metrics = summarize(graph)
  const hasNode = (id: string) => graph.nodes.some((node) => node.id === id)

  api.use('*', cors({
    origin: '*', allowMethods: ['GET', 'OPTIONS'],
    exposeHeaders: ['Content-Disposition', 'X-API-Version'], maxAge: 86_400,
  }))
  api.use('*', async (context, next) => {
    await next()
    context.header('Cache-Control', context.res.ok ? 'public, max-age=300, stale-while-revalidate=3600' : 'no-store')
    context.header('X-API-Version', '1')
  })

  api.openapi(routes.discover, (context) => context.json(discovery, 200))
  api.openapi(routes.graph, (context) => {
    if (context.req.valid('query').download === '1') {
      context.header('Content-Disposition', 'attachment; filename="sfc-enforcement-graph.json"')
    }
    return context.json(graph, 200)
  })
  api.openapi(routes.metrics, (context) => context.json(metrics, 200))
  api.openapi(routes.search, (context) => {
    const { q, limit } = context.req.valid('query')
    return context.json(searchGraph(graph, q, limit), 200)
  })
  api.openapi(routes.inspect, (context) => {
    const result = inspectNode(graph, context.req.valid('param').id)
    return result ? context.json(result, 200) : context.json({ error: 'node not found' }, 404)
  })
  api.openapi(routes.expand, (context) => {
    const ids = context.req.valid('query').ids
    if (ids.some((id: string) => !hasNode(id))) return context.json({ error: 'node not found' }, 404)
    return context.json(expandNodes(graph, ids), 200)
  })
  api.openapi(routes.trace, (context) => {
    const { source, target } = context.req.valid('query')
    if (!hasNode(source) || !hasNode(target)) return context.json({ error: 'node not found' }, 404)
    const result = tracePath(graph, source, target)
    return 'error' in result ? context.json({ error: result.error }, 404) : context.json(result, 200)
  })
  api.openapi(routes.neighborhood, (context) => {
    const { id, depth, limit, includeHubs } = context.req.valid('query')
    if (!hasNode(id)) return context.json({ error: 'node not found' }, 404)
    return context.json(neighborhood(graph, [id], depth, limit, includeHubs), 200)
  })
  api.openapi(routes.community, (context) => {
    const id = context.req.valid('param').id
    return hasNode(id) ? context.json(communityGraph(graph, id), 200) : context.json({ error: 'node not found' }, 404)
  })
  api.openapi(routes.component, (context) => {
    const id = context.req.valid('param').id
    return hasNode(id) ? context.json(componentGraph(graph, id), 200) : context.json({ error: 'node not found' }, 404)
  })
  api.openapi(routes.rank, (context) => {
    const { metric, kind, limit, includeHubs } = context.req.valid('query')
    return context.json(rankGraph(graph, metric, kind ? [kind] : undefined, limit, includeHubs), 200)
  })
  api.doc31('/openapi.json', openapi)

  return api
}

function summarize(graph: GraphData) {
  const componentIds = new Set(graph.nodes.flatMap((node) => node.metrics.component === null ? [] : [node.metrics.component]))
  const componentSizes = graph.nodes.flatMap((node) => node.metrics.component === null ? [] : [node.metrics.componentSize])
  const issueDates = graph.releases.map((release) => release.issueDate.slice(0, 10)).toSorted()
  return {
    schemaVersion: 1,
    coverage: { from: issueDates[0], through: issueDates.at(-1) },
    counts: {
      nodes: graph.nodes.length, links: graph.links.length, releases: graph.releases.length,
      nodeKinds: Object.fromEntries(count(graph.nodes.map((node) => node.kind))),
      edgeFamilies: Object.fromEntries(count(graph.links.map((link) => link.family))),
      components: componentIds.size, outsideTopology: graph.nodes.length - componentSizes.length,
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

function invalidQuery(context: { json: (body: unknown, status: 400) => Response }, error: z.ZodError) {
  return context.json({
    error: 'invalid query',
    issues: error.issues.map((issue: z.core.$ZodIssue) => ({ field: issue.path.join('.'), message: issue.message })),
  }, 400)
}
