import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const pathname = request.nextUrl.pathname;
  const isProtected = ["/dashboard", "/employee", "/client"].some((path) => pathname.startsWith(path));
  const isAuthPage = pathname === "/";

  if (!url || !key) {
    if (isProtected) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookies) {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user && isProtected) return NextResponse.redirect(new URL("/", request.url));
  if (user) {
    const { data: memberships } = await supabase.from("org_memberships").select("role").eq("user_id", user.id);
    const roles = new Set((memberships || []).map((membership) => membership.role as string));
    if (roles.size === 0) {
      if (isProtected) return NextResponse.redirect(new URL("/", request.url));
      return response;
    }
    const home = roles.has("employee") ? "/employee" : roles.has("client") ? "/client" : "/dashboard";
    if (isAuthPage) return NextResponse.redirect(new URL(home, request.url));
    if (pathname.startsWith("/dashboard") && !["owner", "admin", "operations", "viewer"].some((role) => roles.has(role))) {
      return NextResponse.redirect(new URL(home, request.url));
    }
    if (pathname.startsWith("/employee") && !roles.has("employee")) return NextResponse.redirect(new URL(home, request.url));
    if (pathname.startsWith("/client") && !roles.has("client")) return NextResponse.redirect(new URL(home, request.url));
  }
  return response;
}

export const config = {
  matcher: ["/", "/join", "/dashboard/:path*", "/employee/:path*", "/client/:path*"],
};