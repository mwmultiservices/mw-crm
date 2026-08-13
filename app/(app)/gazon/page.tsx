'use client'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { isManager } from '@/lib/roles'
import { findRoute, routeOfSecteur, groupKeyOfSecteur } from '@/lib/gazon-routes'
import { mondayOf, addWeeks, formatWeekLabel } from '@/lib/payes'
import {
  getTerrains, getPassagesWeek, getPassagesRange, setPassage, clearPassage,
  createTerrain, updateTerrain, deleteTerrain, terrainDirectionsUrl, gazonRouteUrl,
  type GazonTerrain, type GazonPassage, type GazonTerrainInput,
} from '@/lib/queries/gazon'
import { uploadPhoto, photoUrl, deletePhoto } from '@/lib/storage'
import {
  ChevronLeft, ChevronRight, Plus, Navigation, Phone, Camera,
  Check, AlertTriangle, X, Trash2, Route, Table2, ListChecks, ArrowLeft,
} from 'lucide-react'

// Début de saison (1re semaine du fichier du client) — borne gauche du datasheet.
const SEASON_START = '2026-05-04'

const GREEN = '#697035'
const ORANGE = '#B45309'

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
  const [migrationError, setMigrationError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'run' | 'datasheet'>('run')
  const [groupFilter, setGroupFilter] = useState<string>('Tous') // id de route (ou secteur orphelin)
  const [modal, setModal] = useState<{ terrain?: GazonTerrain } | null>(null) // {} = nouveau

  const admin = isManager(role)

  const loadTerrains = useCallback(async () => {
    const { terrains: t, error } = await getTerrains()
    setTerrains(t)
    setMigrationError(error)
  }, [])

  const loadPassages = useCallback(async (w: string) => {
    const list = await getPassagesWeek(w)
    setPassages(new Map(list.map((p) => [p.terrain_id, p])))
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      setUserId(user.id)
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setRole(data?.role ?? 'rep')
      await Promise.all([loadTerrains(), loadPassages(mondayOf())])
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (!loading) loadPassages(weekOf) }, [weekOf, loading, loadPassages])

  // realtime : un coéquipier coche → tout le monde voit
  useEffect(() => {
    const ch = supabase
      .channel('gazon')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gazon_passages' }, () => loadPassages(weekOf))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gazon_terrains' }, () => loadTerrains())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [weekOf, loadPassages, loadTerrains])

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

  // sous-titres = secteurs bruts présents dans la sélection, dans l'ordre de passage
  const visibleSecteurs = useMemo(() => {
    const out: string[] = []
    for (const t of visible) if (!out.includes(t.secteur)) out.push(t.secteur)
    return out
  }, [visible])

  const aFaire = visible.filter((t) => !t.a_eviter)
  const faits = aFaire.filter((t) => passages.get(t.id)?.status === 'fait').length

  // itinéraire du secteur : les terrains restants (pas faits, pas à éviter), dans l'ordre
  const routeUrl = useMemo(() => {
    const rest = visible.filter((t) => !t.a_eviter && !passages.get(t.id))
    return gazonRouteUrl(rest)
  }, [visible, passages])

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

  if (loading) return <div style={page}><div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Chargement…</div></div>

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {admin && !lockedRoute && (
          <div style={{ display: 'flex', gap: 6 }}>
            <Tab active={view === 'run'} onClick={() => setView('run')}><ListChecks size={14} /> Run</Tab>
            <Tab active={view === 'datasheet'} onClick={() => setView('datasheet')}><Table2 size={14} /> Datasheet</Tab>
          </div>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {view === 'run' && routeUrl && (
            <a href={routeUrl} target="_blank" rel="noopener noreferrer" style={{ ...addBtn, textDecoration: 'none', background: '#697035', color: '#FFF' }}>
              <Route size={15} />Itinéraire restant
            </a>
          )}
          <button onClick={() => setModal({})} style={addBtn}><Plus size={15} />Terrain</button>
        </div>
      </div>

      {/* filtres route + progression (masqués si la run est verrouillée sur une route) */}
      {!lockedRoute && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 8 }}>
          {[{ key: 'Tous', label: 'Toutes' }, ...groups].map((g) => (
            <button key={g.key} onClick={() => setGroupFilter(g.key)} style={{
              padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              border: 'none', background: groupFilter === g.key ? '#111827' : '#F3F4F6', color: groupFilter === g.key ? '#FFF' : '#374151',
            }}>{g.label}</button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1, height: 8, borderRadius: 999, background: '#E5E7EB', overflow: 'hidden' }}>
          <div style={{ width: `${aFaire.length ? (faits / aFaire.length) * 100 : 0}%`, height: '100%', background: GREEN, borderRadius: 999, transition: 'width .3s' }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: GREEN, whiteSpace: 'nowrap' }}>{faits}/{aFaire.length} faits</span>
      </div>

      {view === 'datasheet' && admin && !lockedRoute ? (
        <Datasheet terrains={terrains.filter((t) => t.active)} weekOf={weekOf} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {visibleSecteurs.map((s) => {
            const list = visible.filter((t) => t.secteur === s)
            if (!list.length) return null
            const done = list.filter((t) => !t.a_eviter && passages.get(t.id)?.status === 'fait').length
            const total = list.filter((t) => !t.a_eviter).length
            return (
              <div key={s}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '4px 0 8px' }}>
                  <h2 style={{ fontSize: 13, fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{s}</h2>
                  <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600 }}>{done}/{total}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {list.map((t) => (
                    <TerrainCard key={t.id} t={t} passage={passages.get(t.id)} onToggle={toggle} onOpen={() => setModal({ terrain: t })} />
                  ))}
                </div>
              </div>
            )
          })}
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
    </div>
  )
}

// ============================================================
// Carte terrain — FAIT / À ÉVITER + GPS + tél + notes
// ============================================================
function TerrainCard({ t, passage, onToggle, onOpen }: {
  t: GazonTerrain
  passage: GazonPassage | undefined
  onToggle: (t: GazonTerrain, s: 'fait' | 'evite') => void
  onOpen: () => void
}) {
  const fait = passage?.status === 'fait'
  const evite = passage?.status === 'evite'
  const gps = terrainDirectionsUrl(t)
  return (
    <div style={{
      background: '#FFF', border: `1px solid ${fait ? GREEN + '66' : evite ? ORANGE + '66' : '#E5E7EB'}`,
      borderRadius: 12, padding: '10px 12px', opacity: t.a_eviter ? 0.75 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div role="button" tabIndex={0} onClick={onOpen} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{t.name}</span>
            {t.a_eviter && <Badge color="#DC2626">À NE PAS FAIRE</Badge>}
            {t.frequency && <Badge color="#6B7280">{t.frequency}</Badge>}
            {t.superficie_pi2 != null && <Badge color="#0E6B6E">{t.superficie_pi2.toLocaleString('fr-CA')} pi²</Badge>}
            {t.photos.length > 0 && <Badge color="#6B7280">📷 {t.photos.length}</Badge>}
          </div>
          {t.address && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{t.address}</div>}
          {t.notes && (
            <div style={{ fontSize: 12, color: '#92400E', background: '#FEF3C7', borderRadius: 8, padding: '4px 8px', marginTop: 6 }}>
              ⚠️ {t.notes}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {t.phone && (
            <a href={`tel:${t.phone}`} onClick={(e) => e.stopPropagation()} aria-label="Appeler" style={iconBtn('#0E6B6E', '#69C9CA1F')}>
              <Phone size={15} />
            </a>
          )}
          {gps && (
            <a href={gps} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} aria-label="Itinéraire" style={iconBtn('#0E6B6E', '#69C9CA1F')}>
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
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#FFF', borderRadius: 14, padding: 20, width: 'min(480px, 100%)', maxHeight: '90vh', overflowY: 'auto', fontFamily: 'Inter, sans-serif' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 16px' }}>{isEdit ? terrain!.name : 'Nouveau terrain'}</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Nom du client *"><input value={name} onChange={(e) => setName(e.target.value)} style={inp} autoFocus={!isEdit} /></Field>

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
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address.trim())}`} target="_blank" rel="noopener noreferrer" aria-label="Itinéraire" style={iconBtn('#0E6B6E', '#69C9CA14', '1px solid #69C9CA')}>
                  <Navigation size={16} />
                </a>
              )}
            </div>
          </Field>

          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="Téléphone" flex><input value={phone} onChange={(e) => setPhone(e.target.value)} style={inp} inputMode="tel" placeholder="514-555-1234" /></Field>
            <Field label="Pied carré (pi²)" flex><input value={superficie} onChange={(e) => setSuperficie(e.target.value)} style={inp} type="number" inputMode="numeric" /></Field>
          </div>

          <Field label="Fréquence / période"><input value={frequency} onChange={(e) => setFrequency(e.target.value)} style={inp} placeholder="BIW · Jeudi · 13 juin–2 août" /></Field>

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

        <div style={{ display: 'flex', gap: 8, marginTop: 18, alignItems: 'center' }}>
          {isEdit && admin && (
            <button onClick={remove} disabled={saving} aria-label="Supprimer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 10, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer' }}>
              <Trash2 size={17} />
            </button>
          )}
          <button onClick={onClose} style={{ ...primaryBtn, background: '#F3F4F6', color: '#374151', flex: 1 }}>Annuler</button>
          <button onClick={save} disabled={saving} style={{ ...primaryBtn, flex: 1, opacity: saving ? 0.6 : 1 }}>{saving ? '…' : isEdit ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// UI helpers
// ============================================================
const page: React.CSSProperties = { fontFamily: 'Inter, sans-serif', maxWidth: 900, margin: '0 auto', padding: '12px 16px 84px' }

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
