"use client"

import * as React from "react"
import { useRender } from "@base-ui/react"
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form"
import { cn } from "cn"

import { FieldError } from "@/components/ui/field"
import { Label } from "@/components/ui/label"

const Form = FormProvider

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName
}

const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue
)

/** The third generic carries a schema transform, so `handleSubmit` hands you the parsed values. */
const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
>({
  ...props
}: ControllerProps<TFieldValues, TName, TTransformedValues>) => (
  <FormFieldContext.Provider value={{ name: props.name }}>
    <Controller {...props} />
  </FormFieldContext.Provider>
)

type FormItemContextValue = {
  id: string
}

const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue
)

/**
 * Everything a control needs from the form it sits in: the ids that tie the
 * label, description and message to the input, plus this field's own error.
 * Both ids and error live in context, so only the control re-renders as you type.
 */
function useFormField() {
  const fieldContext = React.useContext(FormFieldContext)
  const itemContext = React.useContext(FormItemContext)
  const { getFieldState } = useFormContext()
  const formState = useFormState({ name: fieldContext.name })
  const fieldState = getFieldState(fieldContext.name, formState)

  if (!fieldContext) {
    throw new Error("useFormField should be used within <FormField>")
  }

  const { id } = itemContext

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  }
}

function FormItem({ className, ...props }: React.ComponentProps<"div">) {
  const id = React.useId()

  return (
    <FormItemContext.Provider value={{ id }}>
      <div
        data-slot="form-item"
        className={cn("grid gap-2", className)}
        {...props}
      />
    </FormItemContext.Provider>
  )
}

function FormLabel({
  className,
  ...props
}: React.ComponentProps<typeof Label>) {
  const { error, formItemId } = useFormField()

  return (
    <Label
      data-slot="form-label"
      data-error={!!error}
      htmlFor={formItemId}
      className={cn("data-[error=true]:text-destructive", className)}
      {...props}
    />
  )
}

/**
 * Hands the control the id and aria wiring its siblings reference. The control
 * itself is the child, so it keeps whatever props it was given; Base UI's
 * useRender merges these on top rather than wrapping in an extra element.
 */
function FormControl({
  children,
  ...props
}: Omit<React.ComponentProps<"input">, "children"> & {
  children: React.ReactElement
}) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField()

  return useRender({
    render: children,
    props: {
      id: formItemId,
      "aria-describedby": error
        ? `${formDescriptionId} ${formMessageId}`
        : formDescriptionId,
      "aria-invalid": !!error,
      ...props,
    },
  })
}

function FormDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  const { formDescriptionId } = useFormField()

  return (
    <p
      data-slot="form-description"
      id={formDescriptionId}
      className={cn(
        "text-sm leading-normal font-normal text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function FormMessage({
  className,
  children,
  ...props
}: React.ComponentProps<"p">) {
  const { error, formMessageId } = useFormField()
  const body = error ? String(error?.message ?? "") : children

  if (!body) {
    return null
  }

  return (
    <FieldError
      data-slot="form-message"
      id={formMessageId}
      className={cn(className)}
      {...props}
    >
      {body}
    </FieldError>
  )
}

export {
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
  useFormField,
}