import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('en-US')
}

export function formatCurrency(n: number | null | undefined): string {
  if (n == null) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatPercent(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${(n * 100).toFixed(2)}%`
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  return format(new Date(d), 'MMM d, yyyy')
}