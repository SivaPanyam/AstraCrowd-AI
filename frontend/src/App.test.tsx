import { describe, it, expect } from 'vitest'
import {
  classifyStatus,
  getGateCardColorClass,
  getGateBadgeColorClass,
  shouldDivertSignage,
  WARNING_MIN_PCT,
  CRITICAL_MIN_PCT,
} from './gateThresholds'

describe('gateThresholds (shared with App dashboard)', () => {
  it('classifies safe below warning threshold', () => {
    expect(classifyStatus(WARNING_MIN_PCT - 1)).toBe('safe')
  })

  it('classifies warning at 60% through 84%', () => {
    expect(classifyStatus(WARNING_MIN_PCT)).toBe('warning')
    expect(classifyStatus(CRITICAL_MIN_PCT - 1)).toBe('warning')
  })

  it('classifies critical at 85% and above', () => {
    expect(classifyStatus(CRITICAL_MIN_PCT)).toBe('critical')
    expect(classifyStatus(92)).toBe('critical')
  })

  it('renders emerald card styling when safe', () => {
    const classes = getGateCardColorClass(25)
    expect(classes).toContain('bg-emerald-950')
    expect(classes).not.toContain('bg-rose-950')
    expect(classes).not.toContain('bg-amber-950')
  })

  it('renders amber card styling in warning band', () => {
    const classes = getGateCardColorClass(65)
    expect(classes).toContain('bg-amber-950')
    expect(classes).not.toContain('bg-emerald-950')
    expect(classes).not.toContain('bg-rose-950')
  })

  it('renders rose card styling when critical', () => {
    const classes = getGateCardColorClass(92)
    expect(classes).toContain('bg-rose-950')
    expect(classes).not.toContain('bg-emerald-950')
    expect(classes).not.toContain('bg-amber-950')
  })

  it('uses consistent badge colors per status band', () => {
    expect(getGateBadgeColorClass(25)).toContain('emerald')
    expect(getGateBadgeColorClass(65)).toContain('amber')
    expect(getGateBadgeColorClass(92)).toContain('rose')
  })

  it('enables DIVERT signage only at critical threshold', () => {
    expect(shouldDivertSignage(CRITICAL_MIN_PCT - 1)).toBe(false)
    expect(shouldDivertSignage(CRITICAL_MIN_PCT)).toBe(true)
  })
})
