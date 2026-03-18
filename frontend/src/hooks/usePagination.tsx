import { useState, useMemo } from 'react';

export default function usePagination<T>(items: T[], pageSize = 20) {
  const [page, setPage] = useState(1);

  const totalPages = Math.ceil(items.length / pageSize);
  const paginatedItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize]
  );

  return {
    items: paginatedItems,
    page,
    totalPages,
    total: items.length,
    setPage,
    nextPage: () => setPage(p => Math.min(p + 1, totalPages)),
    prevPage: () => setPage(p => Math.max(p - 1, 1)),
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}
