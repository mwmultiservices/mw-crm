// ============================================================
// Payes — helpers semaine + constantes de rémunération (Phase 5).
// >>> Règles de commission/bonus ajustables ICI <<<
// ============================================================

// Taux de commission des techniciens fenêtres (repli si l'employé n'a
// aucune grille de paye définie sur son profil).
export const TECH_RATE = 0.18

// ============================================================
// Grille salariale 2026 (« SALAIRES MW 2026.pdf » + « technicien.txt »)
// Les VALEURS vivent sur chaque profil (colonnes rate_*/pct_*), éditables
// dans Profil → Équipe. Ce fichier ne décrit que la STRUCTURE.
// ============================================================

// Les 7 postes de rémunération d'un employé.
export interface PayRates {
  rate_paysagement: number          // $/h paysagement
  rate_commercial: number           // $/h copropriété / commercial (vitres)
  pct_vitres_ext_equipe: number     // % extérieur, équipe de 2 — par technicien
  pct_vitres_int_ext_equipe: number // % int+ext, équipe de 2 — par technicien
  pct_vitres_solo: number           // % flat solo (ext ou int/ext)
  pct_vente: number                 // % sur ses propres ventes
  pct_override: number              // % sur les ventes de chaque vendeur
}

export const EMPTY_RATES: PayRates = {
  rate_paysagement: 0, rate_commercial: 0,
  pct_vitres_ext_equipe: 0, pct_vitres_int_ext_equipe: 0, pct_vitres_solo: 0,
  pct_vente: 0, pct_override: 0,
}

export type PayRateKey = keyof PayRates

// Métadonnées d'affichage/édition (ordre = ordre du formulaire).
export const PAY_RATE_FIELDS: {
  key: PayRateKey; label: string; unit: '$/h' | '%'; hint: string
}[] = [
  { key: 'rate_paysagement',          label: 'Paysagement',        unit: '$/h', hint: 'Taux horaire sur les jobs de gazon / projets' },
  { key: 'rate_commercial',           label: 'Commercial (vitres)', unit: '$/h', hint: 'Copropriétés, immeubles, commerces — déplacement inclus' },
  { key: 'pct_vitres_ext_equipe',     label: 'Vitres ext. — équipe', unit: '%',  hint: 'Extérieur en équipe de 2, par technicien' },
  { key: 'pct_vitres_int_ext_equipe', label: 'Vitres int/ext — équipe', unit: '%', hint: 'Intérieur + extérieur en équipe de 2, par technicien' },
  { key: 'pct_vitres_solo',           label: 'Vitres — solo',      unit: '%',   hint: 'Taux flat quand le technicien est seul (ext ou int/ext)' },
  { key: 'pct_vente',                 label: 'Ses ventes',         unit: '%',   hint: 'Commission sur les leads qu\'il gagne lui-même' },
  { key: 'pct_override',              label: 'Override équipe',    unit: '%',   hint: 'Sur les ventes de CHAQUE vendeur (directeur des ventes)' },
]

// Lit la grille d'un profil, en tolérant les colonnes absentes (migration
// pas encore appliquée) et le vieux champ commission_value.
export function payRatesOf(p: Record<string, unknown> | null | undefined): PayRates {
  const n = (v: unknown) => Number(v) || 0
  if (!p) return { ...EMPTY_RATES }
  return {
    rate_paysagement: n(p.rate_paysagement) || n(p.hourly_rate),
    rate_commercial: n(p.rate_commercial),
    pct_vitres_ext_equipe: n(p.pct_vitres_ext_equipe),
    pct_vitres_int_ext_equipe: n(p.pct_vitres_int_ext_equipe),
    pct_vitres_solo: n(p.pct_vitres_solo),
    pct_vente: n(p.pct_vente) || (p.commission_type === 'percent' ? n(p.commission_value) : 0),
    pct_override: n(p.pct_override),
  }
}

export const hasRates = (r: PayRates): boolean =>
  Object.values(r).some((v) => v > 0)

// ---- Modes de paye d'une job -------------------------------------------
// Détermine COMMENT une job rémunère les employés qui y sont assignés.
export type PayMode = 'horaire' | 'commercial' | 'ext_equipe' | 'int_ext_equipe' | 'solo'

export const PAY_MODES: { id: PayMode; label: string; short: string; rate: PayRateKey; kind: 'hourly' | 'percent' }[] = [
  { id: 'horaire',        label: '⏱ Horaire paysagement',        short: 'Horaire',    rate: 'rate_paysagement',          kind: 'hourly' },
  { id: 'commercial',     label: '🏢 Commercial / copro (horaire)', short: 'Commercial', rate: 'rate_commercial',        kind: 'hourly' },
  { id: 'ext_equipe',     label: '🪟 Vitres extérieur — équipe',  short: 'Ext. équipe', rate: 'pct_vitres_ext_equipe',    kind: 'percent' },
  { id: 'int_ext_equipe', label: '🪟 Vitres int/ext — équipe',    short: 'Int/ext équipe', rate: 'pct_vitres_int_ext_equipe', kind: 'percent' },
  { id: 'solo',           label: '🪟 Vitres — solo',             short: 'Solo',       rate: 'pct_vitres_solo',           kind: 'percent' },
]

export const PAY_MODE_BY_ID = Object.fromEntries(PAY_MODES.map((m) => [m.id, m])) as Record<PayMode, (typeof PAY_MODES)[number]>

// Mode déduit quand la job n'en fixe pas (jobs.pay_mode NULL) :
//   - gazon / projet          → horaire paysagement
//   - fenêtre, 1 seul assigné → solo
//   - fenêtre, 2+ assignés    → ext ou int/ext selon le service décrit
export function autoPayMode(type: string | null, service: string | null, assignedCount: number): PayMode {
  if (type !== 'fenetre') return 'horaire'
  if (assignedCount <= 1) return 'solo'
  const s = (service ?? '').toLowerCase()
  const hasInt = /int(é|e)rieur|\bint\b/.test(s)
  return hasInt ? 'int_ext_equipe' : 'ext_equipe'
}

// Ce qu'une job verse à UN employé assigné (le % est versé PAR technicien
// sur le prix complet — cf. technicien.txt : « 350 $ → 63 $ » = 18 % du total).
export function jobPayFor(
  job: { type: string | null; service: string | null; price: number | null; pay_mode?: string | null; assigned_ids?: string[] | null },
  rates: PayRates,
): { mode: PayMode; amount: number; rate: number } {
  const count = job.assigned_ids?.length ?? 0
  const mode = (job.pay_mode as PayMode) || autoPayMode(job.type, job.service, count)
  const meta = PAY_MODE_BY_ID[mode] ?? PAY_MODE_BY_ID.solo
  const rate = rates[meta.rate]
  // Les modes horaires sont payés via les feuilles de temps, pas via la job.
  const amount = meta.kind === 'percent' ? ((Number(job.price) || 0) * rate) / 100 : 0
  return { mode, amount: Math.round(amount * 100) / 100, rate }
}

// ---- Heures ------------------------------------------------------------
export type WorkType = 'paysagement' | 'commercial'

export const WORK_TYPES: { id: WorkType; label: string; rate: PayRateKey }[] = [
  { id: 'paysagement', label: '🌿 Paysagement', rate: 'rate_paysagement' },
  { id: 'commercial',  label: '🏢 Commercial / copro (vitres)', rate: 'rate_commercial' },
]

// Taux horaire applicable à une feuille de temps (repli sur le paysagement
// si le taux commercial n'est pas défini pour cet employé).
export function hourlyRateFor(workType: string | null | undefined, rates: PayRates): number {
  if (workType === 'commercial') return rates.rate_commercial || rates.rate_paysagement
  return rates.rate_paysagement
}

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

// --- période de paye aux 2 semaines ---
// Ancre des périodes : lundi 3 août 2026 (référence du client « du 3 au 16 août »).
export const PERIOD_ANCHOR = '2026-08-03'

// Lundi de DÉBUT de la période de 2 semaines contenant la semaine `mondayStr`.
export function periodStartOf(mondayStr: string): string {
  const ms = new Date(mondayStr + 'T00:00:00').getTime() - new Date(PERIOD_ANCHOR + 'T00:00:00').getTime()
  const weeks = Math.round(ms / (7 * 86400000)) // round : absorbe l'heure de DST
  const offset = ((weeks % 2) + 2) % 2
  return addWeeks(mondayStr, -offset)
}

// « 3 au 16 août 2026 »
export function formatPeriodLabel(periodStart: string): string {
  const a = new Date(periodStart + 'T00:00:00')
  const b = new Date(periodStart + 'T00:00:00')
  b.setDate(b.getDate() + 13)
  const end = b.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })
  const start = a.getMonth() === b.getMonth()
    ? String(a.getDate())
    : a.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' })
  return `${start} au ${end}`
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
