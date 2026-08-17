'use client'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { isManager } from '@/lib/roles'
import { findRoute, routeOfSecteur, groupKeyOfSecteur } from '@/lib/gazon-routes'
import { FREQUENCIES, freqOf, freqShort, dueState } from '@/lib/gazon-frequency'
import { mondayOf, addWeeks, formatWeekLabel } from '@/lib/payes'
import {
  getTerrains, getPassagesWeek, getPassagesRange, getPassagesDay, setPassage, clearPassage,
  createTerrain, updateTerrain, deleteTerrain, reorderTerrains, getFaitEverIds,
  getNotesForDate, addNote, deleteNote, optimizeRoute,
  terrainDirectionsUrl, gazonRouteUrl, SHOP_ADDRESS,
  type GazonTerrain, type GazonPassage, type GazonTerrainInput, type GazonNote,
} from '@/lib/queries/gazon'
import { uploadPhoto, photoUrl, deletePhoto } from '@/lib/storage'
import { autoFocusDesktop } from '@/lib/ui'
import {
  ChevronLeft, ChevronRight, ChevronDown, Plus, Navigation, Phone, Camera,
  Check, AlertTriangle, X, Trash2, Route, Table2, ListChecks, ArrowLeft,
  Sparkles, GripVertical, Pencil, StickyNote, ClipboardList, Loader2,
} from 'lucide-react'

// Début de saison (1re semaine du fichier du client) — borne gauche du datasheet.
const SEASON_START = '2026-05-04'

const GREEN = '#697035'
const ORANGE = '#B45309'
const TEAL = '#0E6B6E'

// Préférence « Optimiser » — par appareil (chaque camion garde son choix).
const OPT_PREF_KEY = 'mw-gazon-optimize'

const ymdLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-CA', { weekday: 'long' })
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })
const longDate = (day: string) =>
  new Date(day + 'T00:00:00').toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' })
const addDays = (day: string, n: number) => {
  const d = new Date(day + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return ymdLocal(d)
}
const fmtKm = (m: number) => `${(m / 1000).toLocaleString('fr-CA', { maximumFractionDigits: 1 })} km`
const fmtDur = (s: number) => {
  const min = Math.round(s / 60)
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`
}

// Position GPS du camion (départ de l'optimisation). null = on part du shop.
function currentPosition(): Promise<string | undefined> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(undefined)
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(`${p.coords.latitude},${p.coords.longitude}`),
      () => resolve(undefined),
      { timeout: 6000, maximumAge: 120000 },
    )
  })
}

// Les secteurs forment-ils des blocs contigus ? Si non (ordre optimisé ou
// réordonné à la main qui traverse les secteurs), on affiche une liste à plat.
function contiguousBySecteur(list: GazonTerrain[]): boolean {
  const seen = new Set<string>()
  let prev = ''
  for (const t of list) {
    if (t.secteur !== prev) {
      if (seen.has(t.secteur)) return false
      seen.add(t.secteur)
      prev = t.secteur
    }
  }
  return true
}

// useSearchParams() doit vivre sous une frontière <Suspense> (prerendering Next).
export default function GazonPage() {
  return (
    <Suspense fallback={<div style={page}><div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Chargement…</div></div>}>
      <GazonRun />
    </Suspense>
  )
}

function GazonRun() {
  // ?route=<id> : run verrouillée sur UNE route (lien « Démarrer la job » du calendrier)
  const lockedRoute = findRoute(useSearchParams().get('route'))
  const [role, setRole] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [weekOf, setWeekOf] = useState(mondayOf())
  const [terrains, setTerrains] = useState<GazonTerrain[]>([])
  const [passages, setPassages] = useState<Map<string, GazonPassage>>(new Map())
  const [prevPassages, setPrevPassages] = useState<Map<string, GazonPassage>>(new Map()) // semaine précédente
  const [faitEver, setFaitEver] = useState<Set<string>>(new Set())                       // one shot déjà faits
  const [notes, setNotes] = useState<Map<string, GazonNote[]>>(new Map())                // notes du jour
  const [notesError, setNotesError] = useState<string | null>(null)
  const [migrationError, setMigrationError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'run' | 'datasheet'>('run')
  const [groupFilter, setGroupFilter] = useState<string>('Tous') // id de route (ou secteur orphelin)
  const [modal, setModal] = useState<{ terrain?: GazonTerrain } | null>(null) // {} = nouveau
  const [noteFor, setNoteFor] = useState<GazonTerrain | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [showNotDue, setShowNotDue] = useState(false)

  // --- optimisation Google ---
  const [optimize, setOptimize] = useState(false)
  const [origin, setOrigin] = useState<string | undefined>(undefined)
  const [optOrder, setOptOrder] = useState<Map<string, number>>(new Map())
  const [optInfo, setOptInfo] = useState<{ distanceMeters: number; durationSeconds: number; chunks: number } | null>(null)
  const [optLoading, setOptLoading] = useState(false)
  const [optError, setOptError] = useState<string | null>(null)

  // --- mode Édition (réordonner) ---
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState<GazonTerrain[]>([])
  const [savingOrder, setSavingOrder] = useState(false)

  const admin = isManager(role)
  const today = ymdLocal(new Date())

  const loadTerrains = useCallback(async () => {
    const { terrains: t, error } = await getTerrains()
    setTerrains(t)
    setMigrationError(error)
    // one shot : savoir s'ils ont DÉJÀ été faits (sinon ils resteraient dans la run)
    const oneShot = t.filter((x) => freqOf(x.frequency_type) === 'one-shot').map((x) => x.id)
    setFaitEver(await getFaitEverIds(oneShot))
  }, [])

  const loadPassages = useCallback(async (w: string) => {
    // la semaine précédente sert aux reprises ET au cycle « aux 2 semaines »
    const [list, prev] = await Promise.all([getPassagesWeek(w), getPassagesWeek(addWeeks(w, -1))])
    setPassages(new Map(list.map((p) => [p.terrain_id, p])))
    setPrevPassages(new Map(prev.map((p) => [p.terrain_id, p])))
  }, [])

  const loadNotes = useCallback(async () => {
    const { notes: list, error } = await getNotesForDate(ymdLocal(new Date()))
    const m = new Map<string, GazonNote[]>()
    for (const n of list) m.set(n.terrain_id, [...(m.get(n.terrain_id) ?? []), n])
    setNotes(m)
    setNotesError(error)
  }, [])

  useEffect(() => {
    setOptimize(typeof window !== 'undefined' && localStorage.getItem(OPT_PREF_KEY) === '1')
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      setUserId(user.id)
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setRole(data?.role ?? 'rep')
      await Promise.all([loadTerrains(), loadPassages(mondayOf()), loadNotes()])
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (!loading) loadPassages(weekOf) }, [weekOf, loading, loadPassages])

  // realtime : un coéquipier coche / note → tout le monde voit
  useEffect(() => {
    const ch = supabase
      .channel('gazon')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gazon_passages' }, () => loadPassages(weekOf))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gazon_terrains' }, () => loadTerrains())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gazon_notes' }, () => loadNotes())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [weekOf, loadPassages, loadTerrains, loadNotes])

  // secteurs bruts dans l'ordre de la run (position globale) — pour le modal terrain
  const secteurs = useMemo(() => {
    const seen: string[] = []
    for (const t of terrains) if (!seen.includes(t.secteur)) seen.push(t.secteur)
    return seen
  }, [terrains])

  // filtres = routes (un secteur ajouté à la main hors des 4 routes fait son propre groupe)
  const groups = useMemo(() => {
    const seen: { key: string; label: string }[] = []
    for (const t of terrains) {
      const r = routeOfSecteur(t.secteur)
      const key = r?.id ?? t.secteur
      if (!seen.some((g) => g.key === key)) seen.push({ key, label: r?.label ?? t.secteur })
    }
    return seen
  }, [terrains])

  const visible = useMemo(() => terrains.filter((t) => {
    if (!t.active) return false
    const key = groupKeyOfSecteur(t.secteur)
    if (lockedRoute) return key === lockedRoute.id
    return groupFilter === 'Tous' || key === groupFilter
  }), [terrains, groupFilter, lockedRoute])

  // fréquence : le terrain fait-il partie de la run de CETTE semaine ?
  const due = useMemo(() => {
    const m = new Map<string, { due: boolean; reason: string | null }>()
    for (const t of visible) {
      m.set(t.id, dueState(t.frequency_type, {
        hasPassageThisWeek: passages.has(t.id),
        faitLastWeek: prevPassages.get(t.id)?.status === 'fait',
        faitEver: faitEver.has(t.id),
      }))
    }
    return m
  }, [visible, passages, prevPassages, faitEver])

  // ordre affiché : position manuelle, ou ordre optimisé par Google si activé
  const ordered = useMemo(() => {
    if (!optimize || optOrder.size === 0) return visible
    return visible
      .map((t, i) => ({ t, rank: optOrder.has(t.id) ? optOrder.get(t.id)! : 1_000_000 + i }))
      .sort((a, b) => a.rank - b.rank)
      .map((x) => x.t)
  }, [visible, optimize, optOrder])

  const dueList = useMemo(() => ordered.filter((t) => due.get(t.id)?.due !== false), [ordered, due])
  const notDue = useMemo(() => ordered.filter((t) => due.get(t.id)?.due === false), [ordered, due])

  // sous-titres = secteurs bruts présents dans la sélection, dans l'ordre de passage
  const visibleSecteurs = useMemo(() => {
    const out: string[] = []
    for (const t of dueList) if (!out.includes(t.secteur)) out.push(t.secteur)
    return out
  }, [dueList])

  // liste à plat dès que les secteurs ne sont plus contigus (ordre optimisé /
  // réordonné à la main) — sinon le regroupement par secteur mentirait sur l'ordre.
  const flat = useMemo(() => !contiguousBySecteur(dueList), [dueList])

  const aFaire = dueList.filter((t) => !t.a_eviter)
  const faits = aFaire.filter((t) => passages.get(t.id)?.status === 'fait').length

  // « À reprendre » : remonté EN HAUT de la run du lendemain — terrains cochés
  // À ÉVITER un jour précédent de la semaine, ou manqués la semaine passée.
  const retakes = useMemo(() => {
    const prevWorked = prevPassages.size > 0 // semaine passée réellement travaillée
    const out: { t: GazonTerrain; reason: string }[] = []
    for (const t of dueList) {
      if (t.a_eviter) continue // « à ne pas faire » permanent
      const p = passages.get(t.id)
      if (p) {
        if (p.status === 'evite' && p.done_at && ymdLocal(new Date(p.done_at)) < today) {
          out.push({ t, reason: `Évité ${dayLabel(p.done_at)}` })
        }
        continue // fait, ou évité aujourd'hui → reste à sa place
      }
      // « manqué » ne veut rien dire pour un aux-2-semaines ou un one shot
      if (freqOf(t.frequency_type) !== 'hebdo') continue
      if (prevWorked && prevPassages.get(t.id)?.status !== 'fait') {
        out.push({ t, reason: 'Manqué la semaine passée' })
      }
    }
    return out
  }, [dueList, passages, prevPassages, today])

  const retakeIds = useMemo(() => new Set(retakes.map((r) => r.t.id)), [retakes])

  // terrains restant à faire, dans l'ORDRE MANUEL — entrée stable de l'optimisation
  const pendingByPosition = useMemo(
    () => visible.filter((t) =>
      due.get(t.id)?.due !== false && !t.a_eviter && !passages.get(t.id) && (t.address ?? '').trim()),
    [visible, due, passages],
  )
  // On ne rappelle Google QUE si un terrain non encore classé apparaît (nouveau
  // terrain, changement de filtre…). Cocher FAIT ne fait que retirer un arrêt de
  // la liste : l'ordre déjà calculé reste valide — inutile de repayer un appel.
  const needsOptimize = optimize && pendingByPosition.length >= 2 &&
    pendingByPosition.some((t) => !optOrder.has(t.id))

  useEffect(() => {
    if (!optimize) { setOptOrder(new Map()); setOptInfo(null); setOptError(null); return }
    if (!needsOptimize) return
    let cancelled = false
    setOptLoading(true); setOptError(null)
    optimizeRoute(pendingByPosition.map((t) => ({ id: t.id, address: (t.address ?? '').trim() })), origin)
      .then((r) => {
        if (cancelled) return
        setOptLoading(false)
        if (r.error) {
          setOptError(r.error)
          setOptOrder(new Map()); setOptInfo(null)
          if (!r.configured) { // pas de clé Google → on retombe sur l'ordre manuel
            localStorage.setItem(OPT_PREF_KEY, '0')
            setOptimize(false)
          }
          return
        }
        setOptOrder(new Map(r.order.map((id, i) => [id, i])))
        setOptInfo({ distanceMeters: r.distanceMeters, durationSeconds: r.durationSeconds, chunks: r.chunks })
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optimize, needsOptimize, origin])

  const toggleOptimize = async () => {
    const next = !optimize
    localStorage.setItem(OPT_PREF_KEY, next ? '1' : '0')
    if (next) {
      setEditMode(false)
      setOrigin(await currentPosition()) // départ = position du camion, sinon le shop
    }
    setOptimize(next)
  }

  // itinéraire : les reprises d'abord, puis les terrains restants, dans l'ordre affiché
  const routeUrl = useMemo(() => {
    const pending = dueList.filter((t) => !t.a_eviter && !passages.get(t.id))
    if (optimize && optOrder.size) return gazonRouteUrl(pending) // Google a déjà tout ordonné
    return gazonRouteUrl([...retakes.map((r) => r.t), ...pending.filter((t) => !retakeIds.has(t.id))])
  }, [dueList, passages, retakes, retakeIds, optimize, optOrder])

  const toggle = async (t: GazonTerrain, status: 'fait' | 'evite') => {
    const current = passages.get(t.id)
    // maj optimiste
    const next = new Map(passages)
    if (current?.status === status) next.delete(t.id)
    else next.set(t.id, { id: 'tmp', terrain_id: t.id, week_of: weekOf, status, note: null, done_by: userId, done_at: new Date().toISOString() })
    setPassages(next)
    const { error } = current?.status === status
      ? await clearPassage(t.id, weekOf)
      : await setPassage(t.id, weekOf, status, userId)
    if (error) loadPassages(weekOf)
  }

  // --- mode Édition : réordonner puis Confirmer ---
  const startEdit = () => { setDraft(ordered); setEditMode(true) }

  const confirmOrder = async () => {
    // On réutilise les positions DÉJÀ occupées par ces terrains, triées : l'ordre
    // relatif des terrains hors sélection (autre route / inactifs) reste intact.
    const slots = draft.map((t) => t.position).sort((a, b) => a - b)
    const updates = draft
      .map((t, i) => ({ id: t.id, position: slots[i] }))
      .filter((u, i) => draft[i].position !== u.position)
    if (!updates.length) { setEditMode(false); return }
    setSavingOrder(true)
    const { error } = await reorderTerrains(updates)
    setSavingOrder(false)
    if (error) { alert(`Impossible d'enregistrer l'ordre : ${error}`); return }
    setEditMode(false)
    loadTerrains()
  }

  if (loading) return <div style={page}><div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Chargement…</div></div>

  const cardProps = (t: GazonTerrain, reason?: string) => ({
    t, reason,
    passage: passages.get(t.id),
    notes: notes.get(t.id) ?? [],
    onToggle: toggle,
    onOpen: () => setModal({ terrain: t }),
    onNote: () => setNoteFor(t),
  })

  return (
    <div style={page}>
      {lockedRoute && (
        <Link href="/calendrier/paysagement" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#6B7280', textDecoration: 'none', marginBottom: 8 }}>
          <ArrowLeft size={15} />Calendrier
        </Link>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>🌿 {lockedRoute ? lockedRoute.label : 'Run de gazon'}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <button onClick={() => setWeekOf(addWeeks(weekOf, -1))} style={navBtn} aria-label="Semaine précédente"><ChevronLeft size={16} /></button>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', minWidth: 150, textAlign: 'center' }}>{formatWeekLabel(weekOf)}</span>
          <button onClick={() => setWeekOf(addWeeks(weekOf, 1))} style={navBtn} aria-label="Semaine suivante"><ChevronRight size={16} /></button>
          {weekOf !== mondayOf() && <button onClick={() => setWeekOf(mondayOf())} style={{ ...navBtn, width: 'auto', padding: '0 10px', fontSize: 12, fontWeight: 600 }}>Auj.</button>}
        </div>
      </div>

      {migrationError && (
        <div style={{ background: '#FEF3C7', color: '#92400E', padding: 12, borderRadius: 10, fontSize: 13, marginBottom: 14 }}>
          ⚠️ Tables gazon absentes — appliquer <code>migration_crm_gazon_paye.sql</code> dans Supabase SQL Editor,
          puis importer le CSV : <code>node --env-file=.env.local scripts/import-gazon-csv.mjs Run_Gazon_2026_Suivi.csv</code>
        </div>
      )}

      {/* barre d'actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {admin && !lockedRoute && !editMode && (
          <div style={{ display: 'flex', gap: 6 }}>
            <Tab active={view === 'run'} onClick={() => setView('run')}><ListChecks size={14} /> Run</Tab>
            <Tab active={view === 'datasheet'} onClick={() => setView('datasheet')}><Table2 size={14} /> Datasheet</Tab>
          </div>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {admin && !editMode && (
            <button onClick={() => setReportOpen(true)} style={{ ...addBtn, background: '#F3F4F6', color: '#374151' }}>
              <ClipboardList size={15} />Rapport
            </button>
          )}
          {!editMode && <button onClick={() => setModal({})} style={addBtn}><Plus size={15} />Terrain</button>}
        </div>
      </div>

      {/* optimisation + itinéraire + réordonner */}
      {view === 'run' && !editMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <Switch on={optimize} onChange={toggleOptimize} label="Optimiser" />
          <span style={{ fontSize: 12, color: '#6B7280', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {optLoading && <><Loader2 size={13} style={{ animation: 'mw-spin 1s linear infinite' }} />Calcul…</>}
            {!optLoading && optimize && optInfo && (
              <>{fmtKm(optInfo.distanceMeters)} · {fmtDur(optInfo.durationSeconds)}{optInfo.chunks > 1 ? ` · ${optInfo.chunks} blocs` : ''}</>
            )}
            {!optLoading && !optimize && 'Ordre manuel'}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {routeUrl && (
              <a href={routeUrl} target="_blank" rel="noopener noreferrer" title={`Retour au shop à la fin (${SHOP_ADDRESS})`} style={{ ...addBtn, textDecoration: 'none', background: GREEN, color: '#FFF' }}>
                <Route size={15} />Itinéraire restant
              </a>
            )}
            {admin && <button onClick={startEdit} style={{ ...addBtn, background: '#F3F4F6', color: '#374151' }}><Pencil size={15} />Réordonner</button>}
          </div>
        </div>
      )}

      {optError && (
        <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 10, fontSize: 12, marginBottom: 10 }}>
          Optimisation indisponible — {optError}
        </div>
      )}

      {/* filtres route + progression (masqués si la run est verrouillée sur une route) */}
      {!lockedRoute && !editMode && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 8 }}>
          {[{ key: 'Tous', label: 'Toutes' }, ...groups].map((g) => (
            <button key={g.key} onClick={() => setGroupFilter(g.key)} style={{
              padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              border: 'none', background: groupFilter === g.key ? '#111827' : '#F3F4F6', color: groupFilter === g.key ? '#FFF' : '#374151',
            }}>{g.label}</button>
          ))}
        </div>
      )}
      {!editMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1, height: 8, borderRadius: 999, background: '#E5E7EB', overflow: 'hidden' }}>
            <div style={{ width: `${aFaire.length ? (faits / aFaire.length) * 100 : 0}%`, height: '100%', background: GREEN, borderRadius: 999, transition: 'width .3s' }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: GREEN, whiteSpace: 'nowrap' }}>{faits}/{aFaire.length} faits</span>
        </div>
      )}

      {editMode ? (
        <ReorderList
          draft={draft} setDraft={setDraft} saving={savingOrder}
          onCancel={() => setEditMode(false)} onConfirm={confirmOrder}
        />
      ) : view === 'datasheet' && admin && !lockedRoute ? (
        <Datasheet terrains={terrains.filter((t) => t.active)} weekOf={weekOf} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* reprises en tête de run (l'ordre optimisé les place déjà lui-même) */}
          {retakes.length > 0 && !flat && (
            <div>
              <SectionTitle color={ORANGE}>🔁 À reprendre<Count n={retakes.length} /></SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {retakes.map(({ t, reason }) => <TerrainCard key={t.id} {...cardProps(t, reason)} />)}
              </div>
            </div>
          )}

          {flat ? (
            <div>
              <SectionTitle color={optimize ? TEAL : '#374151'}>
                {optimize ? '✨ Ordre optimisé' : 'Ordre de passage'}<Count n={dueList.length} />
              </SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dueList.map((t, i) => (
                  <TerrainCard key={t.id} {...cardProps(t, retakes.find((r) => r.t.id === t.id)?.reason)} step={i + 1} />
                ))}
              </div>
            </div>
          ) : (
            visibleSecteurs.map((s) => {
              const list = dueList.filter((t) => t.secteur === s)
              const cards = list.filter((t) => !retakeIds.has(t.id)) // les reprises sont déjà en haut
              if (!cards.length) return null
              const done = list.filter((t) => !t.a_eviter && passages.get(t.id)?.status === 'fait').length
              const total = list.filter((t) => !t.a_eviter).length
              return (
                <div key={s}>
                  <SectionTitle color="#374151">{s}<Count n={`${done}/${total}`} /></SectionTitle>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {cards.map((t) => <TerrainCard key={t.id} {...cardProps(t)} />)}
                  </div>
                </div>
              )
            })
          )}

          {/* fréquence : hors cycle cette semaine — repliés, jamais perdus */}
          {notDue.length > 0 && (
            <div>
              <button onClick={() => setShowNotDue((v) => !v)} style={{
                display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: '4px 0',
                cursor: 'pointer', fontSize: 13, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                {showNotDue ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                Pas dues cette semaine<Count n={notDue.length} />
              </button>
              {showNotDue && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {notDue.map((t) => (
                    <TerrainCard key={t.id} {...cardProps(t)} muted notDueReason={due.get(t.id)?.reason ?? null} />
                  ))}
                </div>
              )}
            </div>
          )}

          {visible.length === 0 && !migrationError && (
            <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 12, padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
              Aucun terrain. Importe le CSV ou ajoute un terrain avec « + Terrain ».
            </div>
          )}
        </div>
      )}

      {modal && (
        <TerrainModal
          terrain={modal.terrain}
          secteurs={secteurs}
          admin={admin}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); loadTerrains() }}
        />
      )}

      {noteFor && (
        <NoteModal
          terrain={noteFor}
          day={today}
          notes={notes.get(noteFor.id) ?? []}
          userId={userId}
          admin={admin}
          tableMissing={notesError}
          onClose={() => setNoteFor(null)}
          onSaved={loadNotes}
        />
      )}

      {reportOpen && <DayReportModal onClose={() => setReportOpen(false)} />}
    </div>
  )
}

// ============================================================
// Carte terrain — FAIT / À ÉVITER + GPS + tél + note du jour
// ============================================================
function TerrainCard({ t, passage, reason, notDueReason, step, muted, notes, onToggle, onOpen, onNote }: {
  t: GazonTerrain
  passage: GazonPassage | undefined
  reason?: string          // pourquoi ce terrain est remonté en tête de run
  notDueReason?: string | null // pourquoi il est hors cycle cette semaine
  step?: number            // rang dans l'ordre optimisé
  muted?: boolean          // section « pas dues cette semaine »
  notes: GazonNote[]
  onToggle: (t: GazonTerrain, s: 'fait' | 'evite') => void
  onOpen: () => void
  onNote: () => void
}) {
  const fait = passage?.status === 'fait'
  const evite = passage?.status === 'evite'
  const gps = terrainDirectionsUrl(t)
  const freq = freqOf(t.frequency_type)
  return (
    <div style={{
      background: '#FFF', border: `1px solid ${fait ? GREEN + '66' : evite ? ORANGE + '66' : '#E5E7EB'}`,
      borderRadius: 12, padding: '10px 12px', opacity: t.a_eviter || muted ? 0.7 : 1,
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
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{t.name}</span>
            {reason && <Badge color={ORANGE}>🔁 {reason}</Badge>}
            {notDueReason && <Badge color="#6B7280">{notDueReason}</Badge>}
            {t.a_eviter && <Badge color="#DC2626">À NE PAS FAIRE</Badge>}
            {freq !== 'hebdo' && !notDueReason && <Badge color={TEAL}>⟳ {freqShort(t.frequency_type)}</Badge>}
            {t.frequency && <Badge color="#6B7280">{t.frequency}</Badge>}
            {t.superficie_pi2 != null && <Badge color={TEAL}>{t.superficie_pi2.toLocaleString('fr-CA')} pi²</Badge>}
            {t.photos.length > 0 && <Badge color="#6B7280">📷 {t.photos.length}</Badge>}
          </div>
          {t.address && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{t.address}</div>}
          {t.notes && (
            <div style={{ fontSize: 12, color: '#92400E', background: '#FEF3C7', borderRadius: 8, padding: '4px 8px', marginTop: 6 }}>
              ⚠️ {t.notes}
            </div>
          )}
          {notes.map((n) => (
            <div key={n.id} style={{ fontSize: 12, color: '#374151', background: '#F3F4F6', borderRadius: 8, padding: '4px 8px', marginTop: 6 }}>
              📝 {n.note}
              <span style={{ color: '#9CA3AF', marginLeft: 6 }}>
                — {n.profiles?.full_name ?? 'employé'} {hhmm(n.created_at)}
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {t.phone && (
            <a href={`tel:${t.phone}`} onClick={(e) => e.stopPropagation()} aria-label="Appeler" style={iconBtn(TEAL, '#69C9CA1F')}>
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
        <button onClick={() => onToggle(t, 'fait')} style={{
          flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: 'pointer',
          border: fait ? 'none' : `1px solid ${GREEN}55`,
          background: fait ? GREEN : GREEN + '0F', color: fait ? '#FFF' : GREEN,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}><Check size={15} />FAIT</button>
        <button onClick={() => onToggle(t, 'evite')} style={{
          flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: 'pointer',
          border: evite ? 'none' : `1px solid ${ORANGE}55`,
          background: evite ? ORANGE : ORANGE + '0F', color: evite ? '#FFF' : ORANGE,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}><AlertTriangle size={15} />À ÉVITER</button>
        <button onClick={onNote} aria-label="Note du jour" title="Note du jour" style={{
          width: 46, borderRadius: 8, cursor: 'pointer', border: `1px solid ${notes.length ? TEAL : '#D1D5DB'}`,
          background: notes.length ? '#69C9CA1F' : '#FFF', color: notes.length ? TEAL : '#6B7280',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, fontSize: 12, fontWeight: 800,
        }}><StickyNote size={15} />{notes.length || ''}</button>
      </div>
    </div>
  )
}

// ============================================================
// Mode Édition — drag & drop pour réordonner, puis Confirmer
// ============================================================
function ReorderList({ draft, setDraft, saving, onCancel, onConfirm }: {
  draft: GazonTerrain[]
  setDraft: (l: GazonTerrain[]) => void
  saving: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const dragId = useRef<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const move = (fromId: string, toId: string) => {
    if (fromId === toId) return
    const from = draft.findIndex((t) => t.id === fromId)
    const to = draft.findIndex((t) => t.id === toId)
    if (from < 0 || to < 0) return
    const next = [...draft]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setDraft(next)
  }

  return (
    <div>
      <div style={{ background: '#EFF6FF', color: '#1E40AF', padding: '10px 12px', borderRadius: 10, fontSize: 13, marginBottom: 10 }}>
        Glisse les terrains pour changer l&apos;ordre de passage, puis <strong>Confirmer</strong>.
        L&apos;ordre est partagé avec toute l&apos;équipe.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {draft.map((t, i) => (
          <div
            key={t.id}
            draggable
            onDragStart={() => { dragId.current = t.id }}
            onDragEnd={() => { dragId.current = null; setOverId(null) }}
            onDragOver={(e) => { e.preventDefault(); setOverId(t.id) }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverId((v) => (v === t.id ? null : v)) }}
            onDrop={(e) => { e.preventDefault(); if (dragId.current) move(dragId.current, t.id); setOverId(null) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, cursor: 'grab',
              background: overId === t.id ? '#F0FDFA' : '#FFF',
              border: overId === t.id ? `1px dashed ${TEAL}` : '1px solid #E5E7EB',
            }}
          >
            <GripVertical size={16} color="#9CA3AF" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: '#9CA3AF', width: 22, flexShrink: 0 }}>{i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
              <div style={{ fontSize: 11, color: '#9CA3AF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t.secteur}{t.address ? ` · ${t.address}` : ''}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        position: 'sticky', bottom: 0, display: 'flex', gap: 8, marginTop: 14, padding: '10px 0',
        background: 'linear-gradient(to top, #F9FAFB 70%, transparent)',
      }}>
        <button onClick={onCancel} disabled={saving} style={{ ...primaryBtn, background: '#F3F4F6', color: '#374151', flex: 1 }}>Annuler</button>
        <button onClick={onConfirm} disabled={saving} style={{ ...primaryBtn, flex: 1, background: GREEN, color: '#FFF', opacity: saving ? 0.6 : 1 }}>
          {saving ? '…' : <><Check size={16} />Confirmer l&apos;ordre</>}
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Datasheet admin — saison complète, ✓ / ✗ par semaine
// ============================================================
function Datasheet({ terrains, weekOf }: { terrains: GazonTerrain[]; weekOf: string }) {
  const [range, setRange] = useState<GazonPassage[]>([])

  // colonnes = SEASON_START → max(semaine affichée, semaine courante)
  const weeks = useMemo(() => {
    const out: string[] = []
    const end = weekOf > mondayOf() ? weekOf : mondayOf()
    let w = SEASON_START
    while (w <= end && out.length < 40) { out.push(w); w = addWeeks(w, 1) }
    return out
  }, [weekOf])

  useEffect(() => {
    getPassagesRange(weeks[0], weeks[weeks.length - 1]).then(setRange)
  }, [weeks])

  const byKey = useMemo(() => {
    const m = new Map<string, GazonPassage>()
    for (const p of range) m.set(`${p.terrain_id}|${p.week_of}`, p)
    return m
  }, [range])

  const secteurs: string[] = []
  for (const t of terrains) if (!secteurs.includes(t.secteur)) secteurs.push(t.secteur)

  const fmtW = (w: string) => {
    const d = new Date(w + 'T00:00:00')
    return `${d.getDate()}/${d.getMonth() + 1}`
  }

  return (
    <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 12, overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, position: 'sticky', left: 0, background: '#F9FAFB', zIndex: 2, textAlign: 'left', minWidth: 160 }}>Terrain</th>
            {weeks.map((w) => (
              <th key={w} style={{ ...thStyle, background: w === weekOf ? '#69C9CA33' : '#F9FAFB' }}>{fmtW(w)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {secteurs.map((s) => (
            <SecteurRows key={s} secteur={s} terrains={terrains.filter((t) => t.secteur === s)} weeks={weeks} weekOf={weekOf} byKey={byKey} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SecteurRows({ secteur, terrains, weeks, weekOf, byKey }: {
  secteur: string; terrains: GazonTerrain[]; weeks: string[]; weekOf: string; byKey: Map<string, GazonPassage>
}) {
  return (
    <>
      <tr>
        <td colSpan={weeks.length + 1} style={{ padding: '6px 10px', fontWeight: 800, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#374151', background: '#F3F4F6', position: 'sticky', left: 0 }}>
          {secteur}
        </td>
      </tr>
      {terrains.map((t) => (
        <tr key={t.id}>
          <td style={{ padding: '5px 10px', borderTop: '1px solid #F3F4F6', position: 'sticky', left: 0, background: '#FFF', whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600, color: t.a_eviter ? '#DC2626' : '#374151', zIndex: 1 }}>
          {t.a_eviter ? '🚫 ' : ''}{t.name}
          </td>
          {weeks.map((w) => {
            const p = byKey.get(`${t.id}|${w}`)
            return (
              <td key={w} title={p?.note ?? ''} style={{
                padding: '5px 6px', borderTop: '1px solid #F3F4F6', textAlign: 'center', minWidth: 34,
                background: w === weekOf ? '#69C9CA0D' : undefined,
                color: p?.status === 'fait' ? GREEN : ORANGE, fontWeight: 800,
              }}>
                {p ? (p.status === 'fait' ? '✓' : '✗') : ''}
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}

// ============================================================
// Note du jour — un employé documente ce qu'il a vu sur le terrain
// ============================================================
function NoteModal({ terrain, day, notes, userId, admin, tableMissing, onClose, onSaved }: {
  terrain: GazonTerrain
  day: string
  notes: GazonNote[]
  userId: string | null
  admin: boolean
  tableMissing: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    if (!text.trim()) return
    setSaving(true); setError('')
    const { error: e } = await addNote(terrain.id, day, text.trim(), userId)
    setSaving(false)
    if (e) { setError(e); return }
    setText('')
    onSaved()
  }

  const remove = async (n: GazonNote) => {
    if (!confirm('Supprimer cette note ?')) return
    const { error: e } = await deleteNote(n.id)
    if (e) { setError(e); return }
    onSaved()
  }

  return (
    <Modal onClose={onClose} title={`Note du jour — ${terrain.name}`}>
      <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 10 }}>{longDate(day)}</div>

      {tableMissing && (
        <div style={{ background: '#FEF3C7', color: '#92400E', padding: 10, borderRadius: 10, fontSize: 12, marginBottom: 10 }}>
          ⚠️ Notes indisponibles — appliquer <code>migration_crm_gazon_v2.sql</code> dans Supabase SQL Editor.
        </div>
      )}

      {notes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {notes.map((n) => (
            <div key={n.id} style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ fontSize: 13, color: '#111827', whiteSpace: 'pre-wrap' }}>{n.note}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 11, color: '#9CA3AF' }}>{n.profiles?.full_name ?? 'Employé'} · {hhmm(n.created_at)}</span>
                {(admin || n.author_id === userId) && (
                  <button onClick={() => remove(n)} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#DC2626', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                    Supprimer
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <textarea
        value={text} onChange={(e) => setText(e.target.value)} autoFocus={autoFocusDesktop()}
        placeholder="Ex. : barrière barrée, chien dans la cour, gazon très long, bordure à refaire…"
        style={{ ...inp, minHeight: 90, resize: 'vertical' }}
      />
      {error && <div style={{ color: '#991B1B', fontSize: 13, marginTop: 8 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={onClose} style={{ ...primaryBtn, background: '#F3F4F6', color: '#374151', flex: 1 }}>Fermer</button>
        <button onClick={save} disabled={saving || !text.trim()} style={{ ...primaryBtn, flex: 1, opacity: saving || !text.trim() ? 0.6 : 1 }}>
          {saving ? '…' : 'Ajouter la note'}
        </button>
      </div>
    </Modal>
  )
}

// ============================================================
// Rapport du jour (admin) — tout ce qui s'est passé dans la journée
// ============================================================
function DayReportModal({ onClose }: { onClose: () => void }) {
  const [day, setDay] = useState(ymdLocal(new Date()))
  const [passages, setPassages] = useState<GazonPassage[]>([])
  const [notes, setNotes] = useState<GazonNote[]>([])
  const [notesError, setNotesError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([getPassagesDay(day), getNotesForDate(day)]).then(([p, n]) => {
      if (cancelled) return
      setPassages(p)
      setNotes(n.notes)
      setNotesError(n.error)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [day])

  const faits = passages.filter((p) => p.status === 'fait')
  const evites = passages.filter((p) => p.status === 'evite')

  // regroupement par employé (le rapport sert à voir qui a fait quoi)
  const byEmployee = useMemo(() => {
    const m = new Map<string, { name: string; faits: GazonPassage[]; evites: GazonPassage[] }>()
    for (const p of passages) {
      const key = p.done_by ?? 'inconnu'
      const entry = m.get(key) ?? { name: p.profiles?.full_name ?? 'Non identifié', faits: [], evites: [] }
      if (p.status === 'fait') entry.faits.push(p); else entry.evites.push(p)
      m.set(key, entry)
    }
    return [...m.values()].sort((a, b) => b.faits.length - a.faits.length)
  }, [passages])

  const bySecteur = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of faits) {
      const s = p.gazon_terrains?.secteur ?? '—'
      m.set(s, (m.get(s) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [faits])

  return (
    <Modal onClose={onClose} title="Rapport du jour" wide>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <button onClick={() => setDay(addDays(day, -1))} style={navBtn} aria-label="Jour précédent"><ChevronLeft size={16} /></button>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#374151', flex: 1, textAlign: 'center', textTransform: 'capitalize' }}>{longDate(day)}</span>
        <button onClick={() => setDay(addDays(day, 1))} style={navBtn} aria-label="Jour suivant"><ChevronRight size={16} /></button>
        {day !== ymdLocal(new Date()) && (
          <button onClick={() => setDay(ymdLocal(new Date()))} style={{ ...navBtn, width: 'auto', padding: '0 10px', fontSize: 12, fontWeight: 600 }}>Auj.</button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Chargement…</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <Stat label="Tondus" value={faits.length} color={GREEN} />
            <Stat label="Évités" value={evites.length} color={ORANGE} />
            <Stat label="Notes" value={notes.length} color={TEAL} />
          </div>

          {bySecteur.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {bySecteur.map(([s, n]) => <Badge key={s} color="#374151">{s} · {n}</Badge>)}
            </div>
          )}

          <SectionTitle color="#374151">Par employé</SectionTitle>
          {byEmployee.length === 0 && (
            <div style={{ fontSize: 13, color: '#9CA3AF', padding: '6px 0 14px' }}>Aucun passage enregistré cette journée.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
            {byEmployee.map((e) => (
              <div key={e.name} style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{e.name}</span>
                  <Badge color={GREEN}>{e.faits.length} tondus</Badge>
                  {e.evites.length > 0 && <Badge color={ORANGE}>{e.evites.length} évités</Badge>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {[...e.faits, ...e.evites].map((p) => (
                    <div key={p.id} style={{ display: 'flex', gap: 8, fontSize: 12, color: '#374151' }}>
                      <span style={{ color: p.status === 'fait' ? GREEN : ORANGE, fontWeight: 800, width: 12 }}>
                        {p.status === 'fait' ? '✓' : '✗'}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.gazon_terrains?.name ?? 'Terrain'}
                        <span style={{ color: '#9CA3AF' }}> · {p.gazon_terrains?.secteur ?? ''}</span>
                      </span>
                      <span style={{ color: '#9CA3AF', flexShrink: 0 }}>{p.done_at ? hhmm(p.done_at) : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <SectionTitle color="#374151">Notes du jour</SectionTitle>
          {notesError && (
            <div style={{ background: '#FEF3C7', color: '#92400E', padding: 10, borderRadius: 10, fontSize: 12, margin: '6px 0' }}>
              ⚠️ Notes indisponibles — appliquer <code>migration_crm_gazon_v2.sql</code>.
            </div>
          )}
          {!notesError && notes.length === 0 && (
            <div style={{ fontSize: 13, color: '#9CA3AF', padding: '6px 0' }}>Aucune note aujourd&apos;hui.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {notes.map((n) => (
              <div key={n.id} style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 10, padding: '8px 10px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>
                  {n.gazon_terrains?.name ?? 'Terrain'}
                  <span style={{ color: '#9CA3AF', fontWeight: 500 }}> · {n.gazon_terrains?.secteur ?? ''}</span>
                </div>
                <div style={{ fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap', marginTop: 2 }}>{n.note}</div>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 3 }}>
                  {n.profiles?.full_name ?? 'Employé'} · {hhmm(n.created_at)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: 18 }}>
        <button onClick={onClose} style={{ ...primaryBtn, background: '#F3F4F6', color: '#374151', width: '100%' }}>Fermer</button>
      </div>
    </Modal>
  )
}

// ============================================================
// Modal terrain — fiche + photos + édition (création si terrain absent)
// ============================================================
function TerrainModal({ terrain, secteurs, admin, onClose, onSaved }: {
  terrain?: GazonTerrain
  secteurs: string[]
  admin: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!terrain
  const [name, setName] = useState(terrain?.name ?? '')
  const [sect, setSect] = useState(terrain?.secteur ?? secteurs[0] ?? '')
  const [newSect, setNewSect] = useState('')
  const [address, setAddress] = useState(terrain?.address ?? '')
  const [phone, setPhone] = useState(terrain?.phone ?? '')
  const [superficie, setSuperficie] = useState(terrain?.superficie_pi2 != null ? String(terrain.superficie_pi2) : '')
  const [freqType, setFreqType] = useState(freqOf(terrain?.frequency_type))
  const [frequency, setFrequency] = useState(terrain?.frequency ?? '')
  const [notes, setNotes] = useState(terrain?.notes ?? '')
  const [aEviter, setAEviter] = useState(terrain?.a_eviter ?? false)
  const [active, setActive] = useState(terrain?.active ?? true)
  const [photos, setPhotos] = useState<string[]>(terrain?.photos ?? [])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const addPhoto = async (file: File) => {
    if (!terrain) return
    setUploading(true); setError('')
    const { path, error: e } = await uploadPhoto(`gazon/${terrain.id}`, file)
    if (e || !path) { setUploading(false); setError(e ?? 'Upload impossible'); return }
    const next = [...photos, path]
    const { error: e2 } = await updateTerrain(terrain.id, { photos: next })
    setUploading(false)
    if (e2) { setError(e2); return }
    setPhotos(next)
  }

  const removePhoto = async (path: string) => {
    if (!terrain) return
    if (!confirm('Supprimer cette photo ?')) return
    const next = photos.filter((p) => p !== path)
    const { error: e } = await updateTerrain(terrain.id, { photos: next })
    if (e) { setError(e); return }
    setPhotos(next)
    deletePhoto(path)
  }

  const save = async () => {
    const secteurFinal = (newSect.trim() || sect).toUpperCase().trim()
    if (!name.trim()) { setError('Nom requis.'); return }
    if (!secteurFinal) { setError('Secteur requis.'); return }
    setSaving(true); setError('')
    const payload: GazonTerrainInput = {
      secteur: secteurFinal,
      name: name.trim(),
      address: address.trim() || null,
      phone: phone.trim() || null,
      superficie_pi2: superficie ? Number(superficie) : null,
      frequency_type: freqType,
      frequency: frequency.trim() || null,
      notes: notes.trim() || null,
      a_eviter: aEviter,
      active,
    }
    const { error: e } = isEdit ? await updateTerrain(terrain!.id, payload) : await createTerrain({ ...payload, position: 100000 })
    setSaving(false)
    if (e) { setError(e); return }
    onSaved()
  }

  const remove = async () => {
    if (!isEdit || !admin) return
    if (!confirm(`Supprimer le terrain « ${terrain!.name} » et tout son historique ?`)) return
    setSaving(true)
    const { error: e } = await deleteTerrain(terrain!.id)
    setSaving(false)
    if (e) { setError(e); return }
    onSaved()
  }

  return (
    <Modal onClose={onClose} title={isEdit ? terrain!.name : 'Nouveau terrain'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="Nom du client *"><input value={name} onChange={(e) => setName(e.target.value)} style={inp} autoFocus={!isEdit && autoFocusDesktop()} /></Field>

        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Secteur (route)" flex>
            <select value={sect} onChange={(e) => setSect(e.target.value)} style={inp}>
              {secteurs.map((s) => <option key={s} value={s}>{s}</option>)}
              {!secteurs.length && <option value="">—</option>}
            </select>
          </Field>
          <Field label="…ou nouveau secteur" flex>
            <input value={newSect} onChange={(e) => setNewSect(e.target.value)} style={inp} placeholder="BROSSARD" />
          </Field>
        </div>

        <Field label="Adresse">
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={address} onChange={(e) => setAddress(e.target.value)} style={inp} placeholder="123 rue Principale, Longueuil" />
            {address.trim() && (
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address.trim())}`} target="_blank" rel="noopener noreferrer" aria-label="Itinéraire" style={iconBtn(TEAL, '#69C9CA14', '1px solid #69C9CA')}>
                <Navigation size={16} />
              </a>
            )}
          </div>
        </Field>

        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Téléphone" flex><input value={phone} onChange={(e) => setPhone(e.target.value)} style={inp} inputMode="tel" placeholder="514-555-1234" /></Field>
          <Field label="Pied carré (pi²)" flex><input value={superficie} onChange={(e) => setSuperficie(e.target.value)} style={inp} type="number" inputMode="numeric" /></Field>
        </div>

        {/* Fréquence structurée : pilote la run (voir lib/gazon-frequency.ts) */}
        <Field label="Fréquence de tonte">
          <select value={freqType} onChange={(e) => setFreqType(freqOf(e.target.value))} style={inp}>
            {FREQUENCIES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </Field>
        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: -6 }}>
          {freqType === 'bi-hebdo' && 'Apparaît dans la run une semaine sur deux (les semaines où il n’a pas été fait la semaine précédente).'}
          {freqType === 'one-shot' && 'Sort de la run une fois qu’il a été coché FAIT.'}
          {freqType === 'hebdo' && 'Apparaît dans la run toutes les semaines.'}
        </div>

        <Field label="Période / précisions (texte libre)"><input value={frequency} onChange={(e) => setFrequency(e.target.value)} style={inp} placeholder="Jeudi · 13 juin–2 août" /></Field>

        <Field label="Notes (consignes d'entretien)"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inp, minHeight: 64, resize: 'vertical' }} placeholder="Couper à 3,5 po, attention au fil d'irrigation…" /></Field>

        {/* photos — seulement en édition (il faut l'id du terrain) */}
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

        {admin && (
          <div style={{ display: 'flex', gap: 14, padding: '4px 0' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#DC2626', fontWeight: 700, cursor: 'pointer' }}>
              <input type="checkbox" checked={aEviter} onChange={(e) => setAEviter(e.target.checked)} />
              À ne pas faire (avant les runs)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151', fontWeight: 600, cursor: 'pointer' }}>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Actif
            </label>
          </div>
        )}

        {error && <div style={{ color: '#991B1B', fontSize: 13 }}>{error}</div>}
      </div>

      <div className="mw-modal-actions">
        {isEdit && admin && (
          <button onClick={remove} disabled={saving} aria-label="Supprimer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 10, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer' }}>
            <Trash2 size={17} />
          </button>
        )}
        <button onClick={onClose} style={{ ...primaryBtn, background: '#F3F4F6', color: '#374151', flex: 1 }}>Annuler</button>
        <button onClick={save} disabled={saving} style={{ ...primaryBtn, flex: 1, opacity: saving ? 0.6 : 1 }}>{saving ? '…' : isEdit ? 'Enregistrer' : 'Créer'}</button>
      </div>
    </Modal>
  )
}

// ============================================================
// UI helpers
// ============================================================
const page: React.CSSProperties = { fontFamily: 'Inter, sans-serif', maxWidth: 900, margin: '0 auto', padding: '12px 16px 84px' }

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div onClick={onClose} className="mw-modal-overlay">
      <div onClick={(e) => e.stopPropagation()} className="mw-modal-card" style={{ width: `min(${wide ? 620 : 480}px, 100%)` }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 16px' }}>{title}</h2>
        {children}
      </div>
    </div>
  )
}

function Switch({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button onClick={onChange} title="Faire calculer l'ordre de passage par Google" style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 999, cursor: 'pointer',
      border: `1px solid ${on ? TEAL : '#D1D5DB'}`, background: on ? '#69C9CA1F' : '#FFF',
      color: on ? TEAL : '#374151', fontSize: 13, fontWeight: 700,
    }}>
      <span style={{ position: 'relative', width: 32, height: 18, borderRadius: 999, background: on ? TEAL : '#D1D5DB', transition: 'background .2s', flexShrink: 0 }}>
        <span style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#FFF', transition: 'left .2s' }} />
      </span>
      <Sparkles size={14} />{label}
    </button>
  )
}

function SectionTitle({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <h2 style={{
      display: 'flex', alignItems: 'baseline', gap: 8, margin: '4px 0 8px', fontSize: 13, fontWeight: 800,
      color, textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>{children}</h2>
  )
}

const Count = ({ n }: { n: number | string }) => <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600 }}>{n}</span>

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ flex: 1, background: color + '0F', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    </div>
  )
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return <span style={{ padding: '1px 8px', borderRadius: 999, fontSize: 10, fontWeight: 800, background: color + '14', color }}>{children}</span>
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
      fontSize: 13, fontWeight: 600, background: active ? '#111827' : '#F3F4F6', color: active ? '#FFF' : '#374151',
    }}>{children}</button>
  )
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

const thStyle: React.CSSProperties = {
  padding: '7px 6px', fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase',
  letterSpacing: '0.03em', whiteSpace: 'nowrap', borderBottom: '1px solid #E5E7EB',
}
const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 14, background: '#FFF', boxSizing: 'border-box' }
const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 14px', borderRadius: 10,
  border: 'none', background: '#69C9CA', color: '#06363B', fontSize: 14, fontWeight: 700, cursor: 'pointer',
}
const navBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8,
  border: '1px solid #D1D5DB', background: '#FFF', cursor: 'pointer', color: '#374151',
}
const addBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10,
  border: 'none', background: '#69C9CA', color: '#06363B', fontSize: 13, fontWeight: 700, cursor: 'pointer',
}
