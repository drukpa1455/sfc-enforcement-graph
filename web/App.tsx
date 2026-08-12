import { useCallback, useEffect, useMemo, useState } from 'react'
import { Chat } from './Chat'
import { Graph } from './Graph'
import { focusGraph, overviewGraph, type GraphData, type GraphLink, type GraphView } from '../shared/graph'
import './App.css'

export type Theme = 'light' | 'dark'

export default function App() {
  const [graph, setGraph] = useState<GraphData>()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectedLink, setSelectedLink] = useState<GraphLink>()
  const [focusIds, setFocusIds] = useState<string[]>()
  const [showFullGraph, setShowFullGraph] = useState(false)
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
    <main className="workspace">
      <section className="canvas">
        <header>
          <h1><span>SFC enforcement</span> Connected conduct</h1>
          <div className="meta">
            <p>{focusIds
              ? `${visibleGraph.nodes.length} of ${graph.nodes.length} nodes · ${visibleGraph.links.length} links`
              : showFullGraph
                ? `${graph.nodes.length} nodes · ${graph.links.length} links`
                : `${visibleGraph.nodes.length} overview · ${graph.nodes.length} total · ${visibleGraph.links.length} links`}</p>
            {showFullGraph && !focusIds
              ? <button className="text-button" onClick={showOverview}>Overview</button>
              : <button className="text-button" onClick={showAll}>Show all</button>}
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
        onSelect={selectNodes}
        onView={showView}
      />
    </main>
  )
}

function SunIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
}

function MoonIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 15.2A8.5 8.5 0 0 1 8.8 4a8.5 8.5 0 1 0 11.2 11.2Z"/></svg>
}
