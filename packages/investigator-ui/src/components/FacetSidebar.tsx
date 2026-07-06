import type { FacetBreakdown } from '@kajidog/investigation-shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface FacetSidebarProps {
  facets: FacetBreakdown[]
  onSelect: (facet: string, value: string) => void
  className?: string
}

export function FacetSidebar({ facets, onSelect, className }: FacetSidebarProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {facets.map((facet) => {
        const max = Math.max(...facet.values.map((v) => v.count), 1)
        return (
          <Card key={facet.facet} className="gap-2 py-3">
            <CardHeader className="px-3">
              <CardTitle className="text-xs font-medium text-muted-foreground">{facet.facet}</CardTitle>
            </CardHeader>
            <CardContent className="px-1.5">
              {facet.values.length === 0 && <p className="px-1.5 text-xs text-muted-foreground">No values</p>}
              {facet.values.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  onClick={() => onSelect(facet.facet, v.value)}
                  title={`Filter by ${facet.facet}:${v.value}`}
                  className="relative flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-accent"
                >
                  <span
                    className="absolute inset-y-1 left-0 rounded-sm bg-accent"
                    style={{ width: `${Math.max((v.count / max) * 100, 2)}%`, zIndex: 0 }}
                    aria-hidden
                  />
                  <span className="relative z-10 truncate">{v.value}</span>
                  <span className="relative z-10 tabular-nums text-muted-foreground">{formatCount(v.count)}</span>
                </button>
              ))}
              {facet.otherCount ? (
                <div className="flex items-center justify-between px-1.5 py-1 text-xs text-muted-foreground">
                  <span>(other)</span>
                  <span className="tabular-nums">{formatCount(facet.otherCount)}</span>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function formatCount(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`
  }
  if (n >= 10_000) {
    return `${(n / 1_000).toFixed(1)}k`
  }
  return n.toLocaleString('en-US')
}
