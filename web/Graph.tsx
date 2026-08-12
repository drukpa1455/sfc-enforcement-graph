import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods, type NodeObject } from 'react-force-graph-2d'
import type { Theme } from './App'
import type { GraphData, GraphLink, GraphNode } from '../shared/graph'

type Family = 'source' | 'entity' | 'matter' | 'risk' | 'action'

const familyByKind: Record<GraphNode['kind'], Family> = {
  release: 'source',
  person: 'entity',
  organization: 'entity',
  fund: 'entity',
  group: 'entity',
  instrument: 'entity',
  unknown: 'entity',
  matter: 'matter',
  risk: 'risk',
  action: 'action',
}

const colors: Record<Theme, Record<Family | 'line' | 'muted' | 'surface' | 'text' | 'accent', string>> = {
  dark: {
    source: '#a7ffa0', entity: '#70a99f', matter: '#75ece0', risk: '#ff9580', action: '#e6c384',
    line: '#a7ffa024', muted: '#f8f8f2aa', surface: '#171f1dee', text: '#f8f8f2', accent: '#a7ffa0',
  },
  light: {
    source: '#5c8f55', entity: '#2f7f78', matter: '#587f8a', risk: '#b8675b', action: '#9a7849',
    line: '#c6ded766', muted: '#31443f', surface: '#f7f9f8ee', text: '#1d2522', accent: '#2f7d72',
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
  const settled = useRef(false)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [hoveredId, setHoveredId] = useState<string>()
  const [showLabels, setShowLabels] = useState(true)
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const renderedGraph = useMemo(() => structuredClone(graph), [graph])
  const topologyKey = useMemo(() => graph.nodes.map((node) => node.id).join('\0'), [graph.nodes])
  const nodeNames = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node.label])), [graph.nodes])
  const focused = graph.nodes.length <= 40
  const palette = colors[theme]

  useEffect(() => {
    if (!container.current) return
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])

  const fitGraph = useCallback(() => {
    const graphRenderer = renderer.current
    if (!graphRenderer || !size.width || !size.height) return
    graphRenderer.zoomToFit(0, focused ? 100 : 64)
    const maximumZoom = graph.nodes.length <= 250 ? 2.2 : 1
    if (graphRenderer.zoom() > maximumZoom) graphRenderer.zoom(maximumZoom)
  }, [focused, graph.nodes.length, size])

  useEffect(() => {
    const instance = renderer.current
    const charge = instance?.d3Force('charge') as { strength?: (value: number) => unknown } | undefined
    charge?.strength?.(focused ? -70 : graph.nodes.length <= 250 ? -24 : -100)
    settled.current = false
    instance?.d3ReheatSimulation()
  }, [focused, graph.nodes.length, size.width, topologyKey])

  useEffect(() => {
    settled.current = false
    setHoveredId(undefined)
  }, [topologyKey])

  useEffect(() => {
    if (settled.current) fitGraph()
  }, [fitGraph])

  return (
    <div className="graph" ref={container}>
      <div className="graph-tools">
        <button aria-pressed={showLabels} onClick={() => setShowLabels((visible) => !visible)}>
          <EyeIcon crossed={!showLabels} /> Labels
        </button>
      </div>
      <div className="legend" aria-label="Graph key">
        <span><i data-shape="square" data-family="source" />Source</span>
        <span><i data-shape="circle" data-family="entity" />Entity</span>
        <span><i data-shape="diamond" data-family="matter" />Matter</span>
        <span><i data-shape="triangle" data-family="risk" />Risk</span>
        <span><i data-shape="hexagon" data-family="action" />Action</span>
      </div>
      {size.width > 0 && size.height > 0 && (
        <ForceGraph2D<GraphNode, GraphLink>
          key={topologyKey}
          ref={renderer}
          graphData={renderedGraph}
          width={size.width}
          height={size.height}
          backgroundColor={theme === 'dark' ? '#212c2a' : '#f4f7f5'}
          nodeRelSize={3}
          nodeLabel={(node) => tooltip(node.label, label(node.kind), node.summary)}
          nodeVal={(node) => nodeValue(familyByKind[node.kind])}
          nodeCanvasObjectMode={() => 'replace'}
          nodeCanvasObject={(node, context, scale) => {
            const family = familyByKind[node.kind]
            const radius = nodeRadius(family)
            drawNode(context, node.x ?? 0, node.y ?? 0, radius, family, palette[family])
            if (selected.has(node.id)) drawSelection(context, node.x ?? 0, node.y ?? 0, radius, scale, palette.accent)
            const labelVisible = showLabels && (
              selected.has(node.id) || node.id === hoveredId || focused || scale >= 2.6
            )
            if (labelVisible) drawLabel(context, node, radius, scale, palette)
          }}
          linkLabel={(link) => tooltip(
            label(link.kind),
            `${nodeNames.get(endpointId(link.source)) ?? endpointId(link.source)} → ${nodeNames.get(endpointId(link.target)) ?? endpointId(link.target)}`,
            link.evidence,
          )}
          linkColor={(link) => isIncident(link, selected) ? palette.accent : palette.line}
          linkWidth={(link) => isIncident(link, selected) ? 1.6 : 0.65}
          linkDirectionalArrowLength={focused ? 3 : 0}
          linkDirectionalArrowRelPos={0.96}
          onNodeClick={(node) => onSelectNodes([node.id])}
          onLinkClick={(link) => onSelectLink({
            ...link,
            source: endpointId(link.source),
            target: endpointId(link.target),
          })}
          onNodeHover={(node) => setHoveredId(node?.id)}
          onBackgroundClick={() => onSelectNodes([])}
          linkHoverPrecision={8}
          onEngineStop={() => {
            settled.current = true
            fitGraph()
          }}
          warmupTicks={focused ? 20 : 80}
          cooldownTicks={focused ? 80 : 160}
        />
      )}
    </div>
  )
}

function nodeValue(family: Family) {
  return family === 'source' ? 5 : family === 'entity' ? 3 : 4
}

function nodeRadius(family: Family) {
  return family === 'source' ? 6.5 : family === 'entity' ? 5 : 5.75
}

function drawNode(context: CanvasRenderingContext2D, x: number, y: number, radius: number, family: Family, color: string) {
  context.beginPath()
  if (family === 'entity') context.arc(x, y, radius, 0, 2 * Math.PI)
  if (family === 'source') context.rect(x - radius, y - radius, radius * 2, radius * 2)
  if (family === 'matter') polygon(context, x, y, radius * 1.15, 4, Math.PI / 4)
  if (family === 'risk') polygon(context, x, y, radius * 1.25, 3, -Math.PI / 2)
  if (family === 'action') polygon(context, x, y, radius, 6, 0)
  context.fillStyle = color
  context.fill()
}

function polygon(context: CanvasRenderingContext2D, x: number, y: number, radius: number, sides: number, rotation: number) {
  for (let side = 0; side < sides; side += 1) {
    const angle = rotation + side * 2 * Math.PI / sides
    const pointX = x + Math.cos(angle) * radius
    const pointY = y + Math.sin(angle) * radius
    if (side === 0) context.moveTo(pointX, pointY)
    else context.lineTo(pointX, pointY)
  }
  context.closePath()
}

function drawSelection(context: CanvasRenderingContext2D, x: number, y: number, radius: number, scale: number, color: string) {
  context.beginPath()
  context.arc(x, y, radius + 4 / scale, 0, 2 * Math.PI)
  context.strokeStyle = color
  context.lineWidth = 1.5 / scale
  context.stroke()
}

function drawLabel(
  context: CanvasRenderingContext2D,
  node: NodeObject<GraphNode>,
  radius: number,
  scale: number,
  palette: Record<Family | 'line' | 'muted' | 'surface' | 'text' | 'accent', string>,
) {
  const text = compactLabel(node.label)
  const fontSize = (node.kind === 'release' ? 11 : 10.5) / scale
  const padding = 3 / scale
  context.font = `500 ${fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`
  const width = context.measureText(text).width
  const x = (node.x ?? 0) + radius + 4 / scale
  const y = (node.y ?? 0) - fontSize / 2 - padding
  context.fillStyle = palette.surface
  context.fillRect(x - padding, y, width + padding * 2, fontSize + padding * 2)
  context.fillStyle = palette.text
  context.textBaseline = 'top'
  context.fillText(text, x, y + padding)
}

function compactLabel(value: string) {
  return value.length > 42 ? `${value.slice(0, 39)}…` : value
}

function isIncident(link: GraphLink, selected: Set<string>) {
  return selected.has(endpointId(link.source)) || selected.has(endpointId(link.target))
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

function EyeIcon({ crossed }: { crossed: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/>{crossed && <path d="m4 4 16 16"/>}</svg>
}

function escapeHtml(value: string) {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return value.replace(/[&<>"']/g, (character) => entities[character])
}
