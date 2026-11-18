import { clsx, type ClassValue } from "clsx";
import type React from "react";
import { twMerge } from "tailwind-merge";
import type { UserRole } from "@/types/api";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatInt(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "0";
  const num = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(num)) return "0";
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(Math.round(num));
}

export function formatQty(value: string | number | null | undefined): string {
  return formatInt(value);
}

export function blockNonIntegerKeys(e: React.KeyboardEvent<HTMLInputElement>): void {
  if ([".", ",", "-", "+", "e", "E"].includes(e.key)) {
    e.preventDefault();
  }
}

export function sanitizeIntegerInput(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return "";
  return String(parseInt(digits, 10));
}

export function formatDushanbeTimeShort(iso: string): string {
  try {
    const dt = new Date(iso);
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Asia/Dushanbe",
      hour: "2-digit",
      minute: "2-digit",
    }).format(dt);
  } catch {
    return iso;
  }
}

export function formatDushanbeDateShort(iso: string): string {
  try {
    const dt = new Date(iso);
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Asia/Dushanbe",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(dt);
  } catch {
    return iso;
  }
}

export function formatDushanbeDateTime(iso: string): string {
  try {
    const dt = new Date(iso);
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Asia/Dushanbe",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(dt);
  } catch {
    return iso;
  }
}

export function nowDushanbeLocalInput(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Dushanbe",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Главный администратор",
  DIRECTOR: "Директор",
  MANAGER: "Начальник склада",
  OPERATOR: "Оператор",
};
