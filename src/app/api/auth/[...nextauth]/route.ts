import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // Replace with your auth logic (e.g., check MongoDB users collection)
        if (credentials?.email === "user@example.com" && credentials?.password === "password") {
          return { id: "user123", name: "Test User", email: "user@example.com" };
        }
        return null;
      },
    }),
  ],
};

export default NextAuth(authOptions);