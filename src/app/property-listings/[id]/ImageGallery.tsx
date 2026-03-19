"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
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
  const modalRef = useRef<HTMLDivElement>(null);

  // Reset index if out of bounds
  useEffect(() => {
    if (activeIndex >= safeImages.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, safeImages.length]);

  const goTo = useCallback((index: number) => {
    setActiveIndex((prev) => {
      let next = index;
      if (next < 0) next = safeImages.length - 1;
      if (next >= safeImages.length) next = 0;
      return next;
    });
  }, [safeImages.length]);

  const goNext = useCallback(() => goTo(activeIndex + 1), [activeIndex, goTo]);
  const goPrev = useCallback(() => goTo(activeIndex - 1), [activeIndex, goTo]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, goNext, goPrev]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const activeImage = safeImages[activeIndex];

  return (
    <>
      {/* Main gallery preview */}
      <div className="group relative h-80 w-full overflow-hidden rounded-3xl border border-border bg-card shadow-[0_18px_45px_-30px_rgba(30,58,138,0.45)] transition-all duration-300 hover:shadow-[0_26px_60px_-35px_rgba(30,58,138,0.55)] sm:h-96">
        {/* Main image */}
        <Image
          src={activeImage}
          alt={`${title} - Image ${activeIndex + 1}`}
          fill
          className="object-cover transition-transform duration-700 group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 70vw, 60vw"
          priority={activeIndex === 0}
        />

        {/* Navigation buttons - appear on hover */}
        {safeImages.length > 1 && (
          <>
            <button
              onClick={goPrev}
              className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-foreground/40 p-3 text-white opacity-0 backdrop-blur-sm transition-all hover:bg-foreground/60 group-hover:opacity-100 focus:opacity-100"
              aria-label="Previous image"
            >
              <ChevronLeft size={24} />
            </button>

            <button
              onClick={goNext}
              className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-foreground/40 p-3 text-white opacity-0 backdrop-blur-sm transition-all hover:bg-foreground/60 group-hover:opacity-100 focus:opacity-100"
              aria-label="Next image"
            >
              <ChevronRight size={24} />
            </button>
          </>
        )}

        {/* Click to open modal */}
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="absolute inset-0 z-0 cursor-zoom-in"
          aria-label="Open full-screen gallery"
        />
      </div>

      {/* Thumbnails */}
      {safeImages.length > 1 && (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100">
          {safeImages.map((src, idx) => (
            <button
              key={src + idx}
              type="button"
              onClick={() => setActiveIndex(idx)}
              className={`relative h-20 w-28 flex-shrink-0 overflow-hidden rounded-2xl border-2 transition-all duration-200 ${
                idx === activeIndex
                  ? "border-primary scale-105 shadow-md"
                  : "border-transparent opacity-70 hover:opacity-100 hover:scale-105 hover:shadow-sm"
              }`}
              aria-label={`Select image ${idx + 1}`}
            >
              <Image
                src={src}
                alt={`${title} thumbnail ${idx + 1}`}
                fill
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* Full-screen modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/90 backdrop-blur-sm transition-opacity duration-300">
          <div
            ref={modalRef}
            className="relative w-full max-w-6xl px-4 animate-in fade-in zoom-in-95 duration-300"
          >
            {/* Close button */}
            <button
              onClick={() => setIsOpen(false)}
              className="absolute -top-12 right-4 z-20 rounded-full bg-foreground/60 p-3 text-white hover:bg-foreground/80 transition-colors"
              aria-label="Close gallery"
            >
              <X size={24} />
            </button>

            {/* Main full-screen image */}
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-foreground/40">
              <Image
                src={activeImage}
                alt={`${title} - Full screen ${activeIndex + 1}`}
                fill
                className="object-contain"
                sizes="100vw"
              />
            </div>

            {/* Navigation in full screen */}
            {safeImages.length > 1 && (
              <>
                <button
                  onClick={goPrev}
                  className="absolute left-6 top-1/2 z-20 -translate-y-1/2 rounded-full bg-foreground/60 p-4 text-white hover:bg-foreground/80 transition-colors"
                  aria-label="Previous image"
                >
                  <ChevronLeft size={28} />
                </button>

                <button
                  onClick={goNext}
                  className="absolute right-6 top-1/2 z-20 -translate-y-1/2 rounded-full bg-foreground/60 p-4 text-white hover:bg-foreground/80 transition-colors"
                  aria-label="Next image"
                >
                  <ChevronRight size={28} />
                </button>
              </>
            )}

            {/* Counter */}
            <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-full bg-foreground/70 px-4 py-2 text-sm text-white backdrop-blur-sm">
              {activeIndex + 1} / {safeImages.length}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
