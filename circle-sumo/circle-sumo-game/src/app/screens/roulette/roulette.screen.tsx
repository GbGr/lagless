// roulette.screen.tsx
import './roulette.screen.scss';
import { FC, useMemo, useRef, useCallback, PointerEvent, useState, useEffect } from 'react';
import { Balance } from '../../components/balance/balance';
import { getSpinCost, PLAYER_PRESETS } from '@lagless/circle-sumo-simulation';
import { Application } from '@pixi/react';
import { PixiSkinCard } from './pixi-skin-card';
import { useVirtualCarousel } from './use-virtual-carousel';
import { Button } from '../../components/button/button';
import CoinSvg from '../../../assets/svg/coin.svg?react';
import { invalidatePlayerSkins, usePlayerSkinsQuery } from '../../queries/player-skins.query';
import { api, updatePlayer } from '@lagless/react';
import { launchConfetti } from '../../hooks/confetti';
import { Dots } from '../../components/dots';
import { LoadingScreen } from '../../loading-screen';
import { useNavigate } from 'react-router-dom';

const CARD_WIDTH = 250;

export const RouletteScreen: FC = () => {
  const { data } = usePlayerSkinsQuery();

  const skins = useMemo(() => {
    return shuffleInPlace(Object.keys(PLAYER_PRESETS).map(Number));
  }, []);

  return data && skins.length ? (
    <RouletteScreenInner skins={skins} ownedSkinsCount={data.length} />
  ) : <LoadingScreen />;
};

const RouletteScreenInner: FC<{ skins: number[], ownedSkinsCount: number }> = ({ skins, ownedSkinsCount }) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const carouselRef = useRef<HTMLDivElement>(null!);
  const [centerX, setCenterX] = useState(window.innerWidth / 2);
  const [ isBusy, setIsBusy ] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const updateCenter = () => {
      setCenterX(window.innerWidth / 2);
    };

    updateCenter();
    window.addEventListener('resize', updateCenter);
    return () => window.removeEventListener('resize', updateCenter);
  }, []);

  const { offset, visibleIndices, handleDragStart, handleDragMove, handleDragEnd, slideTo } =
    useVirtualCarousel({
      itemsCount: skins.length,
      cardWidth: CARD_WIDTH,
      onIndexChange: (idx) => {
        console.log('Current index:', idx);
      },
    });

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      e.preventDefault();
      handleDragStart(e.clientX);
    },
    [handleDragStart]
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      handleDragMove(e.clientX);
    },
    [handleDragMove]
  );

  const onPointerUp = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  const performSpin = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const { data: skinId } = await api.put<number>('sumo/player/spinForSkin');
      const skinIndex = skins.indexOf(skinId);
      if (skinIndex === -1) {
        throw new Error(`Skin ${skinId} not found in skins list`);
      }
      updatePlayer().catch(console.error);
      invalidatePlayerSkins().catch(console.error);
      slideTo(skinIndex, () => launchConfetti());
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="screen roulette-screen">
      <Balance />
      <div className="roulette-screen__roulette">
        <div
          className="roulette-screen__carousel"
          ref={carouselRef}
          onPointerUp={onPointerUp}
          onPointerMove={onPointerMove}
          onPointerDown={onPointerDown}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
          style={{ touchAction: 'none', cursor: 'grab' }}
        >
          <Application
            autoDensity
            onInit={(app) => {
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-expect-error
              window['__PIXI_APP__'] = app;
            }}
            resizeTo={carouselRef}
            resolution={window.devicePixelRatio || 1}
            backgroundAlpha={0}
          >
            {/*
              Контейнер располагается ровно в центре экрана.
              Центральная карточка (offset=0) будет точно в центре,
              если в PixiSkinCard используется anchor={0.5}
            */}
            <pixiContainer x={centerX} y={0} eventMode="static">
              {/* prevPrev: -2 карточки влево */}
              <pixiContainer x={-CARD_WIDTH * 2 + offset}>
                <PixiSkinCard skinId={skins[visibleIndices.prevPrev]} />
              </pixiContainer>

              {/* prev: -1 карточка влево */}
              <pixiContainer x={-CARD_WIDTH + offset}>
                <PixiSkinCard skinId={skins[visibleIndices.prev]} />
              </pixiContainer>

              {/* current: точно в центре контейнера (центр экрана) */}
              <pixiContainer x={offset}>
                <PixiSkinCard skinId={skins[visibleIndices.current]} />
              </pixiContainer>

              {/* next: +1 карточка вправо */}
              <pixiContainer x={CARD_WIDTH + offset}>
                <PixiSkinCard skinId={skins[visibleIndices.next]} />
              </pixiContainer>

              {/* nextNext: +2 карточки вправо */}
              <pixiContainer x={CARD_WIDTH * 2 + offset}>
                <PixiSkinCard skinId={skins[visibleIndices.nextNext]} />
              </pixiContainer>
            </pixiContainer>
          </Application>
        </div>
      </div>
      <div className="roulette-screen__bottom">
        <div className="roulette-screen__cost">
          <span>Cost:&nbsp;&nbsp;{getSpinCost(ownedSkinsCount)}</span>
          <CoinSvg className="roulette-screen__coin" />
        </div>
        <Button mode="accent" size="large" onClick={performSpin}>
          {isBusy ? <Dots /> : <span>Spin</span>}
        </Button>
        <Button mode="text" size="medium" onClick={() => navigate(-1)}>
          Back
        </Button>
      </div>
    </div>
  );
};

function shuffleInPlace<T>(array: T[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
