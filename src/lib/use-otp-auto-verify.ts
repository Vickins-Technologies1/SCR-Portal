"use client";

import { useCallback, useEffect, useRef } from "react";

const OTP_LENGTH = 6;

function normalizeCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, OTP_LENGTH);
}

/** Shares one auto/manual verification path for typed and autofilled OTPs. */
export function useOtpAutoVerify({
  code,
  enabled,
  onVerify,
}: {
  code: string;
  enabled: boolean;
  onVerify: (code: string) => Promise<void>;
}) {
  const onVerifyRef = useRef(onVerify);
  const lastAutoCodeRef = useRef("");
  const inFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    onVerifyRef.current = onVerify;
  }, [onVerify]);

  const verify = useCallback((candidate: string, manual = false): Promise<void> => {
    const normalized = normalizeCode(candidate);
    if (normalized.length !== OTP_LENGTH) return Promise.resolve();
    if (inFlightRef.current) return inFlightRef.current;
    if (!manual && lastAutoCodeRef.current === normalized) return Promise.resolve();

    // Mark manual attempts too, so a completion effect cannot submit the same
    // code again after the form's loading state changes.
    lastAutoCodeRef.current = normalized;
    const request = Promise.resolve()
      .then(() => onVerifyRef.current(normalized))
      .finally(() => {
        if (inFlightRef.current === request) inFlightRef.current = null;
      });
    inFlightRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    const normalized = normalizeCode(code);
    if (!enabled || normalized.length !== OTP_LENGTH) {
      if (normalized.length !== OTP_LENGTH) lastAutoCodeRef.current = "";
      return;
    }
    void verify(normalized);
  }, [code, enabled, verify]);

  return verify;
}
