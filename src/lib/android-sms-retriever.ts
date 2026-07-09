"use client";

import { useEffect, useRef, useState } from "react";
import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";

type SmsRetrieverReceivedEvent = {
  message?: string;
  code?: string;
};

type SmsRetrieverPlugin = {
  getAppHash(): Promise<{ hash: string }>;
  startListening(): Promise<void>;
  stopListening(): Promise<void>;
  addListener(
    eventName: "smsRetrieved" | "smsTimeout",
    listenerFunc: (event: SmsRetrieverReceivedEvent) => void
  ): Promise<PluginListenerHandle>;
};

const SmsRetriever = registerPlugin<SmsRetrieverPlugin>("SmsRetriever", {
  web: {
    async getAppHash() {
      return { hash: "" };
    },
    async startListening() {},
    async stopListening() {},
    async addListener() {
      return { remove: async () => undefined };
    },
  },
});

function normalizeOtpCode(message: string): string {
  const match = message.match(/\b(\d{6})\b/);
  return match?.[1] || "";
}

export function isAndroidNativeApp(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function getAndroidAppHash(): Promise<string> {
  if (!isAndroidNativeApp()) return "";
  try {
    const result = await SmsRetriever.getAppHash();
    return typeof result?.hash === "string" ? result.hash.trim() : "";
  } catch {
    return "";
  }
}

export function useAndroidSmsRetriever(params: {
  enabled?: boolean;
  onCode?: (code: string) => void;
} = {}) {
  const { enabled = true, onCode } = params;
  const [appHash, setAppHash] = useState("");
  const onCodeRef = useRef(onCode);

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    let cancelled = false;
    let receivedHandle: PluginListenerHandle | null = null;
    let timeoutHandle: PluginListenerHandle | null = null;

    if (!enabled) {
      setAppHash("");
      return () => undefined;
    }

    (async () => {
      if (!isAndroidNativeApp()) return;

      try {
        const hash = await getAndroidAppHash();
        if (cancelled) return;
        setAppHash(hash);

        receivedHandle = await SmsRetriever.addListener("smsRetrieved", (event) => {
          const message = String(event?.message || "");
          const code = String(event?.code || normalizeOtpCode(message));
          if (code && onCodeRef.current) {
            onCodeRef.current(code);
          }
        });

        timeoutHandle = await SmsRetriever.addListener("smsTimeout", () => {
          // Let the manual entry path continue unchanged.
        });

        await SmsRetriever.startListening();
      } catch {
        if (!cancelled) {
          setAppHash("");
        }
      }
    })();

    return () => {
      cancelled = true;
      receivedHandle?.remove?.().catch(() => null);
      timeoutHandle?.remove?.().catch(() => null);
      SmsRetriever.stopListening().catch(() => null);
    };
  }, [enabled]);

  return { appHash, isAndroid: isAndroidNativeApp() };
}

export async function startAndroidSmsRetriever(): Promise<string> {
  if (!isAndroidNativeApp()) return "";

  const hash = await getAndroidAppHash();
  try {
    await SmsRetriever.startListening();
  } catch {
    return hash;
  }

  return hash;
}

export async function stopAndroidSmsRetriever(): Promise<void> {
  if (!isAndroidNativeApp()) return;
  await SmsRetriever.stopListening().catch(() => null);
}
