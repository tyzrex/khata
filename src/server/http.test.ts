import { describe, expect, test } from "bun:test";
import { MAX_JSON_BYTES, readJson } from "@/server/http";

function chunked(parts: string[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
  return new Request("http://localhost/api/x", { method: "POST", body, duplex: "half" } as RequestInit);
}

describe("readJson", () => {
  test("parses a normal body", async () => {
    expect(await readJson(chunked(['{"a":', "1}"]))).toEqual({ a: 1 });
  });

  test("refuses a chunked body past the cap without a Content-Length", async () => {
    const big = "x".repeat(MAX_JSON_BYTES / 2 + 1);
    await expect(readJson(chunked([big, big]))).rejects.toMatchObject({ status: 413 });
  });

  test("an empty body is a 400", async () => {
    await expect(readJson(new Request("http://localhost/api/x", { method: "POST" }))).rejects.toMatchObject({ status: 400 });
  });
});
