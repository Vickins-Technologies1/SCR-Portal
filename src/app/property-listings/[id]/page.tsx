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
    <main className="min-h-screen pt-28 pb-16">
      <div className="max-w-7xl mx-auto px-6">
        <Link
          href="/property-listings"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft size={16} />
          Back to listings
        </Link>

        <section className="mt-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6 lg:space-y-8">
              <div className="surface-card rounded-3xl p-4 sm:p-6">
                <ImageGallery images={images} title={property.name} />
              </div>

              <div className="surface-card rounded-3xl p-5 sm:p-6 lg:p-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="eyebrow">Property</p>
                    <h1 className="mt-2 text-2xl sm:text-3xl lg:text-4xl font-semibold text-foreground">
                      {property.name}
                    </h1>
                    <p className="mt-2 flex items-center gap-2 text-sm sm:text-base text-muted-foreground">
                      <MapPin size={18} className="flex-shrink-0" />
                      {property.address}
                    </p>
                  </div>

                  <span
                    className={`inline-flex items-center rounded-full px-4 py-1.5 text-xs sm:text-sm font-semibold uppercase tracking-wider mt-3 sm:mt-0 ${
                      property.status === "Active"
                        ? "border border-primary/30 bg-primary/10 text-primary"
                        : "border border-border bg-muted/70 text-muted-foreground"
                    }`}
                  >
                    {property.status}
                  </span>
                </div>

                <div className="mt-6 sm:mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="rounded-2xl border border-border bg-muted/60 p-5 text-center">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Price range</p>
                    <p className="mt-2 text-xl sm:text-2xl font-semibold text-foreground">
                      {minPrice ? `Ksh ${minPrice.toLocaleString()} – ${maxPrice.toLocaleString()}` : "On request"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border bg-muted/60 p-5 text-center">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Vacant units</p>
                    <p className="mt-2 text-2xl sm:text-3xl font-bold text-primary">
                      {availability.totalVacant}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border bg-muted/60 p-5 text-center">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Occupancy</p>
                    <p className="mt-2 text-2xl sm:text-3xl font-bold text-foreground">
                      {availability.occupancyRate}%
                    </p>
                  </div>
                </div>

                {property.description && (
                  <div className="mt-8">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Description</p>
                    <p className="text-sm sm:text-base leading-relaxed text-foreground/80 whitespace-pre-line">
                      {property.description}
                    </p>
                  </div>
                )}
              </div>

              <div className="surface-card rounded-3xl p-5 sm:p-6 lg:p-8">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-xl sm:text-2xl font-semibold text-foreground">Unit mix</h2>
                  <p className="text-sm text-muted-foreground">Live availability</p>
                </div>

                <div className="space-y-4">
                  {unitTypes.map((unit, idx) => (
                    <div
                      key={`${property._id}-${unit.type}-${idx}`}
                      className="rounded-2xl border border-border bg-muted/60 p-5 sm:p-6 hover:bg-muted/80 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <p className="text-base sm:text-lg font-semibold text-foreground">{unit.type}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{unit.uniqueType || "Standard"}</p>
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <DollarSign size={16} /> {unit.price?.toLocaleString() ?? "?"} / mo
                          </span>
                          <span>
                            {unit.deposit ? `Deposit: ${unit.deposit.toLocaleString()}` : "No deposit"}
                          </span>
                          <span className="font-medium text-primary">
                            Vacant: {unit.vacant ?? unit.quantity}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <aside className="space-y-6 lg:sticky lg:top-24 lg:h-fit">
              <div className="glass-panel rounded-3xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-5">At a glance</h3>

                <div className="rounded-2xl border border-border bg-background/70 p-5">
                  <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground mb-3">
                    <span>Occupancy</span>
                    <span className="font-semibold text-foreground">{availability.occupancyRate}%</span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${Math.min(100, availability.occupancyRate)}%` }}
                    />
                  </div>
                </div>

                {property.facilities?.length ? (
                  <div className="mt-6">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Facilities</p>
                    <div className="flex flex-wrap gap-2">
                      {property.facilities.map((f) => (
                        <span
                          key={f}
                          className="rounded-full border border-border bg-background/80 px-3.5 py-1 text-xs text-muted-foreground"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="surface-card rounded-3xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-5">Contact owner</h3>

                {owner ? (
                  <div className="space-y-4 text-sm text-muted-foreground">
                    {owner.email && (
                      <a
                        href={`mailto:${owner.email}`}
                        className="flex items-center gap-3 hover:text-primary transition-colors"
                      >
                        <Mail size={18} className="text-muted-foreground" />
                        {owner.email}
                      </a>
                    )}
                    {owner.phone && (
                      <a
                        href={`tel:${owner.phone}`}
                        className="flex items-center gap-3 hover:text-primary transition-colors"
                      >
                        <Phone size={18} className="text-muted-foreground" />
                        {owner.phone}
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Owner details unavailable at this time.</p>
                )}

                <p className="mt-6 text-sm text-muted-foreground leading-relaxed">
                  Feel free to reach out to schedule a viewing or inquire about current availability.
                </p>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}


