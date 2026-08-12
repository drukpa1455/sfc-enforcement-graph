import { useEffect, useState } from 'react'
import { Chat } from './Chat'
import { Graph } from './Graph'
import type { GraphData } from './model'
import './App.css'

export default function App() {
  const [graph, setGraph] = useState<GraphData>()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [error, setError] = useState<string>()

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

  if (error) return <main className="centered">{error}</main>
  if (!graph) return <main className="centered">Loading graph…</main>

  const selected = graph.nodes.filter((node) => selectedIds.includes(node.id))

  return (
    <main className="workspace">
      <section className="canvas">
        <header>
          <div>
            <p className="eyebrow">SFC enforcement</p>
            <h1>Connected conduct</h1>
          </div>
          <p>{graph.nodes.length} nodes · {graph.links.length} links</p>
        </header>
        <Graph graph={graph} selectedIds={selectedIds} onSelect={setSelectedIds} />
      </section>
      <Chat selected={selected} onSelect={setSelectedIds} />
    </main>
  )
}
