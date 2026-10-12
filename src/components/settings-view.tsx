"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { type ReactNode } from "react";
import { ApiKeysCard } from "@/components/api-keys-card";
import { Card } from "@/components/balances-card";
import { InstallCard } from "@/components/install-card";
import { NotificationsCard } from "@/components/notifications-card";
import { PageHeader } from "@/components/page-header";
import { useDateStyle } from "@/components/use-date-style";
import { useMounted } from "@/components/use-mounted";
import { formatLongDate, formatMonthYear } from "@/lib/format";
import type { CalendarKind, DateStyle, Script } from "@/lib/nepali-date";
import { cn } from "cn";

/** One option in a radio group: small label, a live sample of what it looks like. */
function Choice<T extends string>({
  value,
  current,
  title,
  detail,
  icon: Icon,
  onSelect,
}: {
  value: T;
  current: T | undefined;
  title: string;
  detail?: string;
  icon?: LucideIcon;
  onSelect: (value: T) => void;
}) {
  const active = value === current;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={() => onSelect(value)}
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-xl px-4 py-3 text-left outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-accent text-accent-foreground ring-1 ring-primary ring-inset" : "bg-secondary text-display hover:bg-accent/60",
      )}
    >
      {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={detail ? cn("text-[13px] font-medium", active ? "text-accent-foreground/80" : "text-muted-foreground") : "text-sm font-semibold"}>{title}</span>
        {detail ? <span className="deva max-w-full truncate text-[15px] font-semibold tracking-[-0.01em]">{detail}</span> : null}
      </span>
    </button>
  );
}

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-2.5 py-4 first:pt-1 last:pb-0">
      <div>
        <h3 className="text-[15px] font-semibold text-display">{title}</h3>
        {hint ? <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function SettingsView({
  today,
  account,
}: {
  today: string;
  /** The editable account controls, rendered below the preference cards. */
  account: ReactNode;
}) {
  const { style, setCalendar, setScript } = useDateStyle();
  const { theme: stored, setTheme } = useTheme();
  // The saved theme is only known in the browser, so wait for it to avoid a hydration mismatch.
  const mounted = useMounted();
  const theme = mounted ? stored : undefined;
  const as = (next: Partial<DateStyle>): DateStyle => ({ ...style, ...next });

  return (
    <div className="rise flex flex-col gap-6">
      <PageHeader
        eyebrow="Preferences"
        title="Settings"
        description="Choose how dates look and how you pick them. Your entries are always saved as standard dates, so switching never changes your data."
      />

      <div className="grid items-start gap-3 lg:grid-cols-2 2xl:gap-4">
        <Card title="Dates" hint="Calendar, month names and digits" aside={<span className="rounded-md bg-secondary px-2 py-0.5 text-[12px] font-semibold text-muted-foreground">{style.calendar}</span>}>
          <div className="divide-y divide-border">
            <Row title="Calendar" hint="Used in every date picker, list and dashboard period.">
              <div role="radiogroup" aria-label="Calendar" className="grid gap-2 sm:grid-cols-2">
                <Choice<CalendarKind> value="AD" current={style.calendar} title="AD · Gregorian" detail={formatLongDate(today, as({ calendar: "AD" }))} onSelect={setCalendar} />
                <Choice<CalendarKind> value="BS" current={style.calendar} title="BS · Bikram Sambat" detail={formatLongDate(today, as({ calendar: "BS" }))} onSelect={setCalendar} />
              </div>
            </Row>
            <Row title="Names and numbers" hint="Month names, weekdays and digits.">
              <div role="radiogroup" aria-label="Names and numbers" className="grid gap-2 sm:grid-cols-2">
                <Choice<Script> value="en" current={style.script} title="English" detail={formatMonthYear(today, as({ script: "en" }))} onSelect={setScript} />
                <Choice<Script> value="np" current={style.script} title="नेपाली" detail={formatMonthYear(today, as({ script: "np" }))} onSelect={setScript} />
              </div>
            </Row>
          </div>
        </Card>

        <Card title="Appearance" hint="System follows your device">
          <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2">
            <Choice value="light" current={theme} title="Light" icon={Sun} onSelect={setTheme} />
            <Choice value="dark" current={theme} title="Dark" icon={Moon} onSelect={setTheme} />
            <Choice value="system" current={theme} title="System" icon={Monitor} onSelect={setTheme} />
          </div>
        </Card>

        <div className="grid items-start gap-3 lg:col-span-2 2xl:gap-4">
          <InstallCard />
          <NotificationsCard />
          <ApiKeysCard />
        </div>
      </div>

      {account}
    </div>
  );
}
