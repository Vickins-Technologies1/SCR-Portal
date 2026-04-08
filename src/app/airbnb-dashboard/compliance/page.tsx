"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, UploadCloud, X } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import SectionHeader from "../components/SectionHeader";
import { useAirbnbAccess } from "../components/useAirbnbAccess";
import type { AirbnbComplianceItem } from "@/types/airbnb";

export default function AirbnbCompliancePage() {
  const { hasAccess, ownerId, csrfToken } = useAirbnbAccess("reports:view");
  const [items, setItems] = useState<AirbnbComplianceItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [docForm, setDocForm] = useState({
    propertyId: "",
    documentType: "KTRA License",
    files: [] as File[],
  });

  const fetchCompliance = useCallback(async () => {
    if (!ownerId) return;
    setIsLoading(true);
    const res = await fetch(`/api/airbnb/compliance?ownerId=${ownerId}`, { credentials: "include" });
    const data = await res.json();
    if (data.success) {
      setItems(data.compliance || []);
    }
    setIsLoading(false);
  }, [ownerId]);

  useEffect(() => {
    if (hasAccess) {
      fetchCompliance();
    }
  }, [hasAccess, fetchCompliance]);

  const handleUploadDocuments = async () => {
    if (!csrfToken) {
      setUploadMessage("Missing session token. Refresh and try again.");
      return;
    }
    if (!docForm.propertyId || docForm.files.length === 0) {
      setUploadMessage("Select a property and choose at least one document.");
      return;
    }

    setIsUploading(true);
    setUploadMessage(null);
    try {
      const formData = new FormData();
      docForm.files.forEach((file) => formData.append("images", file));
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
        credentials: "include",
        body: formData,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.success) {
        throw new Error(uploadData.message || "Failed to upload documents");
      }

      const property = items.find((item) => item.propertyId === docForm.propertyId);
      for (const url of uploadData.urls || []) {
        const attachRes = await fetch("/api/airbnb/compliance", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
          credentials: "include",
          body: JSON.stringify({
            propertyId: docForm.propertyId,
            propertyName: property?.propertyName,
            documentType: docForm.documentType,
            url,
          }),
        });
        const attachData = await attachRes.json();
        if (!attachRes.ok || !attachData.success) {
          throw new Error(attachData.message || "Failed to attach document");
        }
      }

      setUploadMessage("Documents uploaded successfully.");
      setShowUploadModal(false);
      setDocForm({ propertyId: "", documentType: "KTRA License", files: [] });
      await fetchCompliance();
    } catch (err) {
      setUploadMessage(err instanceof Error ? err.message : "Failed to upload documents");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-[100svh] bg-background text-foreground">
      <Navbar />
      <Sidebar />

      <div className="md:ml-72 pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-8">
          <SectionHeader
            eyebrow="Airbnb Module"
            title="Compliance & Legal Tools"
            subtitle="Track KTRA licenses, county permits, NEMA, and safety requirements."
            icon={ShieldCheck}
            actions={
              <button
                onClick={() => {
                  setUploadMessage(null);
                  setShowUploadModal(true);
                }}
                className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl shadow-lg shadow-primary/30 hover:bg-primary-hover transition-all text-xs sm:text-sm font-semibold"
              >
                <UploadCloud size={16} />
                Upload documents
              </button>
            }
          />

          <section className="surface-card rounded-3xl p-5 sm:p-6">
            <h2 className="text-sm sm:text-base font-semibold text-foreground mb-4">License tracker</h2>
            <div className="table-shell table-compact">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Property</th>
                      <th>KTRA License</th>
                      <th>KTRA Expiry</th>
                      <th>County Permit</th>
                      <th>NEMA</th>
                      <th>Status</th>
                      <th>Next Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                        <td colSpan={7} className="text-center text-muted-foreground py-6">
                          Loading compliance data...
                        </td>
                      </tr>
                    ) : (
                      items.map((item) => (
                        <tr key={item.propertyId}>
                          <td className="font-semibold">{item.propertyName}</td>
                          <td>{item.ktraLicense}</td>
                          <td>
                            {new Date(item.ktraExpiry).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </td>
                          <td>
                            {new Date(item.countyPermitExpiry).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </td>
                          <td>
                            {new Date(item.nemaExpiry).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </td>
                          <td>
                            <span
                              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                                item.status === "compliant"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : item.status === "due"
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-red-100 text-red-700"
                              }`}
                            >
                              {item.status}
                            </span>
                          </td>
                          <td className="table-muted">{item.nextAction}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="surface-card rounded-3xl p-5 sm:p-6">
              <h2 className="text-sm sm:text-base font-semibold text-foreground mb-3">Guest ID verification</h2>
              <p className="text-[11px] text-muted-foreground">
                Log ID types, capture photos, and confirm guest records for security compliance.
              </p>
              <div className="mt-4 rounded-2xl border border-border bg-white/70 px-4 py-3 text-xs text-muted-foreground">
                24 guest IDs verified this month • 2 pending uploads
              </div>
            </div>
            <div className="surface-card rounded-3xl p-5 sm:p-6">
              <h2 className="text-sm sm:text-base font-semibold text-foreground mb-3">Safety protocols</h2>
              <p className="text-[11px] text-muted-foreground">
                Track fire safety, health clearance, and emergency contacts per listing.
              </p>
              <div className="mt-4 rounded-2xl border border-border bg-white/70 px-4 py-3 text-xs text-muted-foreground">
                3 properties due for safety checklist refresh this quarter.
              </div>
            </div>
          </section>

          {showUploadModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4">
              <div className="modal-panel w-full max-w-lg overflow-hidden">
                <div className="modal-header flex items-center justify-between px-5 py-4">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Upload compliance documents</h2>
                    <p className="text-[11px] text-muted-foreground">Attach licenses and permits.</p>
                  </div>
                  <button onClick={() => setShowUploadModal(false)} className="modal-close rounded-full p-1">
                    <X size={18} />
                  </button>
                </div>
                <div className="modal-body modal-stagger space-y-4">
                  {uploadMessage && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      {uploadMessage}
                    </div>
                  )}
                  <select
                    className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                    value={docForm.propertyId}
                    onChange={(event) => setDocForm((prev) => ({ ...prev, propertyId: event.target.value }))}
                  >
                    <option value="">Select property</option>
                    {items.map((item) => (
                      <option key={item.propertyId} value={item.propertyId}>
                        {item.propertyName}
                      </option>
                    ))}
                  </select>
                  <select
                    className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                    value={docForm.documentType}
                    onChange={(event) => setDocForm((prev) => ({ ...prev, documentType: event.target.value }))}
                  >
                    <option value="KTRA License">KTRA License</option>
                    <option value="County Permit">County Permit</option>
                    <option value="NEMA Clearance">NEMA Clearance</option>
                    <option value="Insurance">Insurance</option>
                    <option value="Health Clearance">Health Clearance</option>
                  </select>
                  <input
                    type="file"
                    multiple
                    accept="image/png,image/jpeg"
                    onChange={(event) =>
                      setDocForm((prev) => ({ ...prev, files: Array.from(event.target.files || []) }))
                    }
                    className="w-full text-xs"
                  />
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => setShowUploadModal(false)}
                      className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleUploadDocuments}
                      disabled={isUploading}
                      className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
                    >
                      {isUploading ? "Uploading..." : "Upload"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
