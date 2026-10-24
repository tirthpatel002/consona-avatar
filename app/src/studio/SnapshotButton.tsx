import React, { useCallback, useState } from 'react';
import type { UseAvatarHandleResult } from '@consona/avatar-enhanced/react/useAvatarHandle.ts';
import { snapshotFilename } from '@consona/avatar-enhanced/adapters/three/stage/snapshot.ts';

/**
 * "Download snapshot": captures exactly the frame on the stage at click time
 * (hi-res, transparent background) and downloads it as a PNG.
 */
export const SnapshotButton: React.FC<{ handle: UseAvatarHandleResult; name: string }> = ({ handle, name }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = useCallback(() => {
    if (busy) return;
    setError(null);
    // the capture (render + readback) runs synchronously inside this click; only encoding is async
    const pending = handle.snapshot({ type: 'image/png' });
    setBusy(true);
    pending
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = snapshotFilename(name);
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      })
      .catch((e: unknown) => {
        console.error('[studio] snapshot failed', e);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setBusy(false));
  }, [busy, handle, name]);

  return (
    <div className="flex flex-col gap-1 w-full shrink-0">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-busy={busy}
        data-testid="studio-snapshot"
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-surface/60 text-fg border border-border/70 shadow-xs hover:bg-surface active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-wait disabled:active:scale-100"
      >
        {busy ? 'Capturing…' : 'Download snapshot'}
      </button>
      {error && <p className="text-[11px] text-red-500">Snapshot failed: {error}</p>}
    </div>
  );
};
