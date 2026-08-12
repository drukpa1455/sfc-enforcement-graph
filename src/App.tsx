import { useCallback, useEffect, useMemo, useState } from 'react'
import { Chat } from './Chat'
import { Graph } from './Graph'
import { focusGraph, type GraphData, type GraphView } from './model'
import './App.css'

export type Theme = 'jade' | 'sapphire'

export default function App() {
  const [graph, setGraph] = useState<GraphData>()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [focusIds, setFocusIds] = useState<string[]>()
  const [error, setError] = useState<string>()
  const [theme, setTheme] = useState<Theme>(() =>
    localStorage.getItem('theme') === 'jade' ? 'jade' : 'sapphire',
  )

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
    () => graph && focusIds ? focusGraph(graph, focusIds) : graph,
    [focusIds, graph],
  )
  const showView = useCallback((view: GraphView) => {
    setFocusIds(view.nodeIds)
    setSelectedIds(view.nodeIds)
  }, [])

  if (error) return <main className="centered">{error}</main>
  if (!graph || !visibleGraph) return <main className="centered">Loading graph…</main>

  return (
    <main className="workspace">
      <section className="canvas">
        <header>
          <div>
            <p className="eyebrow">SFC enforcement</p>
            <h1>Connected conduct</h1>
          </div>
          <div className="meta">
            <p>{focusIds ? `${visibleGraph.nodes.length} of ${graph.nodes.length}` : graph.nodes.length} nodes · {visibleGraph.links.length} links</p>
            {focusIds && <button onClick={() => setFocusIds(undefined)}>Show all</button>}
            <button onClick={() => setTheme(theme === 'sapphire' ? 'jade' : 'sapphire')}>
              {theme === 'sapphire' ? 'Jade' : 'Sapphire'}
            </button>
          </div>
        </header>
        <Graph graph={visibleGraph} selectedIds={selectedIds} onSelect={setSelectedIds} theme={theme} />
      </section>
      <Chat selected={selected} onSelect={setSelectedIds} onView={showView} />
    </main>
  )
}
