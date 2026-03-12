"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface ImageGalleryProps {
  images: string[];
  title: string;
}

export default function ImageGallery({ images, title }: ImageGalleryProps) {
  const safeImages = useMemo(() => (images.length ? images : ["/logo.png"]), [images]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (activeIndex >= safeImages.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, safeImages.length]);

  const goNext = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % safeImages.length);
  }, [safeImages.length]);

  const goPrev = useCallback(() => {
    setActiveIndex((prev) => (prev - 1 + safeImages.length) % safeImages.length);
  }, [safeImages.length]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
      if (event.key === "ArrowRight") goNext();
      if (event.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, goNext, goPrev]);

  const activeImage = safeImages[activeIndex];

  return (
    <div className="space-y-4">
      <div className="relative h-72 w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm sm:h-80">
        <button
          type="button"
          className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/70 bg-white/80 p-2 text-slate-700 shadow-sm transition hover:bg-white"
          onClick={goPrev}
          aria-label="Previous image"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/70 bg-white/80 p-2 text-slate-700 shadow-sm transition hover:bg-white"
          onClick={goNext}
          aria-label="Next image"
        >
          <ChevronRight size={18} />
        </button>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="absolute inset-0 z-0"
          aria-label="Open full screen gallery"
        />
        <Image src={activeImage} alt={title} fill className="object-cover" sizes="(max-width: 1024px) 100vw, 70vw" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/35 via-transparent to-transparent" />
      </div>

      {safeImages.length > 1 && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {safeImages.map((src, idx) => (
            <button
              key={src + String(idx)}
              type="button"
              onClick={() => setActiveIndex(idx)}
              className={`relative h-20 w-28 shrink-0 overflow-hidden rounded-2xl border ${
                idx === activeIndex ? "border-cyan-500 ring-2 ring-cyan-200" : "border-slate-200"
              }`}
              aria-label={`View image ${idx + 1}`}
            >
              <Image src={src} alt={`${title} thumbnail ${idx + 1}`} fill className="object-cover" />
            </button>
          ))}
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 px-4">
          <div className="relative w-full max-w-5xl">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl bg-black">
              <Image src={activeImage} alt={title} fill className="object-contain" sizes="100vw" />
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute right-3 top-3 rounded-full border border-white/20 bg-white/10 p-2 text-white hover:bg-white/20"
              aria-label="Close full screen"
            >
              <X size={18} />
            </button>
            <button
              type="button"
              onClick={goPrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-white/10 p-2 text-white hover:bg-white/20"
              aria-label="Previous image"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-white/10 p-2 text-white hover:bg-white/20"
              aria-label="Next image"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
