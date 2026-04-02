// lib/auth.ts
'server-only';

import { cookies } from "next/headers";
import { verifySessionToken } from "./session";

export async function getCurrentSession() {
  const token = (await cookies()).get("session")?.value;
  if (!token) return null;

  return verifySessionToken(token);
}
