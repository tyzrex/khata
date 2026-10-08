/** Segmented control: shell, then the selected and resting item styles. */
export const SEGMENT = "flex h-10 items-center gap-0.5 rounded-xl bg-secondary p-1";
export const SEGMENT_ON = "h-full flex-1 rounded-md bg-primary px-3 text-[13px] font-semibold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";
export const SEGMENT_OFF =
  "h-full flex-1 rounded-md px-3 text-[13px] font-medium text-muted-foreground transition-colors duration-200 outline-none hover:bg-card hover:text-display focus-visible:ring-2 focus-visible:ring-ring";
