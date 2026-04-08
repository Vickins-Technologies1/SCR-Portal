import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import type { Metadata } from "next";
import { MapPin, DollarSign, Phone, Mail, ArrowLeft, Star, ShieldCheck } from "lucide-react";
import { PublicListing, AirbnbPublicListing } from "@/types/property";
import { ensureAvailability } from "@/lib/availability";
import ImageGallery from "./ImageGallery";

export const dynamic = "force-dynamic";

interface PropertyResponse {
  success: boolean;
  property?: PublicListing;
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await getProperty(id);
  const property = data.property;

  if (!property) {
    return {
      title: "Property not found",
      description: "The requested property could not be found.",
    };
  }

  const description =
    property.description ||
    `Explore ${property.name} in ${property.address}. Premium ${property.listingType === "airbnb" ? "short-term" : "long-term"} stay managed by Sorana.`;
  const images = property.images?.length ? property.images : ["/logo.png"];

  return {
    title: `${property.name} | Sorana Property Managers`,
    description,
    openGraph: {
      title: property.name,
      description,
      images,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: property.name,
      description,
      images,
    },
  };
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
  const isAirbnb = property.listingType === "airbnb";

  const availability = isAirbnb ? null : ensureAvailability(property);
  const images = property.images?.length ? property.images : ["/logo.png"];

  const unitTypes = !isAirbnb ? property.unitTypes ?? [] : [];
  const minPrice = unitTypes.length ? Math.min(...unitTypes.map((u) => Number(u.price) || 0)) : 0;
  const maxPrice = unitTypes.length ? Math.max(...unitTypes.map((u) => Number(u.price) || 0)) : 0;

  const airbnbListing = isAirbnb ? (property as AirbnbPublicListing) : null;
  const nightlyRate = airbnbListing?.baseRate || 0;
  const contactEmail = owner?.email || "bookings@soranapropertymanagers.com";
  const contactLink = `mailto:${contactEmail}`;

  return (
    <main className="min-h-screen bg-[#f6f3ef] text-slate-900">
      <div className="max-w-7xl mx-auto px-6 pt-28 pb-16">
        <Link
          href="/property-listings"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 transition hover:text-slate-900"
        >
          <ArrowLeft size={16} />
          Back to listings
        </Link>

        <section className="mt-8 grid gap-10 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-8">
            <div className="rounded-[32px] border border-slate-200 bg-white/90 p-4 sm:p-6 shadow-[0_22px_50px_-40px_rgba(15,23,42,0.5)]">
              <ImageGallery images={images} title={property.name} />
            </div>

            <div className="rounded-[32px] border border-slate-200 bg-white/90 p-6 sm:p-8 shadow-[0_18px_40px_-35px_rgba(15,23,42,0.45)]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.4em] text-slate-500">Property</p>
                  <h1 className="mt-2 text-2xl sm:text-3xl lg:text-4xl font-semibold text-slate-900 font-[var(--font-cormorant)]">
                    {property.name}
                  </h1>
                  <p className="mt-2 flex items-center gap-2 text-sm sm:text-base text-slate-500">
                    <MapPin size={18} className="flex-shrink-0" />
                    {property.address}
                  </p>
                </div>

                <span
                  className={`inline-flex items-center rounded-full px-4 py-1.5 text-xs sm:text-sm font-semibold uppercase tracking-wider mt-3 sm:mt-0 ${
                    isAirbnb
                      ? property.status === "published"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                      : property.status === "Active"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {isAirbnb && property.status === "published" ? "Live" : property.status}
                </span>
              </div>

              {isAirbnb ? (
                <div className="mt-6 sm:mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center">
                    <p className="text-[11px] uppercase tracking-wider text-slate-500">Nightly rate</p>
                    <p className="mt-2 text-xl sm:text-2xl font-semibold text-slate-900">
                      {airbnbListing?.baseRate
                        ? `Ksh ${airbnbListing.baseRate.toLocaleString()}`
                        : "On request"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center">
                    <p className="text-[11px] uppercase tracking-wider text-slate-500">Weekend rate</p>
                    <p className="mt-2 text-xl sm:text-2xl font-semibold text-slate-900">
                      {airbnbListing?.weekendRate
                        ? `Ksh ${airbnbListing.weekendRate.toLocaleString()}`
                        : "On request"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center">
                    <p className="text-[11px] uppercase tracking-wider text-slate-500">Rating</p>
                    <p className="mt-2 text-2xl sm:text-3xl font-bold text-slate-900">
                      {(airbnbListing?.rating ?? 0).toFixed(1)} ★
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-6 sm:mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center">
                    <p className="text-[11px] uppercase tracking-wider text-slate-500">Price range</p>
                    <p className="mt-2 text-xl sm:text-2xl font-semibold text-slate-900">
                      {minPrice ? `Ksh ${minPrice.toLocaleString()} – ${maxPrice.toLocaleString()}` : "On request"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center">
                    <p className="text-[11px] uppercase tracking-wider text-slate-500">Vacant units</p>
                    <p className="mt-2 text-2xl sm:text-3xl font-bold text-emerald-600">
                      {availability?.totalVacant ?? 0}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center">
                    <p className="text-[11px] uppercase tracking-wider text-slate-500">Occupancy</p>
                    <p className="mt-2 text-2xl sm:text-3xl font-bold text-slate-900">
                      {availability?.occupancyRate ?? 0}%
                    </p>
                  </div>
                </div>
              )}

              {property.description && (
                <div className="mt-8">
                  <p className="text-[11px] uppercase tracking-wider text-slate-500 mb-3">Description</p>
                  <p className="text-sm sm:text-base leading-relaxed text-slate-700 whitespace-pre-line">
                    {property.description}
                  </p>
                </div>
              )}
            </div>

            {isAirbnb ? (
              <div className="rounded-[32px] border border-slate-200 bg-white/90 p-6 sm:p-8 shadow-[0_18px_40px_-35px_rgba(15,23,42,0.45)] space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">Stay details</h2>
                  <p className="text-sm text-slate-500">
                    {(airbnbListing?.reviewCount ?? 0).toLocaleString()} reviews
                  </p>
                </div>

                {airbnbListing?.amenities?.length ? (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-500 mb-3">Amenities</p>
                    <div className="flex flex-wrap gap-2">
                      {airbnbListing.amenities.map((amenity) => (
                        <span
                          key={amenity}
                          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600"
                        >
                          {amenity}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {airbnbListing?.houseRules?.length ? (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-500 mb-3">House rules</p>
                    <ul className="space-y-2 text-sm text-slate-600">
                      {airbnbListing.houseRules.map((rule) => (
                        <li key={rule} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          {rule}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-[32px] border border-slate-200 bg-white/90 p-6 sm:p-8 shadow-[0_18px_40px_-35px_rgba(15,23,42,0.45)]">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">Unit mix</h2>
                  <p className="text-sm text-slate-500">Live availability</p>
                </div>

                <div className="space-y-4">
                  {unitTypes.map((unit, idx) => (
                    <div
                      key={`${property._id}-${unit.type}-${idx}`}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6 hover:bg-white transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <p className="text-base sm:text-lg font-semibold text-slate-900">{unit.type}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{unit.uniqueType || "Standard"}</p>
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm text-slate-500">
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
            )}
          </div>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:h-fit">
            <div className="rounded-[32px] border border-slate-200 bg-white/90 p-6 shadow-[0_18px_40px_-35px_rgba(15,23,42,0.45)]">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Reserve this stay</h3>
                {isAirbnb && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                    <Star size={14} /> {(airbnbListing?.rating ?? 0).toFixed(1)}
                  </span>
                )}
              </div>
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] uppercase tracking-wider text-slate-500">
                  {isAirbnb ? "Nightly rate" : "Monthly rent"}
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {isAirbnb
                    ? nightlyRate
                      ? `Ksh ${nightlyRate.toLocaleString()}`
                      : "On request"
                    : minPrice
                      ? `Ksh ${minPrice.toLocaleString()}`
                      : "On request"}
                </p>
              </div>

              <a
                href={contactLink}
                className="mt-4 block w-full rounded-full bg-slate-900 px-6 py-3 text-center text-xs font-semibold uppercase tracking-[0.25em] text-white transition hover:bg-slate-800"
              >
                {isAirbnb ? "Book now" : "Schedule viewing"}
              </a>

              <p className="mt-4 text-xs text-slate-500">
                Our concierge team replies within 2 hours during business days.
              </p>
            </div>

            <div className="rounded-[32px] border border-slate-200 bg-white/90 p-6 shadow-[0_18px_40px_-35px_rgba(15,23,42,0.45)]">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Contact host</h3>

              {owner ? (
                <div className="space-y-4 text-sm text-slate-600">
                  {owner.email && (
                    <a
                      href={`mailto:${owner.email}`}
                      className="flex items-center gap-3 hover:text-emerald-600 transition-colors"
                    >
                      <Mail size={18} className="text-slate-500" />
                      {owner.email}
                    </a>
                  )}
                  {owner.phone && (
                    <a
                      href={`tel:${owner.phone}`}
                      className="flex items-center gap-3 hover:text-emerald-600 transition-colors"
                    >
                      <Phone size={18} className="text-slate-500" />
                      {owner.phone}
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Owner details unavailable at this time.</p>
              )}

              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-xs text-slate-500">
                <div className="flex items-center gap-2 font-semibold text-slate-700">
                  <ShieldCheck size={14} />
                  Verified listing
                </div>
                <p className="mt-2">
                  Every listing is professionally managed and inspected for guest readiness.
                </p>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
