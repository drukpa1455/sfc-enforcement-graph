import { useCallback, useEffect, useMemo, useState } from 'react'
import { Chat } from './Chat'
import { Graph } from './Graph'
import { focusGraph, overviewGraph, type GraphData, type GraphLink, type GraphView } from '../shared/graph'
import './App.css'

export type Theme = 'light' | 'dark'
type Layout = 'graph' | 'split' | 'agent'

export default function App() {
  const [graph, setGraph] = useState<GraphData>()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectedLink, setSelectedLink] = useState<GraphLink>()
  const [focusIds, setFocusIds] = useState<string[]>()
  const [showFullGraph, setShowFullGraph] = useState(false)
  const [layout, setLayout] = useState<Layout>('split')
  const [viewReset, setViewReset] = useState(0)
  const [viewVersion, setViewVersion] = useState(0)
  const [error, setError] = useState<string>()
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'light' || saved === 'jade') return 'light'
    if (saved === 'dark' || saved === 'sapphire') return 'dark'
    return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    fetch('/api/graph')
      .then((response) => {
        if (!response.ok) throw new Error(`Graph request failed: ${response.status}`)
        return response.json() as Promise<GraphData>
      })
      .then(setGraph)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Graph request failed'),
      )
  }, [])

  const selected = graph?.nodes.filter((node) => selectedIds.includes(node.id)) ?? []
  const visibleGraph = useMemo(
    () => graph && (focusIds ? focusGraph(graph, focusIds) : showFullGraph ? graph : overviewGraph(graph)),
    [focusIds, graph, showFullGraph],
  )
  const showView = useCallback((view: GraphView) => {
    setSelectedLink(undefined)
    setFocusIds(view.nodeIds)
    setSelectedIds(view.selectedNodeIds)
    setViewVersion((version) => version + 1)
  }, [])
  const showAll = useCallback(() => {
    setFocusIds(undefined)
    setShowFullGraph(true)
    setSelectedIds([])
    setSelectedLink(undefined)
    setViewReset((version) => version + 1)
    setViewVersion((version) => version + 1)
  }, [])
  const showOverview = useCallback(() => {
    setShowFullGraph(false)
    setSelectedIds([])
    setSelectedLink(undefined)
    setViewReset((version) => version + 1)
    setViewVersion((version) => version + 1)
  }, [])
  const selectNodes = useCallback((nodeIds: string[]) => {
    setSelectedLink(undefined)
    setSelectedIds(nodeIds)
  }, [])
  const selectLink = useCallback((link: GraphLink) => {
    setSelectedLink(link)
    setSelectedIds([link.source, link.target])
  }, [])

  if (error) return <main className="centered">{error}</main>
  if (!graph || !visibleGraph) return <main className="centered">Loading graph…</main>

  return (
    <main className="workspace" data-layout={layout}>
      <section className="canvas">
        <header>
          <div className="brand">
            <AgosMark />
            <div>
              <h1><span>SFC Enforcement Graph</span><span className="compact-title">SFC Graph</span></h1>
              <p>Evidence-linked intelligence <span>Independent</span></p>
            </div>
          </div>
          <div className="meta">
            <p>{focusIds
              ? `${visibleGraph.nodes.length} of ${graph.nodes.length} nodes · ${visibleGraph.links.length} links`
              : showFullGraph
                ? `${graph.nodes.length} nodes · ${graph.links.length} links`
                : `${visibleGraph.nodes.length} overview · ${graph.nodes.length} total · ${visibleGraph.links.length} links`}</p>
            {showFullGraph && !focusIds
              ? <button className="text-button" onClick={showOverview}>Overview</button>
              : <button className="text-button" onClick={showAll}>Show all</button>}
            <LayoutSwitch layout={layout} onChange={setLayout} />
            <button
              aria-label={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`}
              className="icon-button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </header>
        <Graph
          key={viewVersion}
          graph={visibleGraph}
          selectedIds={selectedIds}
          onSelectLink={selectLink}
          onSelectNodes={selectNodes}
          theme={theme}
        />
      </section>
      <Chat
        graph={graph}
        selected={selected}
        selectedLink={selectedLink}
        view={focusIds ? { mode: 'focus', nodeIds: visibleGraph.nodes.slice(0, 80).map((node) => node.id) } : { mode: 'all' }}
        viewReset={viewReset}
        headerAction={<LayoutSwitch layout={layout} onChange={setLayout} />}
        onSelect={selectNodes}
        onView={showView}
      />
    </main>
  )
}

function AgosMark() {
  return (
    <svg aria-hidden="true" className="brand-mark" viewBox="0 0 64 64">
      <g className="brand-geometry" fill="none" strokeLinecap="round" strokeWidth="1.1">
        <path d="M32 32 47.9 11.5M32 32 47.9 43.7M32 32 16.1 20.3M32 32 16.1 52.5M32 32 57.1 35.2M32 32 38.7 20M32 32 25.3 44M32 32 6.9 28.8M32 32 41.2 23.5M32 32 22.8 8.2M32 32 41.2 55.8M32 32 22.8 40.5"/>
        <path d="M47.9 11.5 57.1 35.2M47.9 11.5 38.7 20M47.9 11.5 41.2 23.5M47.9 11.5 22.8 8.2M47.9 43.7 57.1 35.2M47.9 43.7 38.7 20M47.9 43.7 41.2 55.8M47.9 43.7 22.8 40.5"/>
        <path d="M16.1 20.3 25.3 44M16.1 20.3 6.9 28.8M16.1 20.3 41.2 23.5M16.1 20.3 22.8 8.2M16.1 52.5 25.3 44M16.1 52.5 6.9 28.8M16.1 52.5 41.2 55.8M16.1 52.5 22.8 40.5"/>
        <path d="M57.1 35.2 41.2 23.5M57.1 35.2 41.2 55.8M38.7 20 22.8 8.2M38.7 20 22.8 40.5M25.3 44 41.2 23.5M25.3 44 41.2 55.8M6.9 28.8 22.8 8.2M6.9 28.8 22.8 40.5"/>
      </g>
      <g className="brand-nodes">
        <circle cx="47.9" cy="11.5" r="1.57"/><circle cx="47.9" cy="43.7" r="1.19"/>
        <circle cx="16.1" cy="20.3" r="1.91"/><circle cx="16.1" cy="52.5" r="1.53"/>
        <circle cx="57.1" cy="35.2" r="1.67"/><circle cx="38.7" cy="20" r="1.08"/>
        <circle cx="25.3" cy="44" r="2.02"/><circle cx="6.9" cy="28.8" r="1.43"/>
        <circle cx="41.2" cy="23.5" r="2.03"/><circle cx="22.8" cy="8.2" r="1.44"/>
        <circle cx="41.2" cy="55.8" r="1.66"/><circle cx="22.8" cy="40.5" r="1.07"/>
      </g>
      <path d="M27.2 31.4 30.2 27.4 35.1 28 36.8 32.6 33.8 36.6 28.9 36Z" fill="var(--accent)"/>
    </svg>
  )
}

function LayoutSwitch({ layout, onChange }: { layout: Layout; onChange: (layout: Layout) => void }) {
  const options: Array<{ layout: Layout; label: string }> = [
    { layout: 'graph', label: 'Graph only' },
    { layout: 'split', label: 'Split view' },
    { layout: 'agent', label: 'Agent only' },
  ]
  return (
    <div aria-label="Workspace layout" className="layout-switch" role="group">
      {options.map((option) => (
        <button
          aria-label={option.label}
          aria-pressed={layout === option.layout}
          key={option.layout}
          onClick={() => onChange(option.layout)}
          title={option.label}
        >
          <LayoutIcon layout={option.layout} />
        </button>
      ))}
    </div>
  )
}

function LayoutIcon({ layout }: { layout: Layout }) {
  if (layout === 'graph') return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="6" cy="12" r="2"/><circle cx="18" cy="7" r="2"/><circle cx="18" cy="17" r="2"/><path d="m8 11 8-3M8 13l8 3"/></svg>
  if (layout === 'agent') return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4V5Z"/></svg>
  return <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="1"/><path d="M15 4v16"/></svg>
}

function SunIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
}

function MoonIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 15.2A8.5 8.5 0 0 1 8.8 4a8.5 8.5 0 1 0 11.2 11.2Z"/></svg>
}
