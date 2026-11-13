import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Signed-in app pages (sidebar). Each must also be in config.matcher below. */
export const APP_PAGES = ["/crm", "/pipeline", "/campaigns", "/import", "/scraper", "/settings"];

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isProtected =
    path === "/" ||
    APP_PAGES.some((p) => path === p || path.startsWith(`${p}/`)) ||
    path.startsWith("/api/verify") ||
    request.nextUrl.pathname.startsWith("/crm") ||
    request.nextUrl.pathname.startsWith("/api/crm") ||
    request.nextUrl.pathname.startsWith("/api/leads") ||
    request.nextUrl.pathname.startsWith("/api/scrape") ||
    request.nextUrl.pathname.startsWith("/api/social") ||
    request.nextUrl.pathname === "/api/ai";
  // NOTE: /api/campaigns is deliberately NOT proxied — its routes self-protect
  // (requireUser for users, x-cron-secret for the runner) and the edge runtime
  // cannot read non-NEXT_PUBLIC env vars, so a proxy-level cron bypass can't work.
  if (isProtected && !user) {
    // API callers get the same 401 JSON every route returns (fetch would otherwise
    // follow a redirect and get the login page back as a 200). Pages still redirect.
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ code: "unauthorized", error: "Your session has expired. Sign in again." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (request.nextUrl.pathname === "/login" && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return supabaseResponse;
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/crm/:path*",
    "/pipeline/:path*",
    "/campaigns/:path*",
    "/import/:path*",
    "/scraper/:path*",
    "/settings/:path*",
    "/api/crm/:path*",
    "/api/leads/:path*",
    "/api/scrape",
    "/api/social/:path*",
    "/api/ai",
    "/api/verify/:path*",
  ],
};
