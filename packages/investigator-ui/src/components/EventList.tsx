import type { EventMarker, EventMarkerKind, TimelineBucket } from '@kajidog/investigation-shared'
import { CalendarClock, ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

const KIND_BADGE_CLASS: Record<EventMarkerKind, string> = {
  deploy: 'bg-event-deploy text-white',
  alert: 'bg-event-alert text-white',
  other: 'bg-event-other text-white',
}

const KIND_LABEL: Record<EventMarkerKind, string> = {
  deploy: 'deploy',
  alert: 'alert',
  other: 'event',
}

interface EventListProps {
  events: EventMarker[]
  timeline: TimelineBucket[]
  /** Selects the timeline bucket containing the clicked event (log correlation). */
  onSelectBucket: (time: string) => void
}

/** Chronological list of Datadog events in the investigated window. */
export function EventList({ events, timeline, onSelectBucket }: EventListProps) {
  if (events.length === 0) {
    return null
  }
  return (
    <Card className="shrink-0 py-3">
      <CardContent className="px-3">
        <Collapsible defaultOpen={events.length <= 5}>
          <CollapsibleTrigger className="group flex w-full items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <CalendarClock className="size-3.5" aria-hidden />
            期間内のイベント（{events.length}件）
            <ChevronDown className="size-3.5 transition-transform group-data-[state=closed]:-rotate-90" aria-hidden />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1.5">
            <ul className="space-y-0.5">
              {events.map((event) => {
                const bucketTime = containingBucket(event, timeline)
                return (
                  <li key={event.id || `${event.time}:${event.title}`}>
                    <button
                      type="button"
                      disabled={!bucketTime}
                      onClick={() => bucketTime && onSelectBucket(bucketTime)}
                      title={bucketTime ? 'この時間帯のログを表示' : undefined}
                      className={cn(
                        'flex w-full items-baseline gap-2 rounded-md px-1.5 py-1 text-left text-xs',
                        bucketTime ? 'cursor-pointer hover:bg-accent' : 'cursor-default'
                      )}
                    >
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {formatEventTime(event.time)}
                      </span>
                      <Badge className={cn('shrink-0 px-1.5 py-0 text-[10px]', KIND_BADGE_CLASS[event.kind])}>
                        {KIND_LABEL[event.kind]}
                      </Badge>
                      {event.source && <span className="shrink-0 text-muted-foreground">{event.source}</span>}
                      <span className="min-w-0 truncate" title={event.title}>
                        {event.title}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}

/** Bucket (start time) whose [start, next start) range contains the event, if any. */
function containingBucket(event: EventMarker, timeline: TimelineBucket[]): string | null {
  const eventMs = Date.parse(event.time)
  if (Number.isNaN(eventMs) || timeline.length === 0) {
    return null
  }
  const starts = timeline.map((b) => ({ time: b.time, ms: Date.parse(b.time) })).filter((b) => !Number.isNaN(b.ms))
  const intervalMs = starts.length > 1 ? starts[1].ms - starts[0].ms : 5 * 60_000
  for (let i = starts.length - 1; i >= 0; i--) {
    if (eventMs >= starts[i].ms && eventMs < starts[i].ms + intervalMs) {
      return starts[i].time
    }
  }
  return null
}

function formatEventTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
