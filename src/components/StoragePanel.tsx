/**
 * Storage: how much of the 50 GB budget is used, which sites use it, and the
 * dialog an import opens when there is not enough room left.
 */
import { useState } from 'react';
import clsx from 'clsx';
import { HardDrive, PackageOpen, RotateCcw, Trash2 } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { APP_STORAGE_BUDGET, storageBudget, type StorageBudget } from '@/lib/opfs';
import { formatBytes } from '@/lib/format';
import { Button, Chip } from './ui';

export function useStorageBudget(): StorageBudget {
  const sites = useAppStore((s) => s.sites);
  const storage = useAppStore((s) => s.storage);
  const used = Object.values(sites).reduce((n, st) => n + st.bytesOnDisk, 0);
  return storageBudget(used, storage);
}

export function StorageMeter({ compact = false }: { compact?: boolean }) {
  const budget = useStorageBudget();
  const fraction = budget.limit > 0 ? Math.min(1, budget.used / budget.limit) : 0;
  const tone = fraction > 0.9 ? 'bg-red-500' : fraction > 0.75 ? 'bg-amber-500' : 'bg-[var(--accent)]';
  return (
    <div className="space-y-1.5">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-sunken)]">
        <div className={clsx('h-full rounded-full transition-[width]', tone)} style={{ width: `${(fraction * 100).toFixed(1)}%` }} />
      </div>
      <div className="flex justify-between gap-2 text-[11.5px] text-[var(--text-muted)]">
        <span className="tabular-nums">
          {formatBytes(budget.used)} of {formatBytes(budget.limit)}
        </span>
        {!compact && (
          <span>{budget.diskBound ? 'limited by free disk' : 'app limit'}</span>
        )}
      </div>
    </div>
  );
}

/** Every stored site, biggest first, each deletable in two clicks. */
export function SiteStorageList({ highlightSamples = false }: { highlightSamples?: boolean }) {
  const sites = useAppStore((s) => s.sites);
  const removeSite = useAppStore((s) => s.removeSite);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const rows = Object.values(sites).sort((a, b) => b.bytesOnDisk - a.bytesOnDisk);

  if (rows.length === 0) {
    return <p className="text-[12px] text-[var(--text-muted)]">No site data stored.</p>;
  }

  return (
    <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">
      {rows.map((st) => {
        const id = st.manifest.siteId;
        const sample = st.manifest.origin === 'sample';
        return (
          <li key={id} className="flex items-center gap-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[13px] font-medium">{id}</span>
                {sample && (
                  <Chip tone={highlightSamples ? 'accent' : 'neutral'} className="!py-0 text-[10.5px]">
                    sample
                  </Chip>
                )}
              </div>
              <div className="text-[11.5px] tabular-nums text-[var(--text-muted)]">
                {formatBytes(st.bytesOnDisk)}
              </div>
            </div>
            {confirming === id ? (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy === id}
                  onClick={async () => {
                    setBusy(id);
                    await removeSite(id);
                    setBusy(null);
                    setConfirming(null);
                  }}
                >
                  {busy === id ? 'Deleting…' : 'Delete'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                  Keep
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setConfirming(id)}
                className="rounded p-1.5 text-[var(--text-faint)] hover:bg-red-500/10 hover:text-red-500"
                title={`Delete ${id} (${formatBytes(st.bytesOnDisk)})`}
                aria-label={`Delete ${id}`}
              >
                <Trash2 size={14} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Settings card: bundled samples that are not currently installed. */
export function SampleSitesCard() {
  const samples = useAppStore((s) => s.samples);
  const sites = useAppStore((s) => s.sites);
  const ingestActive = useAppStore((s) => s.ingest.active);
  const installSamples = useAppStore((s) => s.installSamples);
  if (samples.length === 0) return null;
  const missing = samples.filter((s) => !sites[s.siteId]);

  return (
    <section className="card px-4 py-3.5">
      <div className="flex items-start justify-between gap-2 pb-2.5">
        <div>
          <h3 className="text-[13.5px] font-semibold">Sample sites</h3>
          <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
            Bundled with the app. Delete them to free space; restore them any time.
          </p>
        </div>
        <PackageOpen size={14} className="mt-1 shrink-0 text-[var(--text-faint)]" />
      </div>
      <ul className="space-y-2">
        {samples.map((s) => {
          const installed = Boolean(sites[s.siteId]);
          return (
            <li key={s.siteId} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-medium">
                  {s.siteId} <span className="font-normal text-[var(--text-muted)]">· {s.name}</span>
                </div>
                <div className="text-[11.5px] leading-snug text-[var(--text-muted)]">
                  {s.description} · {formatBytes(s.bytes)}
                </div>
              </div>
              {installed ? (
                <Chip tone="accent" className="shrink-0">loaded</Chip>
              ) : (
                <Button
                  size="sm"
                  className="shrink-0"
                  disabled={ingestActive}
                  onClick={() => void installSamples([s.siteId])}
                >
                  Add
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {missing.length > 1 && (
        <Button
          size="sm"
          className="mt-3 w-full"
          icon={<RotateCcw size={13} />}
          disabled={ingestActive}
          onClick={() => void installSamples()}
        >
          Restore all {missing.length} ({formatBytes(missing.reduce((n, s) => n + s.bytes, 0))})
        </Button>
      )}
    </section>
  );
}

/** Opened by an import that would go past the storage limit. */
export function SpaceDialog() {
  const request = useAppStore((s) => s.spaceRequest);
  const budget = useStorageBudget();
  if (!request) return null;

  // After a real quota error the estimate cannot be trusted; count what the
  // user has freed since the dialog opened instead.
  const quota = request.reason === 'quota';
  const free = quota
    ? Math.max(0, request.usedAtOpen - budget.used)
    : Math.max(0, budget.limit - budget.used);
  const short = Math.max(0, request.bytes - free);
  const fits = short === 0;

  return (
    <div className="fixed inset-0 z-[75] grid place-items-center bg-black/30 p-4 backdrop-blur-[2px]">
      <div className="card w-full max-w-[460px] overflow-hidden" role="dialog" aria-label="Make space">
        <header className="flex items-start gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-amber-500/10 text-amber-600">
            <HardDrive size={18} />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold">Make space for {request.siteId}</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
              {quota ? (
                <>
                  This computer ran out of room for app data while copying it ({formatBytes(request.bytes)}).{' '}
                  {fits
                    ? `You have freed ${formatBytes(free)}, which is enough.`
                    : `Delete at least ${formatBytes(short)} of sites below, then continue.`}
                </>
              ) : (
                <>
                  It needs {formatBytes(request.bytes)}, and{' '}
                  {budget.diskBound
                    ? 'this computer’s free disk space'
                    : `the ${formatBytes(APP_STORAGE_BUDGET)} storage limit`}{' '}
                  leaves {formatBytes(free)}.{' '}
                  {fits ? 'That is enough now.' : `Delete at least ${formatBytes(short)} of sites below.`}
                </>
              )}
            </p>
          </div>
        </header>
        <div className="max-h-[46vh] space-y-3 overflow-y-auto px-5 py-4">
          <StorageMeter />
          <SiteStorageList highlightSamples />
          <p className="text-[11.5px] text-[var(--text-muted)]">
            Sample sites can be restored later from Settings → Sample sites.
          </p>
        </div>
        <footer className="flex items-center justify-between gap-2 border-t border-[var(--border)] px-5 py-3">
          <Button size="sm" variant="ghost" onClick={() => request.resolve('stop')}>
            Stop import
          </Button>
          <div className="flex items-center gap-2">
            {request.canSkip && (
              <Button size="sm" onClick={() => request.resolve('skip')}>
                Skip {request.siteId}
              </Button>
            )}
            <Button size="sm" variant="primary" disabled={!fits} onClick={() => request.resolve('retry')}>
              Continue import
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
