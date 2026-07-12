import rehypeStringify from 'rehype-stringify'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'

interface TreeNode {
  type: string
  value?: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: TreeNode[]
}

/** Render untrusted findings Markdown without allowing embedded HTML or unsafe links. */
export function renderMarkdown(markdown: string): string {
  return String(
    unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkBreaks)
      .use(escapeRawHtml)
      .use(remarkRehype)
      .use(hardenLinks)
      .use(rehypeStringify)
      .processSync(markdown)
  )
}

function escapeRawHtml() {
  return (tree: TreeNode) => {
    visit(tree, (node) => {
      if (node.type === 'html') {
        node.type = 'text'
      }
    })
  }
}

function hardenLinks() {
  return (tree: TreeNode) => {
    visit(tree, (node) => {
      if (node.type !== 'element' || node.tagName !== 'a') {
        return
      }
      const properties = node.properties ?? {}
      node.properties = properties
      const href = typeof properties.href === 'string' ? properties.href : ''
      if (!isSafeHref(href)) {
        delete properties.href
        return
      }
      properties.target = '_blank'
      properties.rel = ['noreferrer', 'noopener']
    })
  }
}

function isSafeHref(href: string): boolean {
  return /^(?:https?:|mailto:|#|\.(?:\.\/|\/)|\/(?!\/))/i.test(href)
}

function visit(node: TreeNode, callback: (node: TreeNode) => void): void {
  callback(node)
  for (const child of node.children ?? []) {
    visit(child, callback)
  }
}
