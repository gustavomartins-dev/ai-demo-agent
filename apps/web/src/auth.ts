import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { customFetch } from "next-auth";
import GitHub from "next-auth/providers/github";

import { db } from "@/lib/db";
import { isWorkspaceOwner } from "@/lib/owner-access";
import { githubOAuthFetch } from "@/lib/github-oauth-fetch";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  providers: [GitHub({ [customFetch]: githubOAuthFetch })],
  session: { strategy: "database" },
  pages: {
    signIn: "/login",
    error: "/auth/error",
  },
  callbacks: {
    signIn({ account, profile }) {
      return account?.provider === "github" && isWorkspaceOwner(profile?.login);
    },
  },
});
