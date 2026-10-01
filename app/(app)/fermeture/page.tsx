'use client'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { isManager } from '@/lib/roles'
import {
  villeAuto, canonicalCity, villeLabel, runLabel, parseRunLabel, compareVilles, splitSizes, splitByDuration,
  reassignSlots, fullClientAddress, directionsUrl, formatPostal, referencePrefixes, parsePrefixes,
  fmtDuree, parseDuree, VILLES_REFERENCE, FERMETURE_COLOR, type VilleDef,
} from '@/lib/fermeture'
import {
  getFermetureClients, getFermetureVilles, getFermetureJobs, createFermetureClient, updateFermetureClient,
  deleteFermetureClient, setFermetureStatus, saveFermeturePlan, createFermetureVille, deleteFermetureVille,
  fermetureHasPlanColumns, type FermetureClient, type FermetureVille, type FermetureClientInput,
} from '@/lib/queries/fermeture'
import { currentJobOf } from '@/lib/queries/factures'
import { money, money2 } from '@/lib/payes'
import { optimizeRoute, shopNavUrl } from '@/lib/queries/gazon'
import { searchClients, createClientEverywhere, type Client } from '@/lib/queries/clients'
import { getAssignableProfiles, type Job, type AssignProfile } from '@/lib/queries/calendar'
import { uploadPhoto, photoUrl, deletePhoto } from '@/lib/storage'
import { autoFocusDesktop } from '@/lib/ui'
import JobModal from '@/components/calendar/JobModal'
import { LANES } from '@/components/calendar/CalendarView'
import type { ProfileMini } from '@/components/calendar/WeekCalendar'
import AddressPreviewButton from '@/components/ui/AddressPreviewButton'
import FactureModal from '@/components/factures/FactureModal'
import {
  ArrowLeft, Plus, Pencil, Sparkles, Loader2, Navigation, Phone, Camera, Check, AlertTriangle, X,
  Trash2, GripVertical, Home, Scissors, CalendarPlus, CalendarDays, Play, UserPlus, Route, RotateCcw, Clock,
} from 'lucide-react'

// ============================================================
// Run fermeture — clients de la saison de fermeture des terrains.
// Copie de la Run de gazon, pensée pour la PLANIFICATION :
//   1. « + Client » : le nom cherche dans la base clients ; un client connu
//      remplit toutes ses infos ;
//   2. classement automatique par ville selon le code postal (lib/fermeture) ;
//   3. « Optimiser » propose le meilleur ordre (Google), « Confirmer » l'enregistre ;
//   4. « Réorganiser » : glisser entre villes / journées, « + Ville » ;
//   5. « Diviser en journées » : Longueuil #1, Longueuil #2… ;
//   6. chaque journée part au calendrier Paysagement (job type 'fermeture').
// Chaque client a un temps estimé (et un prix, admin) : total sous chaque
// journée et chaque ville, et « Diviser » équilibre les journées selon le temps.
// Vue employé : /fermeture?run=Longueuil%20%231 (lien « Démarrer » du job).
// ============================================================

const GREEN = '#697035'
const ORANGE = '#B45309'
const TEAL = '#0E6B6E'

// Raisons d'évitement fréquentes — un tap au lieu du clavier sur le terrain.
const EVITE_REASONS = [
  'Barrière barrée', 'Chien dans la cour', 'Auto stationnée',
  'Travaux en cours', 'Trop mouillé', 'Client absent',
]

const ymdLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
// défaut d'une journée envoyée au calendrier : demain
const tomorrow = () => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return ymdLocal(d)
}
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' })
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })
const fmtKm = (m: number) => `${(m / 1000).toLocaleString('fr-CA', { maximumFractionDigits: 1 })} km`
const fmtDur = (s: number) => {
  const min = Math.round(s / 60)
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`
}
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`
const fmtPrice = (n: number) => (n % 1 ? money2(n) : money(n))
// « 08:00 » + 570 min → « 17:30 » (borné à 23:59)
const timePlus = (time: string, minutes: number) => {
  const [h, m] = time.split(':').map(Number)
  const t = Math.min(h * 60 + m + Math.round(minutes), 23 * 60 + 59)
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}
// choix rapides du temps estimé (minutes)
const DUREE_CHOICES = [30, 45, 60, 90, 120, 180]

// Totaux d'un groupe (journée, ville) — « à ne pas faire » exclus.
// reste = temps des clients pas encore faits / évités.
interface Totals { count: number; minutes: number; reste: number; price: number; sansTemps: number }
function totalsOf(items: FermetureClient[]): Totals {
  const t: Totals = { count: 0, minutes: 0, reste: 0, price: 0, sansTemps: 0 }
  for (const c of items) {
    if (c.a_eviter) continue
    t.count++
    t.price += Number(c.price) || 0
    if (!c.duree_min) { t.sansTemps++; continue }
    t.minutes += c.duree_min
    if (!c.status) t.reste += c.duree_min
  }
  return t
}

// Ordre de passage à l'intérieur d'une journée.
const byPosition = (a: FermetureClient, b: FermetureClient) =>
  a.position - b.position || a.created_at.localeCompare(b.created_at)

interface DayGroup { journee: number | null; items: FermetureClient[] } // journee null = à planifier
interface Section { ville: string; days: DayGroup[] }

// Villes (alphabétique, « Sans ville » à la fin) → journées (#1, #2… puis à planifier).
function buildSections(list: FermetureClient[], sortItems: (a: FermetureClient, b: FermetureClient) => number): Section[] {
  const byVille = new Map<string, Map<number | null, FermetureClient[]>>()
  for (const c of list) {
    const days = byVille.get(c.ville) ?? new Map<number | null, FermetureClient[]>()
    byVille.set(c.ville, days)
    const k = c.journee ?? null
    days.set(k, [...(days.get(k) ?? []), c])
  }
  return [...byVille.keys()].sort(compareVilles).map((ville) => {
    const days = byVille.get(ville)!
    const keys = [...days.keys()].sort((a, b) => (a == null ? 1 : b == null ? -1 : a - b))
    return { ville, days: keys.map((journee) => ({ journee, items: [...days.get(journee)!].sort(sortItems) })) }
  })
}

// Adresse affichée : complétée de la ville et du code postal s'ils n'y sont pas.
function addressLine(c: Pick<FermetureClient, 'address' | 'city' | 'postal_code'>): string {
  const a = (c.address ?? '').trim()
  const parts = [a]
  const city = (c.city ?? '').trim()
  if (city && !a.toLowerCase().includes(city.toLowerCase())) parts.push(city)
  const pc = formatPostal(c.postal_code)
  if (pc && !a.toUpperCase().replace(/\s/g, '').includes(pc.replace(/\s/g, ''))) parts.push(pc)
  return parts.filter(Boolean).join(', ')
}

// Filtre : une ville entière (journee undefined), une journée, ou ses « à planifier » (null).
type Sel = { ville: string; journee?: number | null } | null

// Aperçu d'optimisation : rien n'est écrit avant « Confirmer ».
interface OptPreview {
  order: Map<string, number> // id → rang proposé dans sa journée
  groups: number
  distanceMeters: number
  durationSeconds: number
  skipped: Set<string>       // adresses que Google n'a pas trouvées (laissées en fin de journée)
}

// useSearchParams() doit vivre sous une frontière <Suspense> (prerendering Next).
export default function FermeturePage() {
  return (
    <Suspense fallback={<div style={page}><div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Chargement…</div></div>}>
      <FermetureRun />
    </Suspense>
  )
}

function FermetureRun() {
  // ?run=Longueuil #1 : vue verrouillée sur UNE journée (lien « Démarrer » du calendrier)
  const runParam = useSearchParams().get('run')
  const locked = useMemo(() => parseRunLabel(runParam), [runParam])
  const [role, setRole] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [clients, setClients] = useState<FermetureClient[]>([])
  const [villes, setVilles] = useState<FermetureVille[]>([]) // villes ajoutées par l'admin
  const [jobs, setJobs] = useState<Job[]>([])                 // journées déjà au calendrier
  const [profileMap, setProfileMap] = useState<Record<string, ProfileMini>>({})
  const [assignProfiles, setAssignProfiles] = useState<AssignProfile[]>([])
  const [migrationError, setMigrationError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState<Sel>(null)
  const [modal, setModal] = useState<{ client?: FermetureClient } | null>(null) // {} = nouveau
  const [whyFor, setWhyFor] = useState<FermetureClient | null>(null)          // raison d'un « À éviter »
  const [divideFor, setDivideFor] = useState<string | null>(null)             // ville à diviser
  const [jobModal, setJobModal] = useState<{ run: string; job?: Job; date: string } | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [preview, setPreview] = useState<OptPreview | null>(null)
  const [optProgress, setOptProgress] = useState<string | null>(null)
  const [optError, setOptError] = useState<string | null>(null)
  const [savingOrder, setSavingOrder] = useState(false)
  const [factureOpen, setFactureOpen] = useState(false) // « Entrée de facture » (vue employé)
  // prix + temps estimé : colonnes récentes (migration_crm_fermeture_factures.sql)
  const [planColsMissing, setPlanColsMissing] = useState(false)

  const admin = isManager(role)

  const loadClients = useCallback(async () => {
    const { clients: list, error } = await getFermetureClients()
    setClients(list)
    setMigrationError(error)
  }, [])
  const loadVilles = useCallback(async () => { setVilles(await getFermetureVilles()) }, [])
  const loadJobs = useCallback(async () => { setJobs(await getFermetureJobs()) }, [])

  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (cancelled) return
      if (!user) { setLoading(false); return }
      setUserId(user.id)
      const [{ data: prof }, { data: all }] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', user.id).single(),
        supabase.from('profiles').select('id, full_name, color'),
      ])
      if (cancelled) return
      const r = prof?.role ?? 'rep'
      setRole(r)
      const map: Record<string, ProfileMini> = {}
      for (const p of all ?? []) map[p.id] = { full_name: p.full_name, color: p.color }
      setProfileMap(map)
      await Promise.all([loadClients(), loadVilles(), loadJobs(),
        fermetureHasPlanColumns().then((ok) => { if (!cancelled) setPlanColsMissing(!ok) })])
      // employés assignables au JobModal (« Planifier » une journée) — admin seulement
      if (isManager(r)) {
        const list = await getAssignableProfiles(['terrain', 'rep'])
        if (!cancelled) setAssignProfiles(list)
      }
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [loadClients, loadVilles, loadJobs])

  // realtime : un coéquipier coche FAIT, l'admin réorganise → tout le monde voit
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const ch = supabase
      .channel('fermeture')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fermeture_clients' }, () => {
        // un plan confirmé écrit des dizaines de lignes : un seul rechargement
        clearTimeout(timer)
        timer = setTimeout(loadClients, 400)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fermeture_villes' }, () => loadVilles())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => loadJobs())
      .subscribe()
    return () => { clearTimeout(timer); supabase.removeChannel(ch) }
  }, [loadClients, loadVilles, loadJobs])

  // « FAIT » ouvre Google Maps (vue employé) : au retour, on relit la liste
  // pour confirmer (ou défaire) la coche optimiste si l'écriture a échoué.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') loadClients() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadClients])

  // villes présentes, dans l'ordre d'affichage
  const villeNames = useMemo(() => [...new Set(clients.map((c) => c.ville))].sort(compareVilles), [clients])

  // dernier n° de journée par ville (menus « Journée », « Diviser »)
  const maxDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of clients) if (c.journee) m.set(c.ville, Math.max(m.get(c.ville) ?? 0, c.journee))
    return m
  }, [clients])

  // client de la base déjà dans la run (alerte « déjà ajouté » du modal)
  const inRun = useMemo(() => {
    const m = new Map<string, FermetureClient>()
    for (const c of clients) if (c.client_id) m.set(c.client_id, c)
    return m
  }, [clients])

  // portée affichée : la journée verrouillée (vue employé) sinon le filtre
  const scopeVille = locked ? locked.ville : sel?.ville
  const scopeDay: number | null | undefined = locked ? locked.journee : sel?.journee
  const hasScope = !!locked || !!sel
  const visible = useMemo(() => clients.filter((c) => {
    if (!hasScope) return true
    if (c.ville !== scopeVille) return false
    return scopeDay === undefined || (c.journee ?? null) === scopeDay
  }), [clients, hasScope, scopeVille, scopeDay])

  // une seule journée à l'écran → « Prochain client » + numéros d'étape
  const runScope = useMemo(
    () => (hasScope && typeof scopeDay === 'number' ? { ville: scopeVille ?? '', journee: scopeDay } : null),
    [hasScope, scopeVille, scopeDay],
  )

  const sortItems = useCallback((a: FermetureClient, b: FermetureClient) => {
    if (preview) {
      const ra = preview.order.get(a.id)
      const rb = preview.order.get(b.id)
      if (ra != null || rb != null) return (ra ?? 1e9) - (rb ?? 1e9)
    }
    return byPosition(a, b)
  }, [preview])

  const sections = useMemo(() => buildSections(visible, sortItems), [visible, sortItems])

  const aFaire = visible.filter((c) => !c.a_eviter)
  const faits = aFaire.filter((c) => c.status === 'fait').length

  // arrêts RESTANTS de la journée affichée, dans l'ordre de passage
  const runItems = useMemo(() => (runScope ? [...visible].sort(sortItems) : []), [runScope, visible, sortItems])
  const remaining = runItems.filter((c) => !c.a_eviter && !c.status)
  const navigable = remaining.filter((c) => directionsUrl(c, c.ville))
  const nextStop = navigable[0] ?? null

  // journée → jobs du calendrier (annulées ignorées)
  const jobsByRun = useMemo(() => {
    const m = new Map<string, Job[]>()
    for (const j of jobs) {
      if (!j.route_name || j.status === 'canceled') continue
      m.set(j.route_name, [...(m.get(j.route_name) ?? []), j])
    }
    return m
  }, [jobs])

  const select = (s: Sel) => { setSel(s); setPreview(null); setOptError(null) }

  const toggle = async (c: FermetureClient, status: 'fait' | 'evite') => {
    const undo = c.status === status
    // Vue employé : FAIT enchaîne sur le client suivant (un seul appui par
    // client). Ouvert AVANT tout await : hors du geste, iOS bloque Maps.
    const goNext = locked && !undo && status === 'fait' ? navigable.find((x) => x.id !== c.id) ?? null : null
    const now = new Date().toISOString()
    setClients((prev) => prev.map((x) => (x.id === c.id
      ? { ...x, status: undo ? null : status, done_by: undo ? null : userId, done_at: undo ? null : now, status_note: null }
      : x)))
    if (!undo && status === 'evite') setWhyFor(c)
    const write = setFermetureStatus(c.id, undo ? null : status, userId)
    if (goNext) window.open(directionsUrl(goNext, goNext.ville, true)!, '_blank', 'noopener')
    const { error } = await write
    if (error) { setFlash(`Impossible d'enregistrer : ${error}`); loadClients() }
  }

  // --- Optimiser : chaque journée affichée (et chaque pile « à planifier »)
  // est optimisée séparément, départ et retour au shop. Aperçu → Confirmer.
  const runOptimize = async () => {
    setOptError(null); setFlash(null)
    const groups = buildSections(visible, byPosition).flatMap((s) => s.days.map((d) => d.items))
    const todo = groups
      .map((items) => ({ items, stops: items.filter((c) => c.status !== 'fait' && !c.a_eviter && fullClientAddress(c, c.ville)) }))
      .filter((g) => g.stops.length >= 2)
    if (!todo.length) {
      setOptError('Rien à optimiser : il faut au moins 2 clients avec une adresse dans une même journée.')
      return
    }
    const order = new Map<string, number>()
    const skipped = new Set<string>()
    let distanceMeters = 0
    let durationSeconds = 0
    for (let i = 0; i < todo.length; i++) {
      setOptProgress(todo.length > 1 ? `${i + 1}/${todo.length}` : '')
      const { items, stops } = todo[i]
      const r = await optimizeRoute(stops.map((c) => ({ id: c.id, address: fullClientAddress(c, c.ville) })))
      if (r.error) { setOptProgress(null); setOptError(r.error); return }
      r.skipped.forEach((id) => skipped.add(id))
      distanceMeters += r.distanceMeters
      durationSeconds += r.durationSeconds
      // déjà faits en tête, puis l'ordre de Google, puis ce qu'il n'a pas pu
      // placer (adresse introuvable, à ne pas faire, sans adresse)
      const optimized = new Set(r.order)
      const byId = new Map(items.map((c) => [c.id, c]))
      const final = [
        ...items.filter((c) => c.status === 'fait'),
        ...r.order.map((id) => byId.get(id)).filter((c): c is FermetureClient => !!c),
        ...items.filter((c) => c.status !== 'fait' && !optimized.has(c.id)),
      ]
      final.forEach((c, idx) => order.set(c.id, idx))
    }
    setOptProgress(null)
    setPreview({ order, groups: todo.length, distanceMeters, durationSeconds, skipped })
  }

  const confirmPreview = async () => {
    if (!preview) return
    // chaque journée réutilise SES positions : les autres ne bougent pas
    const updates: { id: string; position: number }[] = []
    for (const s of buildSections(visible, byPosition)) {
      for (const d of s.days) {
        if (!d.items.some((c) => preview.order.has(c.id))) continue
        const slots = reassignSlots(d.items.map((c) => c.position))
        const next = [...d.items].sort((a, b) => (preview.order.get(a.id) ?? 1e9) - (preview.order.get(b.id) ?? 1e9))
        next.forEach((c, i) => { if (c.position !== slots[i]) updates.push({ id: c.id, position: slots[i] }) })
      }
    }
    setSavingOrder(true)
    const { error } = await saveFermeturePlan(updates)
    setSavingOrder(false)
    if (error) { setOptError(`Impossible d'enregistrer l'ordre : ${error}`); return }
    setPreview(null)
    setFlash(updates.length ? 'Ordre optimisé enregistré.' : 'L’ordre actuel était déjà le meilleur.')
    loadClients()
  }

  // temps estimé d'une journée (« Au calendrier » : la fin suit ce temps)
  const runMinutes = (run: string) => {
    const r = parseRunLabel(run)
    return r ? totalsOf(clients.filter((c) => c.ville === r.ville && c.journee === r.journee)).minutes : 0
  }

  // job de la journée verrouillée (Entrée de facture) : celle d'aujourd'hui, sinon la 1re
  const lockedJobs = locked ? jobsByRun.get(runLabel(locked.ville, locked.journee)) ?? [] : []
  const lockedJob = currentJobOf(lockedJobs) ?? lockedJobs[0] ?? null

  if (loading) return <div style={page}><div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Chargement…</div></div>

  // Journée au calendrier : date(s) du job, ou bouton pour la planifier (admin).
  const scheduleChip = (run: string) => {
    const js = jobsByRun.get(run) ?? []
    if (js.length) {
      const j = js[0]
      const label = `${j.start_at ? fmtDay(j.start_at) : 'sans date'}${js.length > 1 ? ` +${js.length - 1}` : ''}`
      return admin ? (
        <button onClick={() => setJobModal({ run, job: j, date: tomorrow() })} title="Modifier au calendrier" style={chipBtn(GREEN)}>
          <CalendarDays size={13} />{label}
        </button>
      ) : (
        <span style={{ ...chipBtn(GREEN), cursor: 'default' }}><CalendarDays size={13} />{label}</span>
      )
    }
    return admin ? (
      <button onClick={() => setJobModal({ run, date: tomorrow() })} title="Envoyer au calendrier Paysagement" style={chipBtn(FERMETURE_COLOR)}>
        <CalendarPlus size={13} />Au calendrier
      </button>
    ) : null
  }

  const scopeHint = runScope
    ? runLabel(runScope.ville, runScope.journee)
    : sel
      ? (sel.journee === null ? `${villeLabel(sel.ville)} — à planifier` : `chaque journée de ${villeLabel(sel.ville)}`)
      : 'chaque journée'

  const title = locked ? runLabel(locked.ville, locked.journee) : 'Run fermeture'

  // défauts du modal « + Client » : la journée ouverte, sinon classement auto
  const modalDefaults = runScope ? { ville: runScope.ville, journee: runScope.journee } : undefined
  const maxPosition = clients.reduce((m, c) => Math.max(m, c.position ?? 0), 0)

  return (
    <div style={page}>
      {locked && (
        <Link href="/calendrier/paysagement" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#6B7280', textDecoration: 'none', marginBottom: 8 }}>
          <ArrowLeft size={15} />Calendrier
        </Link>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>🍂 {title}</h1>
        {locked && scheduleChip(runLabel(locked.ville, locked.journee))}
        {/* sur la job : le reçu d'une dépense (gaz, dépotoir…) en photo */}
        {locked && (
          <button onClick={() => { setFlash(null); setFactureOpen(true) }} title="Entrée de facture" style={chipBtn(TEAL)}>
            <Camera size={13} />Facture
          </button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {admin && !locked && !editMode && !preview && clients.length > 0 && (
            <button onClick={() => { setFlash(null); setEditMode(true) }} style={{ ...addBtn, background: '#F3F4F6', color: '#374151' }}>
              <Pencil size={15} />Réorganiser
            </button>
          )}
          {!editMode && !preview && (
            <button onClick={() => setModal({})} style={addBtn}><Plus size={15} />Client</button>
          )}
        </div>
      </div>

      {migrationError && (
        <div style={{ background: '#FEF3C7', color: '#92400E', padding: 12, borderRadius: 10, fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>
          ⚠️ Tables de la Run fermeture absentes — appliquer <code>supabase/migration_crm_fermeture.sql</code>{' '}
          dans Supabase &gt; SQL Editor (coller le contenu), puis recharger la page.
        </div>
      )}

      {flash && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0', borderRadius: 10, padding: '9px 12px', fontSize: 12.5, marginBottom: 10, lineHeight: 1.45 }}>
          <span style={{ flex: 1 }}>{flash}</span>
          <button onClick={() => setFlash(null)} aria-label="Fermer" style={{ border: 'none', background: 'none', color: '#065F46', cursor: 'pointer', padding: 0 }}><X size={14} /></button>
        </div>
      )}

      {/* filtres : villes, puis journées de la ville choisie */}
      {!locked && !editMode && villeNames.length > 0 && (
        <>
          <div style={chipRow}>
            <FilterChip active={!sel} onClick={() => select(null)}>Toutes · {clients.length}</FilterChip>
            {villeNames.map((v) => (
              <FilterChip key={v || '∅'} active={sel?.ville === v} onClick={() => select({ ville: v })}>
                {villeLabel(v)} · {clients.filter((c) => c.ville === v).length}
              </FilterChip>
            ))}
          </div>
          {sel && (
            <div style={chipRow}>
              <FilterChip active={sel.journee === undefined} onClick={() => select({ ville: sel.ville })}>Toute la ville</FilterChip>
              {Array.from({ length: maxDay.get(sel.ville) ?? 0 }, (_, i) => i + 1)
                .filter((n) => clients.some((c) => c.ville === sel.ville && c.journee === n))
                .map((n) => (
                  <FilterChip key={n} active={sel.journee === n} onClick={() => select({ ville: sel.ville, journee: n })}>
                    #{n} · {clients.filter((c) => c.ville === sel.ville && c.journee === n).length}
                  </FilterChip>
                ))}
              {clients.some((c) => c.ville === sel.ville && c.journee == null) && (
                <FilterChip active={sel.journee === null} onClick={() => select({ ville: sel.ville, journee: null })}>
                  À planifier · {clients.filter((c) => c.ville === sel.ville && c.journee == null).length}
                </FilterChip>
              )}
            </div>
          )}
        </>
      )}

      {/* Optimiser → aperçu → Confirmer (admin) */}
      {admin && !editMode && visible.length > 1 && (preview ? (
        <div style={{ background: '#F0FDFA', border: `1px solid ${TEAL}55`, borderRadius: 12, padding: '10px 12px', marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: TEAL, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={15} />Ordre optimisé proposé
          </div>
          <div style={{ fontSize: 12, color: '#374151', marginTop: 3, lineHeight: 1.45 }}>
            {plural(preview.groups, 'journée')} · {fmtKm(preview.distanceMeters)} · {fmtDur(preview.durationSeconds)} de route (départ et retour au shop).{' '}
            Vérifie l&apos;ordre ci-dessous, puis confirme pour l&apos;enregistrer.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => setPreview(null)} disabled={savingOrder} style={{ ...primaryBtn, flex: 1, background: '#F3F4F6', color: '#374151' }}>Annuler</button>
            <button onClick={confirmPreview} disabled={savingOrder} style={{ ...primaryBtn, flex: 1, background: GREEN, color: '#FFF', opacity: savingOrder ? 0.6 : 1 }}>
              {savingOrder ? '…' : <><Check size={16} />Confirmer l&apos;ordre</>}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <button onClick={runOptimize} disabled={optProgress != null} title="Faire calculer le meilleur ordre de passage par Google" style={{
            ...addBtn, background: '#69C9CA1F', color: TEAL, border: `1px solid ${TEAL}`, opacity: optProgress != null ? 0.7 : 1,
          }}>
            {optProgress != null ? <Loader2 size={15} style={{ animation: 'mw-spin 1s linear infinite' }} /> : <Sparkles size={15} />}
            Optimiser
          </button>
          <span style={{ fontSize: 12, color: '#6B7280' }}>
            {optProgress != null ? `Calcul du meilleur ordre… ${optProgress}` : `Meilleur ordre pour ${scopeHint} · départ et retour au shop`}
          </span>
        </div>
      ))}

      {optError && (
        <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 10, fontSize: 12, marginBottom: 10 }}>
          Optimisation indisponible — {optError}
        </div>
      )}

      {preview && preview.skipped.size > 0 && (
        <div style={{ background: '#FFFBEB', color: '#92400E', padding: '8px 12px', borderRadius: 10, fontSize: 12, marginBottom: 10 }}>
          Adresse{preview.skipped.size > 1 ? 's' : ''} introuvable{preview.skipped.size > 1 ? 's' : ''} par Google —{' '}
          {clients.filter((c) => preview.skipped.has(c.id)).map((c) => c.name).join(', ')}. Laissée{preview.skipped.size > 1 ? 's' : ''} en fin de journée :{' '}
          compléter l’adresse (numéro, rue, ville, code postal) dans la fiche.
        </div>
      )}

      {/* Prochain client : UNE destination, navigation lancée (journée affichée) */}
      {!editMode && !preview && runScope && (nextStop ? (
        <a href={directionsUrl(nextStop, nextStop.ville, true)!} target="_blank" rel="noopener noreferrer" style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', marginBottom: 10,
          borderRadius: 12, background: TEAL, color: '#FFF', textDecoration: 'none',
        }}>
          <Navigation size={22} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 800 }}>Prochain client</span>
            <span style={{ display: 'block', fontSize: 12, opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {nextStop.name}{nextStop.address ? ` — ${addressLine(nextStop)}` : ''}
            </span>
          </span>
          <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, background: '#FFFFFF26', borderRadius: 999, padding: '3px 8px' }}>
            {navigable.length} restant{navigable.length > 1 ? 's' : ''}
          </span>
        </a>
      ) : aFaire.length > 0 && remaining.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#F6F7EE', border: `1px solid ${GREEN}33`, borderRadius: 12, padding: '10px 12px', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#3F4A1E' }}>🎉 Journée terminée</span>
          <a href={shopNavUrl()} target="_blank" rel="noopener noreferrer" style={{ ...addBtn, marginLeft: 'auto', textDecoration: 'none', background: GREEN, color: '#FFF' }}>
            <Home size={15} />Retour au shop
          </a>
        </div>
      ) : null)}

      {!editMode && !preview && runScope && remaining.length > navigable.length && (
        <div style={{ background: '#FFFBEB', color: '#92400E', padding: '8px 12px', borderRadius: 10, fontSize: 12, marginBottom: 10 }}>
          Sans adresse, donc hors navigation : {remaining.filter((c) => !directionsUrl(c, c.ville)).map((c) => c.name).join(', ')}.
        </div>
      )}

      {!editMode && visible.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1, height: 8, borderRadius: 999, background: '#E5E7EB', overflow: 'hidden' }}>
            <div style={{ width: `${aFaire.length ? (faits / aFaire.length) * 100 : 0}%`, height: '100%', background: GREEN, borderRadius: 999, transition: 'width .3s' }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: GREEN, whiteSpace: 'nowrap' }}>{faits}/{aFaire.length} faits</span>
        </div>
      )}

      {editMode ? (
        <PlanBoard
          clients={clients}
          customs={villes}
          onCancel={() => setEditMode(false)}
          onSaved={(msg) => { setEditMode(false); setFlash(msg); loadClients(); loadVilles() }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {sections.map((s) => {
            const cityItems = s.days.flatMap((d) => d.items)
            const cityTodo = cityItems.filter((c) => !c.a_eviter)
            const unplanned = s.days.find((d) => d.journee == null)?.items.length ?? 0
            return (
              <div key={s.ville || '∅'}>
                {!runScope && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#111827' }}>{villeLabel(s.ville)}</h2>
                    <Count n={`${cityTodo.filter((c) => c.status === 'fait').length}/${cityTodo.length} faits`} />
                    {unplanned > 0 && <Badge color={ORANGE}>{unplanned} à planifier</Badge>}
                    {admin && !preview && (
                      <button onClick={() => setDivideFor(s.ville)} style={{ ...chipBtn('#374151'), marginLeft: 'auto' }}>
                        <Scissors size={13} />Diviser en journées
                      </button>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {s.days.map((d) => {
                    const run = d.journee != null ? runLabel(s.ville, d.journee) : null
                    const todo = d.items.filter((c) => !c.a_eviter)
                    return (
                      <div key={d.journee ?? 'todo'}>
                        {!runScope && (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '6px 10px', marginBottom: 8,
                            borderRadius: 10, background: run ? '#F3F4F6' : ORANGE + '12',
                          }}>
                            <span style={{ fontSize: 12, fontWeight: 800, color: run ? '#374151' : ORANGE, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              {run ?? 'À planifier'}
                            </span>
                            <Count n={`${todo.filter((c) => c.status === 'fait').length}/${todo.length}`} />
                            {run && (
                              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                                {scheduleChip(run)}
                                <Link href={`/fermeture?run=${encodeURIComponent(run)}`} title="Ouvrir la journée (vue équipe)" aria-label="Ouvrir la journée" style={{ ...chipBtn(TEAL), padding: '4px 7px' }}>
                                  <Play size={12} />
                                </Link>
                              </span>
                            )}
                          </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {d.items.map((c, i) => (
                            <ClientCard
                              key={c.id}
                              c={c}
                              admin={admin}
                              step={run ? i + 1 : undefined}
                              isNext={c.id === nextStop?.id}
                              doneBy={c.done_by ? profileMap[c.done_by]?.full_name ?? null : null}
                              skipped={!!preview?.skipped.has(c.id)}
                              onToggle={toggle}
                              onOpen={() => setModal({ client: c })}
                            />
                          ))}
                          {/* total de la journée, sous le dernier client */}
                          <TotalLine label={run ?? 'À planifier'} t={totalsOf(d.items)} admin={admin} />
                        </div>
                      </div>
                    )
                  })}
                  {/* total de la ville (toutes ses journées + à planifier) */}
                  {!runScope && s.days.length > 1 && (
                    <TotalLine label={`Total ${villeLabel(s.ville)}`} t={totalsOf(cityItems)} admin={admin} strong />
                  )}
                </div>
              </div>
            )
          })}

          {visible.length === 0 && !migrationError && (
            <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 12, padding: 24, textAlign: 'center', color: '#6B7280', fontSize: 13, lineHeight: 1.6 }}>
              {locked ? (
                <>Aucun client dans cette journée.</>
              ) : (
                <>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>🍂</div>
                  <strong style={{ color: '#111827' }}>Aucun client pour l&apos;instant.</strong><br />
                  Ajoute les clients de la fermeture avec « + Client » : si le client existe déjà dans la base,
                  toutes ses infos se remplissent toutes seules. Ils sont classés par ville selon leur code postal.
                </>
              )}
            </div>
          )}
        </div>
      )}

      {modal && (
        <ClientModal
          client={modal.client}
          defaults={modal.client ? undefined : modalDefaults}
          customs={villes}
          villes={villeNames}
          maxDayOf={(v) => maxDay.get(v) ?? 0}
          inRun={inRun}
          admin={admin}
          tableMissing={!!migrationError}
          maxPosition={maxPosition}
          profileMap={profileMap}
          planColsMissing={planColsMissing}
          onClose={() => setModal(null)}
          onSaved={(msg) => { setModal(null); if (msg) setFlash(msg); loadClients() }}
        />
      )}

      {whyFor && (
        <WhyModal
          client={whyFor}
          onClose={() => setWhyFor(null)}
          onSaved={() => { setWhyFor(null); loadClients() }}
        />
      )}

      {divideFor != null && (
        <DivideModal
          ville={divideFor}
          clients={clients.filter((c) => c.ville === divideFor)}
          admin={admin}
          onClose={() => setDivideFor(null)}
          onSaved={(msg) => { setDivideFor(null); setFlash(msg); loadClients() }}
        />
      )}

      {jobModal && (
        <JobModal
          kind="paysagement"
          canEdit={admin}
          userId={userId}
          lanes={LANES}
          assignProfiles={assignProfiles}
          profileMap={profileMap}
          initialDate={jobModal.date}
          initialStart="08:00"
          initialEnd={runMinutes(jobModal.run) ? timePlus('08:00', runMinutes(jobModal.run)) : '16:00'}
          initialTeam={LANES[0]?.id}
          initialType="fermeture"
          initialRoute={jobModal.run}
          job={jobModal.job}
          onClose={() => setJobModal(null)}
          onSaved={() => {
            const run = jobModal.run
            setJobModal(null)
            setFlash(`${run} : calendrier Paysagement mis à jour.`)
            loadJobs()
          }}
        />
      )}

      {factureOpen && (
        <FactureModal
          userId={userId}
          isAdmin={admin}
          defaultJobId={lockedJob?.id ?? null}
          onClose={() => setFactureOpen(false)}
          onSaved={(msg) => { setFactureOpen(false); setFlash(msg) }}
        />
      )}
    </div>
  )
}

// Ligne de total sous le dernier client : « Longueuil #1 : 9 h 30 » (+ prix, admin).
// Rien tant qu'aucun client du groupe n'a de temps estimé (ni de prix).
function TotalLine({ label, t, admin, strong }: { label: string; t: Totals; admin: boolean; strong?: boolean }) {
  if (!t.minutes && !(admin && t.price)) return null
  const extra = [
    plural(t.count, 'client'),
    t.reste > 0 && t.reste < t.minutes ? `reste ${fmtDuree(t.reste)}` : null,
    t.sansTemps > 0 ? `${t.sansTemps} sans temps` : null,
  ].filter(Boolean).join(' · ')
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderRadius: 10,
      padding: strong ? '9px 12px' : '7px 12px', fontSize: strong ? 13.5 : 12.5,
      background: strong ? FERMETURE_COLOR + '14' : '#F3F4F6',
      border: strong ? `1px solid ${FERMETURE_COLOR}40` : '1px solid transparent',
      color: strong ? '#7C2D12' : '#374151',
    }}>
      <Clock size={strong ? 15 : 14} style={{ flexShrink: 0 }} />
      <strong>{label} : {t.minutes ? fmtDuree(t.minutes) : '—'}</strong>
      <span style={{ color: strong ? '#9A3412' : '#6B7280' }}>{extra}</span>
      {admin && t.price > 0 && <strong style={{ marginLeft: 'auto', color: GREEN }}>{fmtPrice(t.price)}</strong>}
    </div>
  )
}

// ============================================================
// Carte client — FAIT / À ÉVITER + GPS + tél
// ============================================================
function ClientCard({ c, admin, step, isNext, doneBy, skipped, onToggle, onOpen }: {
  c: FermetureClient
  admin: boolean             // le prix n'est montré qu'à l'admin
  step?: number              // rang dans la journée
  isNext?: boolean           // cible actuelle de « Prochain client »
  doneBy: string | null
  skipped?: boolean          // adresse introuvable lors de l'optimisation
  onToggle: (c: FermetureClient, s: 'fait' | 'evite') => void
  onOpen: () => void
}) {
  const fait = c.status === 'fait'
  const evite = c.status === 'evite'
  const gps = directionsUrl(c, c.ville)
  const addr = addressLine(c)
  return (
    <div style={{
      background: '#FFF', border: isNext ? `2px solid ${TEAL}` : `1px solid ${fait ? GREEN + '66' : evite ? ORANGE + '66' : '#E5E7EB'}`,
      borderRadius: 12, padding: '10px 12px', opacity: c.a_eviter ? 0.7 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {step != null && (
          <span style={{
            flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: fait ? GREEN : '#F3F4F6',
            color: fait ? '#FFF' : '#6B7280', fontSize: 11, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1,
          }}>{step}</span>
        )}
        <div role="button" tabIndex={0} onClick={onOpen} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{c.name}</span>
            {isNext && <Badge color={TEAL}>▶ PROCHAIN</Badge>}
            {c.a_eviter && <Badge color="#DC2626">À NE PAS FAIRE</Badge>}
            {skipped && <Badge color={ORANGE}>ADRESSE INTROUVABLE</Badge>}
            {c.duree_min ? <Badge color="#374151">⏱ {fmtDuree(c.duree_min)}</Badge> : null}
            {admin && c.price != null && <Badge color={GREEN}>{fmtPrice(c.price)}</Badge>}
            {c.superficie_pi2 != null && <Badge color={TEAL}>{c.superficie_pi2.toLocaleString('fr-CA')} pi²</Badge>}
            {c.photos.length > 0 && <Badge color="#6B7280">📷 {c.photos.length}</Badge>}
          </div>
          {addr && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{addr}</div>}
          {c.notes && (
            <div style={{ fontSize: 12, color: '#92400E', background: '#FEF3C7', borderRadius: 8, padding: '4px 8px', marginTop: 6 }}>
              ⚠️ {c.notes}
            </div>
          )}
          {evite && c.status_note && (
            <div style={{ fontSize: 12, color: '#374151', background: '#F3F4F6', borderRadius: 8, padding: '4px 8px', marginTop: 6 }}>
              📝 {c.status_note}
            </div>
          )}
          {c.status && c.done_at && (
            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
              {fait ? 'Fait' : 'Évité'}{doneBy ? ` par ${doneBy}` : ''} · {fmtDay(c.done_at)} {hhmm(c.done_at)}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {c.phone && (
            <a href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()} aria-label="Appeler" style={iconBtn(TEAL, '#69C9CA1F')}>
              <Phone size={15} />
            </a>
          )}
          {gps && (
            <a href={gps} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} aria-label="Itinéraire" style={iconBtn(TEAL, '#69C9CA1F')}>
              <Navigation size={15} />
            </a>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={() => onToggle(c, 'fait')} style={{
          flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: 'pointer',
          border: fait ? 'none' : `1px solid ${GREEN}55`,
          background: fait ? GREEN : GREEN + '0F', color: fait ? '#FFF' : GREEN,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}><Check size={15} />FAIT</button>
        <button onClick={() => onToggle(c, 'evite')} style={{
          flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: 'pointer',
          border: evite ? 'none' : `1px solid ${ORANGE}55`,
          background: evite ? ORANGE : ORANGE + '0F', color: evite ? '#FFF' : ORANGE,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}><AlertTriangle size={15} />À ÉVITER</button>
      </div>
    </div>
  )
}

// ============================================================
// Réorganiser — villes et journées en blocs : glisser-déposer, ou menu
// « Déplacer » (tactile). « + Ville » classe automatiquement les clients
// dont le code postal correspond. Rien n'est écrit avant « Confirmer ».
// ============================================================
type DraftVille = VilleDef & { id?: string } // id absent = ajoutée pendant cette réorganisation

function PlanBoard({ clients, customs, onCancel, onSaved }: {
  clients: FermetureClient[]
  customs: FermetureVille[]
  onCancel: () => void
  onSaved: (message: string) => void
}) {
  // brouillon dans l'ordre d'affichage : ville → journée → position
  const [draft, setDraft] = useState<FermetureClient[]>(
    () => buildSections(clients, byPosition).flatMap((s) => s.days.flatMap((d) => d.items)),
  )
  const [defs, setDefs] = useState<DraftVille[]>(() => customs.map((v) => ({ ...v })))
  const [extraDays, setExtraDays] = useState<Record<string, number>>({}) // journées vides ajoutées
  const [addVille, setAddVille] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dragId = useRef<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null) // client ou bloc survolé

  const blocks = useMemo(() => {
    const names = new Set<string>(draft.map((c) => c.ville))
    for (const d of defs) names.add(d.name)
    return [...names].sort(compareVilles).map((ville) => {
      const items = draft.filter((c) => c.ville === ville)
      const max = Math.max(0, extraDays[ville] ?? 0, ...items.map((c) => c.journee ?? 0))
      const days: DayGroup[] = []
      for (let j = 1; j <= max; j++) days.push({ journee: j, items: items.filter((c) => c.journee === j) })
      days.push({ journee: null, items: items.filter((c) => c.journee == null) })
      const def = defs.find((d) => d.name === ville)
      return { ville, max, days, count: items.length, minutes: totalsOf(items).minutes, def }
    })
  }, [draft, defs, extraDays])

  // Déplace `id` dans la journée (ville, journee) : avant/après `anchorId`,
  // sinon à la fin de la journée. L'ancre est cherchée APRÈS le retrait.
  const place = (id: string, ville: string, journee: number | null, anchorId: string | null, after: boolean) => {
    const from = draft.findIndex((c) => c.id === id)
    if (from < 0) return
    const moved = { ...draft[from], ville, journee }
    const next = [...draft]
    next.splice(from, 1)
    let at = next.length
    if (anchorId) {
      const a = next.findIndex((c) => c.id === anchorId)
      if (a >= 0) at = a + (after ? 1 : 0)
    } else {
      next.forEach((c, i) => { if (c.ville === ville && (c.journee ?? null) === journee) at = i + 1 })
    }
    next.splice(at, 0, moved)
    setDraft(next)
    setNotice(null)
  }

  const dropOnClient = (target: FermetureClient) => {
    const id = dragId.current
    if (!id || id === target.id) return
    // vers le bas → après la cible ; vers le haut → avant
    const down = draft.findIndex((c) => c.id === id) < draft.findIndex((c) => c.id === target.id)
    place(id, target.ville, target.journee ?? null, target.id, down)
  }

  const dropOnDay = (ville: string, journee: number | null) => {
    const id = dragId.current
    if (id) place(id, ville, journee, null, true)
  }

  // « + Ville » : les clients (pas encore faits) que la nouvelle ville réclame
  // par leur code postal y passent tout de suite, « à planifier ».
  const claimedBy = (def: VilleDef, list: DraftVille[]) =>
    draft.filter((c) => c.status !== 'fait' && c.ville !== def.name && villeAuto(c, [...list, def]) === def.name)

  const addVilleDef = (def: VilleDef) => {
    const nextDefs = [...defs, def]
    const claimed = new Set(claimedBy(def, defs).map((c) => c.id))
    setDefs(nextDefs)
    setDraft(draft.map((c) => (claimed.has(c.id) ? { ...c, ville: def.name, journee: null } : c)))
    setAddVille(false)
    setNotice(claimed.size
      ? `${plural(claimed.size, 'client')} classé${claimed.size > 1 ? 's' : ''} dans ${def.name} selon le code postal.`
      : `${def.name} ajoutée — glisse-y des clients, ou ils s'y classeront selon leur code postal.`)
  }

  const confirm = async () => {
    setSaving(true); setError(null)
    const before = new Map(clients.map((c) => [c.id, c]))
    const slots = reassignSlots(draft.map((c) => c.position))
    const updates: { id: string; ville?: string; journee?: number | null; position?: number }[] = []
    draft.forEach((c, i) => {
      const b = before.get(c.id)
      if (!b) return
      const patch: { id: string; ville?: string; journee?: number | null; position?: number } = { id: c.id }
      if (b.ville !== c.ville) patch.ville = c.ville
      if ((b.journee ?? null) !== (c.journee ?? null)) patch.journee = c.journee ?? null
      if (b.position !== slots[i]) patch.position = slots[i]
      if (Object.keys(patch).length > 1) updates.push(patch)
    })
    for (const d of defs.filter((x) => !x.id)) {
      const { error: e } = await createFermetureVille({ name: d.name, prefixes: d.prefixes })
      if (e) { setSaving(false); setError(`Impossible d'ajouter ${d.name} : ${e}`); return }
    }
    for (const v of customs.filter((x) => !defs.some((d) => d.id === x.id))) {
      const { error: e } = await deleteFermetureVille(v.id)
      if (e) { setSaving(false); setError(`Impossible de retirer ${v.name} : ${e}`); return }
    }
    const { error: e } = await saveFermeturePlan(updates)
    setSaving(false)
    if (e) { setError(`Impossible d'enregistrer : ${e}`); return }
    const moved = updates.filter((u) => u.ville !== undefined || u.journee !== undefined).length
    onSaved(moved ? `Plan enregistré — ${plural(moved, 'client')} changé${moved > 1 ? 's' : ''} de journée ou de ville.` : 'Plan enregistré.')
  }

  const moveValue = (ville: string, journee: number | null | 'new') => JSON.stringify([ville, journee])

  return (
    <div>
      <div style={{ background: '#EFF6FF', color: '#1E40AF', padding: '10px 12px', borderRadius: 10, fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}>
        Glisse les clients pour changer l&apos;ordre, la journée ou la ville — ou utilise le menu de chaque client.
        Les clients se classent <strong>automatiquement par ville selon leur code postal</strong> ; « + Ville »{' '}
        en ajoute une (ex. Brossard : J4W, J4X, J4Y, J4Z). Rien n&apos;est enregistré avant <strong>Confirmer</strong>.
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button onClick={() => setAddVille(true)} style={addBtn}><Plus size={15} />Ville</button>
      </div>

      {notice && (
        <div style={{ background: '#ECFDF5', color: '#065F46', padding: '8px 12px', borderRadius: 10, fontSize: 12, marginBottom: 10 }}>{notice}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {blocks.map((b) => (
          <div key={b.ville || '∅'} style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: 10, background: '#FFF' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <Route size={14} color={GREEN} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>{villeLabel(b.ville)}</span>
              <Count n={b.count} />
              {b.minutes > 0 && <Count n={`· ⏱ ${fmtDuree(b.minutes)}`} />}
              {b.def && b.def.prefixes.length > 0 && <Badge color="#6B7280">{b.def.prefixes.join(' · ')}</Badge>}
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button onClick={() => setExtraDays((p) => ({ ...p, [b.ville]: b.max + 1 }))} style={chipBtn('#374151')}>
                  <Plus size={12} />Journée
                </button>
                {b.def && b.count === 0 && (
                  <button onClick={() => setDefs(defs.filter((d) => d.name !== b.ville))} style={chipBtn('#DC2626')} title="Retirer cette ville">
                    <X size={12} />Retirer
                  </button>
                )}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {b.days.map((d) => {
                const key = moveValue(b.ville, d.journee)
                return (
                  <div
                    key={key}
                    onDragOver={(e) => { e.preventDefault(); setOverKey(key) }}
                    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverKey((v) => (v === key ? null : v)) }}
                    onDrop={(e) => { e.preventDefault(); dropOnDay(b.ville, d.journee); setOverKey(null) }}
                    style={{
                      borderRadius: 10, padding: 6,
                      background: overKey === key ? '#F0FDFA' : d.journee == null ? ORANGE + '0A' : '#F9FAFB',
                      border: overKey === key ? `1px dashed ${TEAL}` : '1px solid transparent',
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 800, color: d.journee == null ? ORANGE : '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '2px 4px 6px' }}>
                      {d.journee == null ? 'À planifier' : runLabel(b.ville, d.journee)} <Count n={d.items.length} />
                      {totalsOf(d.items).minutes > 0 && <Count n={` · ⏱ ${fmtDuree(totalsOf(d.items).minutes)}`} />}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {d.items.length === 0 && (
                        <div style={{ padding: '10px 12px', borderRadius: 8, border: '1px dashed #D1D5DB', textAlign: 'center', fontSize: 12, color: '#9CA3AF' }}>
                          Glisse un client ici
                        </div>
                      )}
                      {d.items.map((c, i) => (
                        <div
                          key={c.id}
                          draggable
                          onDragStart={() => { dragId.current = c.id }}
                          onDragEnd={() => { dragId.current = null; setOverKey(null) }}
                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOverKey(c.id) }}
                          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverKey((v) => (v === c.id ? null : v)) }}
                          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dropOnClient(c); setOverKey(null) }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, cursor: 'grab',
                            background: overKey === c.id ? '#F0FDFA' : '#FFF',
                            border: overKey === c.id ? `1px dashed ${TEAL}` : '1px solid #E5E7EB',
                          }}
                        >
                          <GripVertical size={16} color="#9CA3AF" style={{ flexShrink: 0 }} />
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#9CA3AF', width: 18, flexShrink: 0 }}>{i + 1}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {c.name}{c.status === 'fait' ? ' ✓' : ''}
                            </div>
                            <div style={{ fontSize: 11, color: '#9CA3AF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {[formatPostal(c.postal_code), c.address].filter(Boolean).join(' · ') || 'Sans adresse'}
                            </div>
                          </div>
                          <select
                            aria-label={`Déplacer ${c.name}`}
                            value={moveValue(c.ville, c.journee ?? null)}
                            onChange={(e) => {
                              const [v, j] = JSON.parse(e.target.value) as [string, number | null | 'new']
                              const maxOf = blocks.find((x) => x.ville === v)?.max ?? 0
                              place(c.id, v, j === 'new' ? maxOf + 1 : j, null, true)
                            }}
                            style={{ ...inp, width: 'auto', maxWidth: 132, padding: '5px 6px', fontSize: 12, flexShrink: 0 }}
                          >
                            {blocks.map((x) => (
                              <optgroup key={x.ville || '∅'} label={villeLabel(x.ville)}>
                                {x.days.filter((y) => y.journee != null).map((y) => (
                                  <option key={y.journee} value={moveValue(x.ville, y.journee)}>{runLabel(x.ville, y.journee!)}</option>
                                ))}
                                <option value={moveValue(x.ville, 'new')}>{runLabel(x.ville, x.max + 1)} (nouvelle)</option>
                                <option value={moveValue(x.ville, null)}>{villeLabel(x.ville)} — à planifier</option>
                              </optgroup>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {error && <div style={{ color: '#991B1B', fontSize: 13, marginTop: 10 }}>{error}</div>}

      <div style={{
        position: 'sticky', bottom: 0, display: 'flex', gap: 8, marginTop: 14, padding: '10px 0 calc(10px + env(safe-area-inset-bottom))',
        background: 'linear-gradient(to top, #F9FAFB 70%, transparent)',
      }}>
        <button onClick={onCancel} disabled={saving} style={{ ...primaryBtn, background: '#F3F4F6', color: '#374151', flex: 1 }}>Annuler</button>
        <button onClick={confirm} disabled={saving} style={{ ...primaryBtn, flex: 1, background: GREEN, color: '#FFF', opacity: saving ? 0.6 : 1 }}>
          {saving ? '…' : <><Check size={16} />Confirmer</>}
        </button>
      </div>

      {addVille && (
        <AddVilleModal
          existing={blocks.map((b) => b.ville).filter(Boolean)}
          customNames={defs.map((d) => d.name)}
          countFor={(def) => claimedBy(def, defs).length}
          onClose={() => setAddVille(false)}
          onAdd={addVilleDef}
        />
      )}
    </div>
  )
}

// « + Ville » : nom + préfixes de code postal (pré-remplis pour une ville connue).
function AddVilleModal({ existing, customNames, countFor, onClose, onAdd }: {
  existing: string[]
  customNames: string[]
  countFor: (def: VilleDef) => number
  onClose: () => void
  onAdd: (def: VilleDef) => void
}) {
  const [name, setName] = useState('')
  const [prefixes, setPrefixes] = useState('')
  const [prefixesTouched, setPrefixesTouched] = useState(false)
  const [error, setError] = useState('')

  const canonical = canonicalCity(name, [], existing)
  const parsed = parsePrefixes(prefixes)
  const count = canonical ? countFor({ name: canonical, prefixes: parsed }) : 0
  const suggestions = VILLES_REFERENCE.map((r) => r.name).filter((n, i, a) => a.indexOf(n) === i && !existing.includes(n))

  const onName = (v: string) => {
    setName(v)
    if (!prefixesTouched) setPrefixes(referencePrefixes(v).join(', '))
  }

  const add = () => {
    if (!canonical) { setError('Nom de la ville requis.'); return }
    if (customNames.includes(canonical)) { setError(`${canonical} a déjà été ajoutée.`); return }
    onAdd({ name: canonical, prefixes: parsed })
  }

  return (
    <Modal onClose={onClose} title="Ajouter une ville">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="Ville *">
          <input value={name} onChange={(e) => onName(e.target.value)} list="mw-fermeture-villes" style={inp} autoFocus={autoFocusDesktop()} placeholder="Brossard" />
          <datalist id="mw-fermeture-villes">
            {suggestions.map((n) => <option key={n} value={n} />)}
          </datalist>
        </Field>
        <Field label="Codes postaux (début)">
          <input value={prefixes} onChange={(e) => { setPrefixes(e.target.value); setPrefixesTouched(true) }} style={inp} autoCapitalize="characters" placeholder="J4W, J4X, J4Y, J4Z" />
        </Field>
        <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.5 }}>
          Les clients dont le code postal commence par ces préfixes seront classés dans cette ville — maintenant
          et pour les prochains ajouts.
          {canonical && <><br /><strong style={{ color: count ? '#065F46' : '#6B7280' }}>
            {count ? `${plural(count, 'client')} y passer${count > 1 ? 'ont' : 'a'} tout de suite.` : 'Aucun client existant ne correspond pour l’instant.'}
          </strong></>}
        </div>
        {error && <div style={{ color: '#991B1B', fontSize: 13 }}>{error}</div>}
      </div>
      <div className="mw-modal-actions">
        <button onClick={onClose} style={{ ...primaryBtn, background: '#F3F4F6', color: '#374151', flex: 1 }}>Annuler</button>
        <button onClick={add} style={{ ...primaryBtn, flex: 1 }}>Ajouter la ville</button>
      </div>
    </Modal>
  )
}

// ============================================================
// Diviser une ville en journées (#1, #2…) dans l'ordre de passage actuel.
// Selon le TEMPS estimé (défaut dès qu'un client en a un) : 9 clients en 3
// journées → 5-2-2 si les 5 premiers sont courts ; sinon par nombre de clients.
// ============================================================
function DivideModal({ ville, clients, admin, onClose, onSaved }: {
  ville: string
  clients: FermetureClient[] // tous les clients de la ville
  admin: boolean
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const ordered = useMemo(() => buildSections(clients, byPosition).flatMap((s) => s.days.flatMap((d) => d.items)), [clients])
  // déjà faits : restent dans leur journée ; à ne pas faire : sortis des journées
  const todo = ordered.filter((c) => c.status !== 'fait' && !c.a_eviter)
  const doneCount = ordered.filter((c) => c.status === 'fait').length
  const currentDays = new Set(todo.map((c) => c.journee).filter((j) => j != null)).size
  const [days, setDays] = useState(Math.min(Math.max(currentDays || 2, 1), Math.max(todo.length, 1)))
  // clients sans temps estimé : comptés à la moyenne des autres
  const known = todo.filter((c) => c.duree_min)
  const avg = known.length ? Math.round(known.reduce((sum, c) => sum + c.duree_min!, 0) / known.length) : 0
  const [byTime, setByTime] = useState(known.length > 0)
  const timeMode = byTime && known.length > 0
  const dureeOf = (c: FermetureClient) => c.duree_min || avg
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const sizes = timeMode ? splitByDuration(todo.map(dureeOf), days) : splitSizes(todo.length, days)
  const chunks: FermetureClient[][] = []
  let k = 0
  for (const size of sizes) { chunks.push(todo.slice(k, k + size)); k += size }
  const minutesOf = (ch: FermetureClient[]) => ch.reduce((sum, c) => sum + dureeOf(c), 0)
  const totalMin = minutesOf(todo)
  const approx = known.length < todo.length ? '≈ ' : '' // une moyenne entre dans le compte
  const priceOf = (ch: FermetureClient[]) => ch.reduce((sum, c) => sum + (Number(c.price) || 0), 0)

  const save = async (updates: { id: string; journee: number | null }[], message: string) => {
    setSaving(true); setError('')
    const { error: e } = await saveFermeturePlan(updates)
    setSaving(false)
    if (e) { setError(e); return }
    onSaved(message)
  }

  const divide = () => {
    const updates: { id: string; journee: number | null }[] = []
    chunks.forEach((chunk, i) => chunk.forEach((c) => { if (c.journee !== i + 1) updates.push({ id: c.id, journee: i + 1 }) }))
    for (const c of ordered) if (c.status !== 'fait' && c.a_eviter && c.journee != null) updates.push({ id: c.id, journee: null })
    const detail = chunks
      .map((ch, i) => `#${i + 1} (${ch.length}${timeMode ? ` · ${approx}${fmtDuree(minutesOf(ch))}` : ''})`)
      .join(', ')
    save(updates, `${villeLabel(ville)} divisée en ${plural(chunks.length, 'journée')} : ${detail}.`)
  }

  const unplanAll = () => {
    const updates = ordered.filter((c) => c.status !== 'fait' && c.journee != null).map((c) => ({ id: c.id, journee: null }))
    save(updates, `${villeLabel(ville)} : tous les clients à faire sont remis « à planifier ».`)
  }

  const planned = ordered.some((c) => c.status !== 'fait' && c.journee != null)

  return (
    <Modal onClose={onClose} title={`Diviser ${villeLabel(ville)} en journées`}>
      {todo.length === 0 ? (
        <div style={{ fontSize: 13, color: '#6B7280' }}>Aucun client à répartir dans cette ville.</div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5, marginBottom: 12 }}>
            {plural(todo.length, 'client')} à faire{timeMode ? <> · <strong>{approx}{fmtDuree(totalMin)}</strong> estimées</> : null}, répartis{' '}
            <strong>dans l&apos;ordre de passage actuel</strong>.
            {doneCount > 0 && <> {doneCount > 1 ? `Les ${doneCount} clients déjà faits restent dans leur journée.` : 'Le client déjà fait reste dans sa journée.'}</>}
          </div>

          {/* répartir selon le temps estimé (journées équilibrées) ou le nombre de clients */}
          {known.length > 0 ? (
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {([[true, '⏱ Temps estimé'], [false, '👥 Nombre de clients']] as const).map(([v, l]) => (
                <button key={l} onClick={() => setByTime(v)} title={v ? 'Répartir selon le temps estimé' : 'Répartir selon le nombre de clients'} style={{
                  flex: 1, padding: '7px 6px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                  border: byTime === v ? `2px solid ${TEAL}` : '1px solid #D1D5DB',
                  background: byTime === v ? '#69C9CA1F' : '#FFF', color: '#374151',
                }}>{l}</button>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#6B7280', background: '#F9FAFB', borderRadius: 10, padding: '8px 10px', marginBottom: 12, lineHeight: 1.45 }}>
              Ajoute un <strong>temps estimé</strong>{' '}aux clients (fiche du client) pour équilibrer les journées selon
              le temps : 9 clients → 5-2-2 si les premiers sont plus courts.
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <button onClick={() => setDays(Math.max(1, days - 1))} disabled={days <= 1} style={stepBtn} aria-label="Une journée de moins">−</button>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#111827', minWidth: 110, textAlign: 'center' }}>{plural(days, 'journée')}</span>
            <button onClick={() => setDays(Math.min(todo.length, days + 1))} disabled={days >= todo.length} style={stepBtn} aria-label="Une journée de plus">+</button>
            {timeMode && (
              <span style={{ fontSize: 12, color: '#6B7280' }}>≈ {fmtDuree(totalMin / days)} par journée</span>
            )}
          </div>
          {timeMode && known.length < todo.length && (
            <div style={{ fontSize: 11.5, color: '#92400E', marginBottom: 8 }}>
              {plural(todo.length - known.length, 'client')} sans temps estimé : compté{todo.length - known.length > 1 ? 's' : ''} à la moyenne ({fmtDuree(avg)}).
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {chunks.map((ch, i) => (
              <div key={i} style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: '8px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', fontSize: 13, fontWeight: 800, color: '#111827' }}>
                  {runLabel(ville, i + 1)}
                  <span style={{ fontWeight: 600, color: '#6B7280' }}>· {plural(ch.length, 'client')}</span>
                  {timeMode && <span style={{ fontWeight: 700, color: '#374151' }}>· ⏱ {approx}{fmtDuree(minutesOf(ch))}</span>}
                  {admin && priceOf(ch) > 0 && <span style={{ marginLeft: 'auto', fontWeight: 800, color: GREEN }}>{fmtPrice(priceOf(ch))}</span>}
                </div>
                <div style={{ fontSize: 11, color: '#9CA3AF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {ch[0]?.name}{ch.length > 1 ? ` → ${ch[ch.length - 1].name}` : ''}
                </div>
              </div>
            ))}
          </div>
          <div style={{ background: '#F0FDFA', color: TEAL, borderRadius: 10, padding: '8px 10px', fontSize: 12, lineHeight: 1.45 }}>
            Astuce : optimise d&apos;abord la ville (filtre « {villeLabel(ville)} » → Optimiser → Confirmer) — chaque{' '}
            journée couvrira alors un secteur compact.
          </div>
        </>
      )}
      {planned && (
        <button onClick={unplanAll} disabled={saving} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, padding: 0, border: 'none', background: 'none',
          color: '#6B7280', fontSize: 12, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline',
        }}>
          <RotateCcw size={13} />Tout remettre « à planifier »
        </button>
      )}
      {error && <div style={{ color: '#991B1B', fontSize: 13, marginTop: 10 }}>{error}</div>}
      <div className="mw-modal-actions">
        <button onClick={onClose} style={{ ...primaryBtn, background: '#F3F4F6', color: '#374151', flex: 1 }}>Annuler</button>
        <button onClick={divide} disabled={saving || todo.length === 0} style={{ ...primaryBtn, flex: 1, opacity: saving || todo.length === 0 ? 0.6 : 1 }}>
          {saving ? '…' : <><Scissors size={15} />Diviser</>}
        </button>
      </div>
    </Modal>
  )
}

// ============================================================
// « À éviter » — pourquoi ? (le bureau le voit sur la carte)
// ============================================================
function WhyModal({ client, onClose, onSaved }: { client: FermetureClient; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState(client.status_note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    if (!text.trim()) return
    setSaving(true); setError('')
    const { error: e } = await updateFermetureClient(client.id, { status_note: text.trim() })
    setSaving(false)
    if (e) { setError(e); return }
    onSaved()
  }

  return (
    <Modal onClose={onClose} title={`Pourquoi éviter — ${client.name}`}>
      <div style={{ background: ORANGE + '14', border: `1px solid ${ORANGE}55`, color: '#92400E', padding: '10px 12px', borderRadius: 10, fontSize: 12.5, marginBottom: 10, lineHeight: 1.45 }}>
        Client marqué <strong>À ÉVITER</strong>. Dis en deux mots pourquoi — le bureau le verra sur la fiche.
      </div>
      <textarea
        value={text} onChange={(e) => setText(e.target.value)} autoFocus={autoFocusDesktop()}
        placeholder="Ex. : barrière barrée, chien dans la cour, auto stationnée sur le terrain…"
        style={{ ...inp, minHeight: 80, resize: 'vertical' }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {EVITE_REASONS.map((r) => (
          <button key={r} onClick={() => setText(r)} style={{
            padding: '5px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 600,
            border: text === r ? `2px solid ${ORANGE}` : '1px solid #D1D5DB',
            background: text === r ? ORANGE + '14' : '#FFF', color: '#374151',
          }}>{r}</button>
        ))}
      </div>
      {error && <div style={{ color: '#991B1B', fontSize: 13, marginTop: 8 }}>{error}</div>}
      <div className="mw-modal-actions">
        <button onClick={onClose} style={{ ...primaryBtn, background: '#F3F4F6', color: '#374151', flex: 1 }}>Sans raison</button>
        <button onClick={save} disabled={saving || !text.trim()} style={{ ...primaryBtn, flex: 1, opacity: saving || !text.trim() ? 0.6 : 1 }}>
          {saving ? '…' : 'Enregistrer la raison'}
        </button>
      </div>
    </Modal>
  )
}

// ============================================================
// Modal client — ajout (autocomplétion base clients) / fiche / photos
// ============================================================
function ClientModal({
  client, defaults, customs, villes, maxDayOf, inRun, admin, tableMissing, maxPosition, profileMap, planColsMissing,
  onClose, onSaved,
}: {
  client?: FermetureClient
  defaults?: { ville: string; journee: number | null } // journée ouverte à l'écran
  customs: VilleDef[]
  villes: string[]                                      // villes présentes dans la run
  maxDayOf: (ville: string) => number
  inRun: Map<string, FermetureClient>                   // client_id → déjà dans la run
  admin: boolean
  tableMissing: boolean
  maxPosition: number
  profileMap: Record<string, ProfileMini>
  planColsMissing: boolean // prix / temps estimé pas encore en base
  onClose: () => void
  onSaved: (message?: string) => void
}) {
  const isEdit = !!client
  const [name, setName] = useState(client?.name ?? '')
  const [clientId, setClientId] = useState<string | null>(client?.client_id ?? null)
  const [address, setAddress] = useState(client?.address ?? '')
  const [city, setCity] = useState(client?.city ?? '')
  const [postal, setPostal] = useState(client?.postal_code ?? '')
  const [phone, setPhone] = useState(client?.phone ?? '')
  const [email, setEmail] = useState(client?.email ?? '')
  const [superficie, setSuperficie] = useState(client?.superficie_pi2 != null ? String(client.superficie_pi2) : '')
  // temps estimé : saisie libre (« 1h30 », « 1:30 », « 1,5 », « 90 min »)
  const [duree, setDuree] = useState(client?.duree_min ? fmtDuree(client.duree_min) : '')
  const [price, setPrice] = useState(client?.price != null ? String(client.price) : '')
  const [notes, setNotes] = useState(client?.notes ?? '')
  const [aEviter, setAEviter] = useState(client?.a_eviter ?? false)
  const [photos, setPhotos] = useState<string[]>(client?.photos ?? [])
  // Ville de la run : suit le code postal tant qu'on ne la choisit pas à la main.
  // Une fiche existante (ou ouverte depuis une journée) garde la sienne.
  const [villeManual, setVilleManual] = useState<string | null>(client ? client.ville : defaults ? defaults.ville : null)
  // journée choisie, valable pour UNE ville (changer de ville → à planifier)
  const [dayPick, setDayPick] = useState<{ ville: string; journee: number | null }>(
    client ? { ville: client.ville, journee: client.journee } : defaults ?? { ville: '', journee: null },
  )
  const [addToCrm, setAddToCrm] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // --- autocomplétion : un client de la base remplit toute la fiche ---
  const [suggestions, setSuggestions] = useState<Client[]>([])
  const [showSug, setShowSug] = useState(false)
  // nom déjà résolu (fiche ouverte, client choisi) : pas de recherche
  const settledName = useRef(client?.name ?? '')

  const searching = !clientId && name.trim().length >= 2
  const shown = searching ? suggestions : []

  useEffect(() => {
    const term = name.trim()
    if (term.length < 2 || clientId || name === settledName.current) return
    let cancelled = false
    const t = setTimeout(async () => {
      const list = await searchClients(term)
      if (!cancelled) { setSuggestions(list); setShowSug(true) }
    }, 200)
    return () => { cancelled = true; clearTimeout(t) }
  }, [name, clientId])

  const pickClient = (c: Client) => {
    settledName.current = c.name
    setClientId(c.id)
    setName(c.name)
    setAddress(c.address ?? '')
    setCity(c.city ?? '')
    setPostal(formatPostal(c.postal_code))
    setPhone(c.phone ?? '')
    setEmail(c.email ?? '')
    if (c.superficie_pi2 != null) setSuperficie(String(c.superficie_pi2))
    if (c.notes && !notes.trim()) setNotes(c.notes)
    setShowSug(false)
    setSuggestions([])
  }

  const onNameChange = (v: string) => {
    setName(v)
    if (!isEdit) setClientId(null) // saisie manuelle = nouveau nom, plus de fiche rattachée
  }

  const auto = villeAuto({ address, city, postal_code: postal }, customs, villes)
  const villeValue = villeManual ?? auto
  const villeFinal = canonicalCity(villeValue, customs, villes)
  const journee = dayPick.ville === villeFinal ? dayPick.journee : null
  const maxDay = maxDayOf(villeFinal)
  const dup = clientId ? inRun.get(clientId) : undefined
  const dupElsewhere = dup && dup.id !== client?.id ? dup : undefined
  const villeChoices = [...new Set([...villes.filter(Boolean), ...customs.map((v) => v.name), ...VILLES_REFERENCE.map((r) => r.name)])]

  const addPhoto = async (file: File) => {
    if (!client) return
    setUploading(true); setError('')
    const { path, error: e } = await uploadPhoto(`fermeture/${client.id}`, file)
    if (e || !path) { setUploading(false); setError(e ?? 'Upload impossible'); return }
    const next = [...photos, path]
    const { error: e2 } = await updateFermetureClient(client.id, { photos: next })
    setUploading(false)
    if (e2) { setError(e2); return }
    setPhotos(next)
  }

  const removePhoto = async (path: string) => {
    if (!client || !confirm('Supprimer cette photo ?')) return
    const next = photos.filter((p) => p !== path)
    const { error: e } = await updateFermetureClient(client.id, { photos: next })
    if (e) { setError(e); return }
    setPhotos(next)
    deletePhoto(path)
  }

  const dureeMin = parseDuree(duree) // null = vide, NaN = illisible
  const dureeBad = Number.isNaN(dureeMin)
  const priceRaw = price.replace(/,/g, '.').replace(/[^\d.]/g, '')
  const priceVal = price.trim() ? (priceRaw ? Number(priceRaw) : NaN) : null

  const save = async () => {
    if (!name.trim()) { setError('Nom du client requis.'); return }
    if (dureeBad) { setError('Temps estimé illisible — ex. 1h30, 1:30, 1,5 ou 90 min.'); return }
    if (priceVal != null && Number.isNaN(priceVal)) { setError('Prix illisible.'); return }
    setSaving(true); setError('')
    let linkedId = clientId
    let crmNote = ''
    // nouveau client (pas dans la base) → fiche CRM + QuickBooks, comme
    // « Ajouter nouveau » du calendrier. La run n'attend pas QuickBooks.
    if (!isEdit && !linkedId && addToCrm) {
      const r = await createClientEverywhere({
        name: name.trim(),
        address: address.trim() || null,
        city: city.trim() || null,
        postal_code: formatPostal(postal) || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        superficie_pi2: superficie ? Number(superficie) : null,
      })
      if (r.client) {
        linkedId = r.client.id
        crmNote = r.quickbooks === 'ok'
          ? ' Fiche créée dans la base clients et QuickBooks.'
          : ` Fiche créée dans la base clients (QuickBooks non synchronisé${r.qbError ? ` : ${r.qbError}` : ''}).`
      } else {
        crmNote = ` Fiche client non créée : ${r.error}.`
      }
    }
    const payload: FermetureClientInput = {
      name: name.trim(),
      client_id: linkedId,
      address: address.trim() || null,
      city: city.trim() || null,
      postal_code: formatPostal(postal) || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      ville: villeFinal,
      journee,
      superficie_pi2: superficie ? Number(superficie) : null,
      notes: notes.trim() || null,
      a_eviter: aEviter,
    }
    // colonnes récentes : seulement si la migration est passée ; le prix
    // n'est touché que par l'admin (un employé ne l'efface pas en enregistrant)
    if (!planColsMissing) {
      payload.duree_min = dureeMin
      if (admin) payload.price = priceVal
    }
    const { error: e } = isEdit
      ? await updateFermetureClient(client!.id, payload)
      : await createFermetureClient({ ...payload, position: maxPosition + 10 })
    setSaving(false)
    if (e) { setError(e); return }
    const where = journee ? runLabel(villeFinal, journee) : `${villeLabel(villeFinal)} (à planifier)`
    onSaved(`${isEdit ? `« ${name.trim()} » mis à jour` : `« ${name.trim()} » ajouté`} — ${where}.${crmNote}`)
  }

  const remove = async () => {
    if (!client || !admin) return
    if (!confirm(`Retirer « ${client.name} » de la run fermeture ?`)) return
    setSaving(true)
    const { error: e } = await deleteFermetureClient(client.id)
    setSaving(false)
    if (e) { setError(e); return }
    onSaved(`« ${client.name} » retiré de la run fermeture.`)
  }

  return (
    <Modal onClose={onClose} title={isEdit ? client!.name : 'Nouveau client — fermeture'}>
      {tableMissing && (
        <div style={{ background: '#FEF3C7', color: '#92400E', padding: 10, borderRadius: 10, fontSize: 12, marginBottom: 10 }}>
          ⚠️ Appliquer d&apos;abord <code>migration_crm_fermeture.sql</code> dans Supabase.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="Nom du client *">
          <div style={{ position: 'relative' }}>
            <input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              onFocus={() => { if (shown.length) setShowSug(true) }}
              onBlur={() => setTimeout(() => setShowSug(false), 150)}
              style={inp}
              autoFocus={!isEdit && autoFocusDesktop()}
              autoComplete="off"
              placeholder="Tape le nom — la base clients est cherchée"
            />
            {clientId && (
              <span style={{ position: 'absolute', right: 8, top: 9, fontSize: 10, fontWeight: 800, color: TEAL, background: '#69C9CA1F', padding: '2px 7px', borderRadius: 999 }}>CLIENT</span>
            )}
            {showSug && shown.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, marginTop: 4,
                background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden',
                boxShadow: '0 8px 20px rgba(0,0,0,0.10)', maxHeight: 240, overflowY: 'auto',
              }}>
                {shown.map((s) => {
                  const already = inRun.get(s.id)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()} /* garde le focus le temps du clic */
                      onClick={() => pickClient(s)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', borderTop: '1px solid #F3F4F6', background: '#FFF', cursor: 'pointer' }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                        {s.name}
                        {already && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: ORANGE }}>DÉJÀ DANS LA RUN</span>}
                      </div>
                      {(addressLine(s) || s.phone) && (
                        <div style={{ fontSize: 11, color: '#6B7280' }}>{[addressLine(s), s.phone].filter(Boolean).join(' · ')}</div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {!isEdit && !clientId && name.trim().length >= 2 && (
            <p style={{ margin: '5px 2px 0', fontSize: 11, color: '#9CA3AF' }}>
              {shown.length ? 'Choisis le client dans la liste pour remplir sa fiche automatiquement.' : 'Nouveau client : remplis ses infos ci-dessous.'}
            </p>
          )}
          {dupElsewhere && (
            <p style={{ margin: '5px 2px 0', fontSize: 12, fontWeight: 700, color: ORANGE }}>
              ⚠️ Déjà dans la run : {dupElsewhere.journee ? runLabel(dupElsewhere.ville, dupElsewhere.journee) : `${villeLabel(dupElsewhere.ville)} (à planifier)`}.
            </p>
          )}
        </Field>

        <Field label="Adresse">
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={address} onChange={(e) => setAddress(e.target.value)} style={inp} placeholder="123 rue Principale" />
            {address.trim() && (
              <a href={directionsUrl({ address, city, postal_code: postal }, villeFinal) ?? '#'} target="_blank" rel="noopener noreferrer" aria-label="Itinéraire" style={iconBtn(TEAL, '#69C9CA14', '1px solid #69C9CA')}>
                <Navigation size={16} />
              </a>
            )}
          </div>
          <AddressPreviewButton parts={[address, city, formatPostal(postal)]} />
        </Field>

        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Ville" flex><input value={city} onChange={(e) => setCity(e.target.value)} style={inp} placeholder="Longueuil" /></Field>
          <Field label="Code postal" flex>
            <input value={postal} onChange={(e) => setPostal(e.target.value)} onBlur={() => setPostal(formatPostal(postal))} style={inp} autoCapitalize="characters" placeholder="J4K 1A1" />
          </Field>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Téléphone" flex>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inp} inputMode="tel" placeholder="514-555-1234" />
              {phone.trim() && (
                <a href={`tel:${phone.trim()}`} aria-label="Appeler" style={iconBtn(TEAL, '#69C9CA14', '1px solid #69C9CA')}><Phone size={16} /></a>
              )}
            </div>
          </Field>
          <Field label="Courriel" flex>
            <input value={email} onChange={(e) => setEmail(e.target.value)} style={inp} type="email" autoCapitalize="none" placeholder="client@exemple.com" />
          </Field>
        </div>

        {/* classement de la run : ville (auto selon le code postal) + journée */}
        <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="Ville de la run" flex>
              <input
                value={villeValue}
                onChange={(e) => setVilleManual(e.target.value)}
                onBlur={() => { if (villeManual != null) setVilleManual(canonicalCity(villeManual, customs, villes)) }}
                list="mw-fermeture-ville-run"
                style={inp}
                placeholder="Sans ville"
              />
              <datalist id="mw-fermeture-ville-run">
                {villeChoices.map((v) => <option key={v} value={v} />)}
              </datalist>
            </Field>
            <Field label="Journée" flex>
              <select value={journee ?? ''} onChange={(e) => setDayPick({ ville: villeFinal, journee: e.target.value ? Number(e.target.value) : null })} style={inp}>
                <option value="">À planifier</option>
                {Array.from({ length: maxDay }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{runLabel(villeFinal, n)}</option>)}
                <option value={maxDay + 1}>{runLabel(villeFinal, maxDay + 1)} (nouvelle)</option>
              </select>
            </Field>
          </div>
          <div style={{ fontSize: 11, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {villeManual == null
              ? <>Classé automatiquement selon le code postal{auto ? '' : ' — ajoute le code postal ou la ville'}.</>
              : auto && auto !== villeFinal
                ? <>
                    Selon le code postal : <strong>{auto}</strong>
                    <button type="button" onClick={() => setVilleManual(null)} style={{ ...chipBtn(TEAL), padding: '2px 8px' }}>Appliquer</button>
                  </>
                : <>Ville choisie à la main.</>}
          </div>
        </div>

        {/* temps estimé (tous) + prix (admin) : totaux par journée / ville */}
        {planColsMissing && (
          <div style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FCD34D', borderRadius: 8, padding: '8px 10px', fontSize: 12, lineHeight: 1.45 }}>
            ⚠️ Temps estimé et prix pas encore actifs : appliquer <b>migration_crm_fermeture_factures.sql</b>{' '}
            dans Supabase (SQL Editor).
          </div>
        )}
        <div>
          <Field label="Temps estimé">
            <input
              value={duree}
              onChange={(e) => setDuree(e.target.value)}
              onBlur={() => { if (dureeMin && !dureeBad) setDuree(fmtDuree(dureeMin)) }}
              style={{ ...inp, borderColor: dureeBad ? '#DC2626' : '#D1D5DB' }}
              placeholder="ex. 1h30"
              disabled={planColsMissing}
            />
          </Field>
          {/* hors du <label> : un tap sur son titre « cliquerait » la 1re pastille */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {DUREE_CHOICES.map((m) => (
              <button key={m} type="button" disabled={planColsMissing} onClick={() => setDuree(fmtDuree(m))} style={{
                padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: dureeMin === m ? `2px solid ${TEAL}` : '1px solid #D1D5DB',
                background: dureeMin === m ? '#69C9CA1F' : '#FFF', color: '#374151',
              }}>{fmtDuree(m)}</button>
            ))}
          </div>
          {duree.trim() && (
            <p style={{ margin: '5px 2px 0', fontSize: 11, color: dureeBad ? '#DC2626' : '#6B7280' }}>
              {dureeBad ? 'Format : 1h30, 1:30, 1,5 ou 90 min.' : dureeMin ? `= ${fmtDuree(dureeMin)}` : ''}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {admin && (
            <Field label="Prix ($)" flex>
              <input value={price} onChange={(e) => setPrice(e.target.value)} style={inp} inputMode="decimal" placeholder="0" disabled={planColsMissing} />
            </Field>
          )}
          <Field label="Pied carré (pi²)" flex><input value={superficie} onChange={(e) => setSuperficie(e.target.value)} style={inp} type="number" inputMode="numeric" /></Field>
        </div>

        <Field label="Notes (consignes pour l'équipe)">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inp, minHeight: 60, resize: 'vertical' }} placeholder="Ramasser les feuilles côté cour, attention aux vivaces…" />
        </Field>

        {isEdit && (
          <Field label={`Photos (${photos.length})`}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {photos.map((p) => (
                <div key={p} style={{ position: 'relative' }}>
                  <a href={photoUrl(p)} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoUrl(p)} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid #E5E7EB' }} />
                  </a>
                  <button onClick={() => removePhoto(p)} aria-label="Supprimer la photo" style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: '#DC2626', color: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={12} />
                  </button>
                </div>
              ))}
              <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ width: 72, height: 72, borderRadius: 8, border: '1px dashed #9CA3AF', background: '#F9FAFB', color: '#6B7280', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 10, fontWeight: 700 }}>
                <Camera size={18} />{uploading ? '…' : 'Photo'}
              </button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) addPhoto(f); e.target.value = '' }} />
            </div>
          </Field>
        )}

        {isEdit && client!.status && client!.done_at && (
          <div style={{ fontSize: 12, color: '#6B7280' }}>
            {client!.status === 'fait' ? '✓ Fait' : '⚠️ Évité'}
            {client!.done_by && profileMap[client!.done_by]?.full_name ? ` par ${profileMap[client!.done_by]?.full_name}` : ''}
            {' '}· {fmtDay(client!.done_at)} {hhmm(client!.done_at)}
            {client!.status_note ? ` — ${client!.status_note}` : ''}
          </div>
        )}

        {admin && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#DC2626', fontWeight: 700, cursor: 'pointer' }}>
            <input type="checkbox" checked={aEviter} onChange={(e) => setAEviter(e.target.checked)} />
            À ne pas faire
          </label>
        )}

        {!isEdit && !clientId && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: '#374151', cursor: 'pointer', lineHeight: 1.4 }}>
            <input type="checkbox" checked={addToCrm} onChange={(e) => setAddToCrm(e.target.checked)} style={{ marginTop: 2 }} />
            <span><UserPlus size={13} style={{ verticalAlign: '-2px' }} /> Créer aussi la fiche dans la base clients (CRM + QuickBooks)</span>
          </label>
        )}

        {error && <div style={{ color: '#991B1B', fontSize: 13 }}>{error}</div>}
      </div>

      <div className="mw-modal-actions">
        {isEdit && admin && (
          <button onClick={remove} disabled={saving} aria-label="Retirer de la run" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 10, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer' }}>
            <Trash2 size={17} />
          </button>
        )}
        <button onClick={onClose} style={{ ...primaryBtn, background: '#F3F4F6', color: '#374151', flex: 1 }}>Annuler</button>
        <button onClick={save} disabled={saving || tableMissing} style={{ ...primaryBtn, flex: 1, opacity: saving || tableMissing ? 0.6 : 1 }}>
          {saving ? '…' : isEdit ? 'Enregistrer' : 'Ajouter'}
        </button>
      </div>
    </Modal>
  )
}

// ============================================================
// UI helpers
// ============================================================
const page: React.CSSProperties = { fontFamily: 'Inter, sans-serif', maxWidth: 900, margin: '0 auto', padding: '12px 16px var(--mw-page-pb)' }

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} className="mw-modal-overlay">
      <div onClick={(e) => e.stopPropagation()} className="mw-modal-card" style={{ width: 'min(480px, 100%)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 16px' }}>{title}</h2>
        {children}
      </div>
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
      border: 'none', background: active ? '#111827' : '#F3F4F6', color: active ? '#FFF' : '#374151',
    }}>{children}</button>
  )
}

const Count = ({ n }: { n: number | string }) => <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600 }}>{n}</span>

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return <span style={{ padding: '1px 8px', borderRadius: 999, fontSize: 10, fontWeight: 800, background: color + '14', color }}>{children}</span>
}

function Field({ label, children, flex }: { label: string; children: React.ReactNode; flex?: boolean }) {
  return (
    <label style={{ display: 'block', flex: flex ? 1 : undefined, minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  )
}

const iconBtn = (color: string, bg: string, border = 'none'): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36,
  borderRadius: 8, color, background: bg, border, flexShrink: 0,
})

const chipBtn = (color: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 999,
  border: `1px solid ${color}55`, background: color + '0F', color, fontSize: 11.5, fontWeight: 700,
  cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'none',
})

const chipRow: React.CSSProperties = { display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 8 }

const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 14, background: '#FFF', boxSizing: 'border-box' }
const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 14px', borderRadius: 10,
  border: 'none', background: '#69C9CA', color: '#06363B', fontSize: 14, fontWeight: 700, cursor: 'pointer',
}
const addBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10,
  border: 'none', background: '#69C9CA', color: '#06363B', fontSize: 13, fontWeight: 700, cursor: 'pointer',
}
const stepBtn: React.CSSProperties = {
  width: 40, height: 40, borderRadius: 10, border: '1px solid #D1D5DB', background: '#FFF',
  fontSize: 20, fontWeight: 700, color: '#374151', cursor: 'pointer',
}
