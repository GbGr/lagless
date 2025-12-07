// use-virtual-carousel.ts
import { useState, useCallback, useRef, useEffect } from 'react';

interface UseVirtualCarouselProps {
  itemsCount: number;
  cardWidth: number;
  onIndexChange?: (index: number) => void;
}

interface UseVirtualCarouselReturn {
  currentIndex: number;
  offset: number;
  visibleIndices: {
    prevPrev: number;
    prev: number;
    current: number;
    next: number;
    nextNext: number;
  };
  handleDragStart: (x: number) => void;
  handleDragMove: (x: number) => void;
  handleDragEnd: () => void;
  slideTo: (targetIdx: number, callback?: () => void) => void;
}

export const useVirtualCarousel = ({
  itemsCount,
  cardWidth,
  onIndexChange,
}: UseVirtualCarouselProps): UseVirtualCarouselReturn => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const dragStartX = useRef(0);
  const isDragging = useRef(false);
  const animationFrameRef = useRef<number | null>(null);

  // Получить 5 видимых индексов (по 2 с каждой стороны)
  const getVisibleIndices = useCallback(
    (centerIdx: number) => {
      const total = itemsCount;
      return {
        prevPrev: ((centerIdx - 2 + total) % total + total) % total,
        prev: ((centerIdx - 1 + total) % total + total) % total,
        current: centerIdx,
        next: (centerIdx + 1) % total,
        nextNext: (centerIdx + 2) % total,
      };
    },
    [itemsCount]
  );

  const visibleIndices = getVisibleIndices(currentIndex);

  // Анимация offset для drag
  const animateOffset = useCallback(
    (targetOffset: number, duration: number, onComplete?: () => void) => {
      const startOffset = offset;
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Easing: easeOutCubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const currentOffset = startOffset + (targetOffset - startOffset) * eased;

        setOffset(currentOffset);

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(animate);
        } else {
          setOffset(targetOffset);
          onComplete?.();
        }
      };

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    },
    [offset]
  );

  // Плавная анимация slideTo с бесконечной прокруткой
  const slideTo = useCallback(
    (targetIdx: number, callback?: () => void) => {
      if (isAnimating) return;

      const total = itemsCount;
      const normalizedTarget = ((targetIdx % total) + total) % total;

      // Вычислить кратчайший путь
      let diff = normalizedTarget - currentIndex;

      if (Math.abs(diff) > total / 2) {
        diff = diff > 0 ? diff - total : diff + total;
      }

      if (diff === 0) return;

      const steps = Math.abs(diff);
      const direction = diff > 0 ? -1 : 1;

      setIsAnimating(true);

      // Длительность зависит от расстояния
      // ~100ms на карточку, минимум 400ms, максимум 1500ms
      const baseDuration = Math.min(Math.max(steps * 100, 400), 10_000);

      const startTime = Date.now();
      let currentIdx = currentIndex;
      let currentOff = 0;
      let traveledDistance = 0;
      const totalDistance = steps * cardWidth;

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / baseDuration, 1);

        // Easing: easeInOutCubic для плавного разгона и торможения
        const eased =
          progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        // Целевое пройденное расстояние
        const targetTraveledDistance = totalDistance * eased;
        const deltaDistance = targetTraveledDistance - traveledDistance;

        // Обновляем offset
        currentOff += deltaDistance * direction;
        traveledDistance = targetTraveledDistance;

        // Если offset вышел за пределы cardWidth, сдвигаем currentIndex
        while (Math.abs(currentOff) >= cardWidth) {
          if (currentOff > 0) {
            currentIdx = ((currentIdx - 1 + total) % total + total) % total;
            currentOff -= cardWidth;
          } else {
            currentIdx = (currentIdx + 1) % total;
            currentOff += cardWidth;
          }
          setCurrentIndex(currentIdx);
          onIndexChange?.(currentIdx);
        }

        setOffset(currentOff);

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(animate);
        } else {
          // Финализация - убеждаемся что достигли целевого индекса
          setCurrentIndex(normalizedTarget);
          setOffset(0);
          setIsAnimating(false);
          onIndexChange?.(normalizedTarget);
          callback?.();
        }
      };

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    },
    [currentIndex, itemsCount, cardWidth, isAnimating, onIndexChange]
  );

  // Drag handlers
  const handleDragStart = useCallback(
    (x: number) => {
      if (isAnimating) return;
      isDragging.current = true;
      dragStartX.current = x;
    },
    [isAnimating]
  );

  const handleDragMove = useCallback((x: number) => {
    if (!isDragging.current) return;
    const deltaX = x - dragStartX.current;
    setOffset(deltaX);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;

    const threshold = cardWidth / 3;

    if (Math.abs(offset) > threshold) {
      const direction = offset > 0 ? -1 : 1;

      animateOffset(-direction * cardWidth, 300, () => {
        setCurrentIndex((prev) => {
          const total = itemsCount;
          const newIndex = ((prev + direction + total) % total + total) % total;
          onIndexChange?.(newIndex);
          return newIndex;
        });
        setOffset(0);
      });
    } else {
      // Вернуться к текущей позиции
      animateOffset(0, 200);
    }
  }, [offset, cardWidth, itemsCount, animateOffset, onIndexChange]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return {
    currentIndex,
    offset,
    visibleIndices,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    slideTo,
  };
};
