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
        placeholder="メッセージ内の単語で検索、または左の一覧をクリックして絞り込み"
        title="Datadog のクエリ構文も使えます（例: service:payments status:error）"
        className="min-w-48 flex-1 font-mono text-xs"
        aria-label="ログ検索クエリ"
      />
      <TimeRangePicker from={from} to={to} onChange={onRangeChange} />
      <Button size="sm" onClick={onRun} disabled={running}>
        {running ? <Loader2 className="animate-spin" /> : <Play />}
        検索
      </Button>
      <Button size="sm" variant="outline" onClick={onExport} disabled={exporting}>
        {exporting ? <Loader2 className="animate-spin" /> : <Download />}
        エクスポート
      </Button>
      {canFullscreen && (
        <Button
          size="sm"
          variant="outline"
          onClick={onToggleFullscreen}
          aria-label={fullscreen ? '全画面を終了' : '全画面表示'}
          title={fullscreen ? '全画面を終了' : '全画面表示'}
        >
          {fullscreen ? <Minimize2 /> : <Maximize2 />}
        </Button>
      )}
    </div>
  )
}
