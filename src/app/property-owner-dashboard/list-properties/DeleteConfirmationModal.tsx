// src/app/property-owner-dashboard/list-properties/DeleteConfirmationModal.tsx
import React from "react";
import Modal from "../components/Modal";

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export default function DeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
}: DeleteConfirmationModalProps) {
  return (
    <Modal title="Remove Listing" isOpen={isOpen} onClose={onClose}>
      <p className="mb-6 text-slate-700">
        This will remove the public listing. The original property remains.
      </p>
      <div className="flex justify-end gap-3">
        <button
          onClick={onClose}
          className="px-5 py-2 bg-slate-200 rounded-lg hover:bg-slate-300"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          Remove
        </button>
      </div>
    </Modal>
  );
}



