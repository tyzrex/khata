import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-xl border border-transparent bg-clip-padding text-sm leading-none font-medium tracking-[-0.01em] whitespace-nowrap transition-colors duration-200 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none active:opacity-70 disabled:opacity-40 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-active",
        outline:
          "bg-secondary text-foreground hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent",
        secondary:
          "bg-accent text-accent-foreground hover:bg-accent/70",
        dark: "bg-display text-background hover:opacity-85",
        ghost:
          "rounded-none px-0 text-muted-foreground hover:text-display aria-expanded:text-display",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20",
        link: "rounded-none px-0 text-[0.875rem] tracking-normal text-interactive underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-11 gap-2 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        xs: "h-10 gap-1 px-3 text-[13px] has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-10 gap-1.5 px-4 text-sm has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        lg: "h-12 gap-2 px-6 text-[15px] has-data-[icon=inline-end]:pr-6 has-data-[icon=inline-start]:pl-5",
        icon: "size-11 px-0 [&_svg:not([class*='size-'])]:size-5",
        "icon-xs": "size-9 px-0 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-10 px-0",
        "icon-lg": "size-12 px-0",
      },
    },
    compoundVariants: [
      { variant: ["ghost", "link"], size: ["default", "xs", "sm", "lg"], className: "h-auto min-h-10 px-0" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
