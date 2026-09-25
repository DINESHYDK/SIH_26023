"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/components/AuthProvider";
import { ApiError, loginUser, registerUser } from "@/lib/api";

type Mode = "signin" | "register";

function LoginForm() {
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { startSession } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/dashboard";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response =
        mode === "register"
          ? await registerUser(name.trim(), email.trim(), password)
          : await loginUser(email.trim(), password);

      startSession(response);
      router.replace(nextPath.startsWith("/") ? nextPath : "/dashboard");
    } catch (requestError) {
      const details = requestError instanceof ApiError ? requestError.details : [];
      setError(details[0] || (requestError instanceof Error ? requestError.message : "Unable to sign in."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-space-xl py-space-3xl">
      <div className="rounded-xl border border-border-crisp bg-surface-card p-space-xl shadow-xl">
        <Link className="inline-flex items-center gap-2 text-body-sm text-mining-gold-bright hover:text-text-primary" href="/">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Back to Overview
        </Link>
        <div className="mt-space-xl">
          <p className="font-mono-label text-mono-label uppercase tracking-wider text-mining-gold-bright">BCCL Jharia demonstration</p>
          <h1 className="mt-2 font-headline-lg text-headline-lg font-bold text-text-primary">{mode === "signin" ? "Sign in" : "Create your account"}</h1>
          <p className="mt-2 font-body-sm text-body-sm text-text-secondary">Use a local account to access the Mine Workspace and Decision Briefs.</p>
        </div>

        <div className="mt-space-lg grid grid-cols-2 rounded-lg border border-border-crisp bg-surface-dim p-1">
          {(["signin", "register"] as const).map((tab) => (
            <button
              className={`rounded-md px-space-base py-2 font-body-sm font-semibold transition-colors ${mode === tab ? "bg-surface-card text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"}`}
              key={tab}
              onClick={() => {
                setMode(tab);
                setError(null);
              }}
              type="button"
            >
              {tab === "signin" ? "Sign in" : "Register"}
            </button>
          ))}
        </div>

        <form className="mt-space-lg flex flex-col gap-space-base" onSubmit={handleSubmit}>
          {mode === "register" && (
            <label className="flex flex-col gap-1.5 font-body-sm text-text-secondary">
              Full name
              <input className="rounded-lg border border-border-crisp bg-surface-base px-3 py-2 text-text-primary outline-none focus:border-mining-gold-bright" minLength={2} onChange={(event) => setName(event.target.value)} required value={name} />
            </label>
          )}
          <label className="flex flex-col gap-1.5 font-body-sm text-text-secondary">
            Email address
            <input autoComplete="email" className="rounded-lg border border-border-crisp bg-surface-base px-3 py-2 text-text-primary outline-none focus:border-mining-gold-bright" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          </label>
          <label className="flex flex-col gap-1.5 font-body-sm text-text-secondary">
            Password
            <input autoComplete={mode === "signin" ? "current-password" : "new-password"} className="rounded-lg border border-border-crisp bg-surface-base px-3 py-2 text-text-primary outline-none focus:border-mining-gold-bright" minLength={6} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>
          {error && <p className="rounded-lg border border-state-critical/40 bg-state-critical/10 px-3 py-2 font-body-sm text-state-critical">{error}</p>}
          <button className="mt-space-sm rounded-lg bg-primary-container px-space-base py-2.5 font-body-md font-bold text-surface-base transition-colors hover:bg-mining-gold-deep disabled:cursor-not-allowed disabled:opacity-60" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Please wait…" : mode === "signin" ? "Sign in to Mine Workspace" : "Register and continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-[50vh] w-full max-w-md items-center justify-center p-space-xl text-text-secondary">
          <span className="material-symbols-outlined animate-spin text-[32px] text-mining-gold-bright">progress_activity</span>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
