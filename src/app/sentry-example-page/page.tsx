import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SentryExampleClient from "./SentryExampleClient";

export const metadata: Metadata = {
  title: "Sentry verification",
  robots: { index: false, follow: false },
};

function verificationEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

export default function SentryExamplePage() {
  if (!verificationEnabled()) notFound();
  return <SentryExampleClient />;
}
