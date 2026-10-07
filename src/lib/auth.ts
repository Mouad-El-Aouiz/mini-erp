import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { prisma } from "./prisma";

const secret = process.env.BETTER_AUTH_SECRET;
const baseURL = process.env.BETTER_AUTH_URL;

if (!secret || secret.length < 32) {
  throw new Error(
    "BETTER_AUTH_SECRET must contain at least 32 characters.",
  );
}

if (!baseURL) {
  throw new Error("BETTER_AUTH_URL is required.");
}

export const auth = betterAuth({
  appName: "Mini ERP",
  secret,
  baseURL,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
  },
});