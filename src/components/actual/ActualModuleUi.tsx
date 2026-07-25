import type { LucideIcon } from "lucide-react";
import { AlertCircle, Loader2, RefreshCcw } from "lucide-react";
import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getActualDataErrorMessage } from "@/lib/actualData";

export function BackgroundRefresh({ active }: { active: boolean }) {
  return (
    <span
      aria-live="polite"
      className="inline-flex min-h-5 items-center gap-1.5 text-xs text-muted-foreground"
    >
      {active ? (
        <>
          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
          Memperbarui data…
        </>
      ) : (
        "Data terbaru ditampilkan"
      )}
    </span>
  );
}

export function ModuleInitialLoading({ label }: { label: string }) {
  return (
    <Card aria-busy="true">
      <CardContent className="space-y-3 p-5">
        <span className="sr-only">{label}</span>
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

export function ModuleError({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden="true" className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{getActualDataErrorMessage(error)}</p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          <RefreshCcw aria-hidden="true" className="mr-2 h-4 w-4" />
          Coba lagi
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function IconAction({
  label,
  icon: Icon,
  onClick,
  variant = "ghost",
  disabled,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  variant?: "ghost" | "outline" | "destructive";
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant={variant}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
    </Button>
  );
}

export function FormField({
  id,
  label,
  hint,
  children,
}: {
  id?: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export interface ConfirmActionState {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export function ConfirmActionDialog({
  action,
  pending,
  onClose,
}: {
  action: ConfirmActionState | null;
  pending: boolean;
  onClose: () => void;
}) {
  return (
    <AlertDialog
      open={Boolean(action)}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{action?.title}</AlertDialogTitle>
          <AlertDialogDescription>{action?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
          <Button
            type="button"
            variant={action?.destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={action?.onConfirm}
          >
            {pending ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : null}
            {action?.confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
