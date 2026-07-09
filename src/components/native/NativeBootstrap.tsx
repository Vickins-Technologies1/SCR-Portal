"use client";

import { useEffect } from "react";
import Cookies from "js-cookie";

type StoredPushToken = {
  token: string;
  platform: string;
  updatedAt: string;
};

const GOOGLE_AUTH_SCHEME = "com.soranapropertymanagers.app";
const GOOGLE_AUTH_CALLBACK_HOST = "auth";
const GOOGLE_AUTH_CALLBACK_PATH = "/google/callback";

async function isNativeCapacitor(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

async function ensureCsrfToken(): Promise<string | null> {
  const existing = Cookies.get("csrf-token");
  if (existing) return existing;

  try {
    const res = await fetch("/api/csrf-token", { credentials: "include", cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.success && typeof data.csrfToken === "string") {
      return data.csrfToken;
    }
  } catch {
    // ignore
  }

  return Cookies.get("csrf-token") || null;
}

async function syncPushTokenToServer(params: { token: string; platform: string }) {
  const userId = Cookies.get("userId");
  const role = Cookies.get("role");
  if (!userId || !role) return;

  const csrfToken = await ensureCsrfToken();
  if (!csrfToken) return;

  await fetch("/api/devices/push-token", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify({ token: params.token, platform: params.platform }),
  }).catch(() => null);
}

export default function NativeBootstrap() {
  useEffect(() => {
    let cancelled = false;
    let interval: number | null = null;
    let registrationHandle: { remove: () => Promise<void> } | null = null;
    let appUrlOpenHandle: { remove: () => Promise<void> } | null = null;

    (async () => {
      const native = await isNativeCapacitor();
      if (!native || cancelled) return;

      const [{ Capacitor }, { PushNotifications }, { Preferences }] = await Promise.all([
        import("@capacitor/core"),
        import("@capacitor/push-notifications"),
        import("@capacitor/preferences"),
      ]);
      const { App } = await import("@capacitor/app");

      const platform = Capacitor.getPlatform();

      appUrlOpenHandle = await App.addListener("appUrlOpen", async ({ url }) => {
        if (cancelled) return;

        try {
          const openedUrl = new URL(url);
          const isGoogleAuthCallback =
            openedUrl.protocol === `${GOOGLE_AUTH_SCHEME}:` &&
            openedUrl.host === GOOGLE_AUTH_CALLBACK_HOST &&
            openedUrl.pathname === GOOGLE_AUTH_CALLBACK_PATH;

          if (!isGoogleAuthCallback) return;

          const webCallbackUrl = new URL("/api/auth/google/callback", window.location.origin);
          webCallbackUrl.search = openedUrl.search;
          webCallbackUrl.hash = openedUrl.hash;
          window.location.assign(webCallbackUrl.toString());
        } catch {
          // Ignore malformed deep links and let the user keep using the app.
        }
      });

      const persistToken = async (token: string) => {
        const stored: StoredPushToken = { token, platform, updatedAt: new Date().toISOString() };
        await Preferences.set({ key: "pushToken", value: JSON.stringify(stored) });
        await syncPushTokenToServer({ token, platform });
      };

      const tryRestoreAndSync = async () => {
        try {
          const stored = await Preferences.get({ key: "pushToken" });
          if (!stored.value) return;
          const parsed = JSON.parse(stored.value) as Partial<StoredPushToken>;
          if (parsed?.token) {
            await syncPushTokenToServer({ token: String(parsed.token), platform: String(parsed.platform || platform) });
          }
        } catch {
          // ignore
        }
      };

      // Keep server in sync once the userId/role cookies exist.
      await tryRestoreAndSync();

      const permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive === "prompt") {
        await PushNotifications.requestPermissions();
      }

      const afterPerm = await PushNotifications.checkPermissions();
      if (afterPerm.receive !== "granted") return;

      // Register with APNS/FCM. If Firebase isn't configured on Android (missing `google-services.json`),
      // registration can fail — treat as best-effort so the app doesn't crash on permission grant.
      try {
        await PushNotifications.register();
      } catch {
        return;
      }

      registrationHandle = await PushNotifications.addListener("registration", async (token) => {
        if (cancelled) return;
        if (!token?.value) return;
        await persistToken(token.value);
      });

      await PushNotifications.addListener("registrationError", async () => {
        // Best-effort: ignore
      });

      // If the user signs in after the token is created, sync again.
      interval = window.setInterval(() => {
        tryRestoreAndSync();
      }, 20_000);
    })();

    return () => {
      cancelled = true;
      if (interval) window.clearInterval(interval);
      interval = null;
      registrationHandle?.remove?.().catch(() => null);
      registrationHandle = null;
      appUrlOpenHandle?.remove?.().catch(() => null);
      appUrlOpenHandle = null;
    };
  }, []);

  return null;
}
