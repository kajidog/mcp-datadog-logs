import type { ReactNode } from 'react'

/**
 * Wraps every case-insensitive occurrence of the given terms in <mark>.
 * Rendering goes through React, so the text needs no manual escaping.
 */
export function highlightText(text: string, terms: string[]): ReactNode {
  const escaped = [...new Set(terms.filter(Boolean))].map(escapeRegExp)
  if (!text || escaped.length === 0) {
    return text
  }
  const pattern = new RegExp(escaped.join('|'), 'gi')
  const nodes: ReactNode[] = []
  let lastIndex = 0
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }
    nodes.push(
      <mark key={match.index} className="rounded-sm bg-status-warn/50 text-foreground">
        {match[0]}
      </mark>
    )
    lastIndex = match.index + match[0].length
  }
  if (nodes.length === 0) {
    return text
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }
  return nodes
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
