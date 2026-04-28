"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { UploadCloud, FileText } from "lucide-react";
import { useCsrfToken } from "@/hooks/useCsrfToken";
import { useAirbnbTenantBooking } from "@/hooks/useAirbnbTenantBooking";

type DocumentType = "id_card" | "driver_license" | "passport";

type UploadedDoc = {
  id: string;
  documentType: DocumentType;
  fileName: string;
  fileType: string;
  url: string;
  createdAt: string;
};

export default function AirbnbGuestDocumentsPage() {
  const { csrfToken } = useCsrfToken();
  const { booking } = useAirbnbTenantBooking();
  const [documents, setDocuments] = useState<UploadedDoc[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<DocumentType>("id_card");
  const [file, setFile] = useState<File | null>(null);

  const fetchDocs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/airbnb-tenant/documents", { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Failed to load documents.");
      setDocuments(Array.isArray(json.documents) ? json.documents : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  const label = useMemo(() => {
    switch (selectedType) {
      case "driver_license":
        return "Driver’s License";
      case "passport":
        return "Passport";
      default:
        return "ID Card";
    }
  }, [selectedType]);

  const handleUpload = async () => {
    if (!csrfToken) {
      setError("Missing CSRF token. Refresh and try again.");
      return;
    }
    if (!file) {
      setError("Select a file to upload.");
      return;
    }

    setIsUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("documentType", selectedType);
      form.set("file", file);

      const res = await fetch("/api/airbnb-tenant/documents", {
        method: "POST",
        credentials: "include",
        headers: { "x-csrf-token": csrfToken },
        body: form,
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Upload failed.");
      setFile(null);
      await fetchDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.3em]">Airbnb Security</p>
        <h1 className="text-2xl font-bold text-foreground mt-2">Upload legal documents</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Upload a valid ID Card, Driver’s License, or Passport for verification for{" "}
          <span className="font-semibold text-foreground">{booking?.listingName || "your stay"}</span>.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-800">{error}</div>
      ) : null}

      <div className="surface-card rounded-3xl p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-muted-foreground">Document type</label>
            <select
              className="w-full rounded-2xl border border-border bg-white/80 px-4 py-3 text-sm"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as DocumentType)}
              disabled={isUploading}
            >
              <option value="id_card">National ID</option>
              <option value="driver_license">Driver’s License</option>
              <option value="passport">Passport</option>
            </select>
          </div>

          <div className="sm:col-span-2 space-y-2">
            <label className="block text-xs font-semibold text-muted-foreground">File (PDF, PNG, JPG • Max 10MB)</label>
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              disabled={isUploading}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-xl file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-primary hover:file:bg-primary/15"
            />
          </div>
        </div>

        <button
          onClick={handleUpload}
          disabled={!file || isUploading}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <UploadCloud size={18} />
          {isUploading ? "Uploading…" : `Upload ${label}`}
        </button>
      </div>

      <div className="surface-card rounded-3xl p-6">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.3em]">Uploaded</p>

        {isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading documents…</p>
        ) : documents.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No documents uploaded yet.</p>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {documents.map((doc) => (
              <div key={doc.id} className="rounded-2xl border border-border bg-white/70 p-4">
                <p className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <FileText size={16} className="text-primary" />
                  {doc.documentType.replace(/_/g, " ")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground truncate">{doc.fileName}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">Uploaded: {new Date(doc.createdAt).toLocaleString("en-KE")}</p>
                <a href={doc.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-semibold text-primary hover:underline">
                  View / download
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

