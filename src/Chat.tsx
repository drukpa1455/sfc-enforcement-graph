import { useEffect, useMemo, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { GraphNode } from './model'
import { selectionFromParts } from './model'

interface Props {
  selected: GraphNode[]
  onSelect: (ids: string[]) => void
}

export function Chat({ selected, onSelect }: Props) {
  const transport = useMemo(() => new DefaultChatTransport({ api: '/api/chat' }), [])
  const { messages, sendMessage, status, error } = useChat({ transport })
  const [input, setInput] = useState('')

  useEffect(() => {
    const selection = selectionFromParts(messages.flatMap((message) => message.parts))
    if (selection) onSelect(selection)
  }, [messages, onSelect])

  return (
    <aside className="sidebar">
      <header>
        <h2>Research agent</h2>
        <p>Ask about entities, relationships, actions, or evidence.</p>
      </header>
      <div className="messages">
        <div className="selection">
          {selected.length ? selected.map((node) => (
            <button key={node.id} onClick={() => onSelect([node.id])} title={node.summary}>{node.label}</button>
          )) : <p className="empty">Select a node or ask the agent to focus the graph.</p>}
        </div>
        {messages.map((message) => (
          <div className={`message ${message.role}`} key={message.id}>
            {message.parts.map((part, index) => part.type === 'text' ? <span key={index}>{part.text}</span> : null)}
          </div>
        ))}
        {(status === 'submitted' || status === 'streaming') && <p className="status">Thinking…</p>}
        {error && <p className="status">{error.message}</p>}
      </div>
      <form className="composer" onSubmit={(event) => {
        event.preventDefault()
        const text = input.trim()
        if (!text) return
        void sendMessage({ text })
        setInput('')
      }}>
        <input aria-label="Ask the research agent" placeholder="Find Wong Tim Hi…" value={input} onChange={(event) => setInput(event.target.value)} />
        <button disabled={!input.trim() || status !== 'ready'}>Ask</button>
      </form>
    </aside>
  )
}
