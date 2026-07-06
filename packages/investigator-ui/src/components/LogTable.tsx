import type { LogRow } from '@kajidog/investigation-shared'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

const STATUS_BADGE_CLASS: Record<string, string> = {
  error: 'bg-status-error text-white',
  warn: 'bg-status-warn text-black',
  info: 'bg-status-info text-white',
  debug: 'bg-status-debug text-white',
}

interface LogTableProps {
  rows: LogRow[]
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
  fetchDetail: (logId: string) => Promise<unknown | null>
}

export function LogTable({ rows, hasMore, loadingMore, onLoadMore, fetchDetail }: LogTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, unknown>>({})
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const toggle = async (row: LogRow) => {
    if (expandedId === row.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(row.id)
    if (!(row.id in details)) {
      setLoadingId(row.id)
      try {
        const detail = await fetchDetail(row.id)
        setDetails((prev) => ({ ...prev, [row.id]: detail ?? row }))
      } catch {
        setDetails((prev) => ({ ...prev, [row.id]: row }))
      } finally {
        setLoadingId(null)
      }
    }
  }

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No log entries in this range.</p>
  }

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-6" />
            <TableHead className="w-40">Time</TableHead>
            <TableHead className="w-16">Status</TableHead>
            <TableHead className="w-32">Service</TableHead>
            <TableHead>Message</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <Fragment key={row.id}>
              <TableRow className="cursor-pointer" onClick={() => toggle(row)}>
                <TableCell className="py-1.5 text-muted-foreground">
                  {expandedId === row.id ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                </TableCell>
                <TableCell className="whitespace-nowrap py-1.5 text-xs text-muted-foreground" title={row.timestamp}>
                  {formatTimestamp(row.timestamp)}
                </TableCell>
                <TableCell className="py-1.5">
                  <Badge
                    className={cn(
                      'px-1.5 py-0 text-[10px]',
                      STATUS_BADGE_CLASS[row.status] ?? STATUS_BADGE_CLASS.debug
                    )}
                  >
                    {row.status}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-32 truncate py-1.5 text-xs text-muted-foreground" title={row.service}>
                  {row.service ?? '-'}
                </TableCell>
                <TableCell className="max-w-0 truncate py-1.5 text-xs" title={row.message}>
                  {row.message || '(no message)'}
                </TableCell>
              </TableRow>
              {expandedId === row.id && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="bg-muted/40 p-0">
                    {loadingId === row.id ? (
                      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" /> Loading detail…
                      </div>
                    ) : (
                      <pre className="max-h-72 overflow-auto p-3 text-[11px] leading-relaxed">
                        {JSON.stringify(details[row.id] ?? row, null, 2)}
                      </pre>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          ))}
        </TableBody>
      </Table>
      {hasMore && (
        <div className="flex justify-center py-2">
          <Button size="sm" variant="ghost" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore && <Loader2 className="animate-spin" />}
            Load more
          </Button>
        </div>
      )}
    </div>
  )
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  const mo = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${mo}/${dd} ${hh}:${mm}:${ss}`
}
