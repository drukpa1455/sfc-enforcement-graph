import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods, type NodeObject } from 'react-force-graph-2d'
import type { GraphData, GraphLink, GraphNode } from './model'

const colors: Record<GraphNode['kind'], string> = {
  release: '#b3492f', person: '#5b6da8', organization: '#498177',
  group: '#8c7964', instrument: '#8b638c', unknown: '#77786f',
}

interface Props {
  graph: GraphData
  selectedIds: string[]
  onSelect: (ids: string[]) => void
}

export function Graph({ graph, selectedIds, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const renderer = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [hoveredId, setHoveredId] = useState<string>()
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])

  useEffect(() => {
    if (!container.current) return
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="graph" ref={container}>
      {size.width > 0 && size.height > 0 && (
        <ForceGraph2D<GraphNode, GraphLink>
          ref={renderer}
          graphData={graph}
          width={size.width}
          height={size.height}
          backgroundColor="#f7f7f3"
          nodeLabel={(node) => node.label}
          nodeColor={(node) => selected.has(node.id) ? '#f0a23a' : colors[node.kind]}
          nodeVal={(node) => selected.has(node.id) ? 9 : node.kind === 'release' ? 7 : 4}
          nodeCanvasObjectMode={() => 'after'}
          nodeCanvasObject={(node, context, scale) => {
            if (node.kind !== 'release' && node.id !== hoveredId && !selected.has(node.id)) return
            const size = 11 / scale
            context.font = `${size}px sans-serif`
            context.fillStyle = '#5f6059'
            context.fillText(node.label, (node.x ?? 0) + 6, (node.y ?? 0) + size / 3)
          }}
          linkLabel={(link) => link.kind}
          linkColor={(link) => selected.has(endpointId(link.source)) && selected.has(endpointId(link.target)) ? '#b3492f' : '#c8c8bf'}
          linkWidth={(link) => selected.has(endpointId(link.source)) && selected.has(endpointId(link.target)) ? 2 : 0.7}
          onNodeClick={(node) => onSelect([node.id])}
          onNodeHover={(node) => setHoveredId(node?.id)}
          onBackgroundClick={() => onSelect([])}
          onEngineStop={() => renderer.current?.zoomToFit(250, 70)}
          cooldownTicks={80}
        />
      )}
    </div>
  )
}

function endpointId(endpoint: string | number | NodeObject<GraphNode> | undefined) {
  return typeof endpoint === 'object' && endpoint ? String(endpoint.id) : String(endpoint ?? '')
}
