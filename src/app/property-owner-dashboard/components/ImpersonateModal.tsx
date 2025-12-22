// src/app/property-owner-dashboard/components/ImpersonateModal.tsx
"use client";

import Modal from "../components/Modal";
import { LogIn, AlertTriangle, Shield, Eye } from "lucide-react";

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
    <Modal isOpen={isOpen} onClose={onClose} title="Impersonate Tenant Account">
      <div className="space-y-6">
        {/* Warning Banner */}
        <div className="flex items-start gap-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-2xl p-6 shadow-sm">
          <AlertTriangle className="h-12 w-12 text-amber-600 flex-shrink-0 mt-1" />
          <div className="flex-1">
            <h3 className="text-lg font-bold text-amber-900 flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Impersonation Mode Activated
            </h3>
            <p className="mt-2 text-amber-800">
              You are about to view the tenant dashboard as:
            </p>
            <p className="mt-2 text-lg font-bold text-amber-900">
              {tenantName}
            </p>
            <p className="mt-2 text-sm text-amber-700">
              This allows you to see exactly what the tenant sees in their portal.
            </p>
          </div>
        </div>

        {/* What Happens Next */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-6 border border-emerald-200">
          <h4 className="font-semibold text-emerald-900 mb-4 flex items-center gap-2">
            <Eye className="h-5 w-5" />
            What happens when you impersonate:
          </h4>
          <ul className="space-y-3 text-emerald-800">
            <li className="flex items-start gap-3">
              <span className="text-emerald-600 mt-1">✓</span>
              <span>Your current session will switch to the tenant's dashboard</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-emerald-600 mt-1">✓</span>
              <span>You'll see their exact view, payments, dues, and requests</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-emerald-600 mt-1">✓</span>
              <span>
                A <strong>clear red banner</strong> will appear at the top showing you're in impersonation mode
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-emerald-600 mt-1">✓</span>
              <span>
                Click <strong>"Exit Impersonation"</strong> at any time to instantly return here
              </span>
            </li>
          </ul>
        </div>

        {/* Security Note */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm text-blue-800 flex items-start gap-2">
            <Shield className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>
              <strong>Secure & Temporary:</strong> This session is fully logged for audit purposes and will
              automatically end if you log out.
            </span>
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-4 pt-6 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-8 py-3.5 bg-gray-200 text-gray-800 rounded-xl hover:bg-gray-300 transition font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className="px-10 py-3.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl hover:from-amber-600 hover:to-orange-700 transition font-bold shadow-lg disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-3 min-w-[180px]"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Switching to Tenant View...
              </>
            ) : (
              <>
                <LogIn className="h-5 w-5" />
                Impersonate {tenantName}
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}