import { useEffect, useState, useRef } from 'react'
import { Streamdown } from 'streamdown'
import { code } from '@streamdown/code'
import { cn } from '@/lib/utils'

interface StreamingMessageProps {
  text: string
  className?: string
  typingDuration?: number // in seconds
  onStreamProgress?: () => void
}

export function StreamingMessage({ 
  text, 
  className,
  typingDuration = 4,
  onStreamProgress,
}: StreamingMessageProps) {
  const [displayedText, setDisplayedText] = useState('')
  const indexRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const lastNotifyRef = useRef(0)
  const onStreamProgressRef = useRef(onStreamProgress)

  useEffect(() => {
    onStreamProgressRef.current = onStreamProgress
  }, [onStreamProgress])

  useEffect(() => {
    indexRef.current = 0
    setDisplayedText('')
    startTimeRef.current = null
    lastNotifyRef.current = 0

    const totalChars = text.length
    const durationMs = typingDuration * 1000
    
    const typeNext = (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp
      }
      
      const elapsed = timestamp - startTimeRef.current
      const progress = Math.min(elapsed / durationMs, 1)
      const targetIndex = Math.floor(progress * totalChars)
      
      if (targetIndex > indexRef.current) {
        indexRef.current = targetIndex
        setDisplayedText(text.slice(0, targetIndex))

        if (onStreamProgressRef.current && timestamp - lastNotifyRef.current > 120) {
          lastNotifyRef.current = timestamp
          onStreamProgressRef.current()
        }
      }
      
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(typeNext)
      } else {
        setDisplayedText(text)
        onStreamProgressRef.current?.()
      }
    }

    rafRef.current = requestAnimationFrame(typeNext)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [text, typingDuration])

  return (
    <div className={cn('relative max-w-full overflow-hidden', className)}>
      <Streamdown
        plugins={{ code }}
        className="prose prose-sm dark:prose-invert max-w-none [&_pre]:border [&_pre]:border-border/40 [&_pre]:rounded-lg [&_pre]:p-4 [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_pre]:my-2 [&_code]:before:content-none [&_code]:after:content-none [&_code]:bg-muted/50 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:rounded-none [&_.shiki]:text-xs [&_.shiki]:leading-relaxed [&_[data-streamdown='code-block-header']]:!px-3"
      >
        {displayedText}
      </Streamdown>
    </div>
  )
}
