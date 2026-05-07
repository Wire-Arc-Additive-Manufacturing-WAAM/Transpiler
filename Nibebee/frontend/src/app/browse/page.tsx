"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type Listing = {
  id: string;
  photoUrl: string;
  numberPlate: string;
  lorryType: string;
  capacityTons: number;
  cityRegion: string;
  availability: string;
  verifiedBlueBadge: boolean;
  ownerFirstName: string;
  ownerRating: number;
  basePriceHint: number | null;
};

export default function BrowsePage() {
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<Listing[]>("/listings");
        setItems(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h1 className="text-3xl font-bold text-brand-green">
              Available capacity
            </h1>
            <p className="text-neutral-600">
              Contact details stay hidden until a signed contract exists — enforced
              on the API.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/dashboard/seeker">Back to dashboard</Link>
          </Button>
        </div>
        {loading ? (
          <p className="text-sm text-neutral-600">Loading listings…</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : items.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No listings yet</CardTitle>
              <CardDescription>
                Seed demo data or register a lorry owner and create a listing via
                the API.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((l) => (
              <Card key={l.id} className="overflow-hidden">
                <div className="aspect-video w-full bg-neutral-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={l.photoUrl}
                    alt={l.numberPlate}
                    className="h-full w-full object-cover"
                  />
                </div>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{l.numberPlate}</CardTitle>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        l.availability === "Available"
                          ? "bg-emerald-100 text-emerald-800"
                          : l.availability === "InTransit"
                            ? "bg-amber-100 text-amber-900"
                            : "bg-neutral-200 text-neutral-700"
                      }`}
                    >
                      {l.availability}
                    </span>
                  </div>
                  <CardDescription>
                    {l.lorryType} · {l.capacityTons} t · {l.cityRegion}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p>
                    Operator:{" "}
                    <span className="font-medium text-brand-green">
                      {l.ownerFirstName}
                    </span>{" "}
                    · ★ {l.ownerRating.toFixed(1)}
                    {l.verifiedBlueBadge ? (
                      <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
                        Verified
                      </span>
                    ) : null}
                  </p>
                  {l.basePriceHint != null ? (
                    <p className="text-neutral-700">
                      From approx.{" "}
                      <span className="font-semibold">{l.basePriceHint}</span>{" "}
                      (local currency)
                    </p>
                  ) : null}
                  <Button className="w-full" variant="secondary" disabled>
                    Request this lorry (wire negotiation module)
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
