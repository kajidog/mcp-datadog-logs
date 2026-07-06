import { Download, Loader2, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TimeRangePicker } from './TimeRangePicker'

interface QueryBarProps {
  query: string
  from: string
  to: string
  running: boolean
  exporting: boolean
  onQueryChange: (query: string) => void
  onRangeChange: (from: string, to: string) => void
  onRun: () => void
  onExport: () => void
}

export function QueryBar({
  query,
  from,
  to,
  running,
  exporting,
  onQueryChange,
  onRangeChange,
  onRun,
  onExport,
}: QueryBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onRun()
          }
        }}
        placeholder="Search logs, e.g. service:payments status:error"
        className="min-w-48 flex-1 font-mono text-xs"
        aria-label="Log search query"
      />
      <TimeRangePicker from={from} to={to} onChange={onRangeChange} />
      <Button size="sm" onClick={onRun} disabled={running}>
        {running ? <Loader2 className="animate-spin" /> : <Play />}
        Run
      </Button>
      <Button size="sm" variant="outline" onClick={onExport} disabled={exporting}>
        {exporting ? <Loader2 className="animate-spin" /> : <Download />}
        Export
      </Button>
    </div>
  )
}
