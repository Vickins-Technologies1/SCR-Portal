import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { MapPin, DollarSign, Phone, Mail, ArrowLeft } from "lucide-react";
import { Listing } from "@/types/property";
import { ensureAvailability } from "@/lib/availability";
import ImageGallery from "./ImageGallery";

interface PropertyResponse {
  success: boolean;
  property?: Listing;
  owner?: { email?: string; phone?: string } | null;
}

async function getProperty(id: string): Promise<PropertyResponse> {
  try {
    const hdrs = await headers();
    const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
    const proto =
      hdrs.get("x-forwarded-proto") ?? (host?.includes("localhost") ? "http" : "https");
    const fallbackBase = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const baseUrl = host ? `${proto}://${host}` : fallbackBase;

    const res = await fetch(
      `${baseUrl}/api/public-properties/${id}`,
      { cache: "no-store" }
    );

    if (!res.ok) return { success: false };
    return res.json();
  } catch {
    return { success: false };
  }
}

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id) notFound();

  const data = await getProperty(id);
  if (!data.success || !data.property) notFound();

  const { property, owner } = data;

  const availability = ensureAvailability(property);
  const images = property.images?.length ? property.images : ["/logo.png"];

  const unitTypes = property.unitTypes ?? [];
  const minPrice = unitTypes.length ? Math.min(...unitTypes.map((u) => Number(u.price) || 0)) : 0;
  const maxPrice = unitTypes.length ? Math.max(...unitTypes.map((u) => Number(u.price) || 0)) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 pb-12">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Back button - sticky on mobile */}
        <div className="sticky top-0 z-10 -mx-4 bg-gradient-to-b from-slate-50/90 to-transparent pt-4 pb-3 backdrop-blur-sm lg:static lg:pt-10 lg:pb-0 lg:backdrop-blur-none">
          <Link
            href="/property-listings"
            className="inline-flex items-center gap-2 text-sm font-medium text-cyan-700 hover:text-cyan-900 transition-colors"
          >
            <ArrowLeft size={16} />
            Back to listings
          </Link>
        </div>

        <section className="mt-6 lg:mt-10">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* Left column - main content */}
            <div className="lg:col-span-2 space-y-6 lg:space-y-8">
              {/* Gallery */}
              <div className="rounded-3xl overflow-hidden border border-slate-200 shadow-sm bg-white">
                <ImageGallery images={images} title={property.name} />
              </div>

              {/* Property info card */}
              <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 lg:p-8 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500">Property</p>
                    <h1 className="mt-1 text-2xl sm:text-3xl lg:text-4xl font-semibold text-slate-900">
                      {property.name}
                    </h1>
                    <p className="mt-2 flex items-center gap-2 text-sm sm:text-base text-slate-600">
                      <MapPin size={18} className="flex-shrink-0" />
                      {property.address}
                    </p>
                  </div>

                  <span
                    className={`inline-flex items-center rounded-full px-4 py-1.5 text-xs sm:text-sm font-semibold uppercase tracking-wider mt-3 sm:mt-0 ${
                      property.status === "Active"
                        ? "border border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border border-slate-300 bg-slate-100 text-slate-600"
                    }`}
                  >
                    {property.status}
                  </span>
                </div>

                {/* Stats grid */}
                <div className="mt-6 sm:mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center">
                    <p className="text-xs uppercase tracking-wider text-slate-500">Price range</p>
                    <p className="mt-2 text-xl sm:text-2xl font-semibold text-slate-900">
                      {minPrice ? `Ksh ${minPrice.toLocaleString()} – ${maxPrice.toLocaleString()}` : "On request"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center">
                    <p className="text-xs uppercase tracking-wider text-slate-500">Vacant units</p>
                    <p className="mt-2 text-2xl sm:text-3xl font-bold text-cyan-600">
                      {availability.totalVacant}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center">
                    <p className="text-xs uppercase tracking-wider text-slate-500">Occupancy</p>
                    <p className="mt-2 text-2xl sm:text-3xl font-bold text-indigo-600">
                      {availability.occupancyRate}%
                    </p>
                  </div>
                </div>

                {/* Description */}
                {property.description && (
                  <div className="mt-8">
                    <p className="text-xs uppercase tracking-wider text-slate-500 mb-3">Description</p>
                    <p className="text-sm sm:text-base leading-relaxed text-slate-700 whitespace-pre-line">
                      {property.description}
                    </p>
                  </div>
                )}
              </div>

              {/* Unit mix */}
              <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 lg:p-8 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">Unit mix</h2>
                  <p className="text-sm text-slate-500">Live availability</p>
                </div>

                <div className="space-y-4">
                  {unitTypes.map((unit, idx) => (
                    <div
                      key={`${property._id}-${unit.type}-${idx}`}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6 hover:bg-slate-100/60 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <p className="text-base sm:text-lg font-semibold text-slate-900">{unit.type}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{unit.uniqueType || "Standard"}</p>
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm text-slate-700">
                          <span className="flex items-center gap-1.5">
                            <DollarSign size={16} /> {unit.price?.toLocaleString() ?? "?"} / mo
                          </span>
                          <span>
                            {unit.deposit ? `Deposit: ${unit.deposit.toLocaleString()}` : "No deposit"}
                          </span>
                          <span className="font-medium text-emerald-600">
                            Vacant: {unit.vacant ?? unit.quantity}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right sidebar - sticky on large screens */}
            <aside className="space-y-6 lg:sticky lg:top-10 lg:h-fit">
              {/* At a glance */}
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900 mb-5">At a glance</h3>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-center justify-between text-xs uppercase tracking-wider text-slate-500 mb-3">
                    <span>Occupancy</span>
                    <span className="font-semibold text-slate-900">{availability.occupancyRate}%</span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-500 transition-all duration-500"
                      style={{ width: `${Math.min(100, availability.occupancyRate)}%` }}
                    />
                  </div>
                </div>

                {property.facilities?.length ? (
                  <div className="mt-6">
                    <p className="text-xs uppercase tracking-wider text-slate-500 mb-3">Facilities</p>
                    <div className="flex flex-wrap gap-2">
                      {property.facilities.map((f) => (
                        <span
                          key={f}
                          className="rounded-full border border-slate-200 bg-white px-3.5 py-1 text-xs text-slate-700"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Contact owner */}
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900 mb-5">Contact owner</h3>

                {owner ? (
                  <div className="space-y-4 text-sm text-slate-700">
                    {owner.email && (
                      <a
                        href={`mailto:${owner.email}`}
                        className="flex items-center gap-3 hover:text-cyan-700 transition-colors"
                      >
                        <Mail size={18} className="text-slate-500" />
                        {owner.email}
                      </a>
                    )}
                    {owner.phone && (
                      <a
                        href={`tel:${owner.phone}`}
                        className="flex items-center gap-3 hover:text-cyan-700 transition-colors"
                      >
                        <Phone size={18} className="text-slate-500" />
                        {owner.phone}
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Owner details unavailable at this time.</p>
                )}

                <p className="mt-6 text-sm text-slate-600 leading-relaxed">
                  Feel free to reach out to schedule a viewing or inquire about current availability.
                </p>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </div>
  );
}


