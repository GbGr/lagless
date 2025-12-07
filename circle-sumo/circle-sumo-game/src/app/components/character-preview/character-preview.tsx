import './character-preview.scss';
import { FC, useRef } from 'react';
import { Application } from '@pixi/react';
import { PlayerView } from '../../game-view/components/player-view';
import { Sprite } from 'pixi.js';

interface CharacterPreviewProps {
  skinId: number;
  scale?: number;
  x?: number;
  y?: number;
}
export const CharacterPreview: FC<CharacterPreviewProps> = ({
  skinId,
  scale = 1.5,
  x = 64,
  y = 64,
}) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const bodySpriteRef = useRef<Sprite>(null!);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const characterPreviewRef = useRef<HTMLDivElement>(null!);

  return (
    <div className="character-preview" ref={characterPreviewRef}>
      {/*<CharacterPreviewBody color={"#F8C89B"} className="character-preview__part character-preview__part_body" />*/}
      {/*<CharacterPreviewJams color={"#FF0000"} className="character-preview__part character-preview__part_jams" />*/}
      {/*<CharacterPreviewEyes className="character-preview__part character-preview__part_eyes" />*/}
      <Application
        autoDensity
        onInit={(app) => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          window['__PIXI_APP__'] = app;
        }}
        resizeTo={characterPreviewRef}
        resolution={window.devicePixelRatio || 1}
        backgroundAlpha={0}
      >
        <PlayerView
          unsafeX={x}
          unsafeY={y}
          skinId={skinId}
          unsafeScale={scale}
          unsafeRotation={-Math.PI / 2}
          bodySpriteRef={bodySpriteRef}
        />
      </Application>
    </div>
  );
};
