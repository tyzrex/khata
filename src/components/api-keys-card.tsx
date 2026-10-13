"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Card, CardEmpty } from "@/components/balances-card";
import { agentActivityQuery, apiKeysKey, apiKeysQuery, deleteApiKey, postApiKey } from "@/components/api-keys-query";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import type { AgentScope } from "@/lib/agent-permissions";
import { useDateFormat } from "@/components/use-date-style";
import { apiKeySchema, type ApiKeyValues } from "@/lib/schemas";
import { toast } from "@/lib/status";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      className="bg-card"
      aria-label={label}
      title={label}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(
          () => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          },
          () => toast.error("Copy failed. Select the text and copy it by hand."),
        );
      }}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </Button>
  );
}

/**
 * Personal API keys for bots and AI agents. The full key is shown once, right
 * after it is made; only its first characters are kept for the list.
 */
export function ApiKeysCard() {
  const dates = useDateFormat();
  const queryClient = useQueryClient();
  const { data: keys, error, isPending: loading } = useQuery(apiKeysQuery);
  const { data: operations, refetch: refreshActivity } = useQuery(agentActivityQuery);
  const [fresh, setFresh] = useState<{ name: string; token: string; scopes: AgentScope[] } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [access, setAccess] = useState("write");
  const [expiry, setExpiry] = useState("never");
  const form = useForm<ApiKeyValues>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: { name: "" },
  });
  const name = useWatch({ control: form.control, name: "name" });
  // The origin is only known in the browser; the server render shows a relative path.
  const origin = useSyncExternalStore(
    () => () => undefined,
    () => window.location.origin,
    () => "",
  );

  const create = useMutation({
    mutationFn: (values: ApiKeyValues) =>
      postApiKey(
        values.name,
        (access === "read"
          ? ["read"]
          : access === "full"
            ? ["read", "write", "delete"]
            : ["read", "write"]) as AgentScope[],
        expiry === "never" ? null : Number(expiry),
      ),
    onSuccess: async (body) => {
      // The token exists only in this response, so it is shown before the list is refetched.
      setFresh({ name: body.key.name, token: body.token, scopes: body.key.scopes });
      form.reset({ name: "" });
      await queryClient.invalidateQueries({ queryKey: apiKeysKey });
    },
  });

  const revoke = useMutation({
    mutationFn: deleteApiKey,
    onSuccess: async () => {
      setConfirming(null);
      await queryClient.invalidateQueries({ queryKey: apiKeysKey });
      toast.success("Key revoked");
    },
  });

  const pending = create.isPending || revoke.isPending;

  async function submit(values: ApiKeyValues) {
    try {
      await create.mutateAsync(values);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not create that key.");
    }
  }

  async function revokeKey(id: string) {
    try {
      await revoke.mutateAsync(id);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not revoke that key.");
    }
  }

  const base = `${origin}/api/v1`;

  return (
    <Card
      title="API keys"
      hint="Let a bot or AI assistant add entries and splits for you"
      aside={<KeyRound className="size-4 text-muted-foreground" aria-hidden />}
    >
      <div className="flex flex-col gap-4">
        {fresh ? (
          <div className="rounded-2xl bg-accent p-4 text-accent-foreground">
            <p className="text-sm font-semibold">Copy “{fresh.name}” now. It will not be shown again.</p>
            <div className="mt-3 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-xl bg-card px-3 py-2.5 font-mono text-[13px] text-display">
                {fresh.token}
              </code>
              <CopyButton value={fresh.token} label="Copy key" />
            </div>
            <p className="mt-3 text-[13px] leading-5 text-accent-foreground/80">
              Send it as <code className="font-mono">Authorization: Bearer …</code>. Keep it in the bot’s secrets.
              Access: {fresh.scopes.join(", ")}.
            </p>
            <Button type="button" variant="link" className="mt-1 min-h-0 text-[13px]" onClick={() => setFresh(null)}>
              I saved it
            </Button>
          </div>
        ) : null}

        <Form {...form}>
          <form className="flex flex-col gap-3" noValidate onSubmit={form.handleSubmit(submit)}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="min-w-0 flex-1">
                  <FormControl>
                    <Input aria-label="Key name" placeholder="Name, like Grok bot" maxLength={60} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium" htmlFor="agent-access">
                  Access
                </label>
                <Select
                  items={{ read: "Read only", write: "Read and write", full: "Read, write and delete" }}
                  value={access}
                  disabled={pending}
                  onValueChange={(value) => value && setAccess(value)}
                >
                  <SelectTrigger id="agent-access" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read">Read only</SelectItem>
                    <SelectItem value="write">Read and write</SelectItem>
                    <SelectItem value="full">Read, write and delete</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium" htmlFor="agent-expiry">
                  Expires
                </label>
                <Select
                  items={{ never: "No expiry", "30": "After 30 days", "90": "After 90 days", "365": "After one year" }}
                  value={expiry}
                  disabled={pending}
                  onValueChange={(value) => value && setExpiry(value)}
                >
                  <SelectTrigger id="agent-expiry" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="never">No expiry</SelectItem>
                    <SelectItem value="30">After 30 days</SelectItem>
                    <SelectItem value="90">After 90 days</SelectItem>
                    <SelectItem value="365">After one year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="submit" className="w-full sm:w-fit" disabled={pending || !name.trim()}>
              Create key
            </Button>
          </form>
        </Form>

        <p className="text-[13px] text-muted-foreground">
          Read and write lets an agent complete delegated tasks autonomously. Deletion is a separate permission. Create
          one key per bot.
        </p>

        {error ? (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Keys could not be loaded."}
          </p>
        ) : null}
        {loading && !error ? <p className="label py-2">Loading keys</p> : null}
        {keys?.length === 0 ? (
          <CardEmpty>No keys yet. Create one for each bot so you can revoke them separately.</CardEmpty>
        ) : null}
        {keys?.length ? (
          <ul className="divide-y divide-border">
            {keys.map((key) => (
              <li key={key.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-display">{key.name}</p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    <span className="font-mono">{key.prefix}…</span> · made {dates.full(key.createdAt.slice(0, 10))} ·{" "}
                    {key.lastUsedAt ? `last used ${dates.full(key.lastUsedAt.slice(0, 10))}` : "never used"}
                  </p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {key.scopes?.join(" · ") ?? "read · write · delete"}
                    {key.expiresAt ? ` · expires ${dates.full(key.expiresAt.slice(0, 10))}` : " · no expiry"}
                  </p>
                </div>
                {confirming === key.id ? (
                  <span className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      size="xs"
                      disabled={pending}
                      onClick={() => void revokeKey(key.id)}
                    >
                      Revoke
                    </Button>
                    <Button type="button" variant="ghost" size="xs" onClick={() => setConfirming(null)}>
                      Keep
                    </Button>
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Revoke ${key.name}`}
                    title="Revoke"
                    onClick={() => setConfirming(key.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : null}

        <details
          className="text-[13px]"
          onToggle={(event) => {
            if (event.currentTarget.open) void refreshActivity();
          }}
        >
          <summary className="flex min-h-11 cursor-pointer items-center rounded-lg font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Recent agent actions
          </summary>
          {operations?.length ? (
            <ul className="divide-y divide-border">
              {operations.map((operation) => (
                <li key={operation.id} className="py-2">
                  <p className="font-medium text-foreground">
                    {operation.agentName} · {operation.tool.replaceAll("_", " ")}
                  </p>
                  <p className="mt-0.5 text-muted-foreground">
                    {operation.status}
                    {operation.replayed ? " · retry, no duplicate write" : ""} ·{" "}
                    {dates.full(operation.createdAt.slice(0, 10))}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-2 text-muted-foreground">Agent writes appear here once a bot starts using MCP.</p>
          )}
        </details>
        <div className="rounded-2xl bg-secondary p-3 text-[13px] leading-5 text-muted-foreground">
          <div className="mb-3 flex items-center gap-2">
            <span className="shrink-0 font-medium text-display">MCP endpoint</span>
            <code className="min-w-0 flex-1 truncate font-mono">{origin}/api/mcp</code>
            <CopyButton value={`${origin}/api/mcp`} label="Copy MCP endpoint" />
          </div>
          <div className="flex items-center gap-2">
            <span className="shrink-0 font-medium text-display">Base URL</span>
            <code className="min-w-0 flex-1 truncate font-mono">{base}</code>
            <CopyButton value={base} label="Copy base URL" />
          </div>
          <p className="mt-2">
            Point the bot’s tool importer at{" "}
            <a
              className="text-interactive underline-offset-4 hover:underline"
              href="/api/v1/openapi.json"
              target="_blank"
              rel="noreferrer"
            >
              openapi.json
            </a>{" "}
            or give it{" "}
            <a
              className="text-interactive underline-offset-4 hover:underline"
              href="/api/v1/llms.txt"
              target="_blank"
              rel="noreferrer"
            >
              llms.txt
            </a>
            .
          </p>
        </div>
      </div>
    </Card>
  );
}
