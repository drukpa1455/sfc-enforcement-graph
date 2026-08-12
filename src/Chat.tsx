import { useEffect, useMemo, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { GraphContext, GraphData, GraphLink, GraphNode, GraphView } from './model'
import { viewFromParts } from './model'

interface Props {
  graph: GraphData
  selected: GraphNode[]
  selectedLink?: GraphLink
  visibleNodeIds: string[]
  onSelect: (ids: string[]) => void
  onView: (view: GraphView) => void
}

export function Chat({ graph, selected, selectedLink, visibleNodeIds, onSelect, onView }: Props) {
  const transport = useMemo(() => new DefaultChatTransport({ api: '/api/chat' }), [])
  const { messages, sendMessage, status, error } = useChat({ transport })
  const [input, setInput] = useState('')

  useEffect(() => {
    const view = viewFromParts(messages.flatMap((message) => message.parts))
    if (view) onView(view)
  }, [messages, onView])

  return (
    <aside className="sidebar">
      <header>
        <h2>Research agent</h2>
        <p>Ask about entities, relationships, actions, or evidence.</p>
      </header>
      <div className="messages">
        <div className="selection">
          <SelectionDetail graph={graph} nodes={selected} link={selectedLink} onSelect={onSelect} />
        </div>
        {messages.map((message) => (
          <div className={`message ${message.role}`} key={message.id}>
            {message.parts.map((part, index) => <MessagePart graph={graph} part={part} key={index} />)}
          </div>
        ))}
        {(status === 'submitted' || status === 'streaming') && <p className="status">Thinking…</p>}
        {error && <p className="status">{error.message}</p>}
      </div>
      <form className="composer" onSubmit={(event) => {
        event.preventDefault()
        const text = input.trim()
        if (!text) return
        const context: GraphContext = {
          selectedNodeIds: selected.slice(0, 24).map((node) => node.id),
          visibleNodeIds,
          ...(selectedLink ? { selectedLink: {
            source: selectedLink.source,
            target: selectedLink.target,
            kind: selectedLink.kind,
          } } : {}),
        }
        void sendMessage({ text }, { body: { context } })
        setInput('')
      }}>
        <input aria-label="Ask the research agent" placeholder="Find Wong Tim Hi…" value={input} onChange={(event) => setInput(event.target.value)} />
        <button disabled={!input.trim() || status !== 'ready'}>Ask</button>
      </form>
    </aside>
  )
}

function MessagePart({ graph, part }: { graph: GraphData; part: ChatPart }) {
  if (part.type === 'text') return <span>{boldText(part.text ?? '')}</span>
  const activity = toolActivity(graph, part)
  return activity ? <span className="tool-activity">{activity}</span> : null
}

function boldText(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : part,
  )
}

interface ChatPart {
  type: string
  state?: string
  text?: string
  input?: unknown
  errorText?: string
}

function toolActivity(graph: GraphData, part: ChatPart) {
  if (!part.type.startsWith('tool-')) return undefined
  const tool = part.type.slice(5)
  const done = part.state === 'output-available'
  if (part.state === 'output-error') return `${label(tool)} failed${part.errorText ? `: ${part.errorText}` : ''}`

  const input = part.input && typeof part.input === 'object' ? part.input : {}
  const value = (key: string) => String(Reflect.get(input, key) ?? '')
  const nodeName = (id: string) => graph.nodes.find((node) => node.id === id)?.label ?? id

  if (tool === 'search') return `${done ? 'Searched' : 'Searching'}${value('query') ? ` “${value('query')}”` : ''}${done ? '' : '…'}`
  if (tool === 'inspect') return `${done ? 'Inspected' : 'Inspecting'} ${nodeName(value('id'))}${done ? '' : '…'}`
  if (tool === 'expand') return `${done ? 'Expanded' : 'Expanding'} selection${done ? '' : '…'}`
  if (tool === 'trace') {
    const path = `${nodeName(value('sourceId'))} → ${nodeName(value('targetId'))}`
    return `${done ? 'Traced' : 'Tracing'} ${path}${done ? '' : '…'}`
  }
  return `${done ? 'Used' : 'Using'} ${label(tool)}${done ? '' : '…'}`
}

function SelectionDetail({ graph, nodes, link, onSelect }: {
  graph: GraphData
  nodes: GraphNode[]
  link?: GraphLink
  onSelect: (ids: string[]) => void
}) {
  if (link) return <LinkDetail graph={graph} link={link} />
  if (nodes.length === 1) return <NodeDetail graph={graph} node={nodes[0]} />
  if (nodes.length) return nodes.map((node) => (
    <button key={node.id} onClick={() => onSelect([node.id])}>{node.label}</button>
  ))
  return <p className="empty">Select a node or ask the agent to focus the graph.</p>
}

function NodeDetail({ graph, node }: { graph: GraphData; node: GraphNode }) {
  return (
    <article className="detail">
      <span>{label(node.kind)}</span>
      <h3>{node.label}</h3>
      <p>{node.summary}</p>
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

function label(value: string) {
  return value.replaceAll('_', ' ')
}
