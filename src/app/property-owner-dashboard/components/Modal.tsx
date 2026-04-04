"use client";

import React, { useEffect } from "react";

interface ModalProps {
  children: React.ReactNode;
  title: string;
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  disableClose?: boolean;
}

export default function Modal({
  children,
  title,
  isOpen,
  onClose,
  className = "",
  disableClose = false,
}: ModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !disableClose) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose, disableClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop animate-fade-in px-3 sm:px-4 overflow-y-auto"
      onClick={disableClose ? undefined : onClose}
    >
      <div
        className={`modal-panel w-full max-w-[94vw] sm:max-w-lg lg:max-w-5xl mx-auto max-h-[85vh] sm:max-h-[90vh] overflow-y-auto text-foreground ${className}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="modal-title"
        aria-modal="true"
      >
        {/* Header */}
        <div className="modal-header flex items-center justify-between px-4 sm:px-5 py-3">
          <h2 id="modal-title" className="text-base sm:text-lg font-semibold text-foreground">
            {title}
          </h2>
          {!disableClose && (
            <button
              onClick={onClose}
              className="modal-close rounded-full p-1.5"
              aria-label="Close modal"
            >
              <svg
                className="h-5 w-5 sm:h-6 sm:w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Content */}
        <div className="modal-body modal-stagger text-sm sm:text-base">{children}</div>
      </div>
    </div>
  );
}



