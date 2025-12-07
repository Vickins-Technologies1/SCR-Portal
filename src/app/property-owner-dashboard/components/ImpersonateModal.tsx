// src/app/property-owner-dashboard/components/ImpersonateModal.tsx
import Modal from "../components/Modal";
import { LogIn, AlertTriangle } from "lucide-react";

interface ImpersonateModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantName: string;
  onConfirm: () => Promise<void>;
  isLoading: boolean;
}

export default function ImpersonateModal({
  isOpen,
  onClose,
  tenantName,
  onConfirm,
  isLoading,
}: ImpersonateModalProps) {
  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Impersonate Tenant">
      <div className="space-y-6">
        <div className="flex items-center gap-4 bg-amber-50 border border-amber-300 rounded-xl p-5">
          <AlertTriangle className="h-10 w-10 text-amber-600 flex-shrink-0" />
          <div>
            <p className="text-lg font-semibold text-amber-900">Warning: Impersonation Mode</p>
            <p className="text-sm text-amber-800 mt-1">
              You will be logged in as <span className="font-bold">{tenantName}</span>.
            </p>
          </div>
        </div>

        <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
          <p className="text-slate-700">
            This action will:
          </p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li className="flex items-center gap-2">
              <span className="text-emerald-600">•</span> Switch your session to tenant dashboard
            </li>
            <li className="flex items-center gap-2">
              <span className="text-emerald-600">•</span> Allow you to view their portal
            </li>
            <li className="flex items-center gap-2">
              <span className="text-emerald-600">•</span> Automatically return you when you log out
            </li>
          </ul>
        </div>

        <div className="flex justify-end gap-4 pt-6 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-8 py-3 bg-slate-200 text-slate-800 rounded-xl hover:bg-slate-300 transition font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className="px-10 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl hover:from-amber-600 hover:to-orange-700 transition font-semibold shadow-lg disabled:opacity-60 flex items-center gap-3"
          >
            <LogIn className="h-5 w-5" />
            {isLoading ? "Switching..." : "Impersonate Tenant"}
          </button>
        </div>
      </div>
    </Modal>
  );
}