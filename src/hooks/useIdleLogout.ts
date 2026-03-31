// src/hooks/useIdleLogout.ts
import { useEffect, useRef } from "react";

interface IdleLogoutOptions {
  timeoutMs: number;
  onIdle: () => void;
}

export function useIdleLogout({ timeoutMs, onIdle }: IdleLogoutOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onIdleRef = useRef(onIdle);

  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const resetTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        onIdleRef.current();
      }, timeoutMs);
    };

    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click", "focus"];
    events.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }));

    resetTimer();

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      events.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [timeoutMs]);
}
