import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignOutButton } from "./sign-out-button";

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  return (
    <main>
      <h1>Mini ERP workspace</h1>
      <p>Welcome, {session.user.name}.</p>
      <p>Your business workspace will be available here.</p>
      <SignOutButton />
    </main>
  );
}