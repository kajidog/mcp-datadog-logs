import type { EventMarker, EventMarkerKind, TimelineBucket } from '@kajidog/investigation-shared'
import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from 'recharts'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

/** Bottom-to-top stack order; statuses outside this set fold into "other". */
const STACK_ORDER = ['debug', 'info', 'warn', 'error'] as const

const chartConfig = {
  debug: { label: 'debug', color: 'var(--status-debug)' },
  info: { label: 'info', color: 'var(--status-info)' },
  warn: { label: 'warn', color: 'var(--status-warn)' },
  error: { label: 'error', color: 'var(--status-error)' },
  other: { label: 'other', color: 'var(--status-other)' },
} satisfies ChartConfig

const EVENT_COLOR: Record<EventMarkerKind, string> = {
  deploy: 'var(--event-deploy)',
  alert: 'var(--event-alert)',
  other: 'var(--event-other)',
}

const EVENT_KIND_LABEL: Record<EventMarkerKind, string> = {
  deploy: 'デプロイ',
  alert: 'アラート',
  other: 'イベント',
}

interface TimelineChartProps {
  timeline: TimelineBucket[]
  interval: string
  rangeMs: number
  /** Bucket time (ISO) currently selected as a table filter, if any */
  selectedBucket: string | null
  onBucketSelect: (time: string | null) => void
  /** Events overlaid as vertical reference lines (snapped to the nearest bucket) */
  events?: EventMarker[]
}

export function TimelineChart({
  timeline,
  interval,
  rangeMs,
  selectedBucket,
  onBucketSelect,
  events,
}: TimelineChartProps) {
  const { data, keys } = useMemo(() => {
    const present = new Set<string>()
    const rows = timeline.map((bucket) => {
      const row: Record<string, number | string> = { time: bucket.time }
      for (const [status, count] of Object.entries(bucket.counts)) {
        const key = (STACK_ORDER as readonly string[]).includes(status) ? status : 'other'
        row[key] = ((row[key] as number) ?? 0) + count
        if (count > 0) {
          present.add(key)
        }
      }
      return row
    })
    const ordered = [...STACK_ORDER.filter((s) => present.has(s)), ...(present.has('other') ? ['other'] : [])]
    return { data: rows, keys: ordered }
  }, [timeline])

  // The XAxis is categorical, so ReferenceLine x must be an exact bucket time:
  // each event snaps to its nearest bucket (positions are bucket ±interval).
  const eventLines = useMemo(() => {
    const list = events ?? []
    const buckets = timeline.map((b) => ({ time: b.time, ms: Date.parse(b.time) })).filter((b) => !Number.isNaN(b.ms))
    if (list.length === 0 || buckets.length === 0) {
      return []
    }
    const intervalMs = buckets.length > 1 ? buckets[1].ms - buckets[0].ms : 5 * 60_000
    const firstMs = buckets[0].ms
    const lastMs = buckets[buckets.length - 1].ms + intervalMs
    const lines: Array<{ key: string; x: string; kind: EventMarkerKind }> = []
    for (const event of list) {
      const eventMs = Date.parse(event.time)
      if (Number.isNaN(eventMs) || eventMs < firstMs || eventMs > lastMs) {
        continue
      }
      let nearest = buckets[0]
      for (const bucket of buckets) {
        if (Math.abs(bucket.ms - eventMs) < Math.abs(nearest.ms - eventMs)) {
          nearest = bucket
        }
      }
      lines.push({ key: event.id || `${event.time}:${event.kind}`, x: nearest.time, kind: event.kind })
    }
    return lines
  }, [events, timeline])
  const eventKinds = useMemo(() => [...new Set(eventLines.map((line) => line.kind))], [eventLines])

  const withDate = rangeMs > 86_400_000

  if (timeline.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        この範囲にログはありません
      </div>
    )
  }

  return (
    <div>
      <ChartContainer config={chartConfig} className="h-40 w-full [&_.recharts-bar-rectangle]:cursor-pointer">
        <BarChart
          data={data}
          margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
          onClick={(state) => {
            const label = state?.activeLabel
            if (typeof label === 'string') {
              onBucketSelect(label === selectedBucket ? null : label)
            }
          }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="time"
            tickLine={false}
            axisLine={false}
            minTickGap={40}
            tickFormatter={(value: string) => formatTick(value, withDate)}
            fontSize={11}
          />
          <YAxis tickLine={false} axisLine={false} width={40} fontSize={11} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => formatTick(String(value), true)} />} />
          {eventLines.map((line) => (
            <ReferenceLine
              key={line.key}
              x={line.x}
              stroke={EVENT_COLOR[line.kind]}
              strokeDasharray="3 3"
              strokeOpacity={0.8}
              strokeWidth={1.5}
            />
          ))}
          {keys.map((key, i) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="status"
              fill={`var(--color-${key})`}
              radius={i === keys.length - 1 ? [2, 2, 0, 0] : 0}
            >
              {data.map((row) => (
                <Cell key={String(row.time)} fillOpacity={selectedBucket && row.time !== selectedBucket ? 0.3 : 1} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ChartContainer>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {[...keys].reverse().map((key) => (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: `var(--status-${key})` }} />
            {key}
          </span>
        ))}
        {eventKinds.map((kind) => (
          <span key={kind} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-0.5" style={{ background: EVENT_COLOR[kind] }} />
            {EVENT_KIND_LABEL[kind]}
          </span>
        ))}
        <span className="text-[11px]">バーをクリックするとその時間帯だけ表に表示</span>
        <span className="ml-auto">{interval} ごと</span>
      </div>
    </div>
  )
}

function formatTick(iso: string, withDate: boolean): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  if (withDate) {
    return `${date.getMonth() + 1}/${date.getDate()} ${hh}:${mm}`
  }
  return `${hh}:${mm}`
}
