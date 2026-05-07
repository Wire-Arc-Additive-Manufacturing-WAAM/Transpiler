"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export function SiteHeader() {
  const { locale, setLocale, t } = useI18n();
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex flex-col leading-tight">
          <span className="text-xl font-bold text-brand-green">Nibebee</span>
          <span className="text-xs text-neutral-500">{t("tagline")}</span>
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex rounded-full border border-neutral-200 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setLocale("en")}
              className={`rounded-full px-2 py-1 ${
                locale === "en"
                  ? "bg-brand-green text-white"
                  : "text-neutral-600"
              }`}
            >
              {t("localeEn")}
            </button>
            <button
              type="button"
              onClick={() => setLocale("sw")}
              className={`rounded-full px-2 py-1 ${
                locale === "sw"
                  ? "bg-brand-green text-white"
                  : "text-neutral-600"
              }`}
            >
              {t("localeSw")}
            </button>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">{t("login")}</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/register">{t("register")}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
