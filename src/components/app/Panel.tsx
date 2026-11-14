"use client";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * shadcn Card set to the design system: panels pad 16px, cards carry `shadow`,
 * a hairline divider under the title, bold h2 title.
 */
export function Panel({
  title,
  icon: Icon,
  action,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <Card className={cn("gap-0 py-0 shadow", className)} aria-labelledby={title && id ? `${id}-title` : undefined}>
      {title && (
        <CardHeader className="border-b px-4 py-3 [.border-b]:pb-3">
          <CardTitle id={id ? `${id}-title` : undefined} className="flex items-center gap-2 text-h2 font-bold text-slate-900">
            {Icon && <Icon aria-hidden className="size-4 text-indigo-600" />}
            {title}
          </CardTitle>
          {action && <CardAction>{action}</CardAction>}
        </CardHeader>
      )}
      <CardContent className={cn("p-4", bodyClassName)}>{children}</CardContent>
    </Card>
  );
}

/** Checkbox + label, checked state in brand indigo. */
export function CheckField({
  id,
  checked,
  onChange,
  disabled,
  children,
  className,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-2", className)}>
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onChange(v === true)}
        className="mt-0.5 data-[state=checked]:border-indigo-600 data-[state=checked]:bg-indigo-600"
      />
      <Label htmlFor={id} className={cn("text-body font-normal leading-5 text-slate-600", disabled && "text-slate-500")}>{children}</Label>
    </div>
  );
}

/** Label above an Input. */
export function Field({
  id,
  label,
  required,
  className,
  ...input
}: { id: string; label: string; required?: boolean; className?: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-body font-medium text-slate-700">{label}{required ? " *" : ""}</Label>
      <Input id={id} required={required} {...input} />
    </div>
  );
}
