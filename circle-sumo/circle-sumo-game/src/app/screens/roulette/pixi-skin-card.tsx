import { FC, useMemo, useRef } from 'react';
import { useSkinCard } from '../../components/skin-card/skin-card';
import CARD_COMMON from '../../../assets/textures/card_common.png';
import CARD_RARE from '../../../assets/textures/card_rare.png';
import CARD_LEGENDARY from '../../../assets/textures/card_legendary.png';
import STAR from '../../../assets/textures/star.png';
import { Assets, Sprite, Texture } from 'pixi.js';
import { PlayerView } from '../../game-view/components/player-view';

console.log({ STAR });

const STARS_GAP = 8;
const CARD_SCALE = 0.5;
const STAR_SCALE = 0.5;

interface PixiSkinCardProps {
  skinId: number;
}

export const PixiSkinCard: FC<PixiSkinCardProps> = ({ skinId }) => {
  const { rarity, stars } = useSkinCard(skinId);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const bodySpriteRef = useRef<Sprite>(null!);

  const starTexture = useMemo(() => Assets.get(STAR) as Texture, []);
  const cardBgTexture = useMemo(() => {
    switch (rarity) {
      case 'common':
        return Assets.get(CARD_COMMON) as Texture;
      case 'rare':
        return Assets.get(CARD_RARE) as Texture;
      case 'legendary':
        return Assets.get(CARD_LEGENDARY) as Texture;
      default:
        return Texture.WHITE;
    }
  }, [rarity]);

  // Render sizes with scale applied
  const cardWidth = cardBgTexture.width * CARD_SCALE;
  const starWidth = starTexture.width * STAR_SCALE;

  const starsWidth =
    stars.length > 0
      ? starWidth * stars.length + STARS_GAP * (stars.length - 1)
      : 0;

  // X position of the first star to center the whole row on the card
  const starsStartX = (cardWidth - starsWidth) / 2;

  return (
    <pixiContainer x={-cardBgTexture.width * 0.25}>
      <pixiSprite anchor={0} scale={CARD_SCALE} texture={cardBgTexture} />
      <pixiBitmapText
        x={cardBgTexture.width * 0.25}
        y={36}
        anchor={0.5}
        text={rarity.slice(0, 1).toUpperCase() + rarity.slice(1)}
        style={{
          fill: 0xffffff,
          fontSize: 32,
          fontFamily: '"Alegreya Sans SC"',
        }}
      />
      <PlayerView
        unsafeX={cardBgTexture.width * 0.25}
        unsafeY={cardBgTexture.height * 0.25}
        unsafeScale={2.2}
        unsafeRotation={-Math.PI / 2}
        bodySpriteRef={bodySpriteRef}
        skinId={skinId}
      />
      {stars.map((i, index) => (
        <pixiSprite
          key={i}
          x={starsStartX + index * (starWidth + STARS_GAP)}
          y={282}
          scale={STAR_SCALE}
          texture={starTexture}
        />
      ))}
    </pixiContainer>
  );
};
