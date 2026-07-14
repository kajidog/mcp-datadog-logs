import type { MetricSeries } from '@kajidog/investigation-shared'
import { ChevronDown, LineChart as LineChartIcon } from 'lucide-react'
import { Line, LineChart, XAxis, YAxis } from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

const chartConfig = {
  value: { label: 'value', color: 'var(--status-info)' },
} satisfies ChartConfig

interface MetricsPanelProps {
  metrics: MetricSeries[]
}

/** Small-multiples grid of the metric series fetched alongside the investigation. */
export function MetricsPanel({ metrics }: MetricsPanelProps) {
  if (metrics.length === 0) {
    return null
  }
  return (
    <Card className="shrink-0 py-3">
      <CardContent className="px-3">
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="group flex w-full items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <LineChartIcon className="size-3.5" aria-hidden />
            メトリクス（{metrics.length}系列）
            <ChevronDown className="size-3.5 transition-transform group-data-[state=closed]:-rotate-90" aria-hidden />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {metrics.map((series) => (
                <MetricCard key={`${series.query}:${series.metric}:${series.scope ?? ''}`} series={series} />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}

function MetricCard({ series }: { series: MetricSeries }) {
  const data = series.points.map((p) => ({ time: p.time, value: p.value }))
  const { min, avg, max, last } = series.stats
  const unit = series.unit ? ` ${series.unit}` : ''
  return (
    <div className="rounded-md border p-2">
      <div className="truncate text-xs font-medium" title={series.metric}>
        {series.metric}
      </div>
      {series.scope && (
        <div className="truncate text-[11px] text-muted-foreground" title={series.scope}>
          {series.scope}
        </div>
      )}
      <div className="text-[11px] tabular-nums text-muted-foreground">
        min {formatValue(min)} · avg {formatValue(avg)} · max {formatValue(max)} · last{' '}
        {last === null ? '-' : formatValue(last)}
        {unit}
      </div>
      <ChartContainer config={chartConfig} className="mt-1 h-24 w-full">
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <XAxis dataKey="time" hide />
          <YAxis hide domain={['auto', 'auto']} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(value) => formatTooltipTime(String(value))}
                formatter={(value) => `${formatValue(Number(value))}${unit}`}
              />
            }
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--color-value)"
            strokeWidth={1.5}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
    </div>
  )
}

function formatValue(value: number): string {
  const abs = Math.abs(value)
  if (abs !== 0 && (abs >= 100000 || abs < 0.01)) {
    return value.toExponential(2)
  }
  return String(Math.round(value * 100) / 100)
}

function formatTooltipTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
