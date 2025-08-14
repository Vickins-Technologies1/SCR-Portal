import React, { useState, useEffect } from "react";
import Modal from "./Modal";

interface Property {
  _id: string;
  name: string;
  unitTypes: {
    type: string;
    price: number;
    deposit: number;
    managementType: "RentCollection" | "FullManagement";
    managementFee: number;
    uniqueType: string;
  }[];
}

interface ManualPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
  properties: Property[];
  initialPropertyId: string;
  initialUnitType: string;
  initialPhone: string;
  userId: string;
}

export default function ManualPaymentModal({
  isOpen,
  onClose,
  onSuccess,
  onError,
  properties,
  initialPropertyId,
  initialUnitType,
  initialPhone,
  userId,
}: ManualPaymentModalProps) {
  const [phoneNumber, setPhoneNumber] = useState(initialPhone);
  const [amount, setAmount] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState(initialPropertyId);
  const [selectedUnitType, setSelectedUnitType] = useState(initialUnitType);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState("");

  useEffect(() => {
    const fetchCsrfToken = async () => {
      try {
        const res = await fetch("/api/csrf-token");
        const data = await res.json();
        if (data.csrfToken) {
          setCsrfToken(data.csrfToken);
        } else {
          setError("Failed to fetch CSRF token.");
        }
      } catch {
        setError("Failed to connect to server for CSRF token.");
      }
    };
    fetchCsrfToken();
  }, []);

  useEffect(() => {
    setPhoneNumber(initialPhone);
    setSelectedPropertyId(initialPropertyId);
    setSelectedUnitType(initialUnitType);
    const selectedProperty = properties.find((p) => p._id === initialPropertyId);
    const unit = selectedProperty?.unitTypes.find((u) => u.uniqueType === initialUnitType);
    if (unit) {
      setAmount(unit.managementFee.toString());
    } else {
      setAmount("");
    }
  }, [initialPhone, initialPropertyId, initialUnitType, properties]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber || !amount || !selectedPropertyId || !selectedUnitType) {
      setError("All fields are required.");
      return;
    }
    if (!/^\+?\d{10,15}$/.test(phoneNumber)) {
      setError("Invalid phone number (10-15 digits, optional +)");
      return;
    }
    if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      setError("Amount must be a positive number.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tenant/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        credentials: "include",
        body: JSON.stringify({
          userId,
          amount: parseFloat(amount),
          phoneNumber,
          propertyId: selectedPropertyId,
          unitType: selectedUnitType,
          type: "ManagementFee",
          reference: `INV_${Date.now()}`,
          csrfToken,
        }),
      });
      const data = await res.json();
      if (data.success) {
        onSuccess();
      } else {
        onError(data.message || "Payment failed.");
      }
    } catch {
      onError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal title="Process Payment" isOpen={isOpen} onClose={onClose}>
      {error && (
        <div className="bg-red-100 text-red-700 p-4 mb-4 rounded-lg shadow animate-pulse">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Phone Number</label>
          <input
            placeholder="Enter phone number (e.g., +254123456789)"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Property</label>
          <select
            value={selectedPropertyId}
            onChange={(e) => {
              setSelectedPropertyId(e.target.value);
              setSelectedUnitType("");
              setAmount("");
            }}
            className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition"
            required
          >
            <option value="">Select Property</option>
            {properties.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {selectedPropertyId && (
          <div>
            <label className="block text-sm font-medium text-gray-700">Unit Type</label>
            <select
              value={selectedUnitType}
              onChange={(e) => {
                setSelectedUnitType(e.target.value);
                const selectedProperty = properties.find((p) => p._id === selectedPropertyId);
                const unit = selectedProperty?.unitTypes.find((u) => u.uniqueType === e.target.value);
                setAmount(unit ? unit.managementFee.toString() : "");
              }}
              className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition"
              required
            >
              <option value="">Select Unit Type</option>
              {properties
                .find((p) => p._id === selectedPropertyId)
                ?.unitTypes.map((u) => (
                  <option key={u.uniqueType} value={u.uniqueType}>
                    {u.type} (Fee: Ksh {u.managementFee}/mo)
                  </option>
                ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700">Amount (Ksh)</label>
          <input
            placeholder="Amount (auto-filled)"
            value={amount}
            readOnly
            className="w-full border px-3 py-2 rounded-lg bg-gray-100 cursor-not-allowed"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-[#012a4a] text-white rounded-lg hover:bg-[#014a7a] transition flex items-center gap-2"
            disabled={isLoading}
          >
            {isLoading && (
              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
            )}
            Process Payment
          </button>
        </div>
      </form>
    </Modal>
  );
}