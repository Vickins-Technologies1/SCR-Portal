import { useState, useEffect } from "react";

interface AuthState {
  userId: string | null;
  role: string | null;
}

export default function useAuth(): AuthState {
  const [authState, setAuthState] = useState<AuthState>({ userId: null, role: null });

  useEffect(() => {
    // Function to parse cookies
    const getCookies = (): { [key: string]: string } => {
      const cookies = document.cookie.split(";").reduce((acc, cookie) => {
        const [name, value] = cookie.trim().split("=");
        acc[name] = value;
        return acc;
      }, {} as { [key: string]: string });
      return cookies;
    };

    try {
      const cookies = getCookies();
      const userId = cookies["userId"] || null;
      const role = cookies["role"] || null;

      console.log("useAuth - Cookies parsed:", { userId, role });

      setAuthState({ userId, role });
    } catch (error) {
      console.error("Error parsing cookies in useAuth:", {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      });
      setAuthState({ userId: null, role: null });
    }
  }, []);

  return authState;
}