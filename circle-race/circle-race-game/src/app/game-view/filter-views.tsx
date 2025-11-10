import {
  FC, forwardRef, ForwardRefExoticComponent, ForwardRefRenderFunction, RefAttributes, useCallback, useEffect, useRef,
  useState
} from 'react';
import { AbstractFilter } from '@lagless/core';
import { useTick } from '@pixi/react';

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
  // All entities which are currently rendered (including those in "destroying" state)
  const liveEntitiesRef = useRef<Set<number>>(new Set());

  // Entities currently in async destroy phase
  const destroyingRef = useRef<Set<number>>(new Set());

  // entity -> ref instance
  const entityRefs = useRef<Map<number, FilterViewRef | null>>(new Map());

  // entity -> token to invalidate stale destroy completions
  const destroyTokenRef = useRef<Map<number, number>>(new Map());
  const destroyTokenCounterRef = useRef(0);

  // Entities for which onCreate was already called
  const createdRef = useRef<Set<number>>(new Set());

  // React state: just a mirror of liveEntitiesRef for rendering
  const [renderedEntities, setRenderedEntities] = useState<number[]>([]);

  // Flag that indicates React state needs to be synced with liveEntitiesRef
  const needsSyncRef = useRef(false);

  // Track mount state to avoid setState after unmount
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
      if (currentToken !== token) {
        // Stale destroy, entity was re-added
        return;
      }

      destroyTokenRef.current.delete(entity);
      destroyingRef.current.delete(entity);

      liveEntitiesRef.current.delete(entity);
      entityRefs.current.delete(entity);
      createdRef.current.delete(entity);

      if (!isMountedRef.current) {
        return;
      }

      // Mark that we need to sync React state on next tick
      needsSyncRef.current = true;
    };

    const maybePromise = ref?.onDestroy?.();

    if (maybePromise && typeof (maybePromise as any).then === 'function') {
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
          // New entity appeared
          live.add(entity);
          needsSyncRef.current = true;
        }

        // Cancel destroy if entity came back
        if (destroying.has(entity)) {
          destroying.delete(entity);
          destroyTokenRef.current.delete(entity);
        }

        // Call onUpdate only for entities that were already alive before this tick
        if (!wasNew) {
          const ref = entityRefs.current.get(entity);
          if (ref) {
            ref.onUpdate();
          }
        }
      }

      // Entities that disappeared from filter start async destroy
      live.forEach((entity) => {
        if (!seen.has(entity) && !destroying.has(entity)) {
          startDestroy(entity);
        }
      });

      // Sync React state with liveEntitiesRef only when something actually changed
      if (needsSyncRef.current && isMountedRef.current) {
        needsSyncRef.current = false;
        setRenderedEntities(Array.from(liveEntitiesRef.current));
      }
    }, [filter, startDestroy])
  );

  // On unmount, trigger onDestroy for all remaining views (best effort, without waiting)
  useEffect(() => {
    return () => {
      for (const [, ref] of entityRefs.current) {
        try {
          ref?.onDestroy?.();
        } catch {
          // Ignore errors on unmount
        }
      }
    };
  }, []);

  console.log(`renderedEntities.length: ${renderedEntities}`);

  return (
    <>
      {renderedEntities.map((entity) => (
        <View
          key={entity}
          entity={entity}
          ref={(instance) => {
            if (instance) {
              entityRefs.current.set(entity, instance);

              // Call onCreate only once per logical entity
              if (!createdRef.current.has(entity)) {
                createdRef.current.add(entity);
                instance.onCreate();
              }
            } else {
              // Ref cleared by React for this entity
              entityRefs.current.delete(entity);
            }
          }}
        />
      ))}
    </>
  );
};
