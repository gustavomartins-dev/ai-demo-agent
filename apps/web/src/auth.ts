import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

import { db } from "@/lib/db";
import { isWorkspaceOwner } from "@/lib/owner-access";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  providers: [GitHub],
  session: { strategy: "database" },
  callbacks: {
    signIn({ account, profile }) {
      return account?.provider === "github" && isWorkspaceOwner(profile?.login);
    },
  },
});
