import { openai } from '@ai-sdk/openai'
import { createAgentUIStreamResponse, isStepCount, tool, ToolLoopAgent } from 'ai'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import graphJson from '../data/graph.json' with { type: 'json' }
import { analyzeGraph } from '../shared/analytics.js'
import {
  componentGraph,
  communityGraph,
  describeGraphContext,
  expandNodes,
  GRAPH_METRICS,
  graphContextSchema,
  sourceGraphSchema,
  inspectNode,
  neighborhood,
  NODE_KINDS,
  rankGraph,
  searchGraph,
  tracePath,
} from '../shared/graph.js'
import { CHAT_BODY_LIMIT, CHAT_MESSAGE_LIMIT, chatRequestBudget } from './guardrails.js'
import { publicApi } from './public-api.js'

const graph = analyzeGraph(sourceGraphSchema.parse(graphJson))
const instructions = `You answer questions only from the supplied SFC enforcement graph.
Use search before discussing an entity unless its graph ID is already selected in the current UI context. Use inspect for relationships and evidence.
When the user says this, these, here, or the current view, use the supplied UI context.
Tool results focus the visible graph. For requests to show or isolate a subject, search it and inspect the relevant result.
Use expand to add one relationship hop to known node IDs. Use trace to connect two known node IDs.
Use neighborhood for evidence-backed second- or third-degree connections. Use rank to find recurring, central, bridging, or densely embedded nodes. Use community for a node's algorithmic cluster and component for its complete connected subgraph.
Graph proximity is not evidence of misconduct. Describe every path through its explicit relationships and preserve each claim or action status.
Distinguish allegations, findings, convictions, and sought actions. Cite release references.
If the graph does not support an answer, say so. Keep answers concise.`

export const agent = new ToolLoopAgent({
  model: openai(process.env.OPENAI_MODEL ?? 'gpt-5.6'),
  maxOutputTokens: 1_200,
  stopWhen: isStepCount(6),
  instructions,
  callOptionsSchema: graphContextSchema,
  prepareCall: ({ options, ...settings }) => ({
    ...settings,
    instructions: `${instructions}\n\n${describeGraphContext(graph, options)}`,
  }),
  tools: {
    search: tool({
      description: 'Find graph nodes by name, kind, or summary text.',
      inputSchema: z.object({ query: z.string().min(1) }),
      execute: ({ query }) => {
        const result = searchGraph(graph, query)
        return withFocus(result, result.nodeIds)
      },
    }),
    inspect: tool({
      description: 'Inspect one graph node, its immediate neighbors, source releases, and evidence.',
      inputSchema: z.object({ id: z.string().min(1) }),
      execute: ({ id }) => withFocus(inspectNode(graph, id) ?? { nodeIds: [], error: `Unknown node: ${id}` }, [id]),
    }),
    expand: tool({
      description: 'Add one relationship hop around known node IDs, preserving the existing nodes.',
      inputSchema: z.object({ nodeIds: z.array(z.string().min(1)).min(1).max(24) }),
      execute: ({ nodeIds }) => withFocus(expandNodes(graph, nodeIds), nodeIds),
    }),
    neighborhood: tool({
      description: 'Traverse one to three evidence-backed relationship hops, excluding document and authority hubs by default.',
      inputSchema: z.object({
        nodeIds: z.array(z.string().min(1)).min(1).max(12),
        depth: z.number().int().min(1).max(3).default(2),
        includeHubs: z.boolean().default(false),
      }),
      execute: ({ nodeIds, depth, includeHubs }) =>
        withFocus(neighborhood(graph, nodeIds, depth, 80, includeHubs), nodeIds),
    }),
    community: tool({
      description: "Show the highest-PageRank members of a node's Louvain community. Community membership is a structural clue, not evidence.",
      inputSchema: z.object({ id: z.string().min(1) }),
      execute: ({ id }) => {
        const result = communityGraph(graph, id)
        return withFocus(result, [id])
      },
    }),
    component: tool({
      description: "Show the highest-PageRank members of a node's connected component. Membership is a structural clue, not evidence.",
      inputSchema: z.object({ id: z.string().min(1) }),
      execute: ({ id }) => {
        const result = componentGraph(graph, id)
        return withFocus(result, [id])
      },
    }),
    rank: tool({
      description: 'Rank graph nodes by recurrence, degree, PageRank, exact betweenness, or k-core.',
      inputSchema: z.object({
        metric: z.enum(GRAPH_METRICS),
        kinds: z.array(z.enum(NODE_KINDS)).max(NODE_KINDS.length).optional(),
        limit: z.number().int().min(1).max(24).default(12),
        includeHubs: z.boolean().default(false),
      }),
      execute: ({ metric, kinds, limit, includeHubs }) => {
        const result = rankGraph(graph, metric, kinds, limit, includeHubs)
        return withFocus(result, result.nodeIds)
      },
    }),
    trace: tool({
      description: 'Find the shortest evidence-backed path between two known node IDs, regardless of link direction.',
      inputSchema: z.object({ sourceId: z.string().min(1), targetId: z.string().min(1) }),
      execute: ({ sourceId, targetId }) => withFocus(tracePath(graph, sourceId, targetId), [sourceId, targetId]),
    }),
  },
})

const app = new Hono()
const requests = chatRequestBudget()

app.get('/api/health', (context) => context.json({ status: 'ok' }))
app.get('/api/graph', (context) => context.json(graph))
app.route('/api/v1', publicApi(graph))
app.post('/api/chat', bodyLimit({
  maxSize: CHAT_BODY_LIMIT,
  onError: (context) => context.json({ error: 'chat request is too large' }, 413),
}), async (context) => {
  let body: unknown
  try {
    body = await context.req.json()
  } catch {
    return context.json({ error: 'invalid chat request' }, 400)
  }
  const request = chatRequestSchema.safeParse(body)
  if (!request.success) return context.json({ error: 'invalid chat request' }, 400)
  const admission = requests.take()
  if (!admission.allowed) {
    context.header('Retry-After', String(admission.retryAfter))
    return context.json({ error: 'chat request limit reached' }, 429)
  }

  return createAgentUIStreamResponse({
    agent,
    uiMessages: request.data.messages,
    options: request.data.context,
    abortSignal: context.req.raw.signal,
    timeout: { totalMs: 30_000 },
  })
})

export default app

function withFocus<T extends { nodeIds: string[] }>(result: T, selectedNodeIds: string[]) {
  return { ...result, view: { mode: 'focus' as const, nodeIds: result.nodeIds, selectedNodeIds } }
}

const chatRequestSchema = z.object({
  messages: z.array(z.unknown()).min(1).max(CHAT_MESSAGE_LIMIT),
  context: graphContextSchema.default({
    selectedNodeIds: [],
    view: { mode: 'all', nodeKinds: [...NODE_KINDS], edgeFamilies: ['evidence', 'participation', 'relationship'] },
  }),
})
