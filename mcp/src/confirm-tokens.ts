import { randomBytes } from 'crypto'

export type DeleteOp = 'campaign' | 'campaign_line' | 'performance'

export interface PendingDelete {
  op: DeleteOp
  targetId: number
  preview: string
  fingerprint: string
  expiresAt: number // epoch ms
}

const DEFAULT_TTL_MS = 5 * 60 * 1000
const pending = new Map<string, PendingDelete>()

/** Issue a one-time confirmation token for a pending delete. */
export function issueToken(op: DeleteOp, targetId: number, preview: string, fingerprint: string, ttlMs: number = DEFAULT_TTL_MS): string {
  const token = `del-${op}-${targetId}-${randomBytes(6).toString('hex')}`
  pending.set(token, { op, targetId, preview, fingerprint, expiresAt: Date.now() + ttlMs })
  return token
}

/** Validate and consume a token. Throws on unknown/expired/mismatch/stale. */
export function consumeToken(token: string, op: DeleteOp, targetId: number, fingerprint: string): PendingDelete {
  const entry = pending.get(token)
  if (!entry) throw new Error('Invalid or expired confirm_token. Re-run without confirm_token to get a fresh preview.')
  if (Date.now() > entry.expiresAt) {
    pending.delete(token)
    throw new Error('Expired confirm_token. Re-run without confirm_token to get a fresh preview.')
  }
  if (entry.op !== op || entry.targetId !== targetId) {
    throw new Error('confirm_token does not match the requested operation or target.')
  }
  if (entry.fingerprint !== fingerprint) {
    pending.delete(token)
    throw new Error('Data changed since preview; re-run without confirm_token to get a fresh preview.')
  }
  pending.delete(token) // one-time use
  return entry
}
