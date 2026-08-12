import { UndirectedGraph } from 'graphology'
import * as louvainModule from 'graphology-communities-louvain'
import { connectedComponents } from 'graphology-components'
import { coreNumber } from 'graphology-cores'
import * as betweennessModule from 'graphology-metrics/centrality/betweenness.js'
import * as pagerankModule from 'graphology-metrics/centrality/pagerank.js'
import { graphSchema, type GraphData, type SourceGraphData } from './graph.js'

type NodeScores = (graph: UndirectedGraph, options?: Record<string, unknown>) => Record<string, number>
const pagerank = pagerankModule.default as unknown as NodeScores
const betweenness = betweennessModule.default as unknown as NodeScores
const louvain = louvainModule.default as unknown as NodeScores

export function analyzeGraph(source: SourceGraphData): GraphData {
  const topology = new UndirectedGraph()
  const eligible = new Set(source.nodes
    .filter((node) => node.kind !== 'release' && !isAuthority(node))
    .map((node) => node.id))

  for (const link of source.links) {
    if (
      link.family !== 'evidence' &&
      link.source !== link.target &&
      eligible.has(link.source) &&
      eligible.has(link.target)
    ) {
      topology.mergeNode(link.source)
      topology.mergeNode(link.target)
      topology.mergeEdge(link.source, link.target)
    }
  }

  const components = connectedComponents(topology)
  const componentSizes = Object.fromEntries(components.flatMap((component) =>
    component.map((id) => [id, component.length]),
  ))
  const ranks = pagerank(topology, { getEdgeWeight: null })
  const bridges = betweenness(topology, { getEdgeWeight: null, normalized: true })
  // graphology-cores' published type retains its internal `assign` argument.
  const cores = (coreNumber as unknown as (graph: UndirectedGraph) => Record<string, number>)(topology)
  const communities = louvain(topology, { getEdgeWeight: null, randomWalk: false })

  return graphSchema.parse({
    ...source,
    nodes: source.nodes.map((node) => ({
      ...node,
      metrics: {
        degree: topology.hasNode(node.id) ? topology.degree(node.id) : 0,
        releaseCount: node.releaseRefs.length,
        componentSize: componentSizes[node.id] ?? 1,
        pagerank: ranks[node.id] ?? 0,
        betweenness: bridges[node.id] ?? 0,
        core: cores[node.id] ?? 0,
        community: topology.hasNode(node.id) && topology.degree(node.id) > 0 ? communities[node.id] : null,
      },
    })),
  })
}

function isAuthority(node: SourceGraphData['nodes'][number]) {
  const involvement = node.facets.involvement ?? []
  return !involvement.includes('subject') && (
    involvement.includes('authority') || node.releaseRefs.length > 10
  )
}
