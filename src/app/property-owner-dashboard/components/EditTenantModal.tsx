// components/EditTenantModal.tsx
"use client";

import React from "react";
import Modal from "./Modal";
import TenantFormContent from "./TenantFormContent";

interface EditTenantModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: any;
  properties: any[];
  onSubmit: (data: any) => Promise<void>;
  isLoading: boolean;
  csrfToken: string;
}

export default function EditTenantModal({
  isOpen,
  onClose,
  tenant,
  properties,
  onSubmit,
  isLoading,
  csrfToken,
}: EditTenantModalProps) {
  if (!tenant) return null;

  return (
    <Modal title="Edit Tenant" isOpen={isOpen} onClose={onClose}>
      <TenantFormContent
        mode="edit"
        initialData={tenant}
        properties={properties}
        onSubmit={onSubmit}
        onCancel={onClose}
        isLoading={isLoading}
        csrfToken={csrfToken}
      />
    </Modal>
  );
}