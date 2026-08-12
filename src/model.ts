import { z } from 'zod'

export const graphNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(['release', 'person', 'organization', 'group', 'instrument', 'unknown']),
  summary: z.string().min(1),
  releaseRefs: z.array(z.string().min(1)),
})

export const graphLinkSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  kind: z.string().min(1),
  evidence: z.string().min(1),
  releaseRef: z.string().min(1),
})

export const releaseSchema = z.object({
  ref: z.string().min(1),
  title: z.string().min(1),
  issueDate: z.string().min(1),
  url: z.string().url(),
})

export const graphSchema = z.object({
  nodes: z.array(graphNodeSchema),
  links: z.array(graphLinkSchema),
  releases: z.array(releaseSchema),
}).superRefine((graph, context) => {
  const ids = new Set(graph.nodes.map((node) => node.id))
  if (ids.size !== graph.nodes.length) {
    context.addIssue({ code: 'custom', message: 'node IDs must be unique' })
  }
  for (const link of graph.links) {
    if (!ids.has(link.source) || !ids.has(link.target)) {
      context.addIssue({ code: 'custom', message: `unknown link endpoint: ${link.source} → ${link.target}` })
    }
  }
})

export type GraphNode = z.infer<typeof graphNodeSchema>
export type GraphLink = z.infer<typeof graphLinkSchema>
export type GraphData = z.infer<typeof graphSchema>

export function searchGraph(graph: GraphData, query: string, limit = 12) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  const nodes = graph.nodes
    .filter((node) => terms.every((term) => `${node.label} ${node.summary} ${node.kind}`.toLocaleLowerCase().includes(term)))
    .slice(0, limit)
  return { nodeIds: nodes.map((node) => node.id), nodes }
}

export function inspectNode(graph: GraphData, id: string) {
  const node = graph.nodes.find((candidate) => candidate.id === id)
  if (!node) return null
  const links = graph.links.filter((link) => link.source === id || link.target === id)
  const neighborIds = links.map((link) => link.source === id ? link.target : link.source)
  const nodeIds = [id, ...new Set(neighborIds)]
  const releases = graph.releases.filter((release) => node.releaseRefs.includes(release.ref))
  return { nodeIds, node, links, releases }
}

export function selectionFromParts(parts: Array<{ type: string; state?: string; output?: unknown }>) {
  for (const part of [...parts].reverse()) {
    if (part.state !== 'output-available' || !part.output || typeof part.output !== 'object') continue
    const nodeIds = Reflect.get(part.output, 'nodeIds')
    if (Array.isArray(nodeIds) && nodeIds.every((id) => typeof id === 'string')) return nodeIds
  }
  return undefined
}
