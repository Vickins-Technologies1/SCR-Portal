"use client";

import { notFound } from "next/navigation";
import Link from "next/link";
import { MapPin, DollarSign, Phone, Mail } from "lucide-react";
import { Listing } from "@/types/property";
import { ensureAvailability } from "@/lib/availability";
import ImageGallery from "./ImageGallery";
import { use } from "react";

interface PropertyResponse {
  success: boolean;
  property?: Listing;
  owner?: { email?: string; phone?: string } | null;
}

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";

async function getProperty(id: string): Promise<PropertyResponse> {
  const url = new URL("/api/public-properties/" + id, baseUrl).toString();
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return { success: false };
  return res.json();
}

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getProperty(id);
  if (!data.success || !data.property) {
    notFound();
  }

  const property = data.property;
  const owner = data.owner;
  const availability = ensureAvailability(property);
  const images = property.images && property.images.length ? property.images : ["/logo.png"];

  const unitTypes = property.unitTypes ?? [];
  const minPrice = unitTypes.length ? Math.min(...unitTypes.map((unit) => unit.price)) : 0;
  const maxPrice = unitTypes.length ? Math.max(...unitTypes.map((unit) => unit.price)) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Link href="/property-listings" className="text-sm font-medium text-cyan-700 hover:text-cyan-900">
          Back to listings
        </Link>

        <section className="mt-6 grid gap-8 lg:grid-cols-[2fr,1fr]">
          <div className="space-y-6">
            <ImageGallery images={images} title={property.name} />

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Property</p>
                  <h1 className="text-3xl font-semibold text-slate-900">{property.name}</h1>
                  <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                    <MapPin size={16} /> {property.address}
                  </p>
                </div>
                <span
                  className={
                    "mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-widest " +
                    (property.status === "Active"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : "border-slate-300 bg-slate-100 text-slate-600")
                  }
                >
                  {property.status}
                </span>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-widest text-slate-500">Price range</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">
                    {minPrice ? "Ksh " + minPrice.toLocaleString() + " - " + maxPrice.toLocaleString() : "On request"}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-widest text-slate-500">Vacant units</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{availability.totalVacant}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-widest text-slate-500">Occupancy</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{availability.occupancyRate}%</p>
                </div>
              </div>

              <div className="mt-6">
                <p className="text-xs uppercase tracking-widest text-slate-500">Description</p>
                <p className="mt-3 text-sm text-slate-700 leading-relaxed">
                  {property.description || "No additional description has been added yet."}
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-slate-900">Unit mix</h2>
                <p className="text-sm text-slate-500">Live availability</p>
              </div>
              <div className="mt-4 space-y-4">
                {unitTypes.map((unit, idx) => (
                  <div
                    key={property._id + "-" + unit.type + "-" + idx}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-base font-semibold text-slate-900">{unit.type}</p>
                      <span className="text-xs text-slate-500">{unit.uniqueType || "Standard"}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3">
                      <span className="flex items-center gap-1">
                        <DollarSign size={14} /> {unit.price.toLocaleString()} / mo
                      </span>
                      <span>{unit.deposit ? "Deposit: " + unit.deposit.toLocaleString() : "No deposit"}</span>
                      <span>Quantity: {unit.quantity}</span>
                      <span>Vacant: {unit.vacant ?? unit.quantity}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">At a glance</h3>
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between text-xs uppercase tracking-widest text-slate-500">
                  Occupancy
                  <span className="text-sm font-semibold text-slate-900">{availability.occupancyRate}%</span>
                </div>
                <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <span
                    style={{ width: Math.min(100, availability.occupancyRate) + "%" }}
                    className="block h-full rounded-full bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-500"
                  />
                </div>
              </div>

              {property.facilities && property.facilities.length > 0 && (
                <div className="mt-5">
                  <p className="text-xs uppercase tracking-widest text-slate-500">Facilities</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                    {property.facilities.map((facility) => (
                      <span key={facility} className="rounded-full border border-slate-200 px-3 py-1">
                        {facility}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Contact owner</h3>
              {owner ? (
                <div className="mt-4 space-y-3 text-sm text-slate-700">
                  {owner.email && (
                    <p className="flex items-center gap-2">
                      <Mail size={14} />
                      <a className="text-cyan-700 hover:text-cyan-900" href={"mailto:" + owner.email}>
                        {owner.email}
                      </a>
                    </p>
                  )}
                  {owner.phone && (
                    <p className="flex items-center gap-2">
                      <Phone size={14} />
                      <a className="text-cyan-700 hover:text-cyan-900" href={"tel:" + owner.phone}>
                        {owner.phone}
                      </a>
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">Owner details unavailable.</p>
              )}
              <p className="mt-4 text-sm text-slate-600">
                Reach out to schedule a viewing or to learn more about current availability.
              </p>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
