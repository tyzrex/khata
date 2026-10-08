"use client";
import type { CalendarType } from "../types";

interface Props {
  value: CalendarType;
  onChange: (type: CalendarType) => void;
  switcherClass?: string;
}

export function CalendarTypeSwitch({ value, onChange, switcherClass }: Props) {
  return (
    <div className={`hpc-switch ${switcherClass ?? ""}`}>
      {(["AD", "BS"] as const).map((t) => (
        <button
          key={t}
          type="button"
          className="hpc-switch-btn"
          data-active={value === t}
          aria-pressed={value === t}
          onClick={() => onChange(t)}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
