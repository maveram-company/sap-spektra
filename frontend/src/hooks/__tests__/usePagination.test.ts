import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import usePagination from '../usePagination';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeItems(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('usePagination – initial state', () => {
  it('starts on page 1', () => {
    const { result } = renderHook(() => usePagination(makeItems(50)));
    expect(result.current.page).toBe(1);
  });

  it('uses default pageSize of 20', () => {
    const items = makeItems(50);
    const { result } = renderHook(() => usePagination(items));

    expect(result.current.items).toHaveLength(20);
    expect(result.current.items[0]).toBe(1);
    expect(result.current.items[19]).toBe(20);
  });

  it('calculates totalPages correctly', () => {
    const { result } = renderHook(() => usePagination(makeItems(50)));
    expect(result.current.totalPages).toBe(3); // ceil(50/20)
  });

  it('exposes total item count', () => {
    const items = makeItems(42);
    const { result } = renderHook(() => usePagination(items));
    expect(result.current.total).toBe(42);
  });

  it('hasNext is true on first page when multiple pages exist', () => {
    const { result } = renderHook(() => usePagination(makeItems(25)));
    expect(result.current.hasNext).toBe(true);
    expect(result.current.hasPrev).toBe(false);
  });
});

describe('usePagination – custom page size', () => {
  it('respects custom pageSize', () => {
    const { result } = renderHook(() => usePagination(makeItems(10), 3));
    expect(result.current.items).toHaveLength(3);
    expect(result.current.totalPages).toBe(4); // ceil(10/3)
  });

  it('returns remaining items on last page when not evenly divisible', () => {
    const { result } = renderHook(() => usePagination(makeItems(10), 3));

    // Navigate to last page (page 4)
    act(() => result.current.setPage(4));

    expect(result.current.items).toHaveLength(1); // 10 - 9 = 1 item
    expect(result.current.items[0]).toBe(10);
  });
});

describe('usePagination – navigation', () => {
  it('setPage navigates to specified page', () => {
    const { result } = renderHook(() => usePagination(makeItems(60)));

    act(() => result.current.setPage(2));

    expect(result.current.page).toBe(2);
    expect(result.current.items[0]).toBe(21);
    expect(result.current.items).toHaveLength(20);
  });

  it('nextPage increments page by 1', () => {
    const { result } = renderHook(() => usePagination(makeItems(60)));

    act(() => result.current.nextPage());
    expect(result.current.page).toBe(2);

    act(() => result.current.nextPage());
    expect(result.current.page).toBe(3);
  });

  it('prevPage decrements page by 1', () => {
    const { result } = renderHook(() => usePagination(makeItems(60)));

    act(() => result.current.setPage(3));
    act(() => result.current.prevPage());
    expect(result.current.page).toBe(2);
  });

  it('nextPage does not go past totalPages', () => {
    const { result } = renderHook(() => usePagination(makeItems(40)));
    // totalPages = 2

    act(() => result.current.setPage(2));
    act(() => result.current.nextPage());

    expect(result.current.page).toBe(2);
    expect(result.current.hasNext).toBe(false);
  });

  it('prevPage does not go below 1', () => {
    const { result } = renderHook(() => usePagination(makeItems(40)));

    act(() => result.current.prevPage());
    expect(result.current.page).toBe(1);
    expect(result.current.hasPrev).toBe(false);
  });
});

describe('usePagination – hasNext / hasPrev', () => {
  it('hasNext=false and hasPrev=false when all items fit on one page', () => {
    const { result } = renderHook(() => usePagination(makeItems(5)));
    expect(result.current.hasNext).toBe(false);
    expect(result.current.hasPrev).toBe(false);
    expect(result.current.totalPages).toBe(1);
  });

  it('hasPrev=true when on page 2+', () => {
    const { result } = renderHook(() => usePagination(makeItems(50)));
    act(() => result.current.setPage(2));
    expect(result.current.hasPrev).toBe(true);
  });

  it('hasNext=false on last page', () => {
    const { result } = renderHook(() => usePagination(makeItems(50)));
    act(() => result.current.setPage(3));
    expect(result.current.hasNext).toBe(false);
  });
});

describe('usePagination – empty items', () => {
  it('handles empty array gracefully', () => {
    const { result } = renderHook(() => usePagination([]));

    expect(result.current.items).toEqual([]);
    expect(result.current.page).toBe(1);
    expect(result.current.totalPages).toBe(0);
    expect(result.current.total).toBe(0);
    expect(result.current.hasNext).toBe(false);
    expect(result.current.hasPrev).toBe(false);
  });

  it('handles single item', () => {
    const { result } = renderHook(() => usePagination([42]));

    expect(result.current.items).toEqual([42]);
    expect(result.current.totalPages).toBe(1);
    expect(result.current.hasNext).toBe(false);
  });
});

describe('usePagination – reactivity', () => {
  it('re-paginates when items change', () => {
    const { result, rerender } = renderHook(
      ({ items }) => usePagination(items, 5),
      { initialProps: { items: makeItems(10) } },
    );

    expect(result.current.totalPages).toBe(2);

    rerender({ items: makeItems(20) });
    expect(result.current.totalPages).toBe(4);
    expect(result.current.total).toBe(20);
  });
});
