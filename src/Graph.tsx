import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods, type NodeObject } from 'react-force-graph-2d'
import type { Theme } from './App'
import type { GraphData, GraphLink, GraphNode } from './model'

const palettes: Record<Theme, Record<GraphNode['kind'], string>> = {
  sapphire: {
    release: '#a7ffa0', person: '#80ffea', organization: '#8aff80',
    fund: '#ff80bf', group: '#ffca80', instrument: '#9580ff', unknown: '#f8f8f2aa',
    matter: '#66d9ef', risk: '#ff5555', action: '#f1fa8c',
  },
  jade: {
    release: '#2f7d72', person: '#2f7f78', organization: '#5c8f55',
    fund: '#a85b78', group: '#9a7849', instrument: '#7567a7', unknown: '#4f766f',
    matter: '#477f8c', risk: '#a84f4f', action: '#9a8b49',
  },
}

interface Props {
  graph: GraphData
  selectedIds: string[]
  onSelectLink: (link: GraphLink) => void
  onSelectNodes: (ids: string[]) => void
  theme: Theme
}

export function Graph({ graph, selectedIds, onSelectLink, onSelectNodes, theme }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const renderer = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [hoveredId, setHoveredId] = useState<string>()
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const renderedGraph = useMemo(() => structuredClone(graph), [graph])
  const nodeNames = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node.label])), [graph.nodes])

  useEffect(() => {
    if (!container.current) return
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (size.width && size.height) renderer.current?.zoomToFit(250, 70)
  }, [size])

  return (
    <div className="graph" ref={container}>
      {size.width > 0 && size.height > 0 && (
        <ForceGraph2D<GraphNode, GraphLink>
          ref={renderer}
          graphData={renderedGraph}
          width={size.width}
          height={size.height}
          backgroundColor={theme === 'sapphire' ? '#212c2a' : '#f4f7f5'}
          nodeLabel={(node) => tooltip(node.label, label(node.kind), node.summary)}
          nodeColor={(node) => selected.has(node.id) ? (theme === 'sapphire' ? '#ffffff' : '#1d2522') : palettes[theme][node.kind]}
          nodeVal={(node) => selected.has(node.id) ? 9 : node.kind === 'release' ? 7 : 4}
          nodeCanvasObjectMode={() => 'after'}
          nodeCanvasObject={(node, context, scale) => {
            if (node.kind !== 'release' && node.id !== hoveredId && !selected.has(node.id)) return
            const size = 11 / scale
            context.font = `${size}px sans-serif`
            context.fillStyle = theme === 'sapphire' ? '#f8f8f2aa' : '#31443f'
            context.fillText(node.label, (node.x ?? 0) + 6, (node.y ?? 0) + size / 3)
          }}
          linkLabel={(link) => tooltip(
            label(link.kind),
            `${nodeNames.get(endpointId(link.source)) ?? endpointId(link.source)} → ${nodeNames.get(endpointId(link.target)) ?? endpointId(link.target)}`,
            link.evidence,
          )}
          linkColor={(link) => selected.has(endpointId(link.source)) && selected.has(endpointId(link.target))
            ? (theme === 'sapphire' ? '#a7ffa0' : '#2f7d72')
            : (theme === 'sapphire' ? '#a7ffa033' : '#c6ded7')}
          linkWidth={(link) => selected.has(endpointId(link.source)) && selected.has(endpointId(link.target)) ? 2 : 0.7}
          onNodeClick={(node) => onSelectNodes([node.id])}
          onLinkClick={(link) => onSelectLink({
            ...link,
            source: endpointId(link.source),
            target: endpointId(link.target),
          })}
          onNodeHover={(node) => setHoveredId(node?.id)}
          onBackgroundClick={() => onSelectNodes([])}
          linkHoverPrecision={8}
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

function tooltip(title: string, meta: string, body: string) {
  return `<div class="tooltip"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(meta)}</span><p>${escapeHtml(body)}</p></div>`
}

function label(value: string) {
  return value.replaceAll('_', ' ')
}

function escapeHtml(value: string) {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return value.replace(/[&<>"']/g, (character) => entities[character])
}
