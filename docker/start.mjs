function validDatabaseURL(value) {
  try {
    const url = new URL(value);
    return ["postgresql:", "postgres:"].includes(url.protocol) && Boolean(url.hostname && url.pathname.length > 1);
  } catch {
    return false;
  }
}

function validAuthURL(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/";
  } catch {
    return false;
  }
}

const secret = process.env.BETTER_AUTH_SECRET ?? "";
if (!validDatabaseURL(process.env.DATABASE_URL)) {
  console.error("DATABASE_URL must be a PostgreSQL connection URL.");
  process.exit(1);
}
if (secret.length < 32 || secret.startsWith("build-only-")) {
  console.error("BETTER_AUTH_SECRET must be a runtime secret of at least 32 characters.");
  process.exit(1);
}
if (!validAuthURL(process.env.BETTER_AUTH_URL)) {
  console.error("BETTER_AUTH_URL must be an absolute HTTP(S) origin.");
  process.exit(1);
}

await import("./server.js");
