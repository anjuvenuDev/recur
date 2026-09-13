import { NextResponse, type NextRequest } from "next/server";
import {
  authorize,
  HttpError,
  securityHeaders,
} from "../../packages/core/src/http/security";
export function proxy(request: NextRequest) {
  try {
    authorize(request);
    return NextResponse.next();
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return new NextResponse(
      error instanceof Error ? error.message : "Access denied",
      {
        status,
        headers: {
          ...securityHeaders,
          ...(status === 401
            ? { "WWW-Authenticate": 'Basic realm="Recur", charset="UTF-8"' }
            : {}),
        },
      },
    );
  }
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
