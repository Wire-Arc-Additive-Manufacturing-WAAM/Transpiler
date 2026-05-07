export type Country = "KE" | "UG" | "TZ";

export const currencyForCountry: Record<Country, string> = {
  KE: "KES",
  UG: "UGX",
  TZ: "TZS",
};

export const ownerPlans = (country: Country) => {
  const c = currencyForCountry[country];
  const table: Record<
    Country,
    { monthly: number; boost: number; badge: number }
  > = {
    KE: { monthly: 990, boost: 300, badge: 4999 },
    UG: { monthly: 28500, boost: 8600, badge: 143900 },
    TZ: { monthly: 22000, boost: 6700, badge: 111000 },
  };
  const p = table[country];
  return [
    {
      key: "owner-monthly",
      label: "Lorry owner — monthly",
      amount: p.monthly,
      suffix: "/mo",
      currency: c,
    },
    {
      key: "boost",
      label: "Featured top-of-search boost",
      amount: p.boost,
      suffix: "/boost",
      currency: c,
    },
    {
      key: "badge",
      label: "Annual verified blue badge",
      amount: p.badge,
      suffix: "/yr",
      currency: c,
    },
  ];
};

export const seekerPlans = (country: Country) => {
  const c = currencyForCountry[country];
  const table: Record<Country, { monthly: number; alert: number }> = {
    KE: { monthly: 599, alert: 230 },
    UG: { monthly: 17250, alert: 6620 },
    TZ: { monthly: 13300, alert: 5100 },
  };
  const p = table[country];
  return [
    {
      key: "seeker-monthly",
      label: "Load seeker — monthly",
      amount: p.monthly,
      suffix: "/mo",
      currency: c,
    },
    {
      key: "route-alert",
      label: "Route alert add-on",
      amount: p.alert,
      suffix: "/wk",
      currency: c,
    },
  ];
};

export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}
