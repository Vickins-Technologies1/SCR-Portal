"use client";

import { registerPlugin } from "@capacitor/core";

type GoogleAuthPlugin = {
  signIn(options: { serverClientId: string }): Promise<{ idToken: string; email?: string; name?: string }>;
};

export const GoogleAuth = registerPlugin<GoogleAuthPlugin>("GoogleAuth");
