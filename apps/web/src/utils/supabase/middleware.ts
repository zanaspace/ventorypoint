import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // refreshing the auth token
  const { data: { user } } = await supabase.auth.getUser();

  // Route protection logic
  const path = request.nextUrl.pathname;
  const isPublic =
    path.startsWith('/login') ||
    path.startsWith('/register') ||
    path.startsWith('/forgot-password') ||
    path.startsWith('/reset-password') ||
    path.startsWith('/floor-login') ||
    path.startsWith('/auth') ||
    path.startsWith('/join') ||   // /join/complete performs its own auth check
    path.startsWith('/invite') ||
    path.startsWith('/api/internal/event-worker'); // authenticates with EVENT_WORKER_SECRET

  if (!user && !isPublic) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Membership gate: signed-in users without an ACTIVE membership never reach the dashboard.
  if (user && path.startsWith('/dashboard')) {
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('is_active')
      .eq('user_id', user.id);

    const hasActive = (memberships ?? []).some((m) => m.is_active);
    if (!hasActive) {
      const url = request.nextUrl.clone()
      url.search = ''
      url.pathname = (memberships ?? []).length > 0 ? '/revoked' : '/onboarding'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse;
}
