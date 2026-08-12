import { useEffect } from 'react'
import type { GraphData, GraphLink, GraphNode } from '../shared/graph'

interface Props {
  graph: GraphData
  nodes: GraphNode[]
  link?: GraphLink
  onClose: () => void
  onPrompt: (text: string) => void
  onSelect: (ids: string[]) => void
}

export function Inspector({ graph, nodes, link, onClose, onPrompt, onSelect }: Props) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  if (!link && !nodes.length) return null
  const prompts = suggestedPrompts(graph, nodes, link)

  return (
    <aside aria-label="Graph selection details" className="inspector">
      <header>
        <span>Selection</span>
        <button aria-label="Close inspector" onClick={onClose} title="Close inspector">×</button>
      </header>
      <div className="inspector-body">
        {link
          ? <LinkDetail graph={graph} link={link} />
          : nodes.length === 1
            ? <NodeDetail graph={graph} node={nodes[0]} />
            : <NodeList nodes={nodes} onSelect={onSelect} />}
      </div>
      <footer>
        <span>Suggested questions</span>
        {prompts.map((prompt) => <button key={prompt} onClick={() => onPrompt(prompt)}>{prompt}</button>)}
      </footer>
    </aside>
  )
}

function suggestedPrompts(graph: GraphData, nodes: GraphNode[], link?: GraphLink) {
  if (link) {
    const source = nodeName(graph, link.source)
    const target = nodeName(graph, link.target)
    return [
      `Explain the relationship between ${source} and ${target}, citing the evidence.`,
      `Show the shortest evidence-backed path between ${source} and ${target}.`,
    ]
  }
  if (nodes.length > 1) return [
    'Compare the selected nodes and explain how they are connected.',
    'Show the shortest evidence-backed paths among the selected nodes.',
  ]
  const node = nodes[0]
  if (node.kind === 'release') return [
    `Summarize the key subjects, actions, and evidence in ${node.label}.`,
    `Show the entities connected by ${node.label}.`,
  ]
  if (node.kind === 'risk') return [
    `Which entities are associated with ${node.label}, and with what status?`,
    `Show the evidence behind ${node.label}.`,
  ]
  if (node.kind === 'action') return [
    `Who is affected by ${node.label}, and what is its status?`,
    `Trace the evidence supporting ${node.label}.`,
  ]
  if (node.kind === 'matter') return [
    `Who and what are connected to ${node.label}?`,
    `Summarize the evidence supporting ${node.label}.`,
  ]
  return [
    `What role does ${node.label} play in the enforcement record?`,
    `In two sentences, explain ${node.label}'s role and show direct relationships with supporting evidence.`,
  ]
}

function nodeName(graph: GraphData, id: string) {
  return graph.nodes.find((node) => node.id === id)?.label ?? id
}

function NodeList({ nodes, onSelect }: { nodes: GraphNode[]; onSelect: (ids: string[]) => void }) {
  return (
    <div className="inspector-list">
      <p>{nodes.length} nodes selected</p>
      {nodes.map((node) => (
        <button key={node.id} onClick={() => onSelect([node.id])}>
          <span>{label(node.kind)}</span>{node.label}
        </button>
      ))}
    </div>
  )
}

function NodeDetail({ graph, node }: { graph: GraphData; node: GraphNode }) {
  return (
    <article className="detail">
      <span>{label(node.kind)}</span>
      <h3>{node.label}</h3>
      <p>{node.summary}</p>
      <dl className="facts">
        {metricFacts(node).map(([name, value]) => (
          <div key={name}><dt>{label(name)}</dt><dd>{value}</dd></div>
        ))}
        {Object.entries(node.facets).flatMap(([name, values]) => values.map((value) => (
          <div key={`${name}:${value}`}><dt>{label(name)}</dt><dd>{value}</dd></div>
        )))}
        {node.facts.map((fact, index) => (
          <div key={`${fact.name}:${index}`} title={fact.evidence}><dt>{label(fact.name)}</dt><dd>{fact.value}</dd></div>
        ))}
      </dl>
      <ReleaseLinks graph={graph} refs={node.releaseRefs} />
    </article>
  )
}

function LinkDetail({ graph, link }: { graph: GraphData; link: GraphLink }) {
  const source = graph.nodes.find((node) => node.id === link.source)?.label ?? link.source
  const target = graph.nodes.find((node) => node.id === link.target)?.label ?? link.target
  return (
    <article className="detail">
      <span>{label(link.kind)}</span>
      <h3>{source} → {target}</h3>
      <p>{link.evidence}</p>
      <dl className="facts">
        {Object.entries(link.facets).flatMap(([name, values]) => values.map((value) => (
          <div key={`${name}:${value}`}><dt>{label(name)}</dt><dd>{value}</dd></div>
        )))}
        {link.facts.map((fact, index) => (
          <div key={`${fact.name}:${index}`} title={fact.evidence}><dt>{label(fact.name)}</dt><dd>{fact.value}</dd></div>
        ))}
      </dl>
      <ReleaseLinks graph={graph} refs={[link.releaseRef]} />
    </article>
  )
}

function ReleaseLinks({ graph, refs }: { graph: GraphData; refs: string[] }) {
  return <div className="release-links">{refs.map((ref) => {
    const release = graph.releases.find((candidate) => candidate.ref === ref)
    return release
      ? <a href={release.url} key={ref} rel="noreferrer" target="_blank">{ref} ↗</a>
      : <span key={ref}>{ref}</span>
  })}</div>
}

function metricFacts(node: GraphNode): Array<[string, string]> {
  const metrics: Array<[string, number]> = [
    ['release count', node.metrics.releaseCount],
    ['degree', node.metrics.degree],
    ['pagerank', node.metrics.pagerank],
    ['component size', node.metrics.componentSize],
    ['core', node.metrics.core],
    ['betweenness', node.metrics.betweenness],
  ]
  const facts = metrics.filter(([, value]) => value > 0).map(([name, value]) => [name, formatNumber(value)] as [string, string])
  if (node.metrics.component !== null) facts.push(['component', node.metrics.component])
  if (node.metrics.community !== null) facts.push(['community', String(node.metrics.community)])
  return facts
}

function formatNumber(value: number) {
  if (Number.isInteger(value)) return value.toLocaleString('en-US')
  return value.toLocaleString('en-US', { maximumSignificantDigits: 4 })
}

function label(value: string) {
  return value.replaceAll('_', ' ')
}
