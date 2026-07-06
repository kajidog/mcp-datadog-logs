import type { TimelineBucket } from '@kajidog/investigation-shared'
import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
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

interface TimelineChartProps {
  timeline: TimelineBucket[]
  interval: string
  rangeMs: number
}

export function TimelineChart({ timeline, interval, rangeMs }: TimelineChartProps) {
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

  const withDate = rangeMs > 86_400_000

  if (timeline.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No logs in this range</div>
    )
  }

  return (
    <div>
      <ChartContainer config={chartConfig} className="h-40 w-full">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
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
          {keys.map((key, i) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="status"
              fill={`var(--color-${key})`}
              radius={i === keys.length - 1 ? [2, 2, 0, 0] : 0}
            />
          ))}
        </BarChart>
      </ChartContainer>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {[...keys].reverse().map((key) => (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: `var(--status-${key})` }} />
            {key}
          </span>
        ))}
        <span className="ml-auto">per {interval}</span>
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
