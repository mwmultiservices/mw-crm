// ============================================================
// Payes — helpers semaine + constantes de rémunération (Phase 5).
// >>> Règles de commission/bonus ajustables ICI <<<
// ============================================================

// Taux de commission des techniciens fenêtres (18% du revenu de la job).
export const TECH_RATE = 0.18

// Paliers de bonus rep selon les ventes de la semaine.
export function repBonus(sales: number): number {
  if (sales >= 25000) return 850
  if (sales >= 20000) return 650
  if (sales >= 15000) return 500
  return 0
}

// --- math de semaine (lundi local, format YYYY-MM-DD) ---
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Lundi de la semaine contenant `d`.
export function mondayOf(d: Date = new Date()): string {
  const date = new Date(d)
  const day = date.getDay() // 0 = dimanche
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return ymd(date)
}

// Décale d'un nombre de semaines (négatif = passé).
export function addWeeks(mondayStr: string, n: number): string {
  const d = new Date(mondayStr + 'T00:00:00')
  d.setDate(d.getDate() + n * 7)
  return ymd(d)
}

// Bornes ISO [lundi 00:00, lundi+7 00:00) pour filtrer created_at/updated_at.
export function weekRangeISO(mondayStr: string): { startISO: string; endISO: string } {
  const start = new Date(mondayStr + 'T00:00:00')
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return { startISO: start.toISOString(), endISO: end.toISOString() }
}

// « Semaine du 23 juin 2026 »
export function formatWeekLabel(mondayStr: string): string {
  const d = new Date(mondayStr + 'T00:00:00')
  return 'Semaine du ' + d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Heures travaillées entre deux timestamps (2 décimales).
export function hoursBetween(clockIn: string | null, clockOut: string | null): number {
  if (!clockIn || !clockOut) return 0
  const ms = new Date(clockOut).getTime() - new Date(clockIn).getTime()
  return ms > 0 ? Math.round((ms / 3600000) * 100) / 100 : 0
}

export const money = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n || 0)

export const money2 = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
