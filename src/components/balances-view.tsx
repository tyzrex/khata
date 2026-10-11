"use client";

import { cn } from "cn";
import { HandCoins } from "lucide-react";
import Link from "next/link";
import { Card, CardEmpty } from "@/components/balances-card";
import { PageHeader } from "@/components/page-header";
import { SETTLED } from "@/components/splits/ledger-math";
import { PaymentCard } from "@/components/splits/pay-card";
import { PersonAvatar } from "@/components/splits-ui";
import { Button } from "@/components/ui/button";
import type { BalanceScope, ShareBook } from "@/db/shares";
import { formatNpr } from "@/lib/format";

type Debt = BalanceScope["youOwe"][number];

const sum = (debts: Debt[]) => debts.reduce((total, debt) => total + debt.amount, 0);

/** One person and what is open with them, with a one-tap settle. */
function PersonLine({ name, detail, amount, tone, href, onSettle }: { name: string; detail?: string; amount: number; tone: "owe" | "owed"; href?: string; onSettle: () => void }) {
  const color = tone === "owed" ? "text-credit" : "text-warning";
  const body = (
    <>
      <PersonAvatar name={name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-display">{name}</span>
        <span className={cn("block truncate text-xs font-medium", color)}>
          {tone === "owed" ? "owes you" : "you owe"} <span className="figure">{formatNpr(amount)}</span>
          {detail ? <span className="font-normal text-muted-foreground"> · {detail}</span> : null}
        </span>
      </span>
    </>
  );
  return (
    <li className="flex items-center gap-2 py-1.5">
      {href ? (
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1.5 transition-colors outline-none hover:text-interactive focus-visible:ring-2 focus-visible:ring-ring">
          {body}
        </Link>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-3 py-1.5">{body}</span>
      )}
      <Button type="button" variant={tone === "owe" ? "default" : "outline"} size="xs" className="shrink-0" onClick={onSettle}>
        {tone === "owe" ? "Pay" : "Settle up"}
      </Button>
    </li>
  );
}

/** The headline: where you stand once every friend and group is counted. */
function Position({ owe, owed, people }: { owe: number; owed: number; people: number }) {
  const net = owed - owe;
  const settled = Math.abs(net) < SETTLED && owe < SETTLED && owed < SETTLED;
  const total = owe + owed;
  return (
    <section className="overflow-hidden rounded-3xl bg-card shadow-card">
      <div className={cn("p-5 sm:p-6", settled ? "" : net >= 0 ? "bg-credit/6" : "bg-warning/6")}>
        <p className="label">Overall</p>
        {settled ? (
          <p className="display mt-2 text-[32px] leading-none text-display sm:text-[40px]">All square</p>
        ) : (
          <p className={cn("figure mt-2 text-[34px] leading-none sm:text-[44px]", net >= 0 ? "text-credit" : "text-warning")}>
            {net > 0 ? "+" : net < 0 ? "−" : ""}
            {formatNpr(Math.abs(net))}
          </p>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          {settled ? "Nobody owes you and you owe nobody." : net >= 0 ? `Overall you are owed, across ${people} ${people === 1 ? "person" : "people"}.` : `Overall you owe, across ${people} ${people === 1 ? "person" : "people"}.`}
        </p>
      </div>
      <div className="grid grid-cols-2 border-t border-border">
        <div className="border-r border-border p-4 sm:p-5">
          <p className="label">Owed to you</p>
          <p className={cn("figure mt-1.5 text-lg sm:text-xl", owed > SETTLED ? "text-credit" : "text-muted-foreground")}>{formatNpr(owed)}</p>
        </div>
        <div className="p-4 sm:p-5">
          <p className="label">You owe</p>
          <p className={cn("figure mt-1.5 text-lg sm:text-xl", owe > SETTLED ? "text-warning" : "text-muted-foreground")}>{formatNpr(owe)}</p>
        </div>
      </div>
      {total > 0 ? (
        <div className="flex h-1.5 gap-[2px]" aria-hidden>
          <span className="bg-credit" style={{ width: `${(owed / total) * 100}%` }} />
          <span className="flex-1 bg-warning/70" />
        </div>
      ) : null}
    </section>
  );
}

export function BalancesView({ book, onSettle }: { book: ShareBook; onSettle: (debt: Debt, groupId?: string) => void }) {
  const joinedDebts = book.joinedGroups.flatMap((group) => [
    ...group.balances.youOwe.map((debt) => ({ group, debt, direction: "owe" as const })),
    ...group.balances.youAreOwed.map((debt) => ({ group, debt, direction: "owed" as const })),
  ]);
  const owe = sum(book.overall.youOwe) + joinedDebts.filter((item) => item.direction === "owe").reduce((total, item) => total + item.debt.amount, 0);
  const owed = sum(book.overall.youAreOwed) + joinedDebts.filter((item) => item.direction === "owed").reduce((total, item) => total + item.debt.amount, 0);
  const people = new Set([
    ...book.overall.youOwe.map((debt) => debt.toId),
    ...book.overall.youAreOwed.map((debt) => debt.fromId),
    ...joinedDebts.map((item) => `${item.group.id}:${item.direction === "owe" ? item.debt.toId : item.debt.fromId}`),
  ]).size;
  const firstOther = book.people.find((person) => !person.isSelf);
  const friendHref = (id: string) => (book.people.some((person) => person.id === id && !person.isSelf) ? `/friends/${encodeURIComponent(id)}` : undefined);
  const byAmount = (a: Debt, b: Debt) => b.amount - a.amount;

  return (
    <div className="rise flex flex-col gap-6">
      <PageHeader
        eyebrow="Settle up"
        title="Balances"
        description="Who owes whom, across every friend and group. Paying here records it; your bank ledger stays as it is."
        actions={
          <Button type="button" variant="outline" className="bg-card shadow-card" onClick={() => onSettle({ fromId: book.self.id, toId: firstOther?.id ?? book.self.id, fromName: book.self.name, toName: "", amount: 0 })}>
            <HandCoins />
            Record a payment
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] xl:items-start 2xl:gap-4">
        <div className="flex flex-col gap-3 xl:sticky xl:top-6 2xl:gap-4">
          <Position owe={owe} owed={owed} people={people} />
          {book.overall.simplified.length ? (
            <Card title="Simplest way to settle" hint="The fewest payments that clear the same totals">
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                {book.overall.simplified.map((debt) => (
                  <PaymentCard key={`${debt.fromId}-${debt.toId}`} debt={debt} selfId={book.self.id} onSettle={() => onSettle(debt)} />
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 2xl:gap-4">
          <Card title="Owes you" hint={book.overall.youAreOwed.length ? "Biggest first. Tap a name for the details." : undefined} aside={<span className="figure text-sm text-credit">{formatNpr(sum(book.overall.youAreOwed))}</span>}>
            {book.overall.youAreOwed.length === 0 ? (
              <CardEmpty>Nobody owes you right now.</CardEmpty>
            ) : (
              <ul className="divide-y divide-border">
                {[...book.overall.youAreOwed].sort(byAmount).map((debt) => (
                  <PersonLine key={`${debt.fromId}-${debt.toId}`} name={debt.fromName} amount={debt.amount} tone="owed" href={friendHref(debt.fromId)} onSettle={() => onSettle(debt)} />
                ))}
              </ul>
            )}
          </Card>
          <Card title="You owe" aside={<span className="figure text-sm text-warning">{formatNpr(sum(book.overall.youOwe))}</span>}>
            {book.overall.youOwe.length === 0 ? (
              <CardEmpty>You do not owe anyone. Nice.</CardEmpty>
            ) : (
              <ul className="divide-y divide-border">
                {[...book.overall.youOwe].sort(byAmount).map((debt) => (
                  <PersonLine key={`${debt.fromId}-${debt.toId}`} name={debt.toName} amount={debt.amount} tone="owe" href={friendHref(debt.toId)} onSettle={() => onSettle(debt)} />
                ))}
              </ul>
            )}
          </Card>

          {joinedDebts.length ? (
            <Card title="In groups you joined" hint="Balances inside groups other people run">
              <ul className="divide-y divide-border">
                {joinedDebts.map(({ group, debt, direction }) => (
                  <PersonLine
                    key={`${group.id}-${debt.fromId}-${debt.toId}`}
                    name={direction === "owe" ? debt.toName : debt.fromName}
                    detail={group.name}
                    amount={debt.amount}
                    tone={direction}
                    href={group.kind === "group" ? `/groups/${encodeURIComponent(group.id)}` : `/friends/${encodeURIComponent(group.id)}`}
                    onSettle={() => onSettle(debt, group.id)}
                  />
                ))}
              </ul>
            </Card>
          ) : null}

          {book.overall.others.length ? (
            <Card title="Between others" hint="Inside your books, but nothing for you to pay">
              <ul className="grid gap-2 sm:grid-cols-2">
                {book.overall.others.map((debt) => (
                  <PaymentCard key={`${debt.fromId}-${debt.toId}`} debt={debt} selfId={book.self.id} />
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
