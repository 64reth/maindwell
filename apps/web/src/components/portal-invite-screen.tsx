"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function PortalInviteScreen() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") || "");
  }, []);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;
      return supabase.rpc("accept_portal_invite", { target_token: token }).then(({ data: role, error: inviteError }) => {
        if (!active) return;
        if (inviteError) setError(inviteError.message);
        else { router.replace(role === "employee" ? "/employee" : "/client"); router.refresh(); }
      });
    });
    return () => { active = false; };
  }, [token, router]);

  async function finishInvite() {
    const { data, error: inviteError } = await createClient().rpc("accept_portal_invite", { target_token: token });
    if (inviteError) throw inviteError;
    router.replace(data === "employee" ? "/employee" : "/client");
    router.refresh();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");
    const supabase = createClient();
    const result = mode === "signup"
      ? await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { portal_invite_token: token },
            emailRedirectTo: `${window.location.origin}/join?token=${encodeURIComponent(token)}`,
          },
        })
      : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) {
      setError(result.error.message);
      setBusy(false);
      return;
    }
    if (mode === "signup" && !result.data.session) {
      setNotice("Account created. Confirm your email, then return using this invitation link to finish setup.");
      setMode("signin");
      setBusy(false);
      return;
    }
    try {
      await finishInvite();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This invitation could not be accepted.");
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <aside className="auth-aside">
        <a className="brand-lockup brand-lockup-light" href="/" aria-label="MAINDWELL home"><span className="brand-mark">M</span><span>MAINDWELL</span></a>
        <div className="auth-aside-copy"><span className="eyebrow">Good work. Well managed.</span><h1>Your work,<br />your progress.</h1><p>A secure workspace for your jobs, skills and development.</p></div>
        <div className="principles"><span><Check size={15} /> Quality work</span><span><Check size={15} /> Skills development</span></div>
        <div className="aside-index">MAINDWELL / WORKSPACE INVITE</div>
      </aside>
      <section className="auth-main"><div className="auth-form-wrap">
        <div className="mobile-brand brand-lockup"><span className="brand-mark">M</span><span>MAINDWELL</span></div>
        <p className="eyebrow">Secure workspace invitation</p>
        <h2>{token ? mode === "signup" ? "Set up your account" : "Accept your invitation" : "Invitation link needed"}</h2>
        <p className="auth-intro">{token ? "Use the email address this invitation was sent to." : "Ask your MAINDWELL contact for a current invitation link."}</p>
        {token && <>
          <div className="auth-switch" role="tablist" aria-label="Account action"><button type="button" role="tab" aria-selected={mode === "signup"} onClick={() => { setMode("signup"); setError(""); setNotice(""); }}>Create account</button><button type="button" role="tab" aria-selected={mode === "signin"} onClick={() => { setMode("signin"); setError(""); setNotice(""); }}>Sign in</button></div>
          <form className="auth-form" onSubmit={submit}>
            <label>Email address<span className="input-wrap"><Mail size={17} /><input name="email" type="email" placeholder="you@business.co.uk" required autoComplete="email" /></span></label>
            <label>Password<span className="input-wrap"><LockKeyhole size={17} /><input name="password" type="password" minLength={12} placeholder={mode === "signup" ? "At least 12 characters" : "Your password"} required autoComplete={mode === "signup" ? "new-password" : "current-password"} /></span></label>
            {error && <p className="form-message error-message" role="alert">{error}</p>}{notice && <p className="form-message success-message" role="status">{notice}</p>}
            <button className="button button-primary auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : "Accept invitation"}<ArrowRight size={17} /></button>
          </form>
        </>}
        <p className="secure-note"><ShieldCheck size={15} /> Access is limited to this invitation and its assigned workspace.</p>
      </div></section>
    </main>
  );
}
