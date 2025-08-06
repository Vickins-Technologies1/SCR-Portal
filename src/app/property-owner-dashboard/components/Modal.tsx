"use client";

import React from "react";

interface ModalProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  disableClose?: boolean; // Add disableClose as an optional property
}

const Modal: React.FC<ModalProps> = ({ title, isOpen, onClose, children, disableClose = false }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4 sm:px-6">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg sm:max-w-xl md:max-w-2xl p-4 sm:p-6 md:p-8 transform transition-all duration-300 scale-100 animate-in max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-800">{title}</h2>
          {!disableClose && ( // Only render the close button if disableClose is false
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition p-2 sm:p-1"
              aria-label="Close modal"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
};

export default Modal;