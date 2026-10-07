import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

function handler(method: "GET" | "POST") {
  return (request: Request) => {
    const handlers = toNextJsHandler(getAuth());
    return handlers[method](request);
  };
}

export const GET = handler("GET");
export const POST = handler("POST");
