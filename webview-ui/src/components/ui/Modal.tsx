import type { ReactNode } from 'react';

import { Button } from './Button.js';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** z-index for backdrop (modal gets +1). Default 50 */
  zIndex?: number;
  className?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  zIndex = 50,
  className = '',
}: ModalProps) {
  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-xs animate-fadeIn"
        style={{ zIndex }}
        onClick={onClose}
      />
      <div
        className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-bg border-2 border-border shadow-pixel p-3 sm:p-4 w-[95vw] sm:w-[90vw] max-w-2xl max-h-[88vh] overflow-y-auto pixel-scrollbar animate-scaleIn ${className}`}
        style={{ zIndex: zIndex + 1 }}
      >
        <div className="flex items-center justify-between pb-2.5 mb-3 border-b-2 border-border gap-2">
          <span className="text-accent-bright text-base sm:text-lg font-bold truncate">{title}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] font-bold text-sm hover:bg-btn-hover"
            title="Close"
          >
            ✕
          </Button>
        </div>
        {children}
      </div>
    </>
  );
}
