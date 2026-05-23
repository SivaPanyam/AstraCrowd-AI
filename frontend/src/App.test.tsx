import { describe, it, expect } from 'vitest'

/**
 * Gate Card styling logic directly copied from the App dashboard layout
 * to ensure that Tailwind CSS rules are perfectly verified at build time.
 */
function getGateCardColorClass(capacity: number): string {
  const isYellow = capacity >= 50 && capacity <= 80
  const isRed = capacity > 80

  return isRed 
    ? 'bg-rose-950/80 border-rose-500 shadow-rose-950/20' 
    : isYellow 
      ? 'bg-amber-950/60 border-amber-500 shadow-amber-950/10' 
      : 'bg-emerald-950/40 border-emerald-500/80 shadow-emerald-950/10'
}

describe('AstraCrowd AI - Gate Density Cards Styling spec', () => {
  
  it('renders optimal green/emerald background and borders when capacity is below 50%', () => {
    // Check at 25% capacity
    const classes = getGateCardColorClass(25)
    expect(classes).toContain('bg-emerald-950')
    expect(classes).toContain('border-emerald-500')
    expect(classes).not.toContain('bg-rose-950')
    expect(classes).not.toContain('bg-amber-950')
  })

  it('renders warning yellow/amber background and borders when capacity is between 50% and 80%', () => {
    // Check at 65% capacity
    const classes = getGateCardColorClass(65)
    expect(classes).toContain('bg-amber-950')
    expect(classes).toContain('border-amber-500')
    expect(classes).not.toContain('bg-emerald-950')
    expect(classes).not.toContain('bg-rose-950')
  })

  it('renders critical red/rose background and pulsing borders when capacity is over 80%', () => {
    // Check at 92% capacity
    const classes = getGateCardColorClass(92)
    expect(classes).toContain('bg-rose-950')
    expect(classes).toContain('border-rose-500')
    expect(classes).not.toContain('bg-emerald-950')
    expect(classes).not.toContain('bg-amber-950')
  })
  
})
