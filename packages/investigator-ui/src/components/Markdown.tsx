import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

const components: Components = {
  p: ({ node: _node, ...props }) => <p className="my-1.5 first:mt-0 last:mb-0" {...props} />,
  a: ({ node: _node, ...props }) => (
    <a
      className="font-medium text-primary underline underline-offset-2"
      target="_blank"
      rel="noreferrer noopener"
      {...props}
    />
  ),
  ul: ({ node: _node, ...props }) => <ul className="my-1.5 list-disc pl-5" {...props} />,
  ol: ({ node: _node, ...props }) => <ol className="my-1.5 list-decimal pl-5" {...props} />,
  li: ({ node: _node, ...props }) => <li className="my-0.5" {...props} />,
  h1: ({ node: _node, ...props }) => <h1 className="mt-2 mb-1 text-base font-semibold" {...props} />,
  h2: ({ node: _node, ...props }) => <h2 className="mt-2 mb-1 text-sm font-semibold" {...props} />,
  h3: ({ node: _node, ...props }) => <h3 className="mt-2 mb-1 text-sm font-semibold" {...props} />,
  strong: ({ node: _node, ...props }) => <strong className="font-semibold" {...props} />,
  blockquote: ({ node: _node, ...props }) => (
    <blockquote className="my-1.5 border-l-2 border-border pl-3 text-muted-foreground" {...props} />
  ),
  code: ({ node: _node, className, ...props }) => {
    const isBlock = className?.includes('language-')
    return isBlock ? (
      <code className={cn('font-mono text-xs', className)} {...props} />
    ) : (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs" {...props} />
    )
  },
  pre: ({ node: _node, ...props }) => (
    <pre className="my-1.5 overflow-x-auto rounded-md bg-muted p-2 text-xs" {...props} />
  ),
  table: ({ node: _node, ...props }) => (
    <div className="my-1.5 overflow-x-auto">
      <table className="w-full border-collapse text-xs" {...props} />
    </div>
  ),
  th: ({ node: _node, ...props }) => <th className="border border-border px-2 py-1 text-left font-medium" {...props} />,
  td: ({ node: _node, ...props }) => <td className="border border-border px-2 py-1" {...props} />,
  hr: ({ node: _node, ...props }) => <hr className="my-2 border-border" {...props} />,
}

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('text-sm leading-relaxed break-words', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
