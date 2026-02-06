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
  const textRef = useRef(text)
  const typingDurationRef = useRef(typingDuration)
  const prevTextRef = useRef(text)

  useEffect(() => {
    onStreamProgressRef.current = onStreamProgress
  }, [onStreamProgress])

  useEffect(() => {
    typingDurationRef.current = typingDuration
  }, [typingDuration])

  const tick = (timestamp: number) => {
    const fullText = textRef.current
    const totalChars = fullText.length

    if (totalChars === 0) {
      rafRef.current = null
      return
    }

    if (startTimeRef.current === null) {
      const durationMs = typingDurationRef.current * 1000
      const progress = totalChars > 0 ? indexRef.current / totalChars : 0
      startTimeRef.current = timestamp - progress * durationMs
    }

    const durationMs = typingDurationRef.current * 1000
    const elapsed = timestamp - startTimeRef.current
    const progress = durationMs > 0 ? Math.min(elapsed / durationMs, 1) : 1
    const targetIndex = Math.floor(progress * totalChars)

    if (targetIndex > indexRef.current) {
      indexRef.current = targetIndex
      setDisplayedText(fullText.slice(0, targetIndex))

      if (onStreamProgressRef.current && timestamp - lastNotifyRef.current > 120) {
        lastNotifyRef.current = timestamp
        onStreamProgressRef.current()
      }
    }

    if (indexRef.current < totalChars) {
      rafRef.current = requestAnimationFrame(tick)
    } else {
      setDisplayedText(fullText)
      onStreamProgressRef.current?.()
      rafRef.current = null
      startTimeRef.current = null
    }
  }

  useEffect(() => {
    const prevText = prevTextRef.current
    const isReset = !text.startsWith(prevText)

    if (isReset) {
      indexRef.current = 0
      setDisplayedText('')
      startTimeRef.current = null
      lastNotifyRef.current = 0
    }

    prevTextRef.current = text
    textRef.current = text

    if (text.length > indexRef.current && rafRef.current === null) {
      rafRef.current = requestAnimationFrame(tick)
    }

    if (text.length === 0 && rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [text])

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [])

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
