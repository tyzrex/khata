import { cn } from "cn";
import type { ReactNode } from "react";

/**
 * Masthead for a page: small context line, the title, an optional standfirst,
 * and actions that sit on the title's baseline. A hairline closes it off from the content.
 * `aside` stays beside the title at every width; `wide` keeps actions below the title until xl.
 *
 * On a phone the actions take the full width instead of sitting under a title they used to
 * out-weigh: one 44px-tall button across the screen is a far better thumb target than a
 * short one floating in the left margin, and the row of chrome above the fold gets shorter.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  aside,
  wide = false,
  className,
}: {
  eyebrow: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 border-b border-input/70 pb-5 lg:pb-6",
        wide ? "xl:flex-row xl:items-end xl:justify-between" : "sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="deva text-[13px] leading-5 font-medium text-muted-foreground">{eyebrow}</p>
          <h1 className="display mt-1 text-[24px] sm:text-[32px] 2xl:text-[36px]">{title}</h1>
          {description ? <p className="mt-2 max-w-xl text-[13px] leading-5 text-pretty text-muted-foreground sm:text-sm sm:leading-6">{description}</p> : null}
        </div>
        {aside ? <div className="flex shrink-0 items-center gap-2">{aside}</div> : null}
      </div>
      {actions ? <div className="flex w-full min-w-0 shrink-0 flex-wrap items-center gap-3 sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none">{actions}</div> : null}
    </header>
  );
}
