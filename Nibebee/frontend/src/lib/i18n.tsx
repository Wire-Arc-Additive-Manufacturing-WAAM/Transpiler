"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type Locale = "en" | "sw";

type Dict = Record<string, string>;

const en: Dict = {
  tagline: "Connect. Carry. Delivered.",
  heroTitle: "Kenya, Uganda & Tanzania on one lane",
  heroBody:
    "Nibebee links verified lorry operators with serious load seekers. Subscriptions power the platform — your haulage earnings stay yours.",
  ctaSeeker: "I need a lorry",
  ctaOwner: "I operate a lorry",
  pricingTitle: "Simple subscription pricing",
  login: "Log in",
  register: "Create account",
  localeEn: "English",
  localeSw: "Kiswahili",
  ownerDash: "Owner dashboard",
  seekerDash: "Seeker dashboard",
  logout: "Log out",
};

const sw: Dict = {
  tagline: "Unganisha. Beba. Wasilishwe.",
  heroTitle: "Kenya, Uganda na Tanzania kwenye barabara moja",
  heroBody:
    "Nibebee inaunganisha wamiliki wa lori waliohakikiwa na watafuta mizigo. Malipo ya uanachama yanatumika — mapato yako yanasalia kwako.",
  ctaSeeker: "Nahitaji lori",
  ctaOwner: "Ninaendesha lori",
  pricingTitle: "Bei rahisi za uanachama",
  login: "Ingia",
  register: "Fungua akaunti",
  localeEn: "Kiingereza",
  localeSw: "Kiswahili",
  ownerDash: "Dashibodi — mmiliki",
  seekerDash: "Dashibodi — mtafuta mizigo",
  logout: "Toka",
};

const I18nContext = createContext<{
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: keyof typeof en) => string;
} | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      window.localStorage.setItem("nibebee_locale", l);
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    try {
      const s = window.localStorage.getItem("nibebee_locale") as Locale | null;
      if (s === "sw" || s === "en") setLocaleState(s);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key: keyof typeof en) => {
      const table = locale === "sw" ? sw : en;
      return table[key] ?? en[key] ?? key;
    },
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return (
    <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
