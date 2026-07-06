import type { App } from '@modelcontextprotocol/ext-apps'
import { useApp } from '@modelcontextprotocol/ext-apps/react'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { CircleAlert, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { createMockApp, MOCK_VIEW_UUID } from '@/hooks/devMockApp'
import { exportReport, fetchLogDetail } from '@/hooks/toolClient'
import { useInvestigation } from '@/hooks/useInvestigation'
import { FacetSidebar } from './FacetSidebar'
import { LogTable } from './LogTable'
import { QueryBar } from './QueryBar'
import { TimelineChart } from './TimelineChart'

const isStandaloneDev = import.meta.env.DEV && window.self === window.top

export function Investigator() {
  const investigation = useInvestigation()
  const { phase, setPhase, result, error, setError, running, loadingMore, appRef, viewUUIDRef, attach, run, loadMore } =
    investigation

  // Draft params edited in the UI; synced from the server result on load.
  const [query, setQuery] = useState('')
  const [from, setFrom] = useState('now-1h')
  const [to, setTo] = useState('now')
  const syncedRef = useRef(false)

  const [exporting, setExporting] = useState(false)
  const [exportPath, setExportPath] = useState<string | null>(null)

  useApp({
    appInfo: { name: 'Datadog Logs Investigator', version: '1.0.0' },
    capabilities: {},
    onAppCreated: (createdApp: App) => {
      if (isStandaloneDev) {
        return
      }
      appRef.current = createdApp
      createdApp.ontoolinput = async () => {
        setPhase('waiting')
      }
      createdApp.ontoolresult = async (toolResult: CallToolResult) => {
        await attach(createdApp, toolResult)
      }
      createdApp.ontoolcancelled = () => {
        setPhase('error')
        setError('Tool call was cancelled. Ask the assistant to run the investigation again.')
      }
      createdApp.onteardown = async () => ({})
      createdApp.onerror = (err: unknown) => {
        setPhase('error')
        setError(String(err))
      }
    },
  })

  // DEV standalone mode: render with a mock bridge + fixture data.
  useEffect(() => {
    if (!isStandaloneDev) {
      return
    }
    const mock = createMockApp()
    void attach(mock, { content: [{ type: 'text', text: `mock. viewUUID: ${MOCK_VIEW_UUID}` }] })
  }, [attach])

  // Sync draft inputs from the first loaded result.
  useEffect(() => {
    if (result && !syncedRef.current) {
      syncedRef.current = true
      setQuery(result.params.query)
      setFrom(result.params.from)
      setTo(result.params.to)
    }
  }, [result])

  const handleRun = (nextQuery = query) => {
    setExportPath(null)
    void run({ query: nextQuery, from, to, groupBy: result?.params.groupBy })
  }

  const handleFacetSelect = (facet: string, value: string) => {
    const token = `${facet}:${quoteValue(value)}`
    const nextQuery = query.includes(token) ? query : `${query.trim()} ${token}`.trim()
    setQuery(nextQuery)
    handleRun(nextQuery)
  }

  const handleExport = async () => {
    const app = appRef.current
    const viewUUID = viewUUIDRef.current
    if (!app || !viewUUID) {
      return
    }
    setExporting(true)
    setExportPath(null)
    try {
      const exported = await exportReport(app, viewUUID, result?.params.title)
      if (exported.ok && exported.path) {
        setExportPath(exported.path)
      } else {
        setError(exported.error ?? 'Export failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
    }
  }

  if (phase === 'connecting' || phase === 'waiting' || phase === 'loading') {
    return (
      <CenteredNotice>
        <Loader2 className="size-4 animate-spin" />
        {phase === 'loading' ? 'Loading investigation…' : 'Waiting for investigation data…'}
      </CenteredNotice>
    )
  }

  if (phase === 'expired') {
    return (
      <CenteredNotice>
        <CircleAlert className="size-4 text-status-warn" />
        This investigation session has expired. Ask the assistant to run datadog_investigate_logs again.
      </CenteredNotice>
    )
  }

  if (phase === 'error' || !result) {
    return (
      <CenteredNotice>
        <CircleAlert className="size-4 text-status-error" />
        <span className="whitespace-pre-wrap">{error ?? 'Something went wrong.'}</span>
      </CenteredNotice>
    )
  }

  return (
    <div className="flex min-h-svh flex-col gap-3 p-3">
      <QueryBar
        query={query}
        from={from}
        to={to}
        running={running}
        exporting={exporting}
        onQueryChange={setQuery}
        onRangeChange={(f, t) => {
          setFrom(f)
          setTo(t)
        }}
        onRun={() => handleRun()}
        onExport={handleExport}
      />

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-status-error/40 bg-status-error/10 px-3 py-2 text-xs">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-status-error" />
          <span className="whitespace-pre-wrap">{error}</span>
        </div>
      )}

      {exportPath && (
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
          Report exported: <code className="font-mono">{exportPath}</code>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        ~{result.totalCount.toLocaleString('en-US')} logs matched · showing {result.rows.length}
        {result.params.title ? ` · ${result.params.title}` : ''}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[13rem_1fr]">
        <FacetSidebar facets={result.facets} onSelect={handleFacetSelect} />
        <div className="flex min-w-0 flex-col gap-3">
          <Card className="py-3">
            <CardContent className="px-3">
              <TimelineChart
                timeline={result.timeline}
                interval={result.interval}
                rangeMs={result.resolvedRange.toMs - result.resolvedRange.fromMs}
              />
            </CardContent>
          </Card>
          <Card className="py-1">
            <CardContent className="px-1">
              <LogTable
                rows={result.rows}
                hasMore={Boolean(result.nextCursor)}
                loadingMore={loadingMore}
                onLoadMore={() => void loadMore()}
                fetchDetail={async (logId) => {
                  const app = appRef.current
                  const viewUUID = viewUUIDRef.current
                  if (!app || !viewUUID) {
                    return null
                  }
                  return fetchLogDetail(app, viewUUID, logId)
                }}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function CenteredNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">{children}</div>
    </div>
  )
}

function quoteValue(value: string): string {
  if (/^[\w.\-/:]+$/.test(value)) {
    return value
  }
  return `"${value.replace(/"/g, '\\"')}"`
}
