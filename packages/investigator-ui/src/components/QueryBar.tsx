import { Download, Loader2, Maximize2, Minimize2, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TimeRangePicker } from './TimeRangePicker'

interface QueryBarProps {
  query: string
  from: string
  to: string
  running: boolean
  exporting: boolean
  fullscreen: boolean
  canFullscreen: boolean
  onQueryChange: (query: string) => void
  onRangeChange: (from: string, to: string) => void
  onRun: () => void
  onExport: () => void
  onToggleFullscreen: () => void
}

export function QueryBar({
  query,
  from,
  to,
  running,
  exporting,
  fullscreen,
  canFullscreen,
  onQueryChange,
  onRangeChange,
  onRun,
  onExport,
  onToggleFullscreen,
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
        placeholder="Type words to search log messages, or click a value in the left panel to filter"
        title="Datadog query syntax also works, e.g. service:payments status:error"
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
      {canFullscreen && (
        <Button
          size="sm"
          variant="outline"
          onClick={onToggleFullscreen}
          aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {fullscreen ? <Minimize2 /> : <Maximize2 />}
        </Button>
      )}
    </div>
  )
}
