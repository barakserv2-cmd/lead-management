import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes that don't require authentication
const PUBLIC_ROUTES = ["/login", "/api/", "/sign/", "/book/"];

// The session cookies @supabase/ssr writes (incl. chunks ".0"/".1" and the
// PKCE code verifier).
const AUTH_COOKIE = /^sb-.+-auth-token/;

/**
 * A session whose email has no row in user_profiles is not a recruiter
 * (email signups are open on the project, and deleting a recruiter removes
 * only the profile). Such a session is dropped here, before any page, API
 * route or server action sees it, so every downstream `auth.getUser()` check
 * reads "not signed in", and the browser is told to forget the cookies.
 * Routes and actions still check for themselves; this is the backstop.
 */
function dropSession(request: NextRequest, isPublic: boolean): NextResponse {
  const names = request.cookies.getAll().map((c) => c.name).filter((n) => AUTH_COOKIE.test(n));
  for (const name of names) request.cookies.delete(name);

  let res: NextResponse;
  if (isPublic) {
    res = NextResponse.next({ request });
  } else {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    res = NextResponse.redirect(url);
  }
  for (const name of names) res.cookies.delete(name);
  return res;
}

export async function updateSession(request: NextRequest) {
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
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // is_recruiter() is the same predicate RLS uses (exact email match on
  // user_profiles). If the call itself fails we let the request through:
  // the route-level checks still apply, and a transient DB error must not
  // log the whole office out.
  let recruiter = false;
  if (user) {
    const { data, error } = await supabase.rpc("is_recruiter");
    if (error) {
      console.warn("[proxy] is_recruiter failed, deferring to route checks:", error.message);
      recruiter = true;
    } else {
      recruiter = data === true;
    }
  }

  const pathname = request.nextUrl.pathname;
  const isPublic = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

  if (user && !recruiter) return dropSession(request, isPublic);

  // Allow public routes without auth
  if (isPublic) {
    // If logged in user visits /login, redirect to dashboard
    if (pathname === "/login" && user) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Redirect unauthenticated users to login
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
