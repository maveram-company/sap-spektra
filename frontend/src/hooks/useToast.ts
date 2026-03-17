import { useState, useRef, useCallback, useEffect } from 'react';

interface Toast {
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

export function useToast(duration = 4000) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    clearTimeout(timerRef.current);
    setToast({ message, type });
    timerRef.current = setTimeout(() => setToast(null), duration);
  }, [duration]);

  const dismissToast = useCallback(() => {
    clearTimeout(timerRef.current);
    setToast(null);
  }, []);

  useEffect(() => {
    return () => { clearTimeout(timerRef.current); };
  }, []);

  return { toast, showToast, dismissToast };
}
