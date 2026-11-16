import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { AttributeDefinition } from "@/types/api";

interface DynamicAttributeFieldsProps {
  definitions: AttributeDefinition[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  errors?: Record<string, string>;
}

export function DynamicAttributeFields({
  definitions,
  values,
  onChange,
  errors = {},
}: DynamicAttributeFieldsProps) {
  if (definitions.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {definitions.map((attr) => {
        const currentVal = values[attr.key] ?? attr.default_value ?? "";
        const err = errors[attr.key];

        if (attr.field_type === "BOOLEAN") {
          const checked = Boolean(currentVal);
          return (
            <div
              key={attr.id}
              className="flex items-center justify-between rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 sm:col-span-2"
            >
              <div>
                <Label className="text-xs text-[#0F172A]">
                  {attr.label}
                  {attr.is_required && <span className="ml-1 text-[#DC2626]">*</span>}
                </Label>
                {err && <p className="mt-1 text-xs text-[#DC2626]">{err}</p>}
              </div>
              <Switch
                checked={checked}
                onCheckedChange={(val) => onChange(attr.key, val)}
              />
            </div>
          );
        }

        if (attr.field_type === "SELECT") {
          const options = (attr.dictionary?.items ?? []).filter((item) => item.is_active);
          return (
            <div key={attr.id} className="space-y-1.5">
              <Label>
                {attr.label}
                {attr.is_required && <span className="ml-1 text-[#DC2626]">*</span>}
              </Label>
              <Select
                value={currentVal ? String(currentVal) : ""}
                onValueChange={(val) => onChange(attr.key, val)}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Выберите из справочника..." />
                </SelectTrigger>
                <SelectContent>
                  {options.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {err && <p className="text-xs text-[#DC2626]">{err}</p>}
            </div>
          );
        }

        return (
          <div key={attr.id} className="space-y-1.5">
            <Label>
              {attr.label}
              {attr.is_required && <span className="ml-1 text-[#DC2626]">*</span>}
            </Label>
            <Input
              className={attr.field_type === "NUMBER" ? "h-11 font-mono-tabular" : "h-11"}
              type={
                attr.field_type === "NUMBER"
                  ? "number"
                  : attr.field_type === "DATE"
                    ? "date"
                    : "text"
              }
              step={attr.field_type === "NUMBER" ? "any" : undefined}
              value={currentVal === null || currentVal === undefined ? "" : String(currentVal)}
              onChange={(e) => onChange(attr.key, e.target.value)}
              placeholder={`Введите ${attr.label.toLowerCase()}`}
            />
            {err && <p className="text-xs text-[#DC2626]">{err}</p>}
          </div>
        );
      })}
    </div>
  );
}
