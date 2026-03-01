import { FC, useRef } from 'react';
import { RunnerProvider } from './runner-provider';
import { BabylonScene } from './babylon-scene';
import { DebugPanelWrapper } from './debug-panel-wrapper';

export const GameView: FC = () => {
  const cameraYawRef = useRef<number>(0);

  return (
    <RunnerProvider cameraYawRef={cameraYawRef}>
      <div style={styles.wrapper}>
        <BabylonScene cameraYawRef={cameraYawRef} />
        <DebugPanelWrapper />
      </div>
    </RunnerProvider>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
};
