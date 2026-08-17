// ============================================================
// Fréquence de tonte — source unique (décision client, 2026-08-17).
// Stockée dans gazon_terrains.frequency_type (migration_crm_gazon_v2.sql).
// NE PAS confondre avec gazon_terrains.frequency, qui reste du texte libre
// (période / jour préféré : « Jeudi · 13 juin-2 août »).
//
// Effet dans la run : un terrain « pas dû » cette semaine sort de la liste
// principale (compteur + itinéraire) mais reste accessible dans la section
// repliée « Pas dues cette semaine » — rien n'est jamais caché pour de bon.
// ============================================================

export type FrequencyId = 'hebdo' | 'bi-hebdo' | 'one-shot'

export const DEFAULT_FREQUENCY: FrequencyId = 'hebdo'

export const FREQUENCIES: { id: FrequencyId; label: string; short: string }[] = [
  { id: 'hebdo', label: 'Chaque semaine (récurrente)', short: 'chaque sem.' },
  { id: 'bi-hebdo', label: 'Aux 2 semaines', short: '2 sem.' },
  { id: 'one-shot', label: 'One shot (une seule fois)', short: 'one shot' },
]

// Tolère null (terrains importés avant la migration) et les valeurs inconnues.
export function freqOf(value?: string | null): FrequencyId {
  const v = (value ?? '').trim().toLowerCase()
  return (FREQUENCIES.find((f) => f.id === v)?.id) ?? DEFAULT_FREQUENCY
}

export const freqLabel = (value?: string | null): string =>
  FREQUENCIES.find((f) => f.id === freqOf(value))!.label

export const freqShort = (value?: string | null): string =>
  FREQUENCIES.find((f) => f.id === freqOf(value))!.short

export interface DueContext {
  hasPassageThisWeek: boolean // déjà coché FAIT ou À ÉVITER cette semaine
  faitLastWeek: boolean       // coché FAIT la semaine précédente
  faitEver: boolean           // coché FAIT au moins une fois (one shot)
}

// `due` = le terrain fait partie de la run de cette semaine.
// `reason` = pourquoi il n'en fait pas partie (affiché dans la section repliée).
export function dueState(frequency: string | null | undefined, ctx: DueContext): { due: boolean; reason: string | null } {
  // Déjà touché cette semaine → reste dans la run (l'employé doit pouvoir décocher).
  if (ctx.hasPassageThisWeek) return { due: true, reason: null }

  switch (freqOf(frequency)) {
    case 'bi-hebdo':
      return ctx.faitLastWeek
        ? { due: false, reason: 'Aux 2 semaines · fait la semaine passée' }
        : { due: true, reason: null }
    case 'one-shot':
      return ctx.faitEver
        ? { due: false, reason: 'One shot · déjà fait' }
        : { due: true, reason: null }
    default:
      return { due: true, reason: null }
  }
}
