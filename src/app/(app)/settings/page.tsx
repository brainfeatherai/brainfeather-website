"use client";

/* /settings — account details only. API keys live at /api-keys. */

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { RequireAuth, useAuth } from "@/components/AuthProvider";
import { authService } from "@/services/appwrite";
import type { User } from "@/types";

function Settings() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<User | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;

    /* Profile row: plan and account metadata. get-or-create, so an
       OAuth account without a row is backfilled here too. */
    authService
      .ensureProfile({ $id: user.$id, email: user.email ?? "", name: user.name })
      .then((doc) => {
        if (active) setProfile(doc as unknown as User);
      })
      .catch(() => {
        /* A missing profile degrades the account card only. */
      });

    return () => {
      active = false;
    };
  }, [user]);

  return (
    <AppShell title="Settings" intro="Account and workspace preferences." wide>
      <section className="hairline rounded-xl border bg-paper p-5">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-forest">
          Account
        </h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2.5 text-[13px] sm:grid-cols-2">
          <div className="flex justify-between gap-3 sm:block">
            <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-forest/45">
              Email
            </dt>
            <dd className="truncate text-forest/85">{user?.email ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3 sm:block">
            <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-forest/45">
              Name
            </dt>
            <dd className="truncate text-forest/85">{user?.name || "—"}</dd>
          </div>
          <div className="flex justify-between gap-3 sm:block">
            <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-forest/45">
              Plan
            </dt>
            <dd className="text-forest/85">{profile?.plan ?? "free"}</dd>
          </div>
          <div className="flex justify-between gap-3 sm:block">
            <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-forest/45">
              User id
            </dt>
            <dd className="truncate font-mono text-[11px] text-forest/60">
              {user?.$id ?? "—"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="hairline mt-7 flex flex-col gap-4 rounded-xl border bg-paper p-5 sm:flex-row sm:items-center">
        <div className="flex-1">
          <h2 className="text-[15px] font-semibold text-forest">Developer access</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-forest/45">
            API credentials and MCP client configuration are managed on their own page.
          </p>
        </div>
        <Link
          href="/api-keys"
          className="rounded-lg border border-emerald/25 bg-emerald/10 px-4 py-2.5 font-mono text-[9px] uppercase tracking-[0.1em] text-emerald transition-colors hover:bg-emerald/15"
        >
          Manage API keys
        </Link>
      </section>
    </AppShell>
  );
}

export default function SettingsPage() {
  return (
    <RequireAuth>
      <Settings />
    </RequireAuth>
  );
}
