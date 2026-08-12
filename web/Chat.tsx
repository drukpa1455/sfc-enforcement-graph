import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import Markdown from 'react-markdown'
import { compactChatHistory, viewEventFromMessage } from '../shared/chat'
import type { GraphContext, GraphData, GraphLink, GraphNode, GraphView } from '../shared/graph'

interface Props {
  graph: GraphData
  selected: GraphNode[]
  selectedLink?: GraphLink
  headerAction: ReactNode
  promptRequest: { version: number; text: string }
  view: GraphContext['view']
  viewReset: number
  onSelect: (ids: string[]) => void
  onView: (view: GraphView) => void
}

export function Chat({ graph, selected, selectedLink, headerAction, promptRequest, view, viewReset, onSelect, onView }: Props) {
  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    prepareSendMessagesRequest: ({ messages, body }) => ({
      body: { ...body, messages: compactChatHistory(messages) },
    }),
  }), [])
  const { messages, sendMessage, status, error } = useChat({ transport })
  const [input, setInput] = useState('')
  const composer = useRef<HTMLInputElement>(null)
  const appliedView = useRef<string | undefined>(undefined)
  const historyBoundary = useRef(-1)
  const ignoreViews = useRef(false)

  useEffect(() => {
    if (!viewReset) return
    ignoreViews.current = true
  }, [viewReset])

  useEffect(() => {
    if (ignoreViews.current) return
    if (messages.length - 1 <= historyBoundary.current) return
    const message = messages.at(-1)
    if (!message) return
    const event = viewEventFromMessage(message)
    if (!event || event.key === appliedView.current) return
    appliedView.current = event.key
    onView(event.view)
  }, [messages, onView])

  useEffect(() => {
    if (!promptRequest.version) return
    setInput(promptRequest.text)
    composer.current?.focus()
  }, [promptRequest])

  return (
    <aside className="sidebar">
      <header>
        <div>
          <h2>Research agent</h2>
          <p>Ask about entities, relationships, actions, or evidence.</p>
        </div>
        {headerAction}
      </header>
      <div className="messages">
        <SelectionContext graph={graph} nodes={selected} link={selectedLink} onClear={() => onSelect([])} />
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
          view,
          ...(selectedLink ? { selectedLink: {
            source: selectedLink.source,
            target: selectedLink.target,
            kind: selectedLink.kind,
          } } : {}),
        }
        ignoreViews.current = false
        historyBoundary.current = messages.length - 1
        void sendMessage({ text }, { body: { context } })
        setInput('')
      }}>
        <input ref={composer} aria-label="Ask the research agent" placeholder="Find Wong Tim Hi…" value={input} onChange={(event) => setInput(event.target.value)} />
        <button disabled={!input.trim() || status !== 'ready'}>Ask</button>
      </form>
    </aside>
  )
}

function MessagePart({ graph, part }: { graph: GraphData; part: ChatPart }) {
  if (part.type === 'text') return <Markdown>{part.text ?? ''}</Markdown>
  const activity = toolActivity(graph, part)
  return activity ? <span className="tool-activity">{activity}</span> : null
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
  if (tool === 'neighborhood') return `${done ? 'Mapped' : 'Mapping'} ${value('depth') || '2'}-hop neighborhood${done ? '' : '…'}`
  if (tool === 'rank') return `${done ? 'Ranked' : 'Ranking'} by ${label(value('metric'))}${done ? '' : '…'}`
  if (tool === 'trace') {
    const path = `${nodeName(value('sourceId'))} → ${nodeName(value('targetId'))}`
    return `${done ? 'Traced' : 'Tracing'} ${path}${done ? '' : '…'}`
  }
  return `${done ? 'Used' : 'Using'} ${label(tool)}${done ? '' : '…'}`
}

function SelectionContext({ graph, nodes, link, onClear }: {
  graph: GraphData
  nodes: GraphNode[]
  link?: GraphLink
  onClear: () => void
}) {
  const text = link
    ? `${nodeLabel(graph, link.source)} → ${nodeLabel(graph, link.target)}`
    : nodes.length === 1
      ? nodes[0].label
      : nodes.length
        ? `${nodes.length} nodes`
        : 'No graph selection'
  return (
    <div className="chat-context">
      <span>Context</span><strong>{text}</strong>
      {(link || nodes.length > 0) && <button aria-label="Clear graph context" onClick={onClear}>×</button>}
    </div>
  )
}

function nodeLabel(graph: GraphData, id: string) {
  return graph.nodes.find((node) => node.id === id)?.label ?? id
}

function label(value: string) {
  return value.replaceAll('_', ' ')
}
