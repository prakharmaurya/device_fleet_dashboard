import { hwStatusHasFault, type HwStatus } from '../api/types'

// Compact health indicator for the fleet table: green dot = all components
// ok, red dot = at least one fault/degraded, grey = no telemetry yet.
export default function HwHealthDot({ hwStatus }: { hwStatus: HwStatus | null | undefined }) {
  if (!hwStatus) {
    return <span className="inline-block w-2 h-2 rounded-full bg-slate-600" title="No telemetry yet" />
  }
  const faulty = hwStatusHasFault(hwStatus)
  const title = faulty
    ? Object.entries(hwStatus)
        .filter(([, v]) => v !== 'ok')
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')
    : 'All hardware ok'
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${faulty ? 'bg-red-400' : 'bg-green-400'}`}
      title={title}
    />
  )
}
