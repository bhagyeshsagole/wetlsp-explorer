import { X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { Button, Kbd } from './ui';

/** First-run guidance stays in the layout so it cannot cover a chart or map. */
export function Onboarding() {
  const done = useAppStore((s) => s.onboardingDone);
  const dismiss = useAppStore((s) => s.dismissOnboarding);
  const hasSites = useAppStore((s) => s.siteOrder.length > 0);
  if (done || !hasSites) return null;

  return (
    <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-2.5 text-[12px] text-[var(--text-muted)]">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
        <span><span className="mr-1.5 font-medium text-[var(--accent)]">1</span>Open a site folder</span>
        <span><span className="mr-1.5 font-medium text-[var(--accent)]">2</span>Choose a view</span>
        <span><span className="mr-1.5 font-medium text-[var(--accent)]">3</span>Click a pixel or layer to explore</span>
        <span className="hidden min-[1400px]:inline">Jump anywhere with <Kbd>⌘K</Kbd></span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" variant="ghost" onClick={dismiss}>Got it</Button>
        <button onClick={dismiss} aria-label="Dismiss hints" className="rounded p-1.5 text-[var(--text-faint)] hover:text-[var(--text)]"><X size={14} /></button>
      </div>
    </div>
  );
}
