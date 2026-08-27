"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authService } from "@/services/appwrite";

export type PublicAccess = "loading" | "none" | "pending" | "approved" | "console";

export function usePublicAccess() {
  const [access, setAccess] = useState<PublicAccess>("loading");

  useEffect(() => {
    let active = true;
    async function checkAccess() {
      const user = await authService.getCurrentUser();
      if (user) {
        try {
          const jwt = await authService.createJWT();
          const response = await fetch('/api/public/session', {
            headers: { Authorization: `Bearer ${jwt.jwt}` },
            cache: 'no-store',
          });
          if (response.ok) {
            if (active) setAccess("console");
            return;
          }
        } catch {
          // Fall through to the waitlist approval check.
        }
      }

      try {
        const response = await fetch('/api/public/access', { cache: 'no-store' });
        const body = (await response.json().catch(() => null)) as
          | { status?: "none" | "pending" | "approved" }
          | null;
        if (active) setAccess(response.ok && body?.status ? body.status : "none");
      } catch {
        if (active) setAccess("none");
      }
    }

    void checkAccess();
    const timer = window.setInterval(() => void checkAccess(), 30_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void checkAccess();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return access;
}

export default function PublicAccessLink({
  className,
  children,
  consoleClassName,
}: {
  className: string;
  children: React.ReactNode;
  consoleClassName?: string;
}) {
  const access = usePublicAccess();
  const href = access === "console" ? "/overview" : access === "approved" ? "/login" : "/#waitlist";
  const label = access === "console" ? "Go to Console →" : access === "approved" ? "Create account →" : null;
  return (
    <Link href={href} className={label ? consoleClassName ?? className : className}>
      {label ?? children}
    </Link>
  );
}
