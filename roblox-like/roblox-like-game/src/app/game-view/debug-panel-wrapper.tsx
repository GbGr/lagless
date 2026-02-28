import { FC, useEffect, useRef, useState } from 'react';
import { useRunnerContext } from './runner-provider';

export const DebugPanelWrapper: FC = () => {
  const { runner } = useRunnerContext();
  const [visible, setVisible] = useState(false);
  const [info, setInfo] = useState({ tick: 0, fps: 0, interp: 0 });
  const lastTimeRef = useRef(performance.now());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        setVisible((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!visible || !runner) return;
    let raf: number;
    const update = () => {
      const now = performance.now();
      const dt = now - lastTimeRef.current;
      lastTimeRef.current = now;
      setInfo({
        tick: runner.Simulation.tick,
        fps: dt > 0 ? Math.round(1000 / dt) : 0,
        interp: runner.Simulation.interpolationFactor,
      });
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [visible, runner]);

  if (!visible || !runner) return null;

  return (
    <div style={styles.panel}>
      <div>Tick: {info.tick}</div>
      <div>FPS: {info.fps}</div>
      <div>Interp: {info.interp.toFixed(2)}</div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'absolute',
    top: 8,
    right: 8,
    background: 'rgba(0,0,0,0.7)',
    color: '#0f0',
    padding: '8px 12px',
    fontFamily: 'monospace',
    fontSize: 12,
    borderRadius: 4,
    zIndex: 100,
    pointerEvents: 'none',
  },
};
