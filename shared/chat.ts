export function compactChatHistory<Message extends { parts: Array<{ type: string }> }>(messages: Message[]) {
  return messages.flatMap((message, index) => {
    if (index === messages.length - 1) return [message]
    const parts = message.parts.filter((part) => part.type === 'text')
    return parts.length ? [{ ...message, parts } as Message] : []
  })
}
