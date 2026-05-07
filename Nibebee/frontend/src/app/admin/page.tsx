"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

export default function AdminPage() {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const token = sessionStorage.getItem("nibebee_access");
    if (!token) {
      router.replace("/login");
      return;
    }
    (async () => {
      try {
        const me = await apiFetch<{ role: string }>("/users/me");
        if (me.role !== "Admin") {
          router.replace("/");
          return;
        }
        setOk(true);
      } catch {
        router.replace("/login");
      }
    })();
  }, [router]);

  if (!ok) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-neutral-600">Checking admin access…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-green">Admin console</h1>
        <Button variant="outline" asChild>
          <Link href="/">Home</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Operations</CardTitle>
          <CardDescription>
            Wire KYC queue, disputes, revenue / PayPal payouts, promos, SMS
            broadcast, and system logs to these routes as you extend the NestJS
            modules.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-neutral-700">
          <ul className="list-disc space-y-2 pl-5">
            <li>Users, listings, trips</li>
            <li>Subscriptions & route-alert add-ons</li>
            <li>Flutterwave webhooks → revenue ledger → PayPal payout jobs</li>
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
