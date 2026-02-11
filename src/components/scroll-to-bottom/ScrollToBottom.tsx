import { useState, useEffect } from 'react';
import { ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScrollToBottomProps {
  containerRef: React.RefObject<HTMLElement | null>;
  threshold?: number;
  className?: string;
}

export function ScrollToBottom({
  containerRef,
  threshold = 80,
  className,
}: ScrollToBottomProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const distanceFromBottom =
        container.scrollHeight - (container.scrollTop + container.clientHeight);
      setIsVisible(distanceFromBottom > threshold);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => container.removeEventListener('scroll', handleScroll);
  }, [containerRef, threshold]);

  const scrollToBottom = () => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  };

  if (!isVisible) return null;

  return (
    <button
      onClick={scrollToBottom}
      className={cn(
        'p-2 rounded-full bg-background/90 backdrop-blur-sm border shadow-lg',
        'text-muted-foreground hover:text-foreground hover:bg-accent',
        'transition-all duration-200',
        className
      )}
      title="Scroll to bottom"
    >
      <ArrowDown className="w-4 h-4" />
    </button>
  );
}
