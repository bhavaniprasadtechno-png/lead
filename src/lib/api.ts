import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export function json(data: unknown, init?: number | ResponseInit) {
  return NextResponse.json(data, typeof init === "number" ? { status: init } : init);
}

export function errorResponse(message: string, status = 400) {
  return json({ error: message }, status);
}

/** Resolves the authenticated session or throws a NextResponse-friendly error. */
export async function requireOrgSession() {
  const session = await getSession();
  if (!session) {
    throw new ApiError("Unauthorized", 401);
  }
  return session;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function handleApiError(err: unknown) {
  if (err instanceof ApiError) {
    return errorResponse(err.message, err.status);
  }
  console.error(err);
  return errorResponse("Internal server error", 500);
}
