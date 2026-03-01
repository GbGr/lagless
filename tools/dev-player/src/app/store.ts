import type { DevPlayerAction, DevPlayerState, InstanceState } from './types';
import { PRESETS } from './types';

export function createInitialState(): DevPlayerState {
  return {
    preset: PRESETS[0],
    instanceCount: 2,
    running: false,
    sessionScope: '',
    instances: new Map(),
  };
}

export function reducer(state: DevPlayerState, action: DevPlayerAction): DevPlayerState {
  switch (action.type) {
    case 'SET_PRESET':
      return { ...state, preset: action.preset };

    case 'SET_COUNT':
      return { ...state, instanceCount: Math.max(1, Math.min(8, action.count)) };

    case 'START': {
      const sessionScope = state.preset.scope;
      const instances = new Map<string, InstanceState>();
      for (let i = 0; i < state.instanceCount; i++) {
        const id = String(i);
        instances.set(id, {
          id,
          index: i,
          matchState: 'idle',
          ready: false,
          stats: null,
        });
      }
      return { ...state, running: true, sessionScope, instances };
    }

    case 'STOP':
      return { ...state, running: false, sessionScope: '', instances: new Map() };

    case 'INSTANCE_READY': {
      const inst = state.instances.get(action.instanceId);
      if (!inst) return state;
      const next = new Map(state.instances);
      next.set(action.instanceId, { ...inst, ready: true });
      return { ...state, instances: next };
    }

    case 'INSTANCE_STATS': {
      const inst = state.instances.get(action.instanceId);
      if (!inst) return state;
      const next = new Map(state.instances);
      next.set(action.instanceId, {
        ...inst,
        stats: action.stats,
        matchState: inst.matchState === 'connecting' || inst.matchState === 'queuing' ? 'playing' : inst.matchState,
      });
      return { ...state, instances: next };
    }

    case 'INSTANCE_MATCH_STATE': {
      const inst = state.instances.get(action.instanceId);
      if (!inst) return state;
      const next = new Map(state.instances);
      next.set(action.instanceId, { ...inst, matchState: action.state, error: action.error });
      return { ...state, instances: next };
    }

    case 'TICK':
      return state; // force re-render for staleness checks

    default:
      return state;
  }
}
