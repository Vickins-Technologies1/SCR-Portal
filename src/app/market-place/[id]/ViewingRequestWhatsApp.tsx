"use client";

import { useMemo, useState } from "react";
import { MessageCircle, PhoneOff } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { buildWhatsAppLink, normalizeWhatsAppPhone } from "@/lib/listing-contact";

interface ViewingRequestWhatsAppProps {
  propertyName: string;
  contactPhone?: string | null;
}

export default function ViewingRequestWhatsApp({ propertyName, contactPhone }: ViewingRequestWhatsAppProps) {
  const [isOpening, setIsOpening] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const normalizedPhone = useMemo(() => normalizeWhatsAppPhone(contactPhone), [contactPhone]);
  const message = useMemo(
    () => `Hello, I am interested in viewing ${propertyName} listed on Sorana. I would like to arrange a suitable viewing time.`,
    [propertyName]
  );

  const handleClick = () => {
    if (isOpening) return;

    if (!normalizedPhone) {
      toast.error("This listing does not have a valid WhatsApp contact number.");
      setStatusMessage("This listing does not have a valid WhatsApp contact number yet.");
      return;
    }

    const preferWeb =
      typeof window !== "undefined" && !/Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent);
    const link = buildWhatsAppLink(normalizedPhone, message, preferWeb);

    if (!link) {
      toast.error("The listed WhatsApp number is invalid.");
      setStatusMessage("The listed WhatsApp number is invalid. Please contact support or choose another listing.");
      return;
    }

    setIsOpening(true);
    setStatusMessage(null);

    try {
      window.open(link, "_blank", "noopener,noreferrer");
      toast.success("Opening WhatsApp with your viewing request.");
      setStatusMessage("WhatsApp opened with a prefilled viewing request. This does not confirm the viewing.");
    } catch {
      toast.error("Unable to open WhatsApp right now.");
      setStatusMessage("Unable to open WhatsApp right now. Please message the contact manually.");
    } finally {
      setIsOpening(false);
    }
  };

  return (
    <div className="mt-4 space-y-3">
      <Toaster position="top-right" toastOptions={{ duration: 2500 }} />

      <button
        type="button"
        onClick={handleClick}
        disabled={!normalizedPhone || isOpening}
        className="w-full rounded-full bg-primary px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary-foreground transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 inline-flex items-center justify-center gap-2"
      >
        <MessageCircle size={14} />
        {isOpening ? "Opening WhatsApp..." : "Request Viewing on WhatsApp"}
      </button>

      <div className="rounded-2xl border border-white/70 bg-white/70 p-4 text-[11px] text-slate-500">
        <div className="flex items-center justify-between gap-3">
          <span className="uppercase tracking-wider">Contact</span>
          <span className="font-mono text-[10px] text-slate-700">{contactPhone || "Not listed"}</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <PhoneOff size={12} className={normalizedPhone ? "text-emerald-600" : "text-amber-600"} />
          <span>{normalizedPhone ? "WhatsApp opens with a prefilled viewing request." : "No valid WhatsApp contact number is listed for this property."}</span>
        </div>
      </div>

      {statusMessage ? <p className="text-[11px] text-slate-500">{statusMessage}</p> : null}
    </div>
  );
}
