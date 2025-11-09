import { useEffect, useRef, useState } from 'react';
import { ECSConfig } from '@lagless/core';
import { RelayInputProvider } from '@lagless/relay-input-provider';
import { MoveInput, TestbedInputRegistry, TestbedRunner } from '@lagless/testbed';

type Maybe<T> = T | null;

// ---- Debug types ------------------------------------------------------------

type DebugSnapshot = {
  readonly now: number;
  readonly fps: number;
  readonly rttEwmaMs: Maybe<number>;
  readonly jitterEwmaMs: Maybe<number>;
  readonly deltaTicks: Maybe<number>;
  readonly localTick: Maybe<number>;
  readonly lastServerTickHint: Maybe<number>;
  readonly targetTick: Maybe<number>;
  readonly backlogTicks: Maybe<number>;   // serverTick - localTick
  readonly queuedRpcs: Maybe<number>;
  readonly lastRollbackTick: Maybe<number>;
  readonly heartbeatSilenceTicks: Maybe<number>;
  readonly playerSlot: Maybe<number>;
};

// ---- Sparkline (canvas) -----------------------------------------------------

function Sparkline({
  series,
  maxPoints = 120,
  height = 42,
  label,
  fmt = (v: number) => v.toFixed(1),
}: {
  series: number[];
  maxPoints?: number;
  height?: number;
  label: string;
  fmt?: (v: number) => string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [w] = useState(260);
  const [ v, setV ] = useState(0); // force re-render on series change

  useEffect(() => {
    const intervalId = setInterval(() => setV((prevState) => prevState + 1), 1000 / 30);

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.clearRect(0, 0, w, height);

    if (series.length < 2) return;
    const slice = series.slice(-maxPoints);
    const min = Math.min(...slice);
    const max = Math.max(...slice);
    const span = Math.max(1e-6, max - min);

    // Draw polyline
    ctx.lineWidth = 1.5;
    // Do not set specific colors per requirements? We can rely on default canvas strokeStyle.
    // But to be visible in dark mode, nudge to a light gray.
    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath();
    for (let i = 0; i < slice.length; i++) {
      const x = (i / (maxPoints - 1)) * (w - 2) + 1;
      const norm = (slice[i] - min) / span;
      const y = (1 - norm) * (height - 2) + 1;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Zero line (if 0 in range)
    if (min < 0 && max > 0) {
      const y0 = (1 - (0 - min) / span) * (height - 2) + 1;
      ctx.strokeStyle = '#475569';
      ctx.beginPath();
      ctx.moveTo(0, y0);
      ctx.lineTo(w, y0);
      ctx.stroke();
    }
  }, [series, w, height, maxPoints, v]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{label}</span>
        {series.length > 0 && <span>{fmt(series.at(-1)!)}</span>}
      </div>
      <canvas
        ref={canvasRef}
        width={w}
        height={height}
        className="w-full"
      />
    </div>
  );
}

// ---- Stat card --------------------------------------------------------------

function StatCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string | number | null | undefined;
  hint?: string;
}) {
  const v = value === null || value === undefined ? 'n/a' : value;
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 shadow-inner shadow-black/30">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{title}</div>
      <div className="mt-1 text-lg font-semibold text-slate-100">{v}</div>
      {hint && <div className="mt-1 text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}

// ---- Debug HUD --------------------------------------------------------------

function useDebug(provider: RelayInputProvider | null, runner: TestbedRunner | null) {
  const [snap, setSnap] = useState<DebugSnapshot | null>(null);
  const rttHistory = useRef<number[]>([]);
  const jitterHistory = useRef<number[]>([]);
  const deltaHistory = useRef<number[]>([]);
  const backlogHistory = useRef<number[]>([]);
  const [events, setEvents] = useState<Array<{ t: number; text: string }>>([]);

  // Basic FPS calc
  const fpsRef = useRef({ last: performance.now(), avg: 60 });

  useEffect(() => {
    if (!provider) return;

    const handle = setInterval(() => {
      // FPS (EMA)
      const now = performance.now();
      const dt = now - fpsRef.current.last;
      fpsRef.current.last = now;
      const instFps = dt > 0 ? 1000 / dt : 60;
      fpsRef.current.avg = fpsRef.current.avg * 0.9 + instFps * 0.1;

      const p: any = provider; // duck-typed access for debug
      const localTick =
        p?._simulation?.tick ??
        p?.mem?.tickManager?.tick ??
        (runner as any)?.tick ??
        null;

      const rttEwmaMs: number | null = p?._clockSync?.rttEwmaMs ?? null;
      const jitterEwmaMs: number | null = p?._clockSync?.jitterEwmaMs ?? null;
      const deltaTicks: number | null = p?._inputDelayController?.deltaTicks ?? p?._currentInputDelay ?? null;
      const lastServerTickHint: number | null = p?._lastServerTickHint ?? null;
      const queuedRpcs: number | null = p?._frameRPCBuffer?.length ?? null;
      const lastRollbackTick: number | null = p?._tickToRollback ?? null;
      const heartbeatSilenceTicks: number | null = p?._silentTicks ?? null;
      const playerSlot: number | null = p?.playerSlot ?? null;

      // Compute a safe targetTick (guard = 1)
      let targetTick: number | null = null;
      if (localTick != null && deltaTicks != null) {
        targetTick = localTick + deltaTicks;
      }

      const backlogTicks =
        lastServerTickHint != null && localTick != null
          ? lastServerTickHint - localTick
          : null;

      // Push histories for sparklines
      if (rttEwmaMs != null) rttHistory.current.push(rttEwmaMs);
      if (jitterEwmaMs != null) jitterHistory.current.push(jitterEwmaMs);
      if (deltaTicks != null) deltaHistory.current.push(deltaTicks);
      if (backlogTicks != null) backlogHistory.current.push(backlogTicks);

      // Log rollbacks as events
      if (lastRollbackTick != null) {
        setEvents((prev) => [
          { t: performance.now(), text: `Rollback → tick ${lastRollbackTick}` },
          ...prev.slice(0, 29),
        ]);
      }

      setSnap({
        now,
        fps: Number(fpsRef.current.avg.toFixed(1)),
        rttEwmaMs,
        jitterEwmaMs,
        deltaTicks,
        localTick,
        lastServerTickHint,
        targetTick,
        backlogTicks,
        queuedRpcs,
        lastRollbackTick,
        heartbeatSilenceTicks,
        playerSlot,
      });
    }, 1000/60);

    return () => clearInterval(handle);
  }, [provider, runner]);

  return {
    snap,
    rttHistory: rttHistory.current,
    jitterHistory: jitterHistory.current,
    deltaHistory: deltaHistory.current,
    backlogHistory: backlogHistory.current,
    events,
    clearEvents: () => setEvents([]),
  };
}

function Badge({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span
      className={
        'inline-flex items-center rounded px-2 py-0.5 text-[11px] ' +
        (ok ? 'bg-emerald-900/50 text-emerald-300' : 'bg-rose-900/50 text-rose-300')
      }
    >
      {text}
    </span>
  );
}

function DebugHUD({
  provider,
  runner,
  visible,
  onClose,
}: {
  provider: RelayInputProvider | null;
  runner: TestbedRunner | null;
  visible: boolean;
  onClose: () => void;
}) {
  const { snap, rttHistory, jitterHistory, deltaHistory, backlogHistory, events, clearEvents } =
    useDebug(provider, runner);

  if (!visible) return null;

  return (
    <div className="pointer-events-auto fixed inset-4 z-50 flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/80 p-4 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-200">Lagless Debug HUD</div>
        <div className="flex items-center gap-2">
          {snap && (
            <Badge
              ok={(snap?.rttEwmaMs ?? 0) < 120 && (snap?.jitterEwmaMs ?? 0) < 20}
              text={
                snap?.rttEwmaMs != null
                  ? `RTT ${snap.rttEwmaMs.toFixed(1)} ms`
                  : 'RTT n/a'
              }
            />
          )}
          <button
            onClick={onClose}
            className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
          >
            Close (D)
          </button>
        </div>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard title="FPS" value={snap?.fps} />
        <StatCard title="Local Tick" value={snap?.localTick ?? 'n/a'} />
        <StatCard title="Server Hint" value={snap?.lastServerTickHint ?? 'n/a'} />
        <StatCard title="Δ (ticks)" value={snap?.deltaTicks ?? 'n/a'} />
        <StatCard title="Target Tick" value={snap?.targetTick ?? 'n/a'} />
        <StatCard
          title="Backlog (ticks)"
          value={snap?.backlogTicks ?? 'n/a'}
          hint="serverTick - localTick"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <Sparkline series={rttHistory} label="RTT (ms)" />
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <Sparkline series={jitterHistory} label="Jitter (ms)" />
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <Sparkline series={deltaHistory} label="Δ ticks" fmt={(v) => v.toFixed(0)} />
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <Sparkline
            series={backlogHistory}
            label="Backlog (ticks)"
            fmt={(v) => v.toFixed(0)}
          />
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <div className="mb-2 text-xs font-semibold text-slate-300">Network</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-slate-400">RTT EWMA</div>
            <div className="text-right text-slate-200">
              {snap?.rttEwmaMs != null ? `${snap.rttEwmaMs.toFixed(1)} ms` : 'n/a'}
            </div>
            <div className="text-slate-400">Jitter EWMA</div>
            <div className="text-right text-slate-200">
              {snap?.jitterEwmaMs != null ? `${snap.jitterEwmaMs.toFixed(1)} ms` : 'n/a'}
            </div>
            <div className="text-slate-400">Queued RPCs</div>
            <div className="text-right text-slate-200">{snap?.queuedRpcs ?? 'n/a'}</div>
            <div className="text-slate-400">Heartbeat Quiet</div>
            <div className="text-right text-slate-200">
              {snap?.heartbeatSilenceTicks ?? 'n/a'} ticks
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <div className="mb-2 text-xs font-semibold text-slate-300">Timing</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-slate-400">Δ (Input Delay)</div>
            <div className="text-right text-slate-200">
              {snap?.deltaTicks != null ? `${snap.deltaTicks} ticks` : 'n/a'}
            </div>
            <div className="text-slate-400">Commit Lag</div>
            <div className="text-right text-slate-200">
              n/a
            </div>
            <div className="text-slate-400">Target Tick</div>
            <div className="text-right text-slate-200">{snap?.targetTick ?? 'n/a'}</div>
            <div className="text-slate-400">Player Slot</div>
            <div className="text-right text-slate-200">{snap?.playerSlot ?? 'n/a'}</div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold text-slate-300">Events</div>
            <button
              onClick={clearEvents}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Clear
            </button>
          </div>
          <div className="h-28 overflow-auto pr-1 text-[12px] leading-relaxed text-slate-300">
            {events.length === 0 ? (
              <div className="text-slate-500">No recent events</div>
            ) : (
              events.map((e, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-slate-400">
                    {new Date(e.t).toLocaleTimeString()}
                  </span>
                  <span>{e.text}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- App with HUD integration ----------------------------------------------

export function App() {
  const [runner, setRunner] = useState<TestbedRunner | null>(null);
  const [provider, setProvider] = useState<RelayInputProvider | null>(null);
  const [showHUD, setShowHUD] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'd') setShowHUD((v) => !v); // Toggle HUD with "D"
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let destroyed = false;

    RelayInputProvider.connect(
      new ECSConfig(),
      TestbedInputRegistry,
      'ws://localhost:3000'
    ).then(
      (prov) => {
        const runner = new TestbedRunner(prov.ecsConfig, prov, []);
        runner.start();
        if (destroyed) {
          runner.dispose();
          return;
        }

        setRunner(runner);
        setProvider(prov);

        let prevTime = performance.now();
        setInterval(() => {
          const now = performance.now();
          const dt = now - prevTime;
          prevTime = now;
          runner.update(dt);
        }, 1000 / 60);

        let pointerX = 0;
        let pointerY = 0;
        let speed = 0;

        window.addEventListener('pointermove', (ev) => {
          pointerX = ev.clientX;
          pointerY = ev.clientY;
        });

        window.addEventListener('pointerdown', () => {
          speed = 1;
        });
        window.addEventListener('pointerup', () => {
          speed = 0;
        });

        prov.drainInputs((addRpc) => {
          if (speed === 0) {
            return;
          }
          addRpc(MoveInput, {
            direction: Math.atan2(pointerY - window.innerHeight / 2, pointerX - window.innerWidth / 2),
            speed: speed,
          });
        });
      },
      console.error
    );

    return () => {
      destroyed = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="p-6">
        <h1 className="text-xl font-semibold">App</h1>
        <p className="mt-2 text-sm text-slate-400">
          Press <kbd className="rounded bg-slate-800 px-1 py-0.5">D</kbd> to toggle Debug HUD
        </p>
      </div>

      <DebugHUD
        provider={provider}
        runner={runner}
        visible={showHUD}
        onClose={() => setShowHUD(false)}
      />
    </div>
  );
}
