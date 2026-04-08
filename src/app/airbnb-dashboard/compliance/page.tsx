"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, UploadCloud } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import SectionHeader from "../components/SectionHeader";
import { useAirbnbAccess } from "../components/useAirbnbAccess";
import type { AirbnbComplianceItem } from "@/types/airbnb";

export default function AirbnbCompliancePage() {
  const { hasAccess, ownerId } = useAirbnbAccess("reports:view");
  const [items, setItems] = useState<AirbnbComplianceItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
              <button className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl shadow-lg shadow-primary/30 hover:bg-primary-hover transition-all text-xs sm:text-sm font-semibold">
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
        </main>
      </div>
    </div>
  );
}
