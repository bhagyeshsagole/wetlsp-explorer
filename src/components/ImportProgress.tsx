/** Import progress with the multi-site queue position, shared by the hero and the workspace. */
import { X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { ProgressBar } from './ui';

export function ImportProgress({ inline = false }: { inline?: boolean }) {
  const ingest = useAppStore((s) => s.ingest);
  const cancel = useAppStore((s) => s.cancelImport);
  if (!ingest.active) return null;

  const { progress, queue } = ingest;
  // Overall fraction across the queue, so five sites read as one bar.
  const fraction =
    progress?.fraction == null
      ? null
      : queue
        ? (queue.index + progress.fraction) / queue.total
        : progress.fraction;
  const label = [
    queue ? `Site ${queue.index + 1} of ${queue.total} · ${queue.label}` : null,
    progress?.phase ?? 'Importing',
    progress?.detail ? progress.detail.split('/').pop() : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <ProgressBar fraction={fraction} label={label} />
      </div>
      <button
        onClick={cancel}
        className={
          inline
            ? 'shrink-0 rounded p-1 text-[var(--text-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]'
            : 'shrink-0 text-[12px] text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text)]'
        }
        title="Cancel the import"
        aria-label="Cancel the import"
      >
        {inline ? <X size={14} /> : 'Cancel'}
      </button>
    </div>
  );
}
