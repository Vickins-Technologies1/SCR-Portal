"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

type Placement = "top" | "bottom" | "left" | "right" | "center";

export interface TourStep {
  title: string;
  body: string;
  selector?: string;
  placement?: Placement;
  paths?: string[];
}

interface TourGuideProps {
  steps: TourStep[];
  storageKey: string;
  startEventName?: string;
  autoStart?: boolean;
  currentPath?: string;
}

type Rect = { top: number; left: number; width: number; height: number };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

export default function TourGuide({
  steps,
  storageKey,
  startEventName,
  autoStart = true,
  currentPath,
}: TourGuideProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipSize, setTooltipSize] = useState<{ width: number; height: number } | null>(null);

  const resolvedSteps = useMemo(() => {
    return steps.filter((step) => {
      if (!step.paths || step.paths.length === 0) return true;
      if (!currentPath) return false;
      return step.paths.some((path) => currentPath.startsWith(path));
    });
  }, [steps, currentPath]);

  const currentStep = resolvedSteps[stepIndex];

  const canStart = useMemo(() => typeof window !== "undefined", []);

  useEffect(() => {
    if (!canStart || !autoStart) return;
    const alreadyCompleted = window.localStorage.getItem(storageKey);
    if (!alreadyCompleted && resolvedSteps.length > 0) {
      setIsOpen(true);
      setStepIndex(0);
    }
  }, [autoStart, canStart, storageKey, resolvedSteps.length]);

  useEffect(() => {
    if (!startEventName || !canStart) return;
    const handler = () => {
      if (resolvedSteps.length === 0) return;
      setIsOpen(true);
      setStepIndex(0);
    };
    window.addEventListener(startEventName, handler);
    return () => window.removeEventListener(startEventName, handler);
  }, [startEventName, canStart, resolvedSteps.length]);

  const isStepVisible = (step?: TourStep) => {
    if (!step) return false;
    if (!step.selector) return true;
    return !!document.querySelector(step.selector);
  };

  const findNextEligible = (from: number) => {
    for (let i = from; i < resolvedSteps.length; i += 1) {
      if (isStepVisible(resolvedSteps[i])) return i;
    }
    return -1;
  };

  const findPrevEligible = (from: number) => {
    for (let i = from; i >= 0; i -= 1) {
      if (isStepVisible(resolvedSteps[i])) return i;
    }
    return -1;
  };

  useEffect(() => {
    if (!isOpen) return;
    if (resolvedSteps.length === 0) {
      setIsOpen(false);
      return;
    }
    const nextIndex = findNextEligible(stepIndex);
    if (nextIndex === -1) {
      setIsOpen(false);
      return;
    }
    if (nextIndex !== stepIndex) {
      setStepIndex(nextIndex);
    }
  }, [isOpen, stepIndex, resolvedSteps]);

  useEffect(() => {
    if (!isOpen) return;
    const step = resolvedSteps[stepIndex];
    if (!step?.selector) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(step.selector) as HTMLElement | null;
    if (!el) {
      setTargetRect(null);
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    const rect = el.getBoundingClientRect();
    setTargetRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
  }, [isOpen, stepIndex, steps]);

  useLayoutEffect(() => {
    if (!tooltipRef.current) return;
    const rect = tooltipRef.current.getBoundingClientRect();
    setTooltipSize({ width: rect.width, height: rect.height });
  }, [isOpen, stepIndex]);

  if (!isOpen || !currentStep) return null;

  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1024;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 768;

  const padding = 12;
  const tooltipWidth = tooltipSize?.width ?? 320;
  const tooltipHeight = tooltipSize?.height ?? 160;

  let tooltipTop = (viewportHeight - tooltipHeight) / 2;
  let tooltipLeft = (viewportWidth - tooltipWidth) / 2;

  if (targetRect && currentStep.placement !== "center") {
    const placement = currentStep.placement || "bottom";

    if (placement === "top") {
      tooltipTop = targetRect.top - tooltipHeight - padding;
      tooltipLeft = targetRect.left;
    } else if (placement === "bottom") {
      tooltipTop = targetRect.top + targetRect.height + padding;
      tooltipLeft = targetRect.left;
    } else if (placement === "left") {
      tooltipTop = targetRect.top;
      tooltipLeft = targetRect.left - tooltipWidth - padding;
    } else if (placement === "right") {
      tooltipTop = targetRect.top;
      tooltipLeft = targetRect.left + targetRect.width + padding;
    }
  }

  tooltipTop = clamp(tooltipTop, padding, viewportHeight - tooltipHeight - padding);
  tooltipLeft = clamp(tooltipLeft, padding, viewportWidth - tooltipWidth - padding);

  const handleClose = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, "done");
    }
    setIsOpen(false);
  };

  const handleNext = () => {
    if (stepIndex >= resolvedSteps.length - 1) {
      handleClose();
      return;
    }
    const nextIndex = findNextEligible(stepIndex + 1);
    if (nextIndex === -1) {
      handleClose();
    } else {
      setStepIndex(nextIndex);
    }
  };

  const handleBack = () => {
    const prevIndex = findPrevEligible(stepIndex - 1);
    if (prevIndex !== -1) {
      setStepIndex(prevIndex);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999]">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />

      {targetRect && (
        <div
          className="absolute rounded-2xl border-2 border-primary/80 shadow-[0_0_0_6px_rgba(66,199,117,0.2)] pointer-events-none animate-fade-in"
          style={{
            top: Math.max(targetRect.top - 6, 0),
            left: Math.max(targetRect.left - 6, 0),
            width: targetRect.width + 12,
            height: targetRect.height + 12,
          }}
        />
      )}

      <div
        ref={tooltipRef}
        className="absolute max-w-[92vw] w-[320px] sm:w-[360px] surface-card rounded-2xl p-4 sm:p-5 text-foreground shadow-2xl"
        style={{ top: tooltipTop, left: tooltipLeft }}
        role="dialog"
        aria-live="polite"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.32em] text-muted-foreground">Quick Tour</p>
            <h3 className="mt-2 text-base sm:text-lg font-semibold">{currentStep.title}</h3>
          </div>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground transition"
            aria-label="Skip tour"
          >
            ✕
          </button>
        </div>
        <p className="mt-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">{currentStep.body}</p>

        <div className="mt-4 flex items-center justify-between text-xs sm:text-sm">
          <span className="text-muted-foreground">
            Step {stepIndex + 1} of {resolvedSteps.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBack}
              disabled={stepIndex === 0}
              className="px-3 py-1.5 rounded-full border border-gray-200 text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Back
            </button>
            <button
              onClick={handleNext}
              className="px-3.5 py-1.5 rounded-full bg-primary text-white font-semibold shadow-sm hover:bg-primary-hover transition"
            >
              {stepIndex >= steps.length - 1 ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
