// src/app/property-owner-dashboard/components/AddTenantModal.tsx
"use client";

import Modal from "./Modal";
import TenantFormContent from "./TenantFormContent";

interface AddTenantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  properties: any[];
  pendingTenantData?: Partial<any> | null;
  isLoading: boolean;
  csrfToken: string;
  tenantsCount: number;
}

export default function AddTenantModal({
  isOpen,
  onClose,
  onSubmit,
  properties,
  pendingTenantData,
  isLoading,
  csrfToken,
  tenantsCount,
}: AddTenantModalProps) {
  return (
    <Modal title="Add New Tenant" isOpen={isOpen} onClose={onClose}>
      <TenantFormContent
        mode="add"
        initialData={pendingTenantData || {}}
        properties={properties}
        onSubmit={onSubmit}
        onCancel={onClose}
        isLoading={isLoading}
        csrfToken={csrfToken}
        tenantsCount={tenantsCount}
      />
    </Modal>
  );
}