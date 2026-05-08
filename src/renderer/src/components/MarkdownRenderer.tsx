import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import 'highlight.js/styles/github-dark.css'
import 'katex/dist/katex.min.css'
import { useSettingsStore } from '@/lib/store/settings'

export default function MarkdownRenderer({ children }: { children: string }) {
  const fontSize = useSettingsStore((s) => s.fontSize)
  return (
    <div
      className="prose max-w-none prose-pre:p-0 prose-pre:overflow-hidden [&_pre_code]:whitespace-pre-wrap [&_pre_code]:break-all prose-headings:text-gray-800 prose-p:text-gray-700 prose-li:text-gray-700 prose-strong:text-gray-800 dark:prose-headings:text-gray-200 dark:prose-p:text-gray-300 dark:prose-li:text-gray-300 dark:prose-strong:text-gray-200"
      style={{ fontSize: `${fontSize}px` }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeHighlight, rehypeKatex]}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
