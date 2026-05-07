"use client";

import Link from "next/link";
import { useState } from "react";
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
import { useI18n } from "@/lib/i18n";
import {
  type Country,
  formatMoney,
  ownerPlans,
  seekerPlans,
} from "@/lib/pricing";

export default function HomePage() {
  const { t } = useI18n();
  const [country, setCountry] = useState<Country>("KE");

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="border-b border-neutral-200 bg-gradient-to-b from-white to-neutral-50">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-2 md:items-center md:py-20">
            <div className="space-y-6">
              <p className="text-sm font-semibold uppercase tracking-wide text-brand-amber">
                Nibebee
              </p>
              <h1 className="text-balance text-4xl font-bold text-brand-green md:text-5xl">
                {t("heroTitle")}
              </h1>
              <p className="text-lg text-neutral-700">{t("heroBody")}</p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button size="lg" asChild>
                  <Link href="/register?role=LoadSeeker">{t("ctaSeeker")}</Link>
                </Button>
                <Button size="lg" variant="secondary" asChild>
                  <Link href="/register?role=LorryOwner">{t("ctaOwner")}</Link>
                </Button>
              </div>
            </div>
            <Card className="border-brand-green/20 bg-white">
              <CardHeader>
                <CardTitle>{t("pricingTitle")}</CardTitle>
                <CardDescription>
                  Prices shown in your country&apos;s currency (EAT timezone
                  billing).
                </CardDescription>
                <div className="flex gap-2 pt-2">
                  {(["KE", "UG", "TZ"] as Country[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCountry(c)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        country === c
                          ? "bg-brand-green text-white"
                          : "bg-neutral-100 text-neutral-700"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-bold uppercase text-brand-green">
                    Lorry owners
                  </p>
                  <ul className="space-y-2 text-sm">
                    {ownerPlans(country).map((p) => (
                      <li
                        key={p.key}
                        className="flex justify-between gap-2 border-b border-neutral-100 pb-2"
                      >
                        <span className="text-neutral-700">{p.label}</span>
                        <span className="shrink-0 font-semibold text-brand-green">
                          {formatMoney(p.amount, p.currency)}
                          {p.suffix}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold uppercase text-brand-amber">
                    Load seekers
                  </p>
                  <ul className="space-y-2 text-sm">
                    {seekerPlans(country).map((p) => (
                      <li
                        key={p.key}
                        className="flex justify-between gap-2 border-b border-neutral-100 pb-2"
                      >
                        <span className="text-neutral-700">{p.label}</span>
                        <span className="shrink-0 font-semibold text-brand-green">
                          {formatMoney(p.amount, p.currency)}
                          {p.suffix}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
