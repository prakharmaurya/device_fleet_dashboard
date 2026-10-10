import { useEffect, useRef, useState, useCallback } from 'react'
import * as echarts from 'echarts'
import { ZoomIn, ZoomOut, RotateCcw, Link2, Unlink, Info } from 'lucide-react'

export interface ChartEventMarker {
  time: number
  type: 'pump_start' | 'pump_stop' | 'fault' | 'info'
  label: string
  description?: string
  trigger?: string
  runtime?: number
  reason?: string
}

export interface TimeSeriesChartProps {
  title: string
  data: [number, number | null][]
  dataKey?: string
  color: string
  stepLine?: boolean
  yAxisType?: 'pump_state' | 'percent' | 'linear' | 'binary'
  yDomain?: [number, number]
  unit?: string
  minTimeMs?: number
  maxTimeMs?: number
  height?: number
  markEvents?: ChartEventMarker[]
  syncGroup?: string
  isSynced?: boolean
  onToggleSync?: () => void
  showSlider?: boolean
  description?: string
}

export default function TimeSeriesChart({
  title,
  data,
  color,
  stepLine = false,
  yAxisType = 'linear',
  yDomain,
  unit = '',
  minTimeMs,
  maxTimeMs,
  height = 230,
  markEvents = [],
  syncGroup,
  isSynced = true,
  onToggleSync,
  showSlider = true,
  description,
}: TimeSeriesChartProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstance = useRef<echarts.ECharts | null>(null)
  const prevRangeRef = useRef<{ min?: number; max?: number }>({})
  const [zoomRangeText, setZoomRangeText] = useState<string>('')
  const [isZoomed, setIsZoomed] = useState<boolean>(false)

  // Format timestamp helper
  const formatTime = useCallback((ts: number) => {
    const d = new Date(ts)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }, [])

  // Initialize or reconfigure chart
  useEffect(() => {
    if (!chartRef.current) return

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, undefined, {
        renderer: 'canvas',
      })
    }

    const chart = chartInstance.current

    if (syncGroup && isSynced) {
      chart.group = syncGroup
      echarts.connect(syncGroup)
    } else {
      chart.group = ''
    }

    // Determine min and max time bounds
    const now = Date.now()
    const computedMin = minTimeMs ?? (data.length > 0 ? data[0][0] : now - 24 * 3600 * 1000)
    const computedMax = maxTimeMs ?? now

    // Check if the time range changed (e.g. user selected 6h vs 7d)
    const isNewTimeWindow =
      prevRangeRef.current.min !== computedMin || prevRangeRef.current.max !== computedMax
    prevRangeRef.current = { min: computedMin, max: computedMax }

    // Check if user currently has an active zoom that should be preserved during data refresh
    const prevOption = chart.getOption() as any
    const prevZoom = prevOption?.dataZoom?.[0]
    const shouldPreserveZoom =
      !isNewTimeWindow && prevZoom && (prevZoom.start > 0.5 || prevZoom.end < 99.5)

    if (isNewTimeWindow) {
      setIsZoomed(false)
      setZoomRangeText('')
    }

    // Prepare series data with step line preservation
    // For pump_state and binary, ensure the state line extends to current time if recent
    const processedData = [...data]
    if (processedData.length > 0 && (yAxisType === 'pump_state' || yAxisType === 'binary' || stepLine)) {
      const lastPoint = processedData[processedData.length - 1]
      if (lastPoint[1] !== null && computedMax - lastPoint[0] > 10_000) {
        processedData.push([computedMax, lastPoint[1]])
      }
    }

    // Build event markers
    const markPointData: any[] = []
    if (markEvents && markEvents.length > 0) {
      for (const ev of markEvents) {
        if (ev.time >= computedMin - 3600000 && ev.time <= computedMax + 3600000) {
          const isStart = ev.type === 'pump_start'
          const isStop = ev.type === 'pump_stop'
          const isFault = ev.type === 'fault'
          const symColor = isStart ? '#10b981' : isFault ? '#ef4444' : isStop ? '#64748b' : '#3b82f6'

          markPointData.push({
            name: ev.label,
            coord: [
              ev.time,
              yAxisType === 'pump_state'
                ? isStart
                  ? 2
                  : 0
                : yAxisType === 'binary'
                ? isStart
                  ? 1
                  : 0
                : 0,
            ],
            value: ev.label,
            symbol: 'pin',
            symbolSize: 28,
            symbolOffset: [0, -10],
            itemStyle: {
              color: symColor,
              borderColor: '#ffffff',
              borderWidth: 1.5,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
              shadowBlur: 4,
            },
            label: {
              show: false,
            },
            eventMeta: ev,
          })
        }
      }
    }

    // Configure Y-Axis based on chart type
    let yAxisConfig: echarts.YAXisComponentOption = {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: '#94a3b8',
        fontSize: 10,
        formatter: (v: number) => {
          const formatted = Number.isInteger(v) ? v : Number(v.toFixed(2))
          return `${formatted}${unit ? ' ' + unit : ''}`
        },
      },
      splitLine: {
        lineStyle: {
          color: '#334155',
          type: 'dashed',
          opacity: 0.6,
        },
      },
    }

    if (yAxisType === 'pump_state') {
      yAxisConfig = {
        type: 'value',
        min: 0,
        max: 3.2,
        interval: 1,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#cbd5e1',
          fontSize: 10,
          fontWeight: 'bold',
          formatter: (v: number) => {
            switch (v) {
              case 0:
                return 'OFF'
              case 1:
                return 'TRANS'
              case 2:
                return 'ON'
              case 3:
                return 'FORCE'
              default:
                return ''
            }
          },
        },
        splitLine: {
          lineStyle: {
            color: '#334155',
            type: 'dashed',
            opacity: 0.7,
          },
        },
      }
    } else if (yAxisType === 'binary') {
      yAxisConfig = {
        type: 'value',
        min: 0,
        max: 1.2,
        interval: 1,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#cbd5e1',
          fontSize: 10,
          fontWeight: 'bold',
          formatter: (v: number) => (v === 1 ? 'ON' : v === 0 ? 'OFF' : ''),
        },
        splitLine: {
          lineStyle: {
            color: '#334155',
            type: 'dashed',
            opacity: 0.7,
          },
        },
      }
    } else if (yAxisType === 'percent') {
      yAxisConfig = {
        type: 'value',
        min: 0,
        max: 100,
        interval: 25,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#94a3b8',
          fontSize: 10,
          formatter: '{value}%',
        },
        splitLine: {
          lineStyle: {
            color: '#334155',
            type: 'dashed',
            opacity: 0.6,
          },
        },
      }
    } else if (yDomain) {
      yAxisConfig.min = yDomain[0]
      yAxisConfig.max = yDomain[1]
    }

    // Grid spacing
    const gridBottom = showSlider ? 36 : 24

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      animation: false,
      grid: {
        left: yAxisType === 'pump_state' ? 52 : 46,
        right: 18,
        top: 24,
        bottom: gridBottom,
        containLabel: false,
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          lineStyle: {
            color: '#64748b',
            type: 'dashed',
          },
          crossStyle: {
            color: '#64748b',
          },
        },
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: '#334155',
        borderWidth: 1,
        padding: [10, 14],
        textStyle: {
          color: '#f8fafc',
          fontSize: 12,
        },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return ''
          const item = params[0]
          const [t, val] = item.value as [number, number | null]
          const formattedDate = formatTime(t)

          // Check if there is an event marker near this timestamp (within 2 minutes)
          const nearEvent = markEvents.find((e) => Math.abs(e.time - t) <= 120_000)

          const displayNum =
            typeof val === 'number'
              ? Number.isInteger(val)
                ? val
                : Number(val.toFixed(2))
              : (val ?? '—')
          let valueDisplay = `${displayNum}${unit ? ' ' + unit : ''}`
          let statusBadge = ''

          if (yAxisType === 'pump_state') {
            if (val === 2) {
              valueDisplay = 'PUMP RUNNING (ON)'
              statusBadge =
                '<span style="display:inline-block;padding:2px 6px;border-radius:4px;background:#065f46;color:#34d399;font-weight:bold;font-size:11px;">RUNNING</span>'
            } else if (val === 3) {
              valueDisplay = 'FORCE ON (MANUAL OVERRIDE)'
              statusBadge =
                '<span style="display:inline-block;padding:2px 6px;border-radius:4px;background:#78350f;color:#fbbf24;font-weight:bold;font-size:11px;">FORCE ON</span>'
            } else if (val === 1) {
              valueDisplay = 'STARTING (TRANSITION)'
              statusBadge =
                '<span style="display:inline-block;padding:2px 6px;border-radius:4px;background:#1e3a8a;color:#60a5fa;font-weight:bold;font-size:11px;">TRANSITION</span>'
            } else {
              valueDisplay = 'PUMP OFF (IDLE)'
              statusBadge =
                '<span style="display:inline-block;padding:2px 6px;border-radius:4px;background:#334155;color:#94a3b8;font-weight:bold;font-size:11px;">IDLE</span>'
            }
          } else if (yAxisType === 'binary') {
            valueDisplay = val === 1 ? 'ONLINE' : 'OFFLINE'
          }

          let html = `
            <div style="font-family:ui-monospace,monospace;font-size:11px;color:#94a3b8;margin-bottom:4px;">
              ${formattedDate}
            </div>
            <div style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;color:#ffffff;">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};"></span>
              <span>${title}:</span>
              <span style="color:${color};font-family:ui-monospace,monospace;">${valueDisplay}</span>
              ${statusBadge}
            </div>
          `

          if (nearEvent) {
            html += `
              <div style="margin-top:8px;padding-top:6px;border-top:1px solid #334155;font-size:11px;">
                <div style="color:#f59e0b;font-weight:600;">⚡ Event: ${nearEvent.label}</div>
                ${nearEvent.trigger ? `<div style="color:#cbd5e1;">Trigger: <span style="color:#ffffff;">${nearEvent.trigger}</span></div>` : ''}
                ${nearEvent.runtime ? `<div style="color:#cbd5e1;">Runtime: <span style="color:#38bdf8;">${Math.floor(nearEvent.runtime / 60)}m ${nearEvent.runtime % 60}s</span></div>` : ''}
                ${nearEvent.reason ? `<div style="color:#cbd5e1;">Reason: <span style="color:#f87171;">${nearEvent.reason}</span></div>` : ''}
                ${nearEvent.description ? `<div style="color:#94a3b8;font-size:10px;margin-top:2px;">${nearEvent.description}</div>` : ''}
              </div>
            `
          }

          return html
        },
      },
      xAxis: {
        type: 'time',
        min: computedMin,
        max: computedMax,
        axisLine: {
          lineStyle: { color: '#475569' },
        },
        axisTick: {
          lineStyle: { color: '#475569' },
        },
        axisLabel: {
          color: '#94a3b8',
          fontSize: 10,
          hideOverlap: true,
        },
        splitLine: {
          show: true,
          lineStyle: {
            color: '#334155',
            type: 'dashed',
            opacity: 0.5,
          },
        },
      },
      yAxis: yAxisConfig,
      dataZoom: [
        // Inside mousewheel / pinch / drag zoom
        {
          type: 'inside',
          xAxisIndex: 0,
          filterMode: 'none',
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          moveOnMouseWheel: false,
          ...(shouldPreserveZoom && prevZoom ? { start: prevZoom.start, end: prevZoom.end } : {}),
        },
        // Slider at bottom
        ...(showSlider
          ? [
              {
                type: 'slider' as const,
                xAxisIndex: 0,
                filterMode: 'none' as const,
                height: 18,
                bottom: 6,
                borderColor: '#334155',
                backgroundColor: '#090d16',
                fillerColor: 'rgba(59, 130, 246, 0.22)',
                handleStyle: {
                  color: '#3b82f6',
                  borderColor: '#60a5fa',
                  borderWidth: 1,
                  shadowColor: 'rgba(0, 0, 0, 0.4)',
                  shadowBlur: 2,
                },
                moveHandleStyle: {
                  color: '#475569',
                },
                dataBackground: {
                  lineStyle: { color: color, width: 1, opacity: 0.4 },
                  areaStyle: { color: color, opacity: 0.1 },
                },
                selectedDataBackground: {
                  lineStyle: { color: color, width: 1.5 },
                  areaStyle: { color: color, opacity: 0.25 },
                },
                textStyle: {
                  color: '#94a3b8',
                  fontSize: 9,
                },
                brushSelect: false,
                ...(shouldPreserveZoom && prevZoom ? { start: prevZoom.start, end: prevZoom.end } : {}),
              },
            ]
          : []),
      ],
      series: [
        {
          name: title,
          type: 'line',
          step: stepLine ? 'end' : false,
          smooth: !stepLine && yAxisType !== 'binary',
          showSymbol: false,
          sampling: 'lttb',
          data: processedData,
          lineStyle: {
            color: color,
            width: stepLine ? 2.5 : 2,
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              {
                offset: 0,
                color:
                  yAxisType === 'pump_state'
                    ? 'rgba(167, 139, 250, 0.35)'
                    : `${color}40`,
              },
              {
                offset: 1,
                color:
                  yAxisType === 'pump_state'
                    ? 'rgba(167, 139, 250, 0.02)'
                    : `${color}05`,
              },
            ]),
          },
          markPoint:
            markPointData.length > 0
              ? {
                  data: markPointData,
                  silent: false,
                }
              : undefined,
        },
      ],
    }

    chart.setOption(option, true)

    // Handle dataZoom events to update visual range text
    const handleDataZoom = () => {
      const opt = chart.getOption() as any
      if (opt && opt.dataZoom && opt.dataZoom[0]) {
        // Compute start/end time
        const startPercent = opt.dataZoom[0].start ?? 0
        const endPercent = opt.dataZoom[0].end ?? 100
        const totalDuration = computedMax - computedMin
        const curStart = computedMin + (totalDuration * startPercent) / 100
        const curEnd = computedMin + (totalDuration * endPercent) / 100

        const isActivelyZoomed = startPercent > 0.5 || endPercent < 99.5
        setIsZoomed(isActivelyZoomed)

        if (isActivelyZoomed) {
          const hoursSpan = (curEnd - curStart) / 3600000
          const spanStr =
            hoursSpan < 1
              ? `${Math.round(hoursSpan * 60)}m span`
              : hoursSpan < 24
              ? `${hoursSpan.toFixed(1)}h span`
              : `${(hoursSpan / 24).toFixed(1)}d span`

          const startStr = new Date(curStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          const endStr = new Date(curEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          setZoomRangeText(`${startStr} - ${endStr} (${spanStr})`)
        } else {
          setZoomRangeText('')
        }
      }
    }

    chart.on('datazoom', handleDataZoom)

    // Resize observer
    const ro = new ResizeObserver(() => {
      chart.resize()
    })
    ro.observe(chartRef.current)

    return () => {
      chart.off('datazoom', handleDataZoom)
      ro.disconnect()
    }
  }, [
    data,
    color,
    stepLine,
    yAxisType,
    yDomain,
    unit,
    minTimeMs,
    maxTimeMs,
    markEvents,
    syncGroup,
    isSynced,
    showSlider,
    title,
    formatTime,
  ])

  // Cleanup chart on unmount
  useEffect(() => {
    return () => {
      if (chartInstance.current) {
        chartInstance.current.dispose()
        chartInstance.current = null
      }
    }
  }, [])

  // Zoom In / Out / Reset Handlers (progressive incremental zooming)
  const handleZoomIn = useCallback(() => {
    if (!chartInstance.current) return
    const opt = chartInstance.current.getOption() as any
    const dz = opt?.dataZoom?.[0]
    const curStart = dz?.start ?? 0
    const curEnd = dz?.end ?? 100
    const span = curEnd - curStart
    if (span <= 5) return // max zoom level
    const delta = span * 0.2
    const newStart = Math.min(curStart + delta, 95)
    const newEnd = Math.max(curEnd - delta, 5)
    chartInstance.current.dispatchAction({
      type: 'dataZoom',
      dataZoomIndex: 0,
      start: newStart,
      end: newEnd,
    })
  }, [])

  const handleZoomOut = useCallback(() => {
    if (!chartInstance.current) return
    const opt = chartInstance.current.getOption() as any
    const dz = opt?.dataZoom?.[0]
    const curStart = dz?.start ?? 0
    const curEnd = dz?.end ?? 100
    const span = curEnd - curStart
    const delta = Math.max(span * 0.25, 5)
    const newStart = Math.max(0, curStart - delta)
    const newEnd = Math.min(100, curEnd + delta)
    chartInstance.current.dispatchAction({
      type: 'dataZoom',
      dataZoomIndex: 0,
      start: newStart,
      end: newEnd,
    })
  }, [])

  const handleResetZoom = useCallback(() => {
    if (!chartInstance.current) return
    chartInstance.current.dispatchAction({
      type: 'dataZoom',
      dataZoomIndex: 0,
      start: 0,
      end: 100,
    })
    setIsZoomed(false)
    setZoomRangeText('')
  }, [])

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 min-w-0 transition-all shadow-sm">
      {/* Chart Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-700/60">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: color }}
          />
          <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wide">
            {title}
          </h4>
          {stepLine && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
              Step-Line (True Time Scale)
            </span>
          )}
          {description && (
            <span className="text-[11px] text-slate-400 hidden md:inline">
              {description}
            </span>
          )}
        </div>

        {/* Toolbar & Status */}
        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
          {zoomRangeText && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-900/60 text-blue-300 border border-blue-700/60 mr-1 animate-pulse">
              🔍 {zoomRangeText}
            </span>
          )}

          {onToggleSync && (
            <button
              onClick={onToggleSync}
              title={
                isSynced
                  ? 'Synced Zoom (Panning/zooming affects all charts)'
                  : 'Individual Zoom (Only affects this chart)'
              }
              className={`p-1 rounded text-xs transition-colors flex items-center gap-1 ${
                isSynced
                  ? 'bg-blue-950/80 text-blue-300 border border-blue-700/60 hover:bg-blue-900'
                  : 'bg-slate-700/80 text-slate-400 border border-slate-600/60 hover:text-white'
              }`}
            >
              {isSynced ? <Link2 size={12} /> : <Unlink size={12} />}
              <span className="text-[10px] font-mono pr-0.5">
                {isSynced ? 'Synced' : 'Free'}
              </span>
            </button>
          )}

          <div className="flex items-center bg-slate-900/80 rounded-md border border-slate-700/70 p-0.5 gap-0.5">
            <button
              onClick={handleZoomIn}
              title="Zoom In (or use mouse wheel)"
              className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition-colors"
            >
              <ZoomIn size={12} />
            </button>
            <button
              onClick={handleZoomOut}
              title="Zoom Out"
              className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition-colors"
            >
              <ZoomOut size={12} />
            </button>
            <button
              onClick={handleResetZoom}
              title="Reset Zoom to Full Period"
              disabled={!isZoomed}
              className={`p-1 rounded transition-colors flex items-center gap-1 ${
                isZoomed
                  ? 'bg-blue-600 hover:bg-blue-500 text-white font-medium'
                  : 'text-slate-500 opacity-60 cursor-not-allowed'
              }`}
            >
              <RotateCcw size={12} />
              <span className="text-[10px] pr-0.5">Reset</span>
            </button>
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      {data.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-slate-500 text-xs bg-slate-900/40 rounded-lg border border-slate-800">
          No telemetry points recorded for this time period.
        </div>
      ) : (
        <div
          ref={chartRef}
          style={{ height: `${height}px`, width: '100%' }}
          className="w-full cursor-grab active:cursor-grabbing"
          title="Mouse wheel to zoom, click and drag to pan across time"
        />
      )}

      {/* Hint Footer */}
      <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1 pt-1 border-t border-slate-800/80">
        <span className="flex items-center gap-1">
          <Info size={10} className="text-slate-400" />
          <span>Continuous linear time scale: gaps accurately represent real elapsed time.</span>
        </span>
        <span className="font-mono text-slate-400">
          Scroll: Zoom • Drag: Pan
        </span>
      </div>
    </div>
  )
}
