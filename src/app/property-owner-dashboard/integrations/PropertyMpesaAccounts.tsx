"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Cookies from "js-cookie";
import toast from "react-hot-toast";

type PaymentType = "paybill" | "till" | "bank";

type Property = {
  _id: string;
  name?: string;
  propertyName?: string;
};

type Connection = {
  paymentType: PaymentType;
  paymentAccountId?: string;
  routingKey?: string;
  label?: string;
  propertyIds?: string[];
  propertySpecific?: boolean;
  paybillNumber?: string;
  tillNumber?: string;
  bank?: string;
  bankAccount?: string;
};

type Draft = {
  paymentType: PaymentType;
  paybillNumber: string;
  tillNumber: string;
  bankPaybillNumber: string;
  bankAccountNumber: string;
};

const emptyDraft = (): Draft => ({
  paymentType: "paybill",
  paybillNumber: "",
  tillNumber: "",
  bankPaybillNumber: "",
  bankAccountNumber: "",
});

function draftFromConnection(connection?: Connection): Draft {
  if (!connection) return emptyDraft();
  return {
    paymentType: connection.paymentType,
    paybillNumber: connection.paybillNumber || "",
    tillNumber: connection.tillNumber || "",
    bankPaybillNumber: connection.bank || "",
    bankAccountNumber: connection.bankAccount || "",
  };
}

function normalize(value: string) {
  return value.trim().replace(/\s+/g, "");
}

export default function PropertyMpesaAccounts({ disabled = false }: { disabled?: boolean }) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [csrfToken, setCsrfToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingPropertyId, setSavingPropertyId] = useState<string | null>(null);

  const propertyConnections = useMemo(() => {
    const result = new Map<string, Connection>();
    for (const connection of connections) {
      if (!connection.propertySpecific) continue;
      for (const propertyId of connection.propertyIds || []) {
        if (!result.has(String(propertyId))) result.set(String(propertyId), connection);
      }
    }
    return result;
  }, [connections]);

  const refreshConnections = useCallback(async () => {
    const response = await fetch("/api/mpesa/connect", { credentials: "include", cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || "Unable to load M-Pesa accounts.");
    const nextConnections: Connection[] = Array.isArray(data.connections) ? data.connections : [];
    setConnections(nextConnections);
    return nextConnections;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const ownerId = Cookies.get("userId");
        if (!ownerId) throw new Error("Please sign in again to manage property payment accounts.");

        const [propertiesResponse, csrfResponse, connectionsResponse] = await Promise.all([
          fetch(`/api/properties?userId=${encodeURIComponent(ownerId)}&page=1&limit=500`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch("/api/csrf-token", { credentials: "include", cache: "no-store" }),
          fetch("/api/mpesa/connect", { credentials: "include", cache: "no-store" }),
        ]);
        const [firstPropertiesData, csrfData, connectionsData] = await Promise.all([
          propertiesResponse.json(),
          csrfResponse.json(),
          connectionsResponse.json(),
        ]);
        if (!propertiesResponse.ok || !firstPropertiesData.success) {
          throw new Error(firstPropertiesData.message || "Unable to load your properties.");
        }
        if (!connectionsResponse.ok || !connectionsData.success) {
          throw new Error(connectionsData.message || "Unable to load M-Pesa accounts.");
        }
        if (!csrfResponse.ok || !csrfData.success || !csrfData.csrfToken) {
          throw new Error("Unable to start a secure account update. Refresh the page and try again.");
        }
        if (cancelled) return;

        const nextProperties: Property[] = Array.isArray(firstPropertiesData.properties)
          ? [...firstPropertiesData.properties]
          : [];
        const pageSize = Number(firstPropertiesData.pagination?.limit) || 500;
        const totalProperties = Number(firstPropertiesData.pagination?.total) || nextProperties.length;
        const remainingPages = Math.ceil(totalProperties / pageSize);
        if (remainingPages > 1) {
          const remainingResponses = await Promise.all(
            Array.from({ length: remainingPages - 1 }, (_, index) => index + 2).map((page) =>
              fetch(
                `/api/properties?userId=${encodeURIComponent(ownerId)}&page=${page}&limit=${pageSize}`,
                { credentials: "include", cache: "no-store" },
              ),
            ),
          );
          const remainingData = await Promise.all(remainingResponses.map((response) => response.json()));
          const failedPage = remainingData.findIndex((data, index) => !remainingResponses[index].ok || !data.success);
          if (failedPage >= 0) {
            throw new Error(remainingData[failedPage].message || "Unable to load all of your properties.");
          }
          for (const data of remainingData) {
            if (Array.isArray(data.properties)) nextProperties.push(...data.properties);
          }
        }
        const nextConnections: Connection[] = Array.isArray(connectionsData.connections)
          ? connectionsData.connections
          : [];
        const nextDrafts: Record<string, Draft> = {};
        for (const property of nextProperties) {
          const propertyId = String(property._id);
          const connection = nextConnections.find(
            (candidate) => candidate.propertySpecific && candidate.propertyIds?.some((id) => String(id) === propertyId),
          );
          nextDrafts[propertyId] = draftFromConnection(connection);
        }

        setProperties(nextProperties);
        setConnections(nextConnections);
        setDrafts(nextDrafts);
        setCsrfToken(String(csrfData.csrfToken));
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Unable to load property payment accounts.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateDraft = (propertyId: string, field: keyof Draft, value: string) => {
    setDrafts((current) => ({
      ...current,
      [propertyId]: { ...emptyDraft(), ...current[propertyId], [field]: value },
    }));
  };

  const savePropertyAccount = async (property: Property) => {
    const propertyId = String(property._id);
    const draft = drafts[propertyId] || emptyDraft();
    const paybillNumber = normalize(draft.paybillNumber);
    const tillNumber = normalize(draft.tillNumber).toUpperCase();
    const bankPaybillNumber = normalize(draft.bankPaybillNumber);
    const bankAccountNumber = normalize(draft.bankAccountNumber);

    if (draft.paymentType === "paybill" && !paybillNumber) {
      toast.error("Enter a Paybill number for this property.");
      return;
    }
    if (draft.paymentType === "till" && !tillNumber) {
      toast.error("Enter a Till number for this property.");
      return;
    }
    if (draft.paymentType === "bank" && (!bankPaybillNumber || !bankAccountNumber)) {
      toast.error("Enter both the bank Paybill and account number.");
      return;
    }
    if (!csrfToken) {
      toast.error("Your secure session expired. Refresh the page and try again.");
      return;
    }

    setSavingPropertyId(propertyId);
    try {
      const response = await fetch("/api/mpesa/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        credentials: "include",
        body: JSON.stringify({
          propertySpecific: true,
          propertyIds: [propertyId],
          routingKey: `property:${propertyId}`,
          label: `${property.name || property.propertyName || "Property"} payment account`,
          paymentType: draft.paymentType,
          paybillNumber: draft.paymentType === "paybill" ? paybillNumber : "",
          tillNumber: draft.paymentType === "till" ? tillNumber : "",
          bankPaybillNumber: draft.paymentType === "bank" ? bankPaybillNumber : "",
          bankAccountNumber: draft.paymentType === "bank" ? bankAccountNumber : "",
          isDefault: false,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to save this property account.");
      const nextConnections = await refreshConnections();
      const saved = nextConnections.find((connection) =>
        connection.propertySpecific && connection.propertyIds?.some((id) => String(id) === propertyId),
      );
      if (saved) {
        setDrafts((current) => ({ ...current, [propertyId]: draftFromConnection(saved) }));
      }
      toast.success("Property payment account saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save this property account.");
    } finally {
      setSavingPropertyId(null);
    }
  };

  const removePropertyAccount = async (property: Property) => {
    const propertyId = String(property._id);
    const connection = propertyConnections.get(propertyId);
    if (!connection?.routingKey) return;
    const name = property.name || property.propertyName || "this property";
    if (!window.confirm(`Remove the M-Pesa account assigned to ${name}? New payments will use your existing payment settings.`)) {
      return;
    }
    if (!csrfToken) {
      toast.error("Your secure session expired. Refresh the page and try again.");
      return;
    }

    setSavingPropertyId(propertyId);
    try {
      const response = await fetch("/api/mpesa/connect", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        credentials: "include",
        body: JSON.stringify({ routingKey: connection.routingKey }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to remove this property account.");
      setConnections((current) => current.filter((item) => item.routingKey !== connection.routingKey));
      setDrafts((current) => ({ ...current, [propertyId]: emptyDraft() }));
      toast.success("Property payment account removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to remove this property account.");
    } finally {
      setSavingPropertyId(null);
    }
  };

  return (
    <section className="surface-card rounded-3xl p-5 sm:p-6">
      <div className="mb-5">
        <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Property payment accounts</p>
        <h2 className="mt-1 text-lg font-semibold">Choose an M-Pesa destination for each property</h2>
        <p className="mt-1 max-w-3xl text-xs sm:text-sm text-muted-foreground">
          These destinations apply to new tenant payments when Daraja is selected. Properties without an assigned account keep using your existing owner-wide payment settings.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3" aria-label="Loading property accounts">
          <div className="h-28 animate-pulse rounded-2xl bg-muted/60" />
          <div className="h-28 animate-pulse rounded-2xl bg-muted/60" />
        </div>
      ) : properties.length === 0 ? (
        <p className="rounded-2xl border border-border bg-background/70 p-4 text-sm text-muted-foreground">
          Add a property before assigning its payment account.
        </p>
      ) : (
        <div className="space-y-4">
          {properties.map((property) => {
            const propertyId = String(property._id);
            const name = property.name || property.propertyName || `Property ${propertyId.slice(-6)}`;
            const draft = drafts[propertyId] || emptyDraft();
            const connection = propertyConnections.get(propertyId);
            const saving = savingPropertyId === propertyId;
            return (
              <div key={propertyId} className="rounded-2xl border border-border bg-background/70 p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">{name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {connection ? "Property-specific account is active." : "No property-specific account; owner-wide settings remain in effect."}
                    </p>
                  </div>
                  {connection && <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">Assigned</span>}
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label className="text-xs font-medium">
                    Account type
                    <select
                      value={draft.paymentType}
                      onChange={(event) => updateDraft(propertyId, "paymentType", event.target.value)}
                      disabled={disabled || saving}
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                    >
                      <option value="paybill">Paybill</option>
                      <option value="till">Till</option>
                      <option value="bank">Bank</option>
                    </select>
                  </label>

                  {draft.paymentType === "paybill" && (
                    <label className="text-xs font-medium">
                      Paybill number
                      <input
                        value={draft.paybillNumber}
                        onChange={(event) => updateDraft(propertyId, "paybillNumber", event.target.value)}
                        disabled={disabled || saving}
                        inputMode="numeric"
                        className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                        placeholder="e.g. 400200"
                      />
                    </label>
                  )}

                  {draft.paymentType === "till" && (
                    <label className="text-xs font-medium">
                      Till number
                      <input
                        value={draft.tillNumber}
                        onChange={(event) => updateDraft(propertyId, "tillNumber", event.target.value)}
                        disabled={disabled || saving}
                        className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm uppercase"
                        placeholder="e.g. K123456"
                      />
                    </label>
                  )}

                  {draft.paymentType === "bank" && (
                    <>
                      <label className="text-xs font-medium">
                        Bank Paybill
                        <input
                          value={draft.bankPaybillNumber}
                          onChange={(event) => updateDraft(propertyId, "bankPaybillNumber", event.target.value)}
                          disabled={disabled || saving}
                          inputMode="numeric"
                          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                          placeholder="Bank paybill or identifier"
                        />
                      </label>
                      <label className="text-xs font-medium">
                        Bank account number
                        <input
                          value={draft.bankAccountNumber}
                          onChange={(event) => updateDraft(propertyId, "bankAccountNumber", event.target.value)}
                          disabled={disabled || saving}
                          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                          placeholder="Account number"
                        />
                      </label>
                    </>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void savePropertyAccount(property)}
                    disabled={disabled || saving}
                    className="rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? "Saving…" : connection ? "Update account" : "Assign account"}
                  </button>
                  {connection && (
                    <button
                      type="button"
                      onClick={() => void removePropertyAccount(property)}
                      disabled={disabled || saving}
                      className="rounded-xl border border-border px-4 py-2.5 text-xs font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Remove assignment
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
