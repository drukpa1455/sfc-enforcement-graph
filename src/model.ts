import { z } from 'zod'

export const graphNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(['release', 'person', 'organization', 'fund', 'group', 'instrument', 'unknown', 'matter', 'risk', 'action']),
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
export type GraphView = { mode: 'focus'; nodeIds: string[] }

export function searchGraph(graph: GraphData, query: string, limit = 12) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  const nodes = graph.nodes
    .filter((node) => terms.every((term) => `${node.label} ${node.summary} ${node.kind}`.toLocaleLowerCase().includes(term)))
    .sort((left, right) => labelScore(right, terms) - labelScore(left, terms))
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

export function expandNodes(graph: GraphData, nodeIds: string[], limit = 80) {
  const known = new Set(graph.nodes.map((node) => node.id))
  const seeds = new Set(nodeIds.filter((id) => known.has(id)))
  const expanded = new Set(seeds)
  let truncated = false

  for (const link of graph.links) {
    const neighbor = seeds.has(link.source) ? link.target : seeds.has(link.target) ? link.source : undefined
    if (!neighbor || expanded.has(neighbor)) continue
    if (expanded.size === limit) {
      truncated = true
      continue
    }
    expanded.add(neighbor)
  }

  return { ...graphResult(graph, [...expanded]), truncated }
}

export function tracePath(graph: GraphData, sourceId: string, targetId: string) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]))
  if (!nodes.has(sourceId) || !nodes.has(targetId)) {
    return { ...graphResult(graph, []), error: 'Unknown path endpoint' }
  }

  const queue = [sourceId]
  const previous = new Map<string, { nodeId: string; link: GraphLink }>()
  const visited = new Set(queue)
  const neighbors = new Map<string, Array<{ nodeId: string; link: GraphLink }>>()
  for (const link of graph.links) {
    if (link.kind === 'mentions' || link.kind === 'primary_mention') continue
    addNeighbor(neighbors, link.source, link.target, link)
    addNeighbor(neighbors, link.target, link.source, link)
  }

  for (let index = 0; index < queue.length && !visited.has(targetId); index += 1) {
    const current = queue[index]
    for (const step of neighbors.get(current) ?? []) {
      if (visited.has(step.nodeId)) continue
      visited.add(step.nodeId)
      previous.set(step.nodeId, { nodeId: current, link: step.link })
      queue.push(step.nodeId)
    }
  }

  if (!visited.has(targetId)) return { ...graphResult(graph, []), error: 'No path found' }

  const nodeIds = [targetId]
  const links: GraphLink[] = []
  while (nodeIds[0] !== sourceId) {
    const step = previous.get(nodeIds[0])
    if (!step) break
    nodeIds.unshift(step.nodeId)
    links.unshift(step.link)
  }

  const result = graphResult(graph, nodeIds)
  return { ...result, links }
}

function labelScore(node: GraphNode, terms: string[]) {
  const words = new Set(node.label.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
  return terms.filter((term) => words.has(term)).length
}

export function focusGraph(graph: GraphData, nodeIds: string[]): GraphData {
  const visible = new Set(nodeIds)
  const nodes = graph.nodes.filter((node) => visible.has(node.id))
  const links = graph.links.filter((link) => visible.has(link.source) && visible.has(link.target))
  const releaseRefs = new Set(nodes.flatMap((node) => node.releaseRefs))
  return {
    nodes,
    links,
    releases: graph.releases.filter((release) => releaseRefs.has(release.ref)),
  }
}

function graphResult(graph: GraphData, nodeIds: string[]) {
  const known = new Set(graph.nodes.map((node) => node.id))
  const orderedIds = [...new Set(nodeIds)].filter((id) => known.has(id))
  return { nodeIds: orderedIds, ...focusGraph(graph, orderedIds) }
}

function addNeighbor(
  neighbors: Map<string, Array<{ nodeId: string; link: GraphLink }>>,
  sourceId: string,
  nodeId: string,
  link: GraphLink,
) {
  const list = neighbors.get(sourceId) ?? []
  list.push({ nodeId, link })
  neighbors.set(sourceId, list)
}

export function viewFromParts(parts: Array<{ type: string; state?: string; output?: unknown }>): GraphView | undefined {
  for (const part of [...parts].reverse()) {
    if (part.state !== 'output-available' || !part.output || typeof part.output !== 'object') continue
    const view = Reflect.get(part.output, 'view')
    if (!view || typeof view !== 'object' || Reflect.get(view, 'mode') !== 'focus') continue
    const nodeIds = Reflect.get(view, 'nodeIds')
    if (Array.isArray(nodeIds) && nodeIds.length && nodeIds.every((id) => typeof id === 'string')) {
      return { mode: 'focus', nodeIds }
    }
  }
  return undefined
}
