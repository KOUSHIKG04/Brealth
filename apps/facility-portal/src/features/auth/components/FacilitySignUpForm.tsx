"use client";

import { useFacilitySignUp } from "../hooks/useFacilitySignUp";

import Link from "next/link";

import { Button } from "@startup/web-ui/components/ui/button";
import { Card, CardContent } from "@startup/web-ui/components/ui/card";
import { Input } from "@startup/web-ui/components/ui/input";
import { Label } from "@startup/web-ui/components/ui/label";

export function FacilitySignUpForm({ next }: { next?: string }) {
  const { email, setEmail, password, setPassword, message, busy, submit } =
    useFacilitySignUp({ invited: Boolean(next) });
  return (
    <Card className="w-full max-w-md">
      <CardContent className="space-y-5 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {next ? "Create your account" : "Facility account"}
        </h1>
        {next ? (
          <p className="text-muted-foreground text-sm">
            Use the email address your invitation was sent to.
          </p>
        ) : null}
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="register-email">Email</Label>
            <Input
              id="register-email"
              type="email"
              autoComplete="email"
              placeholder="name@yourclinic.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <p className="text-muted-foreground text-xs">
              Use an inbox you can open to confirm this account.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="register-password">Password</Label>
            <Input
              id="register-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <Button disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </Button>
        </form>
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
        <Link
          href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
          className="text-sm underline"
        >
          Back to sign in
        </Link>
      </CardContent>
    </Card>
  );
}
