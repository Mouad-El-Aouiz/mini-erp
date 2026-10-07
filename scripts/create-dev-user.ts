import "dotenv/config";

import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "../src/lib/prisma";

async function main() {
  try {
    const databaseURL = process.env.DATABASE_URL;

    if (!databaseURL) {
      throw new Error("DATABASE_URL is required.");
    }

    const database = new URL(databaseURL);

    if (
      process.env.NODE_ENV === "production" ||
      !["localhost", "127.0.0.1"].includes(database.hostname) ||
      database.pathname !== "/mini_erp"
    ) {
      throw new Error(
        "This script requires the local mini_erp development database.",
      );
    }

    const email = process.env.DEV_USER_EMAIL?.trim().toLowerCase();
    const name = process.env.DEV_USER_NAME?.trim();
    const password = process.env.DEV_USER_PASSWORD;

    if (!email || !name || !password) {
      throw new Error("Development user configuration is incomplete.");
    }

    if (password.length < 12 || password.length > 128) {
      throw new Error("Password must contain 12 to 128 characters.");
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      console.log("Development user already exists. No changes made.");
      return;
    }

    const userId = randomUUID();
    const passwordHash = await hashPassword(password);

    await prisma.user.create({
      data: {
        id: userId,
        name,
        email,
        emailVerified: false,
        accounts: {
          create: {
            id: randomUUID(),
            accountId: userId,
            providerId: "credential",
            password: passwordHash,
          },
        },
      },
    });

    console.log("Development user created.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error &&
      (error.message.startsWith("DATABASE_URL") ||
        error.message.startsWith("This script") ||
        error.message.startsWith("Development user configuration") ||
        error.message.startsWith("Password must"))
      ? error.message
      : "Development user creation failed. Check database availability and migrations.",
  );

  process.exitCode = 1;
});