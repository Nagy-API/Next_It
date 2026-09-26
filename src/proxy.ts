import { NextResponse, type NextRequest } from "next/server";

/** Optimistic check only: no session cookie → login page. Real validation happens on the server per request. */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("nexora_session");
  const { pathname, search } = request.nextUrl;
  if (!hasSession && pathname !== "/login") {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|brand/|icon.png|apple-icon.png|favicon.ico|robots.txt).*)"],
};
