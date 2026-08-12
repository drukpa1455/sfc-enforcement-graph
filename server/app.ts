import { createOpenAI } from '@ai-sdk/openai'
import { createAgentUIStreamResponse, isStepCount, safeValidateUIMessages, tool, ToolLoopAgent, type InferAgentUIMessage } from 'ai'
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
  GRAPH_VIEW_MODES,
  graphView,
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
const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT
const azureKey = process.env.AZURE_OPENAI_API_KEY
const azure = createOpenAI({
  name: 'azure',
  baseURL: azureEndpoint ?? 'https://azure.invalid/openai/v1',
  apiKey: azureKey ?? 'missing',
})
const instructions = `You answer questions only from the supplied SFC enforcement graph.
Use search before discussing an entity unless its graph ID is already selected in the current UI context. Use inspect for relationships and evidence.
When the user says this, these, here, or the current view, use the supplied UI context.
Research tools do not change the visible graph. After answering with concrete graph nodes, call show exactly once unless the user asks to preserve the current view. Use ego for one subject's direct relationships and exact for an intentionally assembled node set.
Use expand to add one relationship hop to known node IDs. Use trace to connect two known node IDs.
Use neighborhood for evidence-backed second- or third-degree connections. Use rank to find recurring, central, bridging, or densely embedded nodes. Use community for a node's algorithmic cluster and component for its complete connected subgraph.
Graph proximity is not evidence of misconduct. Describe every path through its explicit relationships and preserve each claim or action status.
Distinguish allegations, findings, convictions, and sought actions. Cite release references.
If the graph does not support an answer, say so. Keep answers concise.`

export const agent = new ToolLoopAgent({
  model: azure(process.env.AZURE_OPENAI_MODEL ?? 'gpt-5.6-sol'),
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
      execute: ({ query }) => searchGraph(graph, query),
    }),
    inspect: tool({
      description: 'Inspect one graph node, its immediate neighbors, source releases, and evidence.',
      inputSchema: z.object({ id: z.string().min(1) }),
      execute: ({ id }) => inspectNode(graph, id) ?? { nodeIds: [], error: `Unknown node: ${id}` },
    }),
    expand: tool({
      description: 'Add one relationship hop around known node IDs, preserving the existing nodes.',
      inputSchema: z.object({ nodeIds: z.array(z.string().min(1)).min(1).max(24) }),
      execute: ({ nodeIds }) => expandNodes(graph, nodeIds),
    }),
    neighborhood: tool({
      description: 'Traverse one to three evidence-backed relationship hops, excluding document and authority hubs by default.',
      inputSchema: z.object({
        nodeIds: z.array(z.string().min(1)).min(1).max(12),
        depth: z.number().int().min(1).max(3).default(2),
        includeHubs: z.boolean().default(false),
      }),
      execute: ({ nodeIds, depth, includeHubs }) => neighborhood(graph, nodeIds, depth, 80, includeHubs),
    }),
    community: tool({
      description: "Get the highest-PageRank members of a node's Louvain community. Community membership is a structural clue, not evidence.",
      inputSchema: z.object({ id: z.string().min(1) }),
      execute: ({ id }) => communityGraph(graph, id),
    }),
    component: tool({
      description: "Get the highest-PageRank members of a node's connected component. Membership is a structural clue, not evidence.",
      inputSchema: z.object({ id: z.string().min(1) }),
      execute: ({ id }) => componentGraph(graph, id),
    }),
    rank: tool({
      description: 'Rank graph nodes by recurrence, degree, PageRank, exact betweenness, or k-core.',
      inputSchema: z.object({
        metric: z.enum(GRAPH_METRICS),
        kinds: z.array(z.enum(NODE_KINDS)).max(NODE_KINDS.length).optional(),
        limit: z.number().int().min(1).max(24).default(12),
        includeHubs: z.boolean().default(false),
      }),
      execute: ({ metric, kinds, limit, includeHubs }) => rankGraph(graph, metric, kinds, limit, includeHubs),
    }),
    trace: tool({
      description: 'Find the shortest evidence-backed path between two known node IDs, regardless of link direction.',
      inputSchema: z.object({ sourceId: z.string().min(1), targetId: z.string().min(1) }),
      execute: ({ sourceId, targetId }) => tracePath(graph, sourceId, targetId),
    }),
    show: tool({
      description: 'Set the visible graph once after research. One node defaults to its direct relationship graph; multiple nodes default to the exact set.',
      inputSchema: z.object({
        nodeIds: z.array(z.string().min(1)).min(1).max(80),
        selectedNodeIds: z.array(z.string().min(1)).max(24).default([]),
        mode: z.enum(GRAPH_VIEW_MODES).optional(),
      }),
      execute: ({ nodeIds, selectedNodeIds, mode }) => {
        const view = graphView(graph, nodeIds, selectedNodeIds, mode)
        return view.nodeIds.length ? { nodeIds: view.nodeIds, view } : { nodeIds: [], error: 'No known graph nodes' }
      },
    }),
  },
})

const app = new Hono({ strict: false })
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
  const messages = await safeValidateUIMessages<InferAgentUIMessage<typeof agent>>({
    messages: request.data.messages,
    tools: agent.tools,
  })
  if (!messages.success) return context.json({ error: 'invalid chat request' }, 400)
  if (!azureEndpoint || !azureKey) return context.json({ error: 'chat is not configured' }, 503)
  const admission = requests.take()
  if (!admission.allowed) {
    context.header('Retry-After', String(admission.retryAfter))
    return context.json({ error: 'chat request limit reached' }, 429)
  }

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages.data,
    options: request.data.context,
    abortSignal: context.req.raw.signal,
    timeout: { totalMs: 30_000 },
  })
})
app.all('/api/*', (context) => context.json({ error: 'endpoint not found' }, 404))

export default app

const chatRequestSchema = z.object({
  messages: z.array(z.unknown()).min(1).max(CHAT_MESSAGE_LIMIT),
  context: graphContextSchema.default({
    selectedNodeIds: [],
    view: { mode: 'all', nodeKinds: [...NODE_KINDS], edgeFamilies: ['evidence', 'participation', 'relationship'] },
  }),
})
