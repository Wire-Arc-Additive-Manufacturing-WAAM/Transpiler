"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ accessToken: string; user: { role: string } }>(
        "/auth/login",
        { method: "POST", json: { email, password } },
      );
      sessionStorage.setItem("nibebee_access", res.accessToken);
      if (res.user.role === "LorryOwner") router.push("/dashboard/owner");
      else if (res.user.role === "LoadSeeker") router.push("/dashboard/seeker");
      else if (res.user.role === "Admin") router.push("/admin");
      else router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error ? (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              ) : null}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </Button>
              <p className="text-center text-sm text-neutral-600">
                No account?{" "}
                <Link href="/register" className="font-semibold text-brand-green">
                  Register
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </main>
      <SiteFooter />
    </div>
  );
}
