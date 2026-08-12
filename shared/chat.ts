import type { GraphView } from './graph.js'

export function compactChatHistory<Message extends { parts: Array<{ type: string; text?: string }> }>(messages: Message[]) {
  return messages.flatMap((message, index) => {
    if (index === messages.length - 1) return [message]
    const parts = message.parts.flatMap((part) =>
      part.type === 'text' ? [{ type: 'text', text: part.text ?? '' }] : [],
    )
    return parts.length ? [{ ...message, parts } as Message] : []
  })
}

export function viewEventFromMessage(message: {
  id: string
  role: string
  parts: Array<{ type: string; state?: string; output?: unknown; toolCallId?: string }>
}): { key: string; view: GraphView } | undefined {
  if (message.role !== 'assistant') return undefined
  for (let index = message.parts.length - 1; index >= 0; index -= 1) {
    const part = message.parts[index]
    if (part.state !== 'output-available' || !part.output || typeof part.output !== 'object') continue
    const view = Reflect.get(part.output, 'view')
    if (!view || typeof view !== 'object' || Reflect.get(view, 'mode') !== 'focus') continue
    const nodeIds = Reflect.get(view, 'nodeIds')
    const selectedNodeIds = Reflect.get(view, 'selectedNodeIds')
    if (
      Array.isArray(nodeIds) && nodeIds.length && nodeIds.every((id) => typeof id === 'string') &&
      Array.isArray(selectedNodeIds) && selectedNodeIds.every((id) => typeof id === 'string')
    ) {
      return {
        key: part.toolCallId ?? `${message.id}:${index}`,
        view: { mode: 'focus', nodeIds, selectedNodeIds },
      }
    }
  }
  return undefined
}

export function viewFromParts(parts: Array<{ type: string; state?: string; output?: unknown }>): GraphView | undefined {
  return viewEventFromMessage({ id: 'message', role: 'assistant', parts })?.view
}
