import { useEffect, useRef, useState } from 'react';
import type { RelayInputProvider } from '@lagless/relay-input-provider';

type TelemetrySnapshot = ReturnType<RelayInputProvider['getTelemetrySnapshot']>;

// ---------- Sparkline (Canvas) ----------
function Sparkline({
  data,
  label,
  height = 44,
  maxPoints = 160,
  format = (v: number) => v.toFixed(1),
}: {
  data: readonly number[];
  label: string;
  height?: number;
  maxPoints?: number;
  format?: (v: number) => string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ v, setV ] = useState<number>(0);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setV((v) => v + 1);
    }, 1000/60);

    return () => clearInterval(intervalId);
  }, []);

  // Re-draw on data changes
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const w = el.clientWidth || 280;
    el.width = w; // ensure crisp drawing
    el.height = height;

    const ctx = el.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, w, height);

    const series = data.slice(-maxPoints);
    if (series.length < 2) return;

    const min = Math.min(...series);
    const max = Math.max(...series);
    const span = Math.max(1e-6, max - min);

    // Grid baseline (0 line) if 0 is visible
    if (min < 0 && max > 0) {
      const y0 = (1 - (0 - min) / span) * (height - 2) + 1;
      ctx.strokeStyle = '#475569'; // slate-600
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y0);
      ctx.lineTo(w, y0);
      ctx.stroke();
    }

    // Polyline
    ctx.strokeStyle = '#cbd5e1'; // slate-300 (visible on dark)
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < series.length; i++) {
      const x = (i / (maxPoints - 1)) * (w - 2) + 1;
      const yNorm = (series[i] - min) / span;
      const y = (1 - yNorm) * (height - 2) + 1;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [data, height, maxPoints, v]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{label}</span>
        {data.length > 0 && <span>{format(data[data.length - 1])}</span>}
      </div>
      <canvas ref={canvasRef} className="w-full rounded-md bg-slate-900/50" style={{ height }} />
    </div>
  );
}

// ---------- Small UI atoms ----------
function StatCard({ title, value, hint }: { title: string; value: string | number | null | undefined; hint?: string }) {
  const v = value === null || value === undefined ? 'n/a' : value;
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 shadow-inner shadow-black/30">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{title}</div>
      <div className="mt-1 text-lg font-semibold text-slate-100">{v}</div>
      {hint && <div className="mt-1 text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}

function Badge({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span
      className={
        'inline-flex items-center rounded px-2 py-0.5 text-[11px] ' +
        (ok ? 'bg-emerald-900/60 text-emerald-300' : 'bg-rose-900/60 text-rose-300')
      }
    >
      {text}
    </span>
  );
}

// ---------- Telemetry hook ----------
function useTelemetry(provider: RelayInputProvider | null, intervalMs = 150) {
  const [snap, setSnap] = useState<TelemetrySnapshot | null>(null);

  // Simple FPS estimator (EMA)
  const fpsRef = useRef({ last: performance.now(), ema: 60 });
  const [fps, setFps] = useState<number>(60);

  useEffect(() => {
    if (!provider) return;
    const id = setInterval(() => {
      const s = provider.getTelemetrySnapshot();
      setSnap(s);

      const now = performance.now();
      const dt = now - fpsRef.current.last;
      fpsRef.current.last = now;
      const inst = dt > 0 ? 1000 / dt : 60;
      fpsRef.current.ema = fpsRef.current.ema * 0.9 + inst * 0.1;
      setFps(Number(fpsRef.current.ema.toFixed(1)));
    }, intervalMs);
    return () => clearInterval(id);
  }, [provider, intervalMs]);

  return { snap, fps };
}

// ---------- Debug HUD ----------
export function DebugHUD({
  provider,
  visible = true,
  onClose,
}: {
  provider: RelayInputProvider | null;
  visible?: boolean;
  onClose?: () => void;
}) {
  const { snap, fps } = useTelemetry(provider, 1000/60);

  if (!visible || !snap) return null;

  const rtt = snap.rttMs ?? 0;
  const jitter = snap.jitterMs ?? 0;
  const backlog = snap.backlogTicks ?? 0;

  const netOK = rtt < 120 && jitter < 20;
  const jitterOK = jitter < 15;
  const backlogOK = Math.abs(backlog) < 3;

  return (
    <div className="pointer-events-auto fixed inset-4 z-50 flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/85 p-4 backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-200">Lagless Debug HUD</div>
        <div className="flex items-center gap-2">
          <Badge ok={netOK} text={snap.rttMs != null ? `RTT ${rtt.toFixed(1)} ms` : 'RTT n/a'} />
          <Badge ok={jitterOK} text={snap.jitterMs != null ? `Jitter ${jitter.toFixed(1)} ms` : 'Jitter n/a'} />
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
            >
              Close (D)
            </button>
          )}
        </div>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard title="FPS" value={fps} />
        <StatCard title="Local Tick" value={snap.localTick} />
        <StatCard title="Server Hint" value={snap.serverTickHint} />
        <StatCard title="Δ (ticks)" value={snap.deltaTicks} />
        <StatCard title="Target Tick" value={snap.targetTick} />
        <StatCard title="Backlog (ticks)" value={snap.backlogTicks} hint="serverTick - localTick" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
          <Sparkline label="RTT (ms)" data={snap.history.rtt} />
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
          <Sparkline label="Jitter (ms)" data={snap.history.jitter} />
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
          <Sparkline label="Δ ticks" data={snap.history.delta} format={(v) => v.toFixed(0)} />
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
          <Sparkline label="Backlog (ticks)" data={snap.history.backlog} format={(v) => v.toFixed(0)} />
        </div>
      </div>

      {/* Counters & timings */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <div className="mb-2 text-xs font-semibold text-slate-300">Traffic</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-slate-400">Sent inputs</div>
            <div className="text-right text-slate-200">{snap.sentInputs}</div>
            <div className="text-slate-400">Heartbeats</div>
            <div className="text-right text-slate-200">{snap.sentHeartbeats}</div>
            <div className="text-slate-400">Fanout batches</div>
            <div className="text-right text-slate-200">{snap.fanoutBatches}</div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <div className="mb-2 text-xs font-semibold text-slate-300">Corrections</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-slate-400">CancelInput</div>
            <div className="text-right text-slate-200">{snap.cancelInputs}</div>
            <div className="text-slate-400">Rollbacks</div>
            <div className="text-right text-slate-200">{snap.rollbacks}</div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <div className="mb-2 text-xs font-semibold text-slate-300">Timing</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-slate-400">Last send</div>
            <div className="text-right text-slate-200">
              {snap.lastSendAt ? `${(performance.now() - snap.lastSendAt).toFixed(0)} ms ago` : 'n/a'}
            </div>
            <div className="text-slate-400">Last recv</div>
            <div className="text-right text-slate-200">
              {snap.lastRecvAt ? `${(performance.now() - snap.lastRecvAt).toFixed(0)} ms ago` : 'n/a'}
            </div>
          </div>
        </div>
      </div>

      {/* Hints */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-300">
        <ul className="list-inside list-disc space-y-1">
          {!jitterOK && <li>High jitter detected — expect more Δ ticks and occasional rollbacks.</li>}
          {!backlogOK && <li>Significant backlog — the client clock is catching up to the server.</li>}
        </ul>
      </div>
    </div>
  );
}
