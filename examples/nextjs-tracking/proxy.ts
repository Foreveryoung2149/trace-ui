import { NextResponse, type NextRequest } from "next/server";
import { authorizedPreview, starterMode } from "./lib/access";
export function proxy(request: NextRequest) {
  try {
    if (starterMode(process.env.TRACE_MODE) === "demo") return NextResponse.next();
    if (!process.env.STARTER_ACCESS_TOKEN || process.env.STARTER_ACCESS_TOKEN.length < 24) return new NextResponse("Set a strong STARTER_ACCESS_TOKEN before enabling sandbox or live mode.", {status:503, headers:{"Cache-Control":"no-store"}});
    if (!authorizedPreview(request.headers.get("authorization"), process.env.STARTER_ACCESS_TOKEN)) return new NextResponse("Private integration preview", {status:401, headers:{"WWW-Authenticate":'Basic realm="Trace starter", charset="UTF-8"', "Cache-Control":"no-store"}});
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch { return new NextResponse("Invalid starter configuration", {status:503, headers:{"Cache-Control":"no-store"}}); }
}
// The webhook route has its own raw-body signature verification, not browser auth.
export const config = {matcher: ["/", "/api/track"]};
