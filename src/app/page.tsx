import { ClientApp } from "@/app/client-app";
import { connection } from "next/server";

export default async function Page() {
  // Render per request so the CSP nonce from src/proxy.ts reaches Next's scripts.
  await connection();
  return <ClientApp />;
}
