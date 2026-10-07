import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { beginRequest, UnauthorizedError } from "@/lib/http";

export async function requireUserId(request: Request) {
  await beginRequest();
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) throw new UnauthorizedError();
  return session.user.id;
}

export async function readPageSession() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
  };
}
