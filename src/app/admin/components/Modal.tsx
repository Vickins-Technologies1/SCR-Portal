"use client";

import React from "react";

interface ModalProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ title, isOpen, onClose, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 px-3 sm:px-4">
      <div className="modal-panel w-full max-w-[92vw] sm:max-w-lg max-h-[85vh] sm:max-h-[90vh] overflow-y-auto">
        <div className="modal-header flex justify-between items-center px-4 sm:px-5 py-3">
          <h2 className="text-sm sm:text-base font-semibold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            className="modal-close rounded-full p-1.5"
            aria-label="Close modal"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="modal-body modal-stagger text-sm sm:text-base">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
