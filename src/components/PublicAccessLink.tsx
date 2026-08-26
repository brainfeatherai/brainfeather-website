"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authService } from "@/services/appwrite";

export function useConsoleAccess() {
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const user = await authService.getCurrentUser();
      if (!user) return;
      try {
        const jwt = await authService.createJWT();
        const response = await fetch('/api/public/session', {
          headers: { Authorization: `Bearer ${jwt.jwt}` },
          cache: 'no-store',
        });
        if (active) setHasAccess(response.ok);
      } catch {
        if (active) setHasAccess(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return hasAccess;
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
  const hasAccess = useConsoleAccess();
  return (
    <Link href={hasAccess ? "/overview" : "/#waitlist"} className={hasAccess ? consoleClassName ?? className : className}>
      {hasAccess ? "Go to Console →" : children}
    </Link>
  );
}
