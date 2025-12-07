import { isDynamicGuard, isSolidGuard, isStaticGuard, PLAYER_PRESETS } from '@lagless/circle-sumo-simulation';
import './skin-card.scss';
import { FC, useMemo } from 'react';
import StarSvg from '../../../assets/svg/star.svg?react';
import { CharacterPreview } from '../character-preview/character-preview';

export const useSkinCard = (skinId: number) => {
  const preset = useMemo(() => PLAYER_PRESETS[skinId], [skinId]);
  const rarity = useMemo(() => {
    if (isSolidGuard(preset)) {
      return 'common';
    } else if (isStaticGuard(preset)) {
      return 'rare';
    } else if (isDynamicGuard(preset)) {
      return 'legendary';
    } else {
      return 'undefined';
    }
  }, [preset]);
  const stars = useMemo(() => {
    switch (rarity) {
      case 'common':
        return Array.from({ length: 1 }, (_, i) => i);
      case 'rare':
        return Array.from({ length: 2 }, (_, i) => i);
      case 'legendary':
        return Array.from({ length: 3 }, (_, i) => i);
      default:
        return [];
    }
  }, [rarity]);

  return { rarity, stars } as const;
};

interface SkinCardProps {
  skinId: number;
}
export const SkinCard: FC<SkinCardProps> = ({ skinId }) => {
  const { rarity, stars } = useSkinCard(skinId);

  return (
    <div className={`skin-card skin-card_${rarity}`}>
      <div className="skin-card__title">{rarity}</div>
      <div className="skin-card__preview">
        <CharacterPreview skinId={skinId} />
      </div>
      <div className="skin-card__stars">
        {stars.map((i) => (
          <StarSvg key={i} />
        ))}
      </div>
    </div>
  );
};
