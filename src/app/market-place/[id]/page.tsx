import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import type { Metadata } from "next";
import { MapPin, DollarSign, ArrowLeft, Star, Mail, ShieldCheck, Warehouse } from "lucide-react";
import { PublicListing, AirbnbPublicListing, SalePublicListing } from "@/types/property";
import { ensureAvailability } from "@/lib/availability";
import { getPublicPropertyAvailability, type PublicPropertyAvailability } from "@/lib/public-property-availability";
import ImageGallery from "./ImageGallery";
import BookingRequest from "./BookingRequest";
import ViewingRequestWhatsApp from "./ViewingRequestWhatsApp";
import ReviewsSection from "./ReviewsSection";

export const dynamic = "force-dynamic";

interface PropertyResponse {
  success: boolean;
  property?: PublicListing;
  owner?: { email?: string; phone?: string } | null;
}

interface ReviewItem {
  _id: string;
  reviewerName: string;
  rating: number;
  review: string;
  createdAt: string;
}

interface ReviewsResponse {
  success: boolean;
  reviews?: ReviewItem[];
  rating?: number;
  reviewCount?: number;
}

interface InternalPropertyResponse {
  success: boolean;
  property?: PublicPropertyAvailability;
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

async function getReviews(id: string): Promise<ReviewsResponse> {
  try {
    const hdrs = await headers();
    const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
    const proto =
      hdrs.get("x-forwarded-proto") ?? (host?.includes("localhost") ? "http" : "https");
    const fallbackBase = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const baseUrl = host ? `${proto}://${host}` : fallbackBase;

    const res = await fetch(`${baseUrl}/api/public-properties/${id}/reviews`, {
      cache: "no-store",
    });

    if (!res.ok) return { success: false };
    return res.json();
  } catch {
    return { success: false };
  }
}

async function getInternalProperty(id: string): Promise<InternalPropertyResponse> {
  try {
    const property = await getPublicPropertyAvailability(id);
    if (!property) return { success: false };
    return { success: true, property };
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
    const internalData = await getInternalProperty(id);
    if (!internalData.success || !internalData.property) {
      return {
        title: "Property not found",
        description: "The requested property could not be found.",
      };
    }

    return {
      title: `${internalData.property.name} | Availability`,
      description: `${internalData.property.name} in ${internalData.property.address}. ${internalData.property.availabilityLabel}.`,
    };
  }

  const description =
    property.description ||
    `Explore ${property.name} in ${property.address}. ${property.listingType === "airbnb" ? "Short-term stay" : property.listingType === "sale" ? "Property for sale" : "Long-term rental"} managed by Sorana.`;
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
  if (!data.success || !data.property) {
    const internalData = await getInternalProperty(id);
    if (!internalData.success || !internalData.property) notFound();

    const property = internalData.property;
    const enquiryHref = `mailto:support@soranapropertymanagers.com?subject=${encodeURIComponent(
      `Property availability enquiry: ${property.name}`
    )}&body=${encodeURIComponent(
      [
        "Hello Sorana team,",
        "",
        `I scanned the QR code for ${property.name}.`,
        `Location: ${property.address}`,
        `Availability: ${property.availabilityLabel} (${property.availability.totalVacant} vacant of ${property.availability.totalUnits} units)`,
        "",
        "Please share the latest availability details and next steps.",
      ].join("\n")
    )}`;

    const availabilityTone =
      property.hasVacancy && property.status === "Active"
        ? "bg-emerald-100 text-emerald-700"
        : property.status === "Active"
          ? "bg-amber-100 text-amber-700"
          : "bg-slate-100 text-slate-700";

    return (
      <main className="relative isolate min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_45%,#eef2ff_100%)] text-slate-900">
        <div className="absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_62%)]" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-16">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/market-place"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-600 transition hover:text-slate-900"
            >
              <ArrowLeft size={14} />
              Back to listings
            </Link>

            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-600">
              <ShieldCheck size={14} />
              Public availability
            </span>
          </div>

          <section className="mt-8 rounded-[32px] border border-white/80 bg-white/90 p-6 sm:p-8 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.45)] backdrop-blur">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-[10px] uppercase tracking-[0.32em] text-slate-500">Property availability</p>
                <h1 className="mt-3 font-[var(--font-cormorant)] text-3xl sm:text-4xl lg:text-5xl font-semibold text-slate-950 break-words">
                  {property.name}
                </h1>
                <p className="mt-3 flex items-start gap-2 text-sm sm:text-base text-slate-600">
                  <MapPin size={16} className="mt-0.5 shrink-0 text-slate-400" />
                  <span className="break-words">{property.address}</span>
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${availabilityTone}`}>
                    {property.availabilityLabel}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                    {property.status}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                    Live vacancy status
                  </span>
                </div>
              </div>

              <div className="grid w-full max-w-xl gap-4 sm:grid-cols-2">
                {[
                  { label: "Vacant units", value: property.availability.totalVacant, tone: "text-emerald-600" },
                  { label: "Occupied units", value: property.availability.totalOccupied, tone: "text-slate-900" },
                  { label: "Total units", value: property.availability.totalUnits, tone: "text-slate-900" },
                  { label: "Occupancy", value: `${property.availability.occupancyRate}%`, tone: "text-slate-900" },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
                    <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">{stat.label}</p>
                    <p className={`mt-2 text-2xl sm:text-3xl font-semibold ${stat.tone}`}>{stat.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-6">
              <div className="rounded-[32px] border border-white/80 bg-white/90 p-6 sm:p-8 shadow-[0_18px_45px_-35px_rgba(15,23,42,0.38)] backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Available units</p>
                    <h2 className="mt-2 text-lg sm:text-xl font-semibold text-slate-950">Unit mix and vacancy</h2>
                  </div>
                  <Warehouse className="h-5 w-5 text-slate-400" />
                </div>

                <div className="mt-5 space-y-3">
                  {property.unitTypes.length > 0 ? (
                    property.unitTypes.map((unit) => (
                      <div
                        key={unit.uniqueType}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-4 sm:px-5 sm:py-5"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm sm:text-base font-semibold text-slate-900">{unit.type}</p>
                            <p className="text-[11px] text-slate-500">
                              {unit.quantity} total unit{unit.quantity === 1 ? "" : "s"}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                            <span className="rounded-full bg-slate-100 px-3 py-1.5">Vacant: {unit.vacant}</span>
                            <span className="rounded-full bg-slate-100 px-3 py-1.5">
                              Price: Ksh {unit.price.toLocaleString()}
                            </span>
                            <span className="rounded-full bg-slate-100 px-3 py-1.5">
                              Deposit: Ksh {unit.deposit.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                      No unit mix is configured yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[32px] border border-white/80 bg-white/90 p-6 sm:p-8 shadow-[0_18px_45px_-35px_rgba(15,23,42,0.38)] backdrop-blur">
                <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Basic information</p>
                <h2 className="mt-2 text-lg sm:text-xl font-semibold text-slate-950">Property details</h2>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Billing plan</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {property.billingType || "RentCollection"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Rent due day</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {property.rentPaymentDate ? `Day ${property.rentPaymentDate}` : "Not set"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Availability</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{property.availabilityLabel}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Live updated</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      Refreshed for every scan
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <aside className="space-y-6 lg:sticky lg:top-6 lg:h-fit">
              <div className="rounded-[32px] border border-white/80 bg-white/90 p-6 sm:p-8 shadow-[0_18px_45px_-35px_rgba(15,23,42,0.38)] backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Contact / Enquire</p>
                    <h2 className="mt-2 text-lg sm:text-xl font-semibold text-slate-950">Need more details?</h2>
                  </div>
                  <Mail className="h-5 w-5 text-slate-400" />
                </div>

                <p className="mt-4 text-sm leading-relaxed text-slate-600">
                  Send a general enquiry to Sorana Property Managers for the latest availability,
                  viewing guidance, or next steps.
                </p>

                <a
                  href={enquiryHref}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-primary-foreground transition hover:bg-primary-hover"
                >
                  <Mail size={14} />
                  Enquire by Email
                </a>

                <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
                  This public page intentionally hides tenant, owner, and other private dashboard details.
                </p>
              </div>

              <div className="rounded-[32px] border border-white/80 bg-slate-950 p-6 sm:p-8 text-white shadow-[0_18px_45px_-35px_rgba(15,23,42,0.45)]">
                <p className="text-[10px] uppercase tracking-[0.28em] text-slate-400">Scan info</p>
                <h2 className="mt-2 text-lg sm:text-xl font-semibold">QR code ready for printing</h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">
                  The downloaded QR code can be placed outside the property or gate and will open
                  this public availability page on any phone.
                </p>
              </div>
            </aside>
          </section>
        </div>
      </main>
    );
  }

  const { property, owner } = data;
  const isAirbnb = property.listingType === "airbnb";
  const reviewData = await getReviews(id);
  const initialReviews =
    reviewData.success && reviewData.reviews ? reviewData.reviews : [];
  const reviewCount =
    reviewData.success && typeof reviewData.reviewCount === "number"
      ? reviewData.reviewCount
      : property.reviewCount ?? 0;
  const rating =
    reviewData.success && typeof reviewData.rating === "number"
      ? reviewData.rating
      : property.rating ?? 0;
  const ratingLabel = reviewCount ? `${rating.toFixed(1)} ★` : "No reviews yet";
  const ratingDetail = reviewCount
    ? `${reviewCount.toLocaleString()} reviews`
    : "Be the first to review";

  const isSale = property.listingType === "sale";
  const isRental = property.listingType === "rentals";
  const availability = isAirbnb || isSale ? null : ensureAvailability(property);
  const images = property.images?.length ? property.images : ["/logo.png"];

  const unitTypes = !isAirbnb && !isSale ? property.unitTypes ?? [] : [];
  const minPrice = unitTypes.length ? Math.min(...unitTypes.map((u) => Number(u.price) || 0)) : 0;
  const maxPrice = unitTypes.length ? Math.max(...unitTypes.map((u) => Number(u.price) || 0)) : 0;

  const airbnbListing = isAirbnb ? (property as AirbnbPublicListing) : null;
  const saleListing = isSale ? (property as SalePublicListing) : null;
  const nightlyRate = airbnbListing?.baseRate || 0;
  const defaultContactEmail = isSale ? "sales@soranapropertymanagers.com" : "bookings@soranapropertymanagers.com";
  const contactEmail = owner?.email || defaultContactEmail;
  const contactLink = `mailto:${contactEmail}`;
  const listingContactPhone = property.contactPhone || owner?.phone || null;

  return (
    <main className="relative isolate min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-28 pb-16">
        <Link
          href="/market-place"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/85 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-600 transition hover:text-slate-900"
        >
          <ArrowLeft size={14} />
          Back to listings
        </Link>

        <section className="mt-8 grid gap-10 items-start lg:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-8 min-w-0">
            <div className="rounded-[32px] border border-white/70 bg-white/85 p-4 sm:p-6 shadow-[0_22px_50px_-40px_rgba(15,23,42,0.45)] backdrop-blur">
              <ImageGallery images={images} title={property.name} />
            </div>

            <div className="rounded-[32px] border border-white/70 bg-white/85 p-6 sm:p-8 shadow-[0_18px_40px_-35px_rgba(15,23,42,0.45)] backdrop-blur">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Property</p>
                  <h1 className="mt-2 text-xl sm:text-2xl lg:text-3xl font-semibold text-slate-900 font-[var(--font-cormorant)] break-words">
                    {property.name}
                  </h1>
                  <p className="mt-2 flex items-center gap-2 text-xs sm:text-sm text-slate-500 break-words">
                    <MapPin size={14} className="flex-shrink-0" />
                    {property.address}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
                      <Star size={13} className="text-amber-500" />
                      {ratingLabel}
                    </span>
                    <span>{ratingDetail}</span>
                  </div>
                </div>

                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider mt-3 sm:mt-0 ${
                    isAirbnb || isSale
                      ? property.status === "published"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                      : property.status === "Active"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {(isAirbnb || isSale) && property.status === "published" ? "Live" : property.status}
                </span>
              </div>

              {isAirbnb ? (
                <div className="mt-6 sm:mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="rounded-2xl border border-white/70 bg-white/70 p-4 text-center backdrop-blur">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Nightly rate</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      {airbnbListing?.baseRate
                        ? `Ksh ${airbnbListing.baseRate.toLocaleString()}`
                        : "On request"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/70 bg-white/70 p-4 text-center backdrop-blur">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Weekend rate</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      {airbnbListing?.weekendRate
                        ? `Ksh ${airbnbListing.weekendRate.toLocaleString()}`
                        : "On request"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/70 bg-white/70 p-4 text-center backdrop-blur">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Rating</p>
                    <p className="mt-2 text-xl font-semibold text-slate-900">{ratingLabel}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{ratingDetail}</p>
                  </div>
                </div>
              ) : isSale ? (
                <div className="mt-6 sm:mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="rounded-2xl border border-white/70 bg-white/70 p-4 text-center backdrop-blur">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Sale price</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      {saleListing?.price ? `${saleListing.currency || "Ksh"} ${Number(saleListing.price).toLocaleString()}` : "On request"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/70 bg-white/70 p-4 text-center backdrop-blur">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Details</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {[
                        saleListing?.propertyType ? saleListing.propertyType : null,
                        Number.isFinite(Number(saleListing?.bedrooms)) ? `${Number(saleListing?.bedrooms)} bed` : null,
                        Number.isFinite(Number(saleListing?.bathrooms)) ? `${Number(saleListing?.bathrooms)} bath` : null,
                      ]
                        .filter(Boolean)
                        .join(" • ") || "On request"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/70 bg-white/70 p-4 text-center backdrop-blur">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Rating</p>
                    <p className="mt-2 text-xl font-semibold text-slate-900">{ratingLabel}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{ratingDetail}</p>
                  </div>
                </div>
              ) : (
                <div className="mt-6 sm:mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="rounded-2xl border border-white/70 bg-white/70 p-4 text-center backdrop-blur">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Price range</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      {minPrice ? `Ksh ${minPrice.toLocaleString()} – ${maxPrice.toLocaleString()}` : "On request"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/70 bg-white/70 p-4 text-center backdrop-blur">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Vacant units</p>
                    <p className="mt-2 text-xl font-semibold text-emerald-600">
                      {availability?.totalVacant ?? 0}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/70 bg-white/70 p-4 text-center backdrop-blur">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Occupancy</p>
                    <p className="mt-2 text-xl font-semibold text-slate-900">
                      {availability?.occupancyRate ?? 0}%
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/70 bg-white/70 p-4 text-center backdrop-blur">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Rating</p>
                    <p className="mt-2 text-xl font-semibold text-slate-900">{ratingLabel}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{ratingDetail}</p>
                  </div>
                </div>
              )}

              {property.description && (
                <div className="mt-8">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">Overview</p>
                  <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-line break-words">
                    {property.description}
                  </p>
                </div>
              )}
            </div>

            {isAirbnb ? (
              <div className="rounded-[32px] border border-white/70 bg-white/85 p-6 sm:p-8 shadow-[0_18px_40px_-35px_rgba(15,23,42,0.45)] backdrop-blur space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg sm:text-xl font-semibold text-slate-900">Stay profile</h2>
                  <p className="text-xs text-slate-500">
                    {reviewCount.toLocaleString()} reviews
                  </p>
                </div>

                {airbnbListing?.amenities?.length ? (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">Amenities</p>
                    <div className="flex flex-wrap gap-2">
                      {airbnbListing.amenities.map((amenity) => (
                        <span
                          key={amenity}
                          className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-[10px] text-slate-600"
                        >
                          {amenity}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {airbnbListing?.houseRules?.length ? (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">House rules</p>
                    <ul className="space-y-2 text-xs text-slate-600">
                      {airbnbListing.houseRules.map((rule) => (
                        <li key={rule} className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3">
                          {rule}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : isSale ? (
              <div className="rounded-[32px] border border-white/70 bg-white/85 p-6 sm:p-8 shadow-[0_18px_40px_-35px_rgba(15,23,42,0.45)] backdrop-blur space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg sm:text-xl font-semibold text-slate-900">Property details</h2>
                  <p className="text-xs text-slate-500">{reviewCount.toLocaleString()} reviews</p>
                </div>

                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">Highlights</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      saleListing?.propertyType ? saleListing.propertyType : null,
                      Number.isFinite(Number(saleListing?.bedrooms)) ? `${Number(saleListing?.bedrooms)} bedroom` : null,
                      Number.isFinite(Number(saleListing?.bathrooms)) ? `${Number(saleListing?.bathrooms)} bathroom` : null,
                      Number.isFinite(Number(saleListing?.interiorSizeSqft))
                        ? `${Number(saleListing?.interiorSizeSqft).toLocaleString()} sqft`
                        : null,
                      Number.isFinite(Number(saleListing?.lotSizeSqft))
                        ? `Lot ${Number(saleListing?.lotSizeSqft).toLocaleString()} sqft`
                        : null,
                      Number.isFinite(Number(saleListing?.yearBuilt)) ? `Built ${Number(saleListing?.yearBuilt)}` : null,
                    ]
                      .filter(Boolean)
                      .map((item) => (
                        <span
                          key={String(item)}
                          className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-[10px] text-slate-600"
                        >
                          {item}
                        </span>
                      ))}
                    {!saleListing && (
                      <span className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-[10px] text-slate-600">
                        Details on request
                      </span>
                    )}
                  </div>
                </div>

                {saleListing?.amenities?.length ? (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">Amenities</p>
                    <div className="flex flex-wrap gap-2">
                      {saleListing.amenities.map((amenity) => (
                        <span
                          key={amenity}
                          className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-[10px] text-slate-600"
                        >
                          {amenity}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-[32px] border border-white/70 bg-white/85 p-6 sm:p-8 shadow-[0_18px_40px_-35px_rgba(15,23,42,0.45)] backdrop-blur">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg sm:text-xl font-semibold text-slate-900">Unit mix</h2>
                  <p className="text-xs text-slate-500">Live availability</p>
                </div>

                <div className="space-y-4">
                  {unitTypes.map((unit, idx) => (
                    <div
                      key={`${property._id}-${unit.type}-${idx}`}
                      className="rounded-2xl border border-slate-200 bg-white/70 p-5 sm:p-6 hover:bg-white transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <p className="text-sm sm:text-base font-semibold text-slate-900">{unit.type}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">{unit.uniqueType || "Standard"}</p>
                        </div>
                        <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                          <span className="flex items-center gap-1.5">
                            <DollarSign size={14} /> {unit.price?.toLocaleString() ?? "?"} / mo
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

            <ReviewsSection
              listingId={property._id}
              listingType={property.listingType}
              initialReviews={initialReviews}
              initialRating={rating}
              initialReviewCount={reviewCount}
            />
          </div>

          <aside className="space-y-6 min-w-0 lg:sticky lg:top-24 lg:h-fit">
            {isAirbnb ? (
              <BookingRequest
                propertyName={property.name}
                contactPhone={listingContactPhone}
                nightlyRate={nightlyRate}
              />
            ) : isSale ? (
              <div className="rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_18px_40px_-35px_rgba(15,23,42,0.45)] backdrop-blur">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">
                    {isSale ? "Request details" : "Schedule viewing"}
                  </h3>
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                    <Star size={12} /> Verified
                  </span>
                </div>
                <div className="mt-4 rounded-2xl border border-white/70 bg-white/70 p-4 backdrop-blur">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">
                    {isSale ? "Sale price" : "Monthly rent"}
                  </p>
                  <p className="mt-2 text-xl font-semibold text-slate-900">
                    {isSale
                      ? saleListing?.price
                        ? `${saleListing.currency || "Ksh"} ${Number(saleListing.price).toLocaleString()}`
                        : "On request"
                      : minPrice
                        ? `Ksh ${minPrice.toLocaleString()}`
                        : "On request"}
                  </p>
                </div>

                <a
                  href={contactLink}
                  className="mt-4 block w-full rounded-full bg-primary px-5 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.24em] text-primary-foreground transition hover:bg-primary-hover"
                >
                  {isSale ? "Request viewing" : "Schedule viewing"}
                </a>

                <p className="mt-4 text-[11px] text-slate-500">Response within 2 business hours.</p>
              </div>
            ) : isRental ? (
              <div className="rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_18px_40px_-35px_rgba(15,23,42,0.45)] backdrop-blur">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">Request viewing</h3>
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                    <Star size={12} /> Direct contact
                  </span>
                </div>

                <div className="mt-4 rounded-2xl border border-white/70 bg-white/70 p-4 backdrop-blur">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">
                    Monthly rent
                  </p>
                  <p className="mt-2 text-xl font-semibold text-slate-900">
                    {minPrice ? `Ksh ${minPrice.toLocaleString()}` : "On request"}
                  </p>
                </div>

                <ViewingRequestWhatsApp
                  propertyName={property.name}
                  contactPhone={listingContactPhone}
                />
              </div>
            ) : (
              <div className="rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_18px_40px_-35px_rgba(15,23,42,0.45)] backdrop-blur">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">Request details</h3>
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                    <Star size={12} /> Direct contact
                  </span>
                </div>
                <p className="mt-4 text-sm text-slate-600">
                  This listing does not currently support a direct viewing request action.
                </p>
              </div>
            )}

          </aside>
        </section>
      </div>
    </main>
  );
}
