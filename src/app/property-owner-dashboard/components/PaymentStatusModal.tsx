import React from "react";
import Modal from "./Modal";

interface PaymentStatusModalProps {
  isOpen: boolean;
  status: "loading" | "success" | "error";
  message: string;
  onClose: () => void;
}

export default function PaymentStatusModal({ isOpen, status, message, onClose }: PaymentStatusModalProps) {
  return (
    <Modal title={status === "success" ? "Payment Successful" : status === "error" ? "Payment Error" : "Processing Payment"} isOpen={isOpen} onClose={onClose}>
      <div className="text-center">
        {status === "loading" && (
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#012a4a] mb-4"></div>
        )}
        {status === "success" && (
          <div className="inline-block rounded-full h-8 w-8 bg-green-500 text-white flex items-center justify-center mb-4">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
        {status === "error" && (
          <div className="inline-block rounded-full h-8 w-8 bg-red-500 text-white flex items-center justify-center mb-4">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        )}
        <p className={`text-sm sm:text-base ${status === "error" ? "text-red-700" : status === "success" ? "text-green-700" : "text-gray-700"}`}>
          {message}
        </p>
        {(status === "success" || status === "error") && (
          <div className="flex justify-center mt-6">
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-lg transition text-sm sm:text-base ${
                status === "success"
                  ? "bg-[#012a4a] text-white hover:bg-[#014a7a]"
                  : "bg-gray-200 hover:bg-gray-300"
              }`}
              aria-label={status === "success" ? "Close success modal" : "Close error modal"}
            >
              {status === "success" ? "Continue" : "Close"}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}