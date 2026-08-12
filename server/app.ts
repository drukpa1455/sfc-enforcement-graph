import { openai } from '@ai-sdk/openai'
import { createAgentUIStreamResponse, isStepCount, tool, ToolLoopAgent } from 'ai'
import { Hono } from 'hono'
import { z } from 'zod'
import graphJson from '../data/graph.json' with { type: 'json' }
import { graphSchema, inspectNode, searchGraph } from '../src/model.js'

const graph = graphSchema.parse(graphJson)

export const agent = new ToolLoopAgent({
  model: openai(process.env.OPENAI_MODEL ?? 'gpt-5.6'),
  stopWhen: isStepCount(4),
  instructions: `You answer questions only from the supplied SFC enforcement graph.
Use search before discussing an entity. Use inspect for its relationships and evidence.
Distinguish allegations, findings, convictions, and sought actions. Cite release references.
If the graph does not support an answer, say so. Keep answers concise.`,
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
  },
})

const app = new Hono()

app.get('/api/graph', (context) => context.json(graph))
app.post('/api/chat', async (context) => {
  const body: unknown = await context.req.json()
  const messages = body && typeof body === 'object' ? Reflect.get(body, 'messages') : undefined
  if (!Array.isArray(messages)) return context.json({ error: 'messages must be an array' }, 400)

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
    abortSignal: context.req.raw.signal,
    timeout: { totalMs: 30_000 },
  })
})

export default app
