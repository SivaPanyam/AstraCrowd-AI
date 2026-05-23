/**
 * Crowd density thresholds — aligned with backend/app/thresholds.py and DESIGN.md.
 */
export const WARNING_MIN_PCT = 60
export const CRITICAL_MIN_PCT = 85
export const DIVERT_SIGNAGE_MIN_PCT = 85

export type GateStatus = 'safe' | 'warning' | 'critical'

export function classifyStatus(capacity: number): GateStatus {
  if (capacity >= CRITICAL_MIN_PCT) return 'critical'
  if (capacity >= WARNING_MIN_PCT) return 'warning'
  return 'safe'
}

export function shouldDivertSignage(capacity: number): boolean {
  return capacity >= DIVERT_SIGNAGE_MIN_PCT
}

/** Tailwind classes for gate density cards (outdoor high-contrast). */
export function getGateCardColorClass(capacity: number): string {
  const status = classifyStatus(capacity)
  if (status === 'critical') {
    return 'bg-rose-950/80 border-rose-500 shadow-rose-950/20'
  }
  if (status === 'warning') {
    return 'bg-amber-950/60 border-amber-500 shadow-amber-950/10'
  }
  return 'bg-emerald-950/40 border-emerald-500/80 shadow-emerald-950/10'
}

export function getGateBadgeColorClass(capacity: number): string {
  const status = classifyStatus(capacity)
  if (status === 'critical') return 'bg-rose-500 text-white font-bold'
  if (status === 'warning') return 'bg-amber-500 text-slate-950 font-black'
  return 'bg-emerald-500 text-white font-bold'
}
