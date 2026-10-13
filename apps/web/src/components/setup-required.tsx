import { Database, ShieldCheck } from "lucide-react";

export default function SetupRequired() {
  return (
    <main className="setup-screen">
      <section className="setup-panel">
        <a className="brand-lockup" href="/" aria-label="MAINDWELL home">
          <span className="brand-mark">M</span>
          <span>MAINDWELL</span>
        </a>
        <p className="eyebrow">Operations workspace</p>
        <h1>Connect your Supabase project</h1>
        <p className="setup-lede">Your records and sign-in are protected by your own Supabase project. Connect it to open the workspace.</p>
        <ol className="setup-steps">
          <li><span className="step-icon"><Database size={18} /></span><span><strong>Create a Supabase project</strong><small>Use the project URL and anon key from Project Settings → API.</small></span></li>
          <li><span className="step-icon"><ShieldCheck size={18} /></span><span><strong>Apply the database migration</strong><small>Run the SQL in <code>supabase/migrations</code> from the Supabase SQL Editor.</small></span></li>
        </ol>
        <div className="env-block"><span>apps/web/.env.local</span><pre>{"NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key"}</pre></div>
        <p className="setup-footnote">Restart the app after saving the environment file. No service-role key is used by the dashboard.</p>
      </section>
    </main>
  );
}
