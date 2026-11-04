"use client";

import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, toApiError } from "@/lib/api-client";
import { safeNextPath } from "@/lib/navigation";
import { fieldErrors, loginSchema } from "@/lib/validation/schemas";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  const sessionNotice =
    searchParams.get("reason") === "session"
      ? "Sesi Anda tidak lagi memiliki akses aplikasi. Silakan masuk kembali."
      : null;

  async function handleSubmit(event) {
    event.preventDefault();
    if (inFlight.current) return;

    const parsed = loginSchema.safeParse({ email: email.trim(), password });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }

    setErrors({});
    setFailure(null);
    setPending(true);
    inFlight.current = true;
    try {
      await api.post("/auth/login", parsed.data);
      router.replace(safeNextPath(searchParams.get("next")));
    } catch (error) {
      const apiError = toApiError(error);
      setFailure(apiError.message);
      if (apiError.fields) setErrors(apiError.fields);
      setPending(false);
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <Card className="w-full max-w-sm border-t-6 border-t-primary">
      <CardHeader>
        <CardTitle className="text-xl">Masuk</CardTitle>
        <CardDescription>Smart Warehouse Firaza</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="grid gap-4">
          {(failure || sessionNotice) && (
            <p role="alert" className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive">
              {failure ?? sessionNotice}
            </p>
          )}

          <div className="grid gap-2">
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? "login-email-error" : undefined}
              onChange={(event) => setEmail(event.target.value)}
            />
            {errors.email && (
              <p id="login-email-error" className="text-sm text-destructive">
                {errors.email[0]}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="login-password">Kata sandi</Label>
            <Input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? "login-password-error" : undefined}
              onChange={(event) => setPassword(event.target.value)}
            />
            {errors.password && (
              <p id="login-password-error" className="text-sm text-destructive">
                {errors.password[0]}
              </p>
            )}
          </div>

          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Memproses…" : "Masuk"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="page">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
