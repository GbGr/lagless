import { useEffect, useState } from 'react';
import { ECSConfig } from '@lagless/core';
import { RelayInputProvider } from '@lagless/relay-input-provider';
import { MoveInput, TestbedInputRegistry, TestbedRunner } from '@lagless/testbed';
import { DebugHUD } from './debug-ui';

let vidx = 0;

export function App() {
  const [, setRunner] = useState<TestbedRunner | null>(null);
  const [provider, setProvider] = useState<RelayInputProvider | null>(null);
  const [showHUD, setShowHUD] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'd') setShowHUD((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    vidx++;
    let destroyed = false;
    RelayInputProvider.connect(new ECSConfig(), TestbedInputRegistry, 'ws://localhost:3000').then(
      (prov) => {
        if (destroyed) {
          prov.dispose();
          return;
        }
        const r = new TestbedRunner(prov.ecsConfig, prov, []);
        r.start();
        setRunner(r);
        setProvider(prov);

        let prev = performance.now();
        const id = setInterval(() => {
          const now = performance.now();
          const dt = now - prev;
          prev = now;
          r.update(dt);
        }, 1000 / 60);

        // Simple input (same as before)
        let pointerX = 0, pointerY = 0, speed = 0;
        window.addEventListener('pointermove', (ev) => { pointerX = ev.clientX; pointerY = ev.clientY; });
        window.addEventListener('pointerdown', () => { speed = 1; });
        window.addEventListener('pointerup', () => { speed = 0; });

        prov.drainInputs((addRpc) => {
          console.log(`drainInputs callback ${vidx}`);
          if (speed === 0) return;
          addRpc(MoveInput, {
            direction: Math.atan2(pointerY - window.innerHeight / 2, pointerX - window.innerWidth / 2),
            speed,
          });
        });

        return () => {
          destroyed = true;
          clearInterval(id);
        };
      },
      console.error
    );
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="p-6">
        <h1 className="text-xl font-semibold">App</h1>
        <p className="mt-2 text-sm text-slate-400">
          Press <kbd className="rounded bg-slate-800 px-1 py-0.5">D</kbd> to toggle Debug HUD
        </p>
      </div>

      <DebugHUD provider={provider} visible={showHUD} onClose={() => setShowHUD(false)} />
    </div>
  );
}
