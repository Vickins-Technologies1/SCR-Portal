"use client";

import { useEffect, useRef, useState } from "react";

type OtpCodeFieldProps = {
  value: string;
  onChange: (value: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  label?: string;
  helperText?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  labelClassName?: string;
  helperTextClassName?: string;
  buttonClassName?: string;
};

const OTP_LENGTH = 6;

function normalizeOtpInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, OTP_LENGTH);
}

export default function OtpCodeField({
  value,
  onChange,
  inputRef,
  label = "6-digit OTP",
  helperText = "You can paste the code from SMS or email, or let your phone autofill it automatically.",
  placeholder = "123456",
  disabled = false,
  className = "",
  inputClassName = "",
  labelClassName = "",
  helperTextClassName = "",
  buttonClassName = "",
}: OtpCodeFieldProps) {
  const [isReadingClipboard, setIsReadingClipboard] = useState(false);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (disabled) return;
    if (typeof window === "undefined") return;
    if (typeof navigator === "undefined") return;

    const credentials = (navigator as Navigator & {
      credentials?: { get?: (options: Record<string, unknown>) => Promise<unknown> };
    }).credentials;

    if (!credentials?.get) return;

    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      try {
        const otpCredential = await credentials.get({
          otp: { transport: ["sms"] },
          signal: controller.signal,
        });

        if (cancelled) return;

        const code = normalizeOtpInput(
          String(
            (otpCredential as { code?: unknown })?.code ||
              (otpCredential as { password?: unknown })?.password ||
              ""
          )
        );

        if (code) {
          onChangeRef.current(code);
          inputRef?.current?.focus();
        }
      } catch {
        // Web OTP is best-effort only. Manual entry and native Android retriever still work.
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [disabled, inputRef]);

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedValue = normalizeOtpInput(event.clipboardData.getData("text"));
    if (!pastedValue) return;
    event.preventDefault();
    onChange(pastedValue);
  };

  const handlePasteClick = async () => {
    if (disabled || typeof navigator === "undefined" || !navigator.clipboard?.readText) return;
    setIsReadingClipboard(true);
    try {
      const text = await navigator.clipboard.readText();
      const pastedValue = normalizeOtpInput(text);
      if (pastedValue) {
        onChange(pastedValue);
        inputRef?.current?.focus();
      }
    } catch {
      // Ignore clipboard errors and leave the manual input path available.
    } finally {
      setIsReadingClipboard(false);
    }
  };

  return (
    <div className={`space-y-2 ${className}`.trim()}>
      <label className={`block space-y-1 ${labelClassName}`.trim()}>
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          enterKeyHint="done"
          spellCheck={false}
          autoCorrect="off"
          value={value}
          onChange={(event) => onChange(normalizeOtpInput(event.target.value))}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full rounded-xl border border-border bg-background px-4 py-3 text-center text-sm font-semibold tracking-[0.35em] tabular-nums shadow-inner focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60 ${inputClassName}`.trim()}
        />
      </label>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={handlePasteClick}
          disabled={disabled || isReadingClipboard}
          className={`inline-flex items-center justify-center rounded-lg border border-border bg-background/80 px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60 ${buttonClassName}`.trim()}
        >
          {isReadingClipboard ? "Reading clipboard..." : "Paste code"}
        </button>
        {helperText && <p className={`text-xs text-muted-foreground ${helperTextClassName}`.trim()}>{helperText}</p>}
      </div>
    </div>
  );
}
