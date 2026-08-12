import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods, type NodeObject } from 'react-force-graph-2d'
import type { Theme } from './App'
import { Inspector } from './Inspector'
import {
  EDGE_FAMILIES,
  NODE_FAMILIES,
  nodeFamily,
  type EdgeFamily,
  type GraphData,
  type GraphLink,
  type GraphNode,
  type NodeFamily,
} from '../shared/graph'

type Shape = 'square' | 'circle' | 'diamond' | 'triangle' | 'hexagon'

const shapeByFamily: Record<NodeFamily, Shape> = {
  source: 'square', entity: 'circle', matter: 'diamond', risk: 'triangle', action: 'hexagon',
}

const colors: Record<Theme, Record<NodeFamily | 'line' | 'muted' | 'surface' | 'text' | 'accent', string>> = {
  dark: {
    source: '#a7ffa0', entity: '#70a99f', matter: '#75ece0', risk: '#ff9580', action: '#e6c384',
    line: '#a7ffa024', muted: '#f8f8f2aa', surface: '#171f1dee', text: '#f8f8f2', accent: '#a7ffa0',
  },
  light: {
    source: '#5c8f55', entity: '#2f7f78', matter: '#587f8a', risk: '#b8675b', action: '#9a7849',
    line: '#c6ded766', muted: '#31443f', surface: '#f7f9f8ee', text: '#1d2522', accent: '#2f7d72',
  },
}

const edgeColors: Record<Theme, Record<EdgeFamily, string>> = {
  dark: { evidence: '#70a99f40', participation: '#75ece070', relationship: '#e6c38470' },
  light: { evidence: '#64877f55', participation: '#2f7f7880', relationship: '#9a784980' },
}

const edgeDashes: Record<EdgeFamily, number[] | null> = {
  evidence: null,
  participation: [4, 3],
  relationship: [1, 3],
}

interface Props {
  graph: GraphData
  completeGraph: GraphData
  unfilteredGraph: GraphData
  nodeFamilies: Set<NodeFamily>
  edgeFamilies: Set<EdgeFamily>
  onNodeFamilies: (value: Set<NodeFamily>) => void
  onEdgeFamilies: (value: Set<EdgeFamily>) => void
  selectedIds: string[]
  selectedNodes: GraphNode[]
  selectedLink?: GraphLink
  onPrompt: (text: string) => void
  onSelectLink: (link: GraphLink) => void
  onSelectNodes: (ids: string[]) => void
  theme: Theme
}

export function Graph({
  graph,
  completeGraph,
  unfilteredGraph,
  nodeFamilies,
  edgeFamilies,
  onNodeFamilies,
  onEdgeFamilies,
  selectedIds,
  selectedNodes,
  selectedLink,
  onPrompt,
  onSelectLink,
  onSelectNodes,
  theme,
}: Props) {
  const container = useRef<HTMLDivElement>(null)
  const renderer = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined)
  const settled = useRef(false)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const renderedGraph = useMemo(() => structuredClone(graph), [graph])
  const topologyKey = useMemo(
    () => `${graph.nodes.map((node) => node.id).join('\0')}|${[...edgeFamilies].sort().join(',')}`,
    [edgeFamilies, graph.nodes],
  )
  const nodeNames = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node.label])), [graph.nodes])
  const nodeCounts = useMemo(() => counts(unfilteredGraph.nodes.map((node) => nodeFamily(node.kind))), [unfilteredGraph.nodes])
  const edgeCounts = useMemo(() => counts(unfilteredGraph.links.map((link) => link.family)), [unfilteredGraph.links])
  const focused = graph.nodes.length <= 40
  const filtered = nodeFamilies.size < NODE_FAMILIES.length || edgeFamilies.size < EDGE_FAMILIES.length
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
  }, [graph.nodes.length, focused, size])

  useEffect(() => {
    const instance = renderer.current
    const charge = instance?.d3Force('charge') as { strength?: (value: number) => unknown } | undefined
    charge?.strength?.(focused ? -70 : graph.nodes.length <= 250 ? -24 : -100)
    settled.current = false
    instance?.d3ReheatSimulation()
  }, [graph.nodes.length, focused, size.width, topologyKey])

  const toggleNodeFamily = (family: NodeFamily) => onNodeFamilies(toggle(nodeFamilies, family))
  const toggleEdgeFamily = (family: EdgeFamily) => onEdgeFamilies(toggle(edgeFamilies, family))
  const clearSelection = useCallback(() => onSelectNodes([]), [onSelectNodes])
  const resetFilters = () => {
    onNodeFamilies(new Set(NODE_FAMILIES))
    onEdgeFamilies(new Set(EDGE_FAMILIES))
  }

  useEffect(() => {
    settled.current = false
  }, [topologyKey])

  useEffect(() => {
    if (settled.current) fitGraph()
  }, [fitGraph])

  return (
    <div className="graph" ref={container}>
      <div className="graph-tools">
        <KeyMenu
          edgeCounts={edgeCounts}
          edges={edgeFamilies}
          nodeCounts={nodeCounts}
          nodes={nodeFamilies}
          onToggleEdge={toggleEdgeFamily}
          onToggleNode={toggleNodeFamily}
        />
        {filtered && <button onClick={resetFilters}>Reset</button>}
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
          nodeVal={(node) => nodeValue(nodeFamily(node.kind))}
          nodeCanvasObjectMode={() => 'replace'}
          nodeCanvasObject={(node, context, scale) => {
            const family = nodeFamily(node.kind)
            const radius = nodeRadius(family)
            drawNode(context, node.x ?? 0, node.y ?? 0, radius, family, palette[family])
            if (selected.has(node.id)) drawSelection(context, node.x ?? 0, node.y ?? 0, radius, scale, palette.accent)
          }}
          linkLabel={(link) => tooltip(
            label(link.kind),
            `${nodeNames.get(endpointId(link.source)) ?? endpointId(link.source)} → ${nodeNames.get(endpointId(link.target)) ?? endpointId(link.target)}`,
            link.evidence,
          )}
          linkColor={(link) => isIncident(link, selected)
            ? palette.accent
            : edgeColors[theme][link.family]}
          linkLineDash={(link) => edgeDashes[link.family]}
          linkWidth={(link) => isIncident(link, selected) ? 1.6 : link.family === 'evidence' ? 0.55 : 0.85}
          linkDirectionalArrowLength={focused ? 3 : 0}
          linkDirectionalArrowRelPos={0.96}
          onNodeClick={(node) => onSelectNodes([node.id])}
          onLinkClick={(link) => onSelectLink({
            ...link,
            source: endpointId(link.source),
            target: endpointId(link.target),
          })}
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
      {!graph.nodes.length && <p className="graph-empty">No nodes match these filters.</p>}
      <Inspector
        graph={completeGraph}
        nodes={selectedNodes}
        link={selectedLink}
        onPrompt={onPrompt}
        onClose={clearSelection}
        onSelect={onSelectNodes}
      />
    </div>
  )
}

function KeyMenu({
  edgeCounts,
  edges,
  nodeCounts,
  nodes,
  onToggleEdge,
  onToggleNode,
}: {
  edgeCounts: Map<EdgeFamily, number>
  edges: ReadonlySet<EdgeFamily>
  nodeCounts: Map<NodeFamily, number>
  nodes: ReadonlySet<NodeFamily>
  onToggleEdge: (family: EdgeFamily) => void
  onToggleNode: (family: NodeFamily) => void
}) {
  const menu = useDismissableMenu()
  return (
    <details className="filter-menu key-menu" ref={menu}>
      <summary><LegendIcon /> Key <span>{nodes.size + edges.size}/{NODE_FAMILIES.length + EDGE_FAMILIES.length}</span></summary>
      <div>
        <strong>Nodes</strong>
        {NODE_FAMILIES.map((family) => (
          <label key={family}>
            <input checked={nodes.has(family)} onChange={() => onToggleNode(family)} type="checkbox" />
            <i aria-hidden="true" className="filter-node" data-family={family} data-shape={shapeByFamily[family]} />
            <span>{family}</span>
            <small>{nodeCounts.get(family) ?? 0}</small>
          </label>
        ))}
        <strong>Edges</strong>
        {EDGE_FAMILIES.map((family) => (
          <label key={family}>
            <input checked={edges.has(family)} onChange={() => onToggleEdge(family)} type="checkbox" />
            <EdgeSymbol family={family} />
            <span>{label(family)}</span>
            <small>{edgeCounts.get(family) ?? 0}</small>
          </label>
        ))}
      </div>
    </details>
  )
}

function useDismissableMenu() {
  const menu = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) menu.current?.removeAttribute('open')
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !menu.current?.open) return
      menu.current.removeAttribute('open')
      menu.current.querySelector('summary')?.focus()
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])
  return menu
}

function EdgeSymbol({ family }: { family: EdgeFamily }) {
  return <i aria-hidden="true" className="filter-edge" data-edge={family} />
}

function toggle<T>(values: ReadonlySet<T>, value: T) {
  const next = new Set(values)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

function counts<T>(values: T[]) {
  const result = new Map<T, number>()
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1)
  return result
}

function nodeValue(family: NodeFamily) {
  return family === 'source' ? 5 : family === 'entity' ? 3 : 4
}

function nodeRadius(family: NodeFamily) {
  return family === 'source' ? 6.5 : family === 'entity' ? 5 : 5.75
}

function drawNode(context: CanvasRenderingContext2D, x: number, y: number, radius: number, family: NodeFamily, color: string) {
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

function LegendIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="5" cy="6" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="5" cy="18" r="1.5"/><path d="M9 6h10M9 12h10M9 18h10"/></svg>
}

function escapeHtml(value: string) {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return value.replace(/[&<>"']/g, (character) => entities[character])
}
