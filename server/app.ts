import { openai } from '@ai-sdk/openai'
import { createAgentUIStreamResponse, isStepCount, tool, ToolLoopAgent } from 'ai'
import { Hono } from 'hono'
import { z } from 'zod'
import graphJson from '../data/graph.json' with { type: 'json' }
import { describeGraphContext, expandNodes, graphContextSchema, graphSchema, inspectNode, searchGraph, tracePath } from '../shared/graph.js'

const graph = graphSchema.parse(graphJson)
const instructions = `You answer questions only from the supplied SFC enforcement graph.
Use search before discussing an entity unless its canonical ID is already selected in the current UI context. Use inspect for relationships and evidence.
When the user says this, these, here, or the current view, use the supplied UI context.
Tool results focus the visible graph. For requests to show or isolate a subject, search it and inspect the relevant result.
Use expand to add one relationship hop to known node IDs. Use trace to connect two known node IDs.
Distinguish allegations, findings, convictions, and sought actions. Cite release references.
If the graph does not support an answer, say so. Keep answers concise.`

export const agent = new ToolLoopAgent({
  model: openai(process.env.OPENAI_MODEL ?? 'gpt-5.6'),
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
    trace: tool({
      description: 'Find the shortest evidence-backed path between two known node IDs, regardless of link direction.',
      inputSchema: z.object({ sourceId: z.string().min(1), targetId: z.string().min(1) }),
      execute: ({ sourceId, targetId }) => withFocus(tracePath(graph, sourceId, targetId), [sourceId, targetId]),
    }),
  },
})

const app = new Hono()

app.get('/api/graph', (context) => context.json(graph))
app.post('/api/chat', async (context) => {
  const body: unknown = await context.req.json()
  const request = chatRequestSchema.safeParse(body)
  if (!request.success) return context.json({ error: 'invalid chat request' }, 400)

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
  messages: z.array(z.unknown()),
  context: graphContextSchema.default({ selectedNodeIds: [], view: { mode: 'all' } }),
})
