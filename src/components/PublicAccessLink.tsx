"use client";

import Link from "next/link";
import { usePublicAccess } from "./PublicAccessStore";

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
