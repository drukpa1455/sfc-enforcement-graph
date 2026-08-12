export const CHAT_BODY_LIMIT = 64 * 1024
export const CHAT_MESSAGE_LIMIT = 40

export class RequestBudget {
  private count = 0
  private readonly limit: number
  private readonly windowMs: number
  private windowStartedAt = 0

  constructor(limit: number, windowMs: number) {
    this.limit = limit
    this.windowMs = windowMs
  }

  take(now = Date.now()) {
    if (now - this.windowStartedAt >= this.windowMs) {
      this.windowStartedAt = now
      this.count = 0
    }
    if (this.count >= this.limit) {
      return { allowed: false as const, retryAfter: Math.ceil((this.windowStartedAt + this.windowMs - now) / 1000) }
    }
    this.count += 1
    return { allowed: true as const }
  }
}

export function chatRequestBudget(environment = process.env) {
  return new RequestBudget(integer(environment.CHAT_REQUESTS_PER_MINUTE, 12), 60_000)
}

function integer(value: string | undefined, fallback: number) {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}
