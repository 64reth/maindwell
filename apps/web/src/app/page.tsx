import { hasSupabaseConfig } from "@/lib/supabase/client";
import AuthScreen from "@/components/auth-screen";
import SetupRequired from "@/components/setup-required";

export default function HomePage() {
  if (!hasSupabaseConfig()) return <SetupRequired />;
  return <AuthScreen />;
}
