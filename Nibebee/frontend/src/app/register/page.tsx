"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";

type Role = "LorryOwner" | "LoadSeeker";

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    const r = params.get("role");
    if (r === "LorryOwner" || r === "LoadSeeker") setRole(r);
  }, [params]);
  const [country, setCountry] = useState<"KE" | "UG" | "TZ">("KE");
  const [prefix, setPrefix] = useState("+254");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [entityType, setEntityType] = useState<"Individual" | "Business">(
    "Individual",
  );
  const [businessName, setBusinessName] = useState("");
  const [businessPin, setBusinessPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function syncPrefix(c: "KE" | "UG" | "TZ") {
    if (c === "KE") setPrefix("+254");
    if (c === "UG") setPrefix("+256");
    if (c === "TZ") setPrefix("+255");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!role) {
      setError("Choose how you will use Nibebee.");
      return;
    }
    setError(null);
    setLoading(true);
    const phoneE164 = `${prefix}${phoneLocal.replace(/\D/g, "")}`;
    try {
      const body: Record<string, unknown> = {
        email,
        password,
        role,
        country,
        phoneE164,
        firstName,
        lastName,
      };
      if (role === "LoadSeeker") {
        body.entityType = entityType;
        if (entityType === "Business") {
          body.businessName = businessName;
          body.businessPin = businessPin;
        }
      }
      const res = await apiFetch<{ accessToken: string; user: { role: string } }>(
        "/auth/register",
        { method: "POST", json: body },
      );
      sessionStorage.setItem("nibebee_access", res.accessToken);
      if (res.user.role === "LorryOwner") router.push("/dashboard/owner");
      else router.push("/dashboard/seeker");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Create your Nibebee account</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={onSubmit}>
          {!role ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                className="h-auto flex-col gap-1 py-4"
                onClick={() => setRole("LoadSeeker")}
              >
                <span className="text-base">Load seeker</span>
                <span className="text-xs font-normal text-neutral-600">
                  I have cargo to move
                </span>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-auto flex-col gap-1 py-4"
                onClick={() => setRole("LorryOwner")}
              >
                <span className="text-base">Lorry owner</span>
                <span className="text-xs font-normal text-neutral-600">
                  I offer transport capacity
                </span>
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl bg-neutral-50 px-3 py-2 text-sm">
              <span>
                Signing up as{" "}
                <strong>
                  {role === "LorryOwner" ? "Lorry owner" : "Load seeker"}
                </strong>
              </span>
              <button
                type="button"
                className="text-brand-green underline"
                onClick={() => setRole(null)}
              >
                Change
              </button>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Country</Label>
              <select
                className="h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm"
                value={country}
                onChange={(e) => {
                  const c = e.target.value as "KE" | "UG" | "TZ";
                  setCountry(c);
                  syncPrefix(c);
                }}
              >
                <option value="KE">Kenya</option>
                <option value="UG">Uganda</option>
                <option value="TZ">Tanzania</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Mobile</Label>
              <div className="flex gap-2">
                <select
                  className="w-24 shrink-0 rounded-xl border border-neutral-300 px-1 text-sm"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                >
                  <option value="+254">+254</option>
                  <option value="+256">+256</option>
                  <option value="+255">+255</option>
                </select>
                <Input
                  id="phone"
                  inputMode="numeric"
                  placeholder="7XXXXXXXX"
                  value={phoneLocal}
                  onChange={(e) => setPhoneLocal(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          {role === "LoadSeeker" ? (
            <div className="space-y-3 rounded-xl border border-neutral-200 p-4">
              <p className="text-sm font-semibold text-brand-green">
                Account type
              </p>
              <div className="flex gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="entity"
                    checked={entityType === "Individual"}
                    onChange={() => setEntityType("Individual")}
                  />
                  Individual
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="entity"
                    checked={entityType === "Business"}
                    onChange={() => setEntityType("Business")}
                  />
                  Business
                </label>
              </div>
              {entityType === "Business" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="bizName">Business name</Label>
                    <Input
                      id="bizName"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pin">PIN</Label>
                    <Input
                      id="pin"
                      value={businessPin}
                      onChange={(e) => setBusinessPin(e.target.value)}
                      required
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="password">Password (min 8)</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>

          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={loading || !role}>
            {loading ? "Creating account…" : "Continue"}
          </Button>
          <p className="text-center text-sm text-neutral-600">
            Already registered?{" "}
            <Link href="/login" className="font-semibold text-brand-green">
              Log in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <Suspense
          fallback={
            <p className="text-sm text-neutral-600">Loading registration…</p>
          }
        >
          <RegisterForm />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
