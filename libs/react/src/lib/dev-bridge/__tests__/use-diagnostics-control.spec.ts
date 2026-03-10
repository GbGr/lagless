import { renderHook, act } from '@testing-library/react';
import { useDiagnosticsControl } from '../use-diagnostics-control.js';

let mockIsActive = false;
let mockDiagnosticsValue = false;

vi.mock('../dev-bridge.js', () => ({
  DevBridge: {
    isActive: () => mockIsActive,
    getUrlParams: () =>
      mockIsActive
        ? { instanceId: '0', serverUrl: '', scope: '', autoMatch: false, diagnostics: mockDiagnosticsValue }
        : null,
  },
}));

describe('useDiagnosticsControl', () => {
  beforeEach(() => {
    mockIsActive = false;
    mockDiagnosticsValue = false;
  });

  it('should return true when DevBridge is not active (standalone play)', () => {
    mockIsActive = false;
    const { result } = renderHook(() => useDiagnosticsControl());
    expect(result.current).toBe(true);
  });

  it('should return false by default when in dev-player (no diagnostics param)', () => {
    mockIsActive = true;
    mockDiagnosticsValue = false;
    const { result } = renderHook(() => useDiagnosticsControl());
    expect(result.current).toBe(false);
  });

  it('should return true when diagnostics URL param is true', () => {
    mockIsActive = true;
    mockDiagnosticsValue = true;
    const { result } = renderHook(() => useDiagnosticsControl());
    expect(result.current).toBe(true);
  });

  it('should respond to dev-bridge:set-diagnostics messages', () => {
    mockIsActive = true;
    mockDiagnosticsValue = false;
    const { result } = renderHook(() => useDiagnosticsControl());
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'dev-bridge:set-diagnostics', enabled: true },
        }),
      );
    });

    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'dev-bridge:set-diagnostics', enabled: false },
        }),
      );
    });

    expect(result.current).toBe(false);
  });

  it('should ignore unrelated messages', () => {
    mockIsActive = true;
    mockDiagnosticsValue = false;
    const { result } = renderHook(() => useDiagnosticsControl());

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'dev-bridge:start-match' },
        }),
      );
    });

    expect(result.current).toBe(false);
  });

  it('should clean up message listener on unmount', () => {
    mockIsActive = true;
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useDiagnosticsControl());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('message', expect.any(Function));
    removeSpy.mockRestore();
  });
});
