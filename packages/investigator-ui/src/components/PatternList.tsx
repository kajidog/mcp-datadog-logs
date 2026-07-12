import type { LogPattern } from '@kajidog/investigation-shared'
import { Braces, Check, ChevronDown } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

interface PatternListProps {
  patterns: LogPattern[]
  /** Rows the patterns were extracted from (for the header note) */
  analyzedCount: number
  /** Template of the currently selected pattern, if any */
  selectedTemplate: string | null
  /** Called with the template to select, or null to clear the selection */
  onSelect: (template: string | null) => void
  className?: string
}

/**
 * Clustered message templates for the fetched rows. Clicking a pattern
 * narrows the log table to its rows (client-side, like the keyword filter).
 */
export function PatternList({ patterns, analyzedCount, selectedTemplate, onSelect, className }: PatternListProps) {
  if (patterns.length === 0) {
    return null
  }
  const max = Math.max(...patterns.map((p) => p.count), 1)
  return (
    <Card className={cn('shrink-0 py-3', className)}>
      <CardContent className="px-3">
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="group flex w-full items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Braces className="size-3.5" aria-hidden />
            メッセージパターン（取得済み {analyzedCount} 件から抽出）
            <ChevronDown className="size-3.5 transition-transform group-data-[state=closed]:-rotate-90" aria-hidden />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1.5">
            {patterns.map((pattern) => {
              const active = pattern.template === selectedTemplate
              return (
                <button
                  key={pattern.template}
                  type="button"
                  onClick={() => onSelect(active ? null : pattern.template)}
                  title={active ? 'パターンの絞り込みを解除' : 'このパターンのログだけを表示'}
                  className={cn(
                    'relative flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-accent',
                    active && 'font-medium'
                  )}
                >
                  <span
                    className="absolute inset-y-1 left-0 rounded-sm bg-accent"
                    style={{ width: `${Math.max((pattern.count / max) * 100, 2)}%`, zIndex: 0 }}
                    aria-hidden
                  />
                  <span className="relative z-10 min-w-0 truncate font-mono" title={pattern.example}>
                    {pattern.template}
                  </span>
                  <span className="relative z-10 flex shrink-0 items-center gap-1 tabular-nums text-muted-foreground">
                    {active && <Check className="size-3" />}
                    {pattern.count} ({Math.round(pattern.ratio * 100)}%)
                  </span>
                </button>
              )
            })}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}
