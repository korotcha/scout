import { NextResponse, type NextRequest } from "next/server";

const OWNER_EMAIL = "korotcha@yandex.ru";

export function proxy(request: NextRequest) {
  const password = process.env.SCOUT_PASSWORD;
  if (!password) return new NextResponse("SCOUT_PASSWORD is not configured", { status: 503 });

  const auth = request.headers.get("authorization") ?? "";
  const expected = `Basic ${btoa(`scout:${password}`)}`;
  if (auth !== expected) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="SCOUT", charset="UTF-8"' },
    });
  }

  const headers = new Headers(request.headers);
  headers.set("oai-authenticated-user-id", "scout-owner");
  headers.set("oai-authenticated-user-email", OWNER_EMAIL);
  headers.set("oai-authenticated-user-full-name", encodeURIComponent("SCOUT Owner"));
  headers.set("oai-authenticated-user-full-name-encoding", "percent-encoded-utf-8");
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.svg).*)"],
};
