import { describe, it, expect } from 'vitest'
import { issueToken, consumeToken } from './confirm-tokens'

describe('confirm-tokens', () => {
  it('issues a token bound to op and target, consumable once', () => {
    const t = issueToken('campaign', 5, 'will delete campaign 5', 'fp-abc')
    expect(typeof t).toBe('string')
    expect(t.length).toBeGreaterThan(0)
    const entry = consumeToken(t, 'campaign', 5, 'fp-abc')
    expect(entry.preview).toBe('will delete campaign 5')
    // one-time: second consume of the same token fails
    expect(() => consumeToken(t, 'campaign', 5, 'fp-abc')).toThrow(/invalid|expired/i)
  })

  it('rejects an unknown token', () => {
    expect(() => consumeToken('nope', 'campaign', 1, 'fp')).toThrow(/invalid|expired/i)
  })

  it('rejects an expired token', () => {
    const t = issueToken('performance', 7, 'p', 'fp', -1) // already expired
    expect(() => consumeToken(t, 'performance', 7, 'fp')).toThrow(/expired/i)
  })

  it('rejects op/target mismatch and does not consume the token', () => {
    const t = issueToken('campaign_line', 3, 'line 3', 'fp-3')
    expect(() => consumeToken(t, 'campaign', 3, 'fp-3')).toThrow(/mismatch|does not match/i)
    expect(() => consumeToken(t, 'campaign_line', 9, 'fp-3')).toThrow(/mismatch|does not match/i)
    // still valid for the correct op/target
    expect(consumeToken(t, 'campaign_line', 3, 'fp-3').targetId).toBe(3)
  })

  it('matching fingerprint consumes successfully', () => {
    const t = issueToken('campaign', 10, 'preview text', '2:5')
    const entry = consumeToken(t, 'campaign', 10, '2:5')
    expect(entry.fingerprint).toBe('2:5')
    expect(entry.preview).toBe('preview text')
  })

  it('mismatched fingerprint throws changed|stale and token is then gone', () => {
    const t = issueToken('campaign', 11, 'preview', 'fp-original')
    // Different fingerprint (data changed)
    expect(() => consumeToken(t, 'campaign', 11, 'fp-changed')).toThrow(/changed|stale/i)
    // Token is now deleted — even correct fingerprint fails
    expect(() => consumeToken(t, 'campaign', 11, 'fp-original')).toThrow(/invalid|expired/i)
  })
})
