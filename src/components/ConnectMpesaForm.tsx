// src/components/ConnectMpesaForm.tsx
"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface ConnectMpesaFormProps {
  disabled?: boolean;
}

export default function ConnectMpesaForm({ disabled }: ConnectMpesaFormProps) {
  const [shortcode, setShortcode] = useState("");
  const [passkey, setPasskey] = useState("");
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/mpesa/connect", { credentials: "include" });
        const data = await res.json();
        if (res.ok && data.success) {
          setConnected(!!data.connected);
          if (data.shortcode) setShortcode(data.shortcode);
        } else {
          setConnected(false);
        }
      } catch {
        setConnected(false);
      }
    };

    const fetchCsrf = async () => {
      try {
        const res = await fetch("/api/csrf-token", { credentials: "include" });
        const data = await res.json();
        if (data.success && data.csrfToken) setCsrfToken(data.csrfToken);
      } catch {
        setCsrfToken(null);
      }
    };

    fetchStatus();
    fetchCsrf();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled) return;

    if (!shortcode || !passkey) {
      toast.error("Shortcode and Passkey are required");
      return;
    }

    if (!csrfToken) {
      toast.error("Missing CSRF token");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/mpesa/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ shortcode, passkey }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.message || "Failed to connect M-Pesa");
        setConnected(false);
        return;
      }

      toast.success("M-Pesa connected successfully");
      setConnected(true);
      setPasskey("");
    } catch (error) {
      toast.error("Failed to connect M-Pesa");
      setConnected(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <span
          className={`inline-flex h-2.5 w-2.5 rounded-full ${
            connected ? "bg-emerald-500" : connected === false ? "bg-red-400" : "bg-gray-300"
          }`}
        />
        <span className="text-gray-600">
          {connected === null ? "Checking connection..." : connected ? "Connected" : "Not Connected"}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-gray-600">Shortcode (Paybill/Till)</label>
          <input
            type="text"
            value={shortcode}
            onChange={(e) => setShortcode(e.target.value.trim())}
            disabled={disabled}
            className="mt-2 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
            placeholder="e.g. 123456"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Passkey</label>
          <input
            type="password"
            value={passkey}
            onChange={(e) => setPasskey(e.target.value)}
            disabled={disabled}
            className="mt-2 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
            placeholder="Enter your passkey"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={disabled || loading}
        className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors duration-200 disabled:opacity-50"
      >
        {loading ? "Saving..." : "Save M-Pesa Settings"}
      </button>
    </form>
  );
}
