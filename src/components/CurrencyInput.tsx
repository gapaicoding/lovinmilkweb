import { Input } from "@/components/ui/input";
import { formatCurrencyInput, parseCurrencyInput } from "@/lib/format";
import { forwardRef } from "react";

interface Props {
  value: number | undefined;
  onChange: (v: number) => void;
  placeholder?: string;
  id?: string;
}

export const CurrencyInput = forwardRef<HTMLInputElement, Props>(function CurrencyInput(
  { value, onChange, placeholder = "0", id }, ref
) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">Rp</span>
      <Input
        ref={ref}
        id={id}
        inputMode="numeric"
        className="pl-9"
        placeholder={placeholder}
        value={value ? formatCurrencyInput(value) : ""}
        onChange={(e) => onChange(parseCurrencyInput(e.target.value))}
      />
    </div>
  );
});
