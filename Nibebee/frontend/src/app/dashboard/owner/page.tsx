"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function OwnerDashboardPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [user, setUser] = useState<{ firstName?: string; email?: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = sessionStorage.getItem("nibebee_access");
    if (!token) {
      router.replace("/login");
      return;
    }
    (async () => {
      try {
        const me = await apiFetch<{ firstName: string; email: string; role: string }>(
          "/users/me",
        );
        if (me.role !== "LorryOwner") {
          router.replace("/");
          return;
        }
        setUser(me);
      } catch {
        setError("Could not load your profile. Try logging in again.");
      }
    })();
  }, [router]);

  async function logout() {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    sessionStorage.removeItem("nibebee_access");
    router.push("/");
  }

  return (
    <div className="flex min-h-screen flex-col bg-amber-50/40">
      <header className="border-b border-amber-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs font-bold uppercase text-brand-amber">
              {t("ownerDash")}
            </p>
            <h1 className="text-2xl font-bold text-brand-green">Nibebee</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/">Home</Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void logout()}>
              {t("logout")}
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : !user ? (
          <p className="text-sm text-neutral-600">Loading…</p>
        ) : (
          <>
            <Card className="border-brand-green/20">
              <CardHeader>
                <CardTitle>Hello, {user.firstName}</CardTitle>
                <CardDescription>
                  Owner workspace — set availability, manage listings, and track
                  trips. Full vehicle onboarding (Cloudinary lorry photo, routes,
                  encrypted KYC) plugs into the same account record.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/browse">Preview marketplace</Link>
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Next steps</CardTitle>
                <CardDescription>
                  Complete SMS OTP (Africa&apos;s Talking), upload documents
                  (encrypted at rest), and pick a subscription or stay on the free
                  tier (3 booking requests / month).
                </CardDescription>
              </CardHeader>
            </Card>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
