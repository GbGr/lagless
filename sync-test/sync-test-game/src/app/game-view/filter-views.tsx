import {
  FC,
  forwardRef,
  ForwardRefExoticComponent,
  ForwardRefRenderFunction,
  RefAttributes,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AbstractFilter } from '@lagless/core';
import { useTick } from '@pixi/react';
import { Container } from 'pixi.js';

export interface FilterViewRef {
  onCreate(): void;
  onUpdate(): void;
  onDestroy(): Promise<void> | void;
}

export type FilterViewProps = { entity: number };
export type FilterView = ForwardRefExoticComponent<FilterViewProps & RefAttributes<FilterViewRef>>;

export const filterView = (render: ForwardRefRenderFunction<FilterViewRef, FilterViewProps>) => {
  return forwardRef<FilterViewRef, FilterViewProps>(render);
};

interface FilterViewsProps {
  View: FilterView;
  filter: AbstractFilter;
}

export const FilterViews: FC<FilterViewsProps> = ({ filter, View }) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const viewsContainerRef = useRef<Container>(null!);
  const liveEntitiesRef = useRef<Set<number>>(new Set());
  const destroyingRef = useRef<Set<number>>(new Set());
  const entityRefs = useRef<Map<number, FilterViewRef | null>>(new Map());
  const destroyTokenRef = useRef<Map<number, number>>(new Map());
  const destroyTokenCounterRef = useRef(0);
  const createdRef = useRef<Set<number>>(new Set());
  const [renderedEntities, setRenderedEntities] = useState<number[]>([]);
  const needsSyncRef = useRef(false);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const startDestroy = useCallback((entity: number) => {
    const ref = entityRefs.current.get(entity);
    destroyingRef.current.add(entity);

    const token = ++destroyTokenCounterRef.current;
    destroyTokenRef.current.set(entity, token);

    const finalize = () => {
      const currentToken = destroyTokenRef.current.get(entity);
      if (currentToken !== token) return;

      destroyTokenRef.current.delete(entity);
      destroyingRef.current.delete(entity);
      liveEntitiesRef.current.delete(entity);
      entityRefs.current.delete(entity);
      createdRef.current.delete(entity);

      if (!isMountedRef.current) return;
      needsSyncRef.current = true;
    };

    const maybePromise = ref?.onDestroy?.();

    if (maybePromise && typeof (maybePromise as Promise<void>).then === 'function') {
      (maybePromise as Promise<void>).then(finalize, finalize);
    } else {
      finalize();
    }
  }, []);

  useTick(
    useCallback(() => {
      const live = liveEntitiesRef.current;
      const destroying = destroyingRef.current;
      const seen = new Set<number>();

      for (const entity of filter) {
        seen.add(entity);
        const wasNew = !live.has(entity);
        if (wasNew) {
          live.add(entity);
          needsSyncRef.current = true;
        }

        if (destroying.has(entity)) {
          destroying.delete(entity);
          destroyTokenRef.current.delete(entity);
        }

        if (!wasNew) {
          const ref = entityRefs.current.get(entity);
          if (ref) ref.onUpdate();
        }
      }

      live.forEach((entity) => {
        if (!seen.has(entity) && !destroying.has(entity)) {
          startDestroy(entity);
        }
      });

      if (needsSyncRef.current && isMountedRef.current) {
        needsSyncRef.current = false;
        setRenderedEntities(Array.from(liveEntitiesRef.current));
      }
    }, [filter, startDestroy]),
  );

  useEffect(() => {
    return () => {
      for (const [, ref] of entityRefs.current) {
        try {
          ref?.onDestroy?.();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return (
    <pixiContainer ref={viewsContainerRef}>
      {renderedEntities.map((entity) => (
        <View
          key={entity}
          entity={entity}
          ref={(instance) => {
            if (instance) {
              entityRefs.current.set(entity, instance);
              if (!createdRef.current.has(entity)) {
                createdRef.current.add(entity);
                instance.onCreate();
              }
            } else {
              entityRefs.current.delete(entity);
            }
          }}
        />
      ))}
    </pixiContainer>
  );
};
