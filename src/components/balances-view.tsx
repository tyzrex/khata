"use client";

import { ArrowRight, HandCoins } from "lucide-react";
import { Card, CardEmpty, PersonMark } from "@/components/balances-card";
import { PageHeader } from "@/components/page-header";
import { sumAmounts } from "@/components/panel";
import { Button } from "@/components/ui/button";
import type { BalanceScope, ShareBook } from "@/db/shares";
import { formatNpr } from "@/lib/format";

type Debt = BalanceScope["youOwe"][number];

function DebtRow({ name, detail, amount, tone, onSettle }: { name: string; detail: string; amount: number; tone: "owe" | "owed"; onSettle: () => void }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <PersonMark name={name} tone={tone} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-display">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      <p className={tone === "owed" ? "figure shrink-0 text-sm text-credit" : "figure shrink-0 text-sm text-warning"}>{formatNpr(amount)}</p>
      <Button type="button" variant="outline" size="xs" className="shrink-0" onClick={onSettle}>
        Settle
      </Button>
    </li>
  );
}

function Summary({ owe, owed, people }: { owe: number; owed: number; people: number }) {
  const net = owed - owe;
  const total = owe + owed;
  const owedShare = total > 0 ? (owed / total) * 100 : 50;
  return (
    <section className="grid grid-cols-2 rounded-3xl bg-card shadow-card sm:grid-cols-3">
      <div className="col-span-2 border-b border-border p-4 sm:col-span-1 sm:border-r sm:border-b-0 sm:p-5 2xl:p-6">
        <p className="label">Net balance</p>
        <p className={`figure mt-2.5 text-2xl 2xl:text-[28px] ${net > 0.005 ? "text-credit" : net < -0.005 ? "text-warning" : "text-display"}`}>
          {net > 0.005 ? "+" : net < -0.005 ? "−" : ""}
          {formatNpr(Math.abs(net))}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">{Math.abs(net) < 0.005 ? "Everyone is square" : net > 0 ? "Overall, you are owed" : "Overall, you owe"}</p>
      </div>
      <div className="border-r border-border p-4 sm:p-5 2xl:p-6">
        <p className="label">You are owed</p>
        <p className={`figure mt-2.5 text-xl sm:text-2xl ${owed ? "text-credit" : "text-muted-foreground"}`}>{formatNpr(owed)}</p>
        <div className="mt-3 flex h-1.5 gap-[2px] overflow-hidden rounded-full" aria-hidden>
          {total > 0 ? (
            <>
              <span className="bg-credit" style={{ width: `${owedShare}%` }} />
              <span className="flex-1 bg-warning/70" />
            </>
          ) : (
            <span className="flex-1 bg-secondary" />
          )}
        </div>
      </div>
      <div className="p-4 sm:p-5 2xl:p-6">
        <p className="label">You owe</p>
        <p className={`figure mt-2.5 text-xl sm:text-2xl ${owe ? "text-warning" : "text-muted-foreground"}`}>{formatNpr(owe)}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          {people} {people === 1 ? "person" : "people"} with an open balance
        </p>
      </div>
    </section>
  );
}

export function BalancesView({
  book,
  onSettle,
}: {
  book: ShareBook;
  onSettle: (debt: Debt, groupId?: string) => void;
}) {
  const owe = sumAmounts(book.overall.youOwe);
  const owed = sumAmounts(book.overall.youAreOwed);
  const joinedDebts = book.joinedGroups.flatMap((group) => [
    ...group.balances.youOwe.map((debt) => ({ group, debt, direction: "owe" as const })),
    ...group.balances.youAreOwed.map((debt) => ({ group, debt, direction: "owed" as const })),
  ]);
  const people = new Set([...book.overall.youOwe.map((debt) => debt.toId), ...book.overall.youAreOwed.map((debt) => debt.fromId)]).size;
  const firstOther = book.people.find((person) => !person.isSelf);

  return (
    <div className="rise flex flex-col gap-6">
      <PageHeader
        eyebrow="Settle up"
        title="Balances"
        description="Who owes whom, across every group and any expense outside one."
        actions={
          <Button type="button" onClick={() => onSettle({ fromId: book.self.id, toId: firstOther?.id ?? book.self.id, fromName: book.self.name, toName: "", amount: 0 })}>
            <HandCoins />
            Record a payment
          </Button>
        }
      />

      <div className="flex flex-col gap-3 2xl:gap-4">
        <Summary owe={owe} owed={owed} people={people} />

        <div className="grid gap-3 lg:grid-cols-2 2xl:gap-4">
          <Card title="You are owed" hint={`${book.overall.youAreOwed.length} ${book.overall.youAreOwed.length === 1 ? "person" : "people"}`} aside={<span className="figure text-sm text-credit">{formatNpr(owed)}</span>}>
            {book.overall.youAreOwed.length === 0 ? (
              <CardEmpty>Nobody owes you right now.</CardEmpty>
            ) : (
              <ul className="divide-y divide-border">
                {book.overall.youAreOwed.map((debt) => (
                  <DebtRow key={`${debt.fromId}-${debt.toId}`} name={debt.fromName} detail="owes you" amount={debt.amount} tone="owed" onSettle={() => onSettle(debt)} />
                ))}
              </ul>
            )}
          </Card>
          <Card title="You owe" hint={`${book.overall.youOwe.length} ${book.overall.youOwe.length === 1 ? "person" : "people"}`} aside={<span className="figure text-sm text-warning">{formatNpr(owe)}</span>}>
            {book.overall.youOwe.length === 0 ? (
              <CardEmpty>You do not owe anyone. Nice.</CardEmpty>
            ) : (
              <ul className="divide-y divide-border">
                {book.overall.youOwe.map((debt) => (
                  <DebtRow key={`${debt.fromId}-${debt.toId}`} name={debt.toName} detail="you owe" amount={debt.amount} tone="owe" onSettle={() => onSettle(debt)} />
                ))}
              </ul>
            )}
          </Card>
        </div>

        {joinedDebts.length ? (
          <Card title="In groups you joined" hint="Balances inside groups other people own">
            <ul className="divide-y divide-border">
              {joinedDebts.map(({ group, debt, direction }) => (
                <DebtRow
                  key={`${group.id}-${debt.fromId}-${debt.toId}`}
                  name={direction === "owe" ? debt.toName : debt.fromName}
                  detail={`${group.name} · ${direction === "owe" ? "you owe" : "owes you"}`}
                  amount={debt.amount}
                  tone={direction}
                  onSettle={() => onSettle(debt, group.id)}
                />
              ))}
            </ul>
          </Card>
        ) : null}

        {book.overall.simplified.length || book.overall.others.length ? (
          <div className="grid gap-3 lg:grid-cols-2 2xl:gap-4">
            {book.overall.simplified.length ? (
              <Card title="Simplest way to settle" hint="Fewest payments that clear the same totals">
                <ul className="divide-y divide-border">
                  {book.overall.simplified.map((debt) => (
                    <PairRow key={`${debt.fromId}-${debt.toId}`} debt={debt} selfId={book.self.id} />
                  ))}
                </ul>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">The lists above keep each friendship separate. These payments reach the same end state in fewer steps.</p>
              </Card>
            ) : null}
            {book.overall.others.length ? (
              <Card title="Between others" hint="Balances you can see but are not part of">
                <ul className="divide-y divide-border">
                  {book.overall.others.map((debt) => (
                    <PairRow key={`${debt.fromId}-${debt.toId}`} debt={debt} selfId={book.self.id} />
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** "A → B  amount": who pays whom, with you highlighted. */
function PairRow({ debt, selfId }: { debt: Debt; selfId: string }) {
  const youPay = debt.fromId === selfId;
  const youGet = debt.toId === selfId;
  return (
    <li className="flex items-center gap-3 py-2.5 text-sm">
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className={`truncate font-medium ${youPay ? "text-warning" : "text-display"}`}>{debt.fromName}</span>
        <ArrowRight className="size-3.5 shrink-0 text-disabled" aria-label="pays" />
        <span className={`truncate font-medium ${youGet ? "text-credit" : "text-display"}`}>{debt.toName}</span>
      </span>
      <span className="figure shrink-0 text-display">{formatNpr(debt.amount)}</span>
    </li>
  );
}
