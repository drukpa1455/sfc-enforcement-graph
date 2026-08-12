import type { GraphNode } from '../shared/graph'

type LabelNode = Pick<GraphNode, 'id' | 'label'> & {
  metrics: Pick<GraphNode['metrics'], 'degree' | 'pagerank'>
}

const ALL_LABEL_LIMIT = 40
const LABEL_SLOT_WIDTH = 110
const MIN_LABELS = 4
const MAX_LABELS = 12

export function priorityLabelIds(nodes: LabelNode[], canvasWidth: number) {
  if (nodes.length <= ALL_LABEL_LIMIT) return new Set(nodes.map((node) => node.id))
  const budget = Math.min(MAX_LABELS, Math.max(MIN_LABELS, Math.floor(canvasWidth / LABEL_SLOT_WIDTH)))
  return new Set(
    nodes
      .toSorted((left, right) =>
        right.metrics.pagerank - left.metrics.pagerank ||
        right.metrics.degree - left.metrics.degree ||
        left.label.localeCompare(right.label),
      )
      .slice(0, budget)
      .map((node) => node.id),
  )
}
