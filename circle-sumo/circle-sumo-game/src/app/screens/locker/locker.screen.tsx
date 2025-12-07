import './locker.screen.scss';
import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { usePlayerSkinsQuery } from '../../queries/player-skins.query';
import { LoadingScreen } from '../../loading-screen';
import { api, updatePlayer, usePlayer } from '@lagless/react';
import { Balance } from '../../components/balance/balance';
import { Application } from '@pixi/react';
import { Button } from '../../components/button/button';
import { PixiSkinCard } from '../roulette/pixi-skin-card';
import * as PIXI from 'pixi.js';
import { useNavigate } from 'react-router-dom';
import { SumoPlayerData } from '@lagless/circle-sumo-simulation';
import { FederatedPointerEvent } from 'pixi.js';

export const LockerScreen = () => {
  const { data } = usePlayerSkinsQuery();

  return !data ? <LoadingScreen /> : (
    <LockerScreenInner ownedSkins={data} />
  );
};

const LockerScreenInner: FC<{ ownedSkins: number[] }> = ({ ownedSkins }) => {
  const player = usePlayer();
  const navigate = useNavigate();
  const [ isBusy, setIsBusy ] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<PIXI.Container>(null);
  const scrollStateRef = useRef({
    scrollY: 0,
    isDragging: false,
    startY: 0,
    lastY: 0,
    velocity: 0,
    lastTime: 0,
  });

  const cardConfig = useCardConfig();
  const { cardWidth, cardHeight, gap } = cardConfig;

  // Расчет позиций карточек в сетке (3 колонки) с gap по краям
  const getCardPosition = (index: number) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    return {
      x: gap + col * (cardWidth + gap) + cardWidth/2,
      y: gap + row * (cardHeight + gap),
    };
  };

  // Расчет максимальной высоты контента
  const totalRows = Math.ceil(ownedSkins.length / 3);
  const totalHeight = totalRows * (cardHeight + gap) + gap;
  const maxScroll = Math.max(0, totalHeight - (listRef.current?.clientHeight || 0));

  // Применение скролла с ограничениями
  const applyScroll = useCallback((targetY: number) => {
    const clampedY = Math.max(-maxScroll, Math.min(0, targetY));
    scrollStateRef.current.scrollY = clampedY;
    if (contentRef.current) {
      contentRef.current.y = clampedY;
    }
  }, [maxScroll]);

  useEffect(() => {
    const listElement = listRef.current;
    if (!listElement) return;

    // Touch события
    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      scrollStateRef.current.isDragging = true;
      scrollStateRef.current.startY = touch.clientY;
      scrollStateRef.current.lastY = touch.clientY;
      scrollStateRef.current.velocity = 0;
      scrollStateRef.current.lastTime = Date.now();
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!scrollStateRef.current.isDragging) return;
      e.preventDefault();

      const touch = e.touches[0];
      const currentTime = Date.now();
      const deltaY = touch.clientY - scrollStateRef.current.lastY;
      const deltaTime = currentTime - scrollStateRef.current.lastTime;

      if (deltaTime > 0) {
        scrollStateRef.current.velocity = deltaY / deltaTime;
      }

      const newScrollY = scrollStateRef.current.scrollY + deltaY;
      applyScroll(newScrollY);

      scrollStateRef.current.lastY = touch.clientY;
      scrollStateRef.current.lastTime = currentTime;
    };

    const handleTouchEnd = () => {
      scrollStateRef.current.isDragging = false;

      // Инерционная прокрутка
      const animateInertia = () => {
        if (Math.abs(scrollStateRef.current.velocity) < 0.1) return;

        scrollStateRef.current.velocity *= 0.95; // Затухание
        const newScrollY = scrollStateRef.current.scrollY + scrollStateRef.current.velocity * 16;
        applyScroll(newScrollY);

        requestAnimationFrame(animateInertia);
      };

      if (Math.abs(scrollStateRef.current.velocity) > 0.1) {
        animateInertia();
      }
    };

    // Mouse события (для десктопа)
    const handleMouseDown = (e: MouseEvent) => {
      scrollStateRef.current.isDragging = true;
      scrollStateRef.current.startY = e.clientY;
      scrollStateRef.current.lastY = e.clientY;
      scrollStateRef.current.velocity = 0;
      scrollStateRef.current.lastTime = Date.now();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!scrollStateRef.current.isDragging) return;

      const currentTime = Date.now();
      const deltaY = e.clientY - scrollStateRef.current.lastY;
      const deltaTime = currentTime - scrollStateRef.current.lastTime;

      if (deltaTime > 0) {
        scrollStateRef.current.velocity = deltaY / deltaTime;
      }

      const newScrollY = scrollStateRef.current.scrollY + deltaY;
      applyScroll(newScrollY);

      scrollStateRef.current.lastY = e.clientY;
      scrollStateRef.current.lastTime = currentTime;
    };

    const handleMouseUp = () => {
      scrollStateRef.current.isDragging = false;

      const animateInertia = () => {
        if (Math.abs(scrollStateRef.current.velocity) < 0.1) return;

        scrollStateRef.current.velocity *= 0.95;
        const newScrollY = scrollStateRef.current.scrollY + scrollStateRef.current.velocity * 16;
        applyScroll(newScrollY);

        requestAnimationFrame(animateInertia);
      };

      if (Math.abs(scrollStateRef.current.velocity) > 0.1) {
        animateInertia();
      }
    };

    // Wheel события
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const newScrollY = scrollStateRef.current.scrollY - e.deltaY;
      applyScroll(newScrollY);
    };

    listElement.addEventListener('touchstart', handleTouchStart, { passive: false });
    listElement.addEventListener('touchmove', handleTouchMove, { passive: false });
    listElement.addEventListener('touchend', handleTouchEnd);
    listElement.addEventListener('mousedown', handleMouseDown);
    listElement.addEventListener('wheel', handleWheel, { passive: false });

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      listElement.removeEventListener('touchstart', handleTouchStart);
      listElement.removeEventListener('touchmove', handleTouchMove);
      listElement.removeEventListener('touchend', handleTouchEnd);
      listElement.removeEventListener('mousedown', handleMouseDown);
      listElement.removeEventListener('wheel', handleWheel);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [applyScroll]);

  const onSelectItem = useCallback(async (skinId: number) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await api.put(`sumo/player/equipSkin/${skinId}`);
      await updatePlayer();
    } finally {
      setIsBusy(false);
    }
  }, [isBusy]);

  return (
    <div className="screen locker-screen">
      <Balance />
      <div className="locker-screen__title">Your Skins</div>
      <div className="locker-screen__list" ref={listRef} style={{ opacity: isBusy ? 0.5 : 1 }}>
        <Application
          autoDensity
          onInit={(app) => {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            window['__PIXI_APP__'] = app;
          }}
          resizeTo={listRef}
          resolution={window.devicePixelRatio || 1}
          backgroundAlpha={0}
        >
          <pixiContainer ref={contentRef}>
            {ownedSkins.map((skinId, index) => {
              const position = getCardPosition(index);
              return (
                <pixiContainer
                  key={skinId}
                  x={position.x}
                  y={position.y}
                  eventMode="static"
                  onPointerUp={(e: FederatedPointerEvent) => {
                    const diff = Math.abs(scrollStateRef.current.startY - e.clientY);
                    if (diff > 10) return;
                    onSelectItem(skinId).catch(console.error);
                  }}
                >
                  <pixiContainer scale={cardConfig.scaleFactor}>
                    <PixiSkinCard skinId={skinId} />
                    {(player.data as SumoPlayerData).selectedSkinId === skinId && (
                      <pixiGraphics
                        x={-237.5 / 2}
                        draw={(g) => {
                          g.clear();
                          g.roundRect(0, 0, 237.5, 342, 16);
                          g.stroke({
                            width: 12,
                            color: 0x00ff00,
                          });
                        }}
                      />
                    )}
                  </pixiContainer>
                </pixiContainer>
              );
            })}
          </pixiContainer>
        </Application>
      </div>
      <div className="locker-screen__actions">
        <Button mode='secondary' size='medium' onClick={() => navigate('/roulette')}>Get more skins</Button>
        <Button mode="text" size="medium" onClick={() => navigate(-1)}>Back</Button>
      </div>
    </div>
  );
}

const useCardConfig = () => {
  const calcCardSize = useCallback(() => {
    const gap = window.innerWidth / 24;
    // Формула: width = gap + card + gap + card + gap + card + gap
    // width = 4*gap + 3*card
    const cardWidth = (window.innerWidth - 4 * gap) / 3;
    const scaleFactor = cardWidth / 237.5;
    const cardHeight = cardWidth * 1.44;
    return { cardWidth, cardHeight, gap, scaleFactor };
  }, []);
  const [ config, setConfig ] = useState(calcCardSize());

  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      setConfig(calcCardSize());
    });
    resizeObserver.observe(document.body);
    return () => resizeObserver.disconnect();

  }, [calcCardSize]);

  return config;
};
