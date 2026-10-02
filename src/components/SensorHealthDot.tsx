import { type SensorTelemetry, sensorTelemetryHasFault, sensorTelemetryHasWarning } from '../api/types'

// Compact health indicator for the fleet table representing the Tank-Top sensor
export default function SensorHealthDot({ sensorTelemetry }: { sensorTelemetry: SensorTelemetry | null | undefined }) {
  if (!sensorTelemetry) {
    return <span className="inline-block w-2 h-2 rounded-full bg-slate-600" title="No sensor telemetry yet" />
  }

  if (!sensorTelemetry.online) {
    return <span className="inline-block w-2 h-2 rounded-full bg-slate-500" title="Sensor offline" />
  }

  const faulty = sensorTelemetryHasFault(sensorTelemetry)
  const warning = sensorTelemetryHasWarning(sensorTelemetry)

  let color = 'bg-emerald-400'
  let title = `Sensor OK (${sensorTelemetry.magnet_status}) • Loss: ${sensorTelemetry.packet_loss_rate_pct.toFixed(1)}% • RF: ${sensorTelemetry.rf_signal_pct}%`

  if (faulty) {
    color = 'bg-rose-500 animate-pulse'
    title = `SENSOR FAULT: ${sensorTelemetry.sensor_fault ? 'AS5600 Fail' : ''} Magnet ${sensorTelemetry.magnet_status}${!sensorTelemetry.calibrated ? ' (Uncalibrated)' : ''}`
  } else if (warning) {
    color = 'bg-amber-400'
    title = `WARNING: Magnet ${sensorTelemetry.magnet_status}${sensorTelemetry.magnet_degraded ? ' (Degraded)' : ''} • Drop Rate: ${sensorTelemetry.packet_loss_rate_pct.toFixed(1)}%`
  }

  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${color}`}
      title={title}
    />
  )
}
