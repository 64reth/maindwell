"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function AuthScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");
    const supabase = createClient();

    const result = mode === "signup"
      ? await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { organization_name: String(form.get("organization") || "").trim() },
            emailRedirectTo: window.location.origin,
          },
        })
      : await supabase.auth.signInWithPassword({ email, password });

    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (mode === "signup" && !result.data.session) {
      setNotice("Account created. Check your email to confirm your address, then sign in.");
      setMode("signin");
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="auth-screen">
      <aside className="auth-aside">
        <a className="brand-lockup brand-lockup-light" href="/" aria-label="MAINDWELL home">
          <span className="brand-mark">M</span><span>MAINDWELL</span>
        </a>
        <div className="auth-aside-copy">
          <span className="eyebrow">Property operations</span>
          <h1>Good work,<br />well managed.</h1>
          <p>One clear view of every request, property and contractor.</p>
        </div>
        <div className="principles"><span><Check size={15} /> Quality</span><span><Check size={15} /> Transparency</span><span><Check size={15} /> Reliable delivery</span></div>
        <div className="aside-index">OPERATIONS / 001</div>
      </aside>
      <section className="auth-main">
        <div className="auth-form-wrap">
          <div className="mobile-brand brand-lockup"><span className="brand-mark">M</span><span>MAINDWELL</span></div>
          <p className="eyebrow">Your operations, in order</p>
          <h2>{mode === "signup" ? "Set up your workspace" : "Welcome back"}</h2>
          <p className="auth-intro">{mode === "signup" ? "Create your business account to get started." : "Sign in to continue to your workspace."}</p>
          <div className="auth-switch" role="tablist" aria-label="Account action">
            <button type="button" role="tab" aria-selected={mode === "signup"} onClick={() => { setMode("signup"); setError(""); setNotice(""); }}>Create account</button>
            <button type="button" role="tab" aria-selected={mode === "signin"} onClick={() => { setMode("signin"); setError(""); setNotice(""); }}>Sign in</button>
          </div>
          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === "signup" && <label>Business name<input name="organization" type="text" minLength={2} maxLength={120} placeholder="e.g. Northside Property Co." required autoComplete="organization" /></label>}
            <label>Email address<span className="input-wrap"><Mail size={17} /><input name="email" type="email" placeholder="you@business.co.uk" required autoComplete="email" /></span></label>
            <label>Password<span className="input-wrap"><LockKeyhole size={17} /><input name="password" type="password" minLength={12} placeholder="At least 12 characters" required autoComplete={mode === "signup" ? "new-password" : "current-password"} /></span></label>
            {error && <p className="form-message error-message" role="alert">{error}</p>}
            {notice && <p className="form-message success-message" role="status">{notice}</p>}
            <button className="button button-primary auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create workspace" : "Sign in"}<ArrowRight size={17} /></button>
          </form>
          <p className="secure-note"><ShieldCheck size={15} /> Your business data is private to your workspace.</p>
        </div>
      </section>
    </main>
  );
}
