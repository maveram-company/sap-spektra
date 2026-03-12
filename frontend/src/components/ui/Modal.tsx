import { useEffect, useRef, useId } from 'react';
import { X } from 'lucide-react';

export default function Modal({ isOpen, onClose, title, description, children, size = 'md', footer }) {
  const titleId = useId();
  const descId = useId();
  const previousFocusRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
      document.body.style.overflow = 'hidden';
      const handleEsc = (e) => e.key === 'Escape' && onClose();
      window.addEventListener('keydown', handleEsc);
      // Focus the dialog container
      requestAnimationFrame(() => dialogRef.current?.focus());
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleEsc);
        previousFocusRef.current?.focus();
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`relative bg-surface rounded-2xl shadow-2xl w-full ${sizes[size]} animate-fade-in border border-border focus:outline-none`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-text-primary">{title}</h2>
            {description && <p id={descId} className="text-sm text-text-secondary mt-0.5">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-lg hover:bg-surface-tertiary text-text-tertiary hover:text-text-primary transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-border flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}
