'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isManager } from '@/lib/roles'
import { getFactures, deleteFacture, factureFileName, type Facture } from '@/lib/queries/factures'
import { getTeamProfiles, jobLabel, type Job, type AssignProfile } from '@/lib/queries/calendar'
import { photoUrl, photoDownloadUrl, downloadPhoto } from '@/lib/storage'
import { money2, mondayOf } from '@/lib/payes'
import FactureModal from '@/components/factures/FactureModal'
import { Camera, Download, Receipt, Search, X, Trash2, Loader2 } from 'lucide-react'

// ============================================================
// Factures — tous les reçus entrés dans les jobs (job_expenses), par date et
// heure d'entrée, pour les retrouver dans le temps et les glisser dans
// QuickBooks (bouton Télécharger = fichier direct dans Téléchargements).
// Admin : toutes les factures, filtres période / employé / recherche.
// Employé : « Mes factures » (payées par lui) + le bouton Entrée de facture.
// ============================================================

type Period = 'week' | '30d' | 'month' | 'prevMonth' | 'all' | 'custom'
const PERIODS: { id: Exclude<Period, 'custom'>; label: string }[] = [
  { id: 'week', label: 'Cette semaine' },
  { id: '30d', label: '30 jours' },
  { id: 'month', label: 'Ce mois' },
  { id: 'prevMonth', label: 'Mois passé' },
  { id: 'all', label: 'Tout' },
]

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Bornes [from, to[ (ISO) de la période, en jours LOCAUX.
function rangeOf(p: Period, from: string, to: string): { from: string | null; to: string | null } {
  const now = new Date()
  const day = (y: number, m: number, d: number) => new Date(y, m, d).toISOString()
  const Y = now.getFullYear()
  const M = now.getMonth()
  switch (p) {
    case 'week': return { from: new Date(mondayOf() + 'T00:00:00').toISOString(), to: null }
    case '30d': return { from: day(Y, M, now.getDate() - 30), to: null }
    case 'month': return { from: day(Y, M, 1), to: null }
    case 'prevMonth': return { from: day(Y, M - 1, 1), to: day(Y, M, 1) }
    case 'all': return { from: null, to: null }
    case 'custom': {
      const end = to ? new Date(to + 'T00:00:00') : null
      if (end) end.setDate(end.getDate() + 1) // « au 30 » inclus
      return { from: from ? new Date(from + 'T00:00:00').toISOString() : null, to: end ? end.toISOString() : null }
    }
  }
}

// « Jeudi 1 octobre 2026 » (majuscule au jour seulement, pas au mois)
const fmtDayLong = (key: string) => {
  const s = new Date(key + 'T00:00:00').toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}
const fmtHour = (iso: string) => new Date(iso).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })
const fmtJobDay = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' }) : ''
const norm = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const jobTitleOf = (f: Facture) => (f.jobs ? jobLabel(f.jobs as Job) : null)

export default function FacturesPage() {
  const [role, setRole] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      setUserId(user.id)
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setRole(data?.role ?? 'rep')
      setLoading(false)
    })
  }, [])

  if (loading) return <div style={page}><div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Chargement…</div></div>

  return (
    <div style={page}>
      {isManager(role) ? <AdminFactures userId={userId} /> : <MesFactures userId={userId} />}
    </div>
  )
}

// ============================================================
// VUE ADMIN
// ============================================================
function AdminFactures({ userId }: { userId: string | null }) {
  const [period, setPeriod] = useState<Period>('30d')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [employee, setEmployee] = useState('') // profile_id (payé par)
  const [search, setSearch] = useState('')
  const [team, setTeam] = useState<AssignProfile[]>([])
  const [adding, setAdding] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [bulk, setBulk] = useState<string | null>(null) // « 3/12 » pendant « Tout télécharger »

  const range = useMemo(() => rangeOf(period, from, to), [period, from, to])
  // résultat étiqueté par sa requête : « chargement » = la requête affichée
  // n'est pas encore revenue (tick = recharger après une entrée)
  const [tick, setTick] = useState(0)
  const key = `${range.from}|${range.to}|${tick}`
  const [data, setData] = useState<{ key: string; factures: Facture[]; error: string | null } | null>(null)
  useEffect(() => {
    let cancelled = false
    getFactures({ from: range.from, to: range.to }).then((r) => {
      if (!cancelled) setData({ key, factures: r.factures, error: r.error })
    })
    return () => { cancelled = true }
  }, [key, range])
  useEffect(() => { getTeamProfiles().then(setTeam) }, [])
  const loading = data?.key !== key
  const factures = useMemo(() => data?.factures ?? [], [data])
  const error = data?.error ?? null
  const setFactures = (fn: (prev: Facture[]) => Facture[]) =>
    setData((d) => (d ? { ...d, factures: fn(d.factures) } : d))

  const shown = useMemo(() => {
    const q = norm(search.trim())
    return factures.filter((f) => {
      if (employee && f.profile_id !== employee) return false
      if (!q) return true
      return [f.label, f.profiles?.full_name, jobTitleOf(f), String(f.amount)].some((x) => norm(x).includes(q))
    })
  }, [factures, employee, search])

  const total = shown.reduce((sum, f) => sum + f.amount, 0)
  const withPhoto = shown.filter((f) => f.photo_path)

  // à rembourser par employé (payé par) — un tap filtre sur lui
  const byPayer = useMemo(() => {
    const m = new Map<string, { id: string; name: string; total: number; count: number }>()
    for (const f of factures) {
      if (!f.profile_id) continue
      const e = m.get(f.profile_id) ?? { id: f.profile_id, name: f.profiles?.full_name ?? '—', total: 0, count: 0 }
      e.total += f.amount
      e.count++
      m.set(f.profile_id, e)
    }
    return [...m.values()].sort((a, b) => b.total - a.total)
  }, [factures])

  const remove = async (f: Facture) => {
    if (!confirm(`Supprimer la facture « ${f.label} » (${money2(f.amount)}) ?`)) return
    const { error: e } = await deleteFacture(f)
    if (e) { setFlash(`Suppression impossible : ${e}`); return }
    setFactures((prev) => prev.filter((x) => x.id !== f.id))
  }

  // un fichier après l'autre (le navigateur peut demander d'autoriser
  // les téléchargements multiples la 1re fois)
  const downloadAll = async () => {
    let failed = 0
    for (let i = 0; i < withPhoto.length; i++) {
      setBulk(`${i + 1}/${withPhoto.length}`)
      const f = withPhoto[i]
      try {
        await downloadPhoto(f.photo_path!, factureFileName(f, jobTitleOf(f)))
      } catch {
        failed++
      }
      await new Promise((r) => setTimeout(r, 350))
    }
    setBulk(null)
    setFlash(failed
      ? `${withPhoto.length - failed} facture(s) téléchargée(s), ${failed} en échec.`
      : `${withPhoto.length} facture${withPhoto.length > 1 ? 's' : ''} téléchargée${withPhoto.length > 1 ? 's' : ''}.`)
  }

  const employeeOptions = useMemo(() => {
    const ids = new Set(team.map((p) => p.id))
    const extra = byPayer.filter((p) => !ids.has(p.id)).map((p) => ({ id: p.id, full_name: p.name }))
    return [...team.map((p) => ({ id: p.id, full_name: p.full_name })), ...extra]
  }, [team, byPayer])

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>Factures</h1>
        <button onClick={() => { setFlash(null); setAdding(true) }} style={{ ...addBtn, marginLeft: 'auto' }}>
          <Camera size={15} />Entrée de facture
        </button>
      </div>
      <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 14px' }}>
        Les reçus entrés dans les jobs, avec la date et l&apos;heure. «&nbsp;Télécharger&nbsp;» met le fichier direct dans
        tes Téléchargements, prêt à glisser dans QuickBooks.
      </p>

      {flash && <Flash text={flash} onClose={() => setFlash(null)} />}

      {/* période */}
      <div style={chipRow}>
        {PERIODS.map((p) => (
          <Chip key={p.id} active={period === p.id} onClick={() => setPeriod(p.id)}>{p.label}</Chip>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <label style={dateLabel}>Du
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPeriod('custom') }} style={inp} />
        </label>
        <label style={dateLabel}>au
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPeriod('custom') }} style={inp} />
        </label>
        {period === 'custom' && (
          <button onClick={() => { setFrom(''); setTo(''); setPeriod('30d') }} style={linkBtn}>Effacer les dates</button>
        )}
      </div>

      {/* employé + recherche */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <select value={employee} onChange={(e) => setEmployee(e.target.value)} style={{ ...inp, flex: '1 1 160px' }} aria-label="Payé par">
          <option value="">Tous les employés</option>
          {employeeOptions.map((p) => <option key={p.id} value={p.id}>{p.full_name ?? '—'}</option>)}
        </select>
        <div style={{ position: 'relative', flex: '2 1 200px' }}>
          <Search size={15} color="#9CA3AF" style={{ position: 'absolute', left: 10, top: 10 }} />
          <input
            type="text" role="searchbox" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Gaz, client, job, montant…" style={{ ...inp, paddingLeft: 32 }} aria-label="Rechercher"
          />
        </div>
      </div>

      {byPayer.length > 0 && (
        <div style={chipRow}>
          {byPayer.map((p) => (
            <Chip key={p.id} active={employee === p.id} onClick={() => setEmployee(employee === p.id ? '' : p.id)}>
              {p.name} · {money2(p.total)}
            </Chip>
          ))}
        </div>
      )}

      {/* résumé + tout télécharger */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '4px 0 12px' }}>
        <span style={{ fontSize: 13, color: '#374151' }}>
          <strong>{shown.length}</strong> facture{shown.length > 1 ? 's' : ''} · <strong style={{ color: '#0D6E6F' }}>{money2(total)}</strong>
        </span>
        {withPhoto.length > 1 && (
          <button onClick={downloadAll} disabled={bulk != null} style={{ ...ghostBtn, marginLeft: 'auto', opacity: bulk ? 0.7 : 1 }}>
            {bulk ? <Loader2 size={14} style={{ animation: 'mw-spin 1s linear infinite' }} /> : <Download size={14} />}
            {bulk ? `Téléchargement ${bulk}…` : `Tout télécharger (${withPhoto.length})`}
          </button>
        )}
      </div>

      {error && (
        <div style={{ background: '#FEF3C7', color: '#92400E', padding: 12, borderRadius: 10, fontSize: 13, marginBottom: 12 }}>
          Factures indisponibles — {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: '#9CA3AF' }}>Chargement…</div>
      ) : (
        <FactureList factures={shown} userId={userId} admin onDelete={remove}
          empty={factures.length ? 'Aucune facture ne correspond aux filtres.' : 'Aucune facture sur cette période.'} />
      )}

      {adding && (
        <FactureModal
          userId={userId}
          isAdmin
          onClose={() => setAdding(false)}
          onSaved={(msg) => { setAdding(false); setFlash(msg); setTick((t) => t + 1) }}
        />
      )}
    </>
  )
}

// ============================================================
// VUE EMPLOYÉ — « Mes factures »
// ============================================================
function MesFactures({ userId }: { userId: string | null }) {
  const [adding, setAdding] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [data, setData] = useState<{ tick: number; factures: Facture[] } | null>(null)
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    getFactures({ profileId: userId, limit: 200 }).then((r) => {
      if (!cancelled) setData({ tick, factures: r.factures })
    })
    return () => { cancelled = true }
  }, [userId, tick])
  const loading = !!userId && data?.tick !== tick
  const factures = data?.factures ?? []
  const setFactures = (fn: (prev: Facture[]) => Facture[]) =>
    setData((d) => (d ? { ...d, factures: fn(d.factures) } : d))

  const remove = async (f: Facture) => {
    if (!confirm(`Supprimer la facture « ${f.label} » (${money2(f.amount)}) ?`)) return
    const { error } = await deleteFacture(f)
    if (error) { setFlash(`Suppression impossible : ${error}`); return }
    setFactures((prev) => prev.filter((x) => x.id !== f.id))
  }

  return (
    <>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: '0 0 12px' }}>Mes factures</h1>

      <button onClick={() => { setFlash(null); setAdding(true) }} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%',
        padding: '16px 18px', borderRadius: 14, border: 'none', cursor: 'pointer',
        background: '#69C9CA', color: '#06363B', fontSize: 17, fontWeight: 800,
      }}>
        <Camera size={22} />Entrée de facture
      </button>
      <p style={{ fontSize: 12.5, color: '#6B7280', lineHeight: 1.5, margin: '8px 2px 16px' }}>
        Prends le reçu en photo dès que tu paies une dépense (gaz, matériel, dépotoir…). Garde quand même la
        facture papier et rapporte-la au bureau.
      </p>

      {flash && <Flash text={flash} onClose={() => setFlash(null)} />}

      <h2 style={{ fontSize: 13, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
        Payées par moi
      </h2>
      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: '#9CA3AF' }}>Chargement…</div>
      ) : (
        <FactureList factures={factures} userId={userId} admin={false} onDelete={remove} empty="Aucune facture pour l'instant." />
      )}

      {adding && (
        <FactureModal
          userId={userId}
          onClose={() => setAdding(false)}
          onSaved={(msg) => { setAdding(false); setFlash(msg); setTick((t) => t + 1) }}
        />
      )}
    </>
  )
}

// ============================================================
// Liste par jour (date + heure d'entrée)
// ============================================================
function FactureList({ factures, userId, admin, onDelete, empty }: {
  factures: Facture[]
  userId: string | null
  admin: boolean
  onDelete: (f: Facture) => void
  empty: string
}) {
  const days = useMemo(() => {
    const m = new Map<string, Facture[]>()
    for (const f of factures) {
      const k = ymd(new Date(f.created_at))
      m.set(k, [...(m.get(k) ?? []), f])
    }
    return [...m.entries()]
  }, [factures])

  if (factures.length === 0) {
    return (
      <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 12, padding: 24, textAlign: 'center', color: '#6B7280', fontSize: 13 }}>
        <Receipt size={26} color="#9CA3AF" style={{ display: 'block', margin: '0 auto 6px' }} />
        {empty}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {days.map(([key, list]) => (
        <div key={key}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 2px 6px' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#374151' }}>{fmtDayLong(key)}</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#6B7280' }}>
              {money2(list.reduce((sum, f) => sum + f.amount, 0))}
            </span>
          </div>
          <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
            {list.map((f, i) => (
              <FactureRow key={f.id} f={f} first={i === 0} canDelete={admin || f.profile_id === userId} onDelete={() => onDelete(f)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function FactureRow({ f, first, canDelete, onDelete }: { f: Facture; first: boolean; canDelete: boolean; onDelete: () => void }) {
  const job = jobTitleOf(f)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: first ? 'none' : '1px solid #F3F4F6' }}>
      {f.photo_path ? (
        <a href={photoUrl(f.photo_path)} target="_blank" rel="noopener noreferrer" aria-label="Voir la facture" style={{ flexShrink: 0, display: 'inline-flex' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl(f.photo_path)} alt="" loading="lazy" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, border: '1px solid #E5E7EB' }} />
        </a>
      ) : (
        <span title="Pas de photo" style={{ flexShrink: 0, width: 52, height: 52, borderRadius: 8, background: '#F3F4F6', color: '#9CA3AF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Receipt size={18} />
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.label}</span>
          <strong style={{ marginLeft: 'auto', fontSize: 14, color: '#0D6E6F', whiteSpace: 'nowrap' }}>{money2(f.amount)}</strong>
        </div>
        <div style={{ fontSize: 11.5, color: '#6B7280', marginTop: 1 }}>
          {fmtHour(f.created_at)}{f.profiles?.full_name ? ` · payé par ${f.profiles.full_name}` : ''}
        </div>
        <div style={{ fontSize: 11.5, color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {job ? `${job}${f.jobs?.start_at ? ` · ${fmtJobDay(f.jobs.start_at)}` : ''}` : 'Sans job — dépense générale'}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        {f.photo_path && (
          <a href={photoDownloadUrl(f.photo_path, factureFileName(f, job))} download aria-label="Télécharger la facture" title="Télécharger" style={iconBtn('#0E6B6E', '#69C9CA14', '1px solid #69C9CA')}>
            <Download size={16} />
          </a>
        )}
        {canDelete && (
          <button onClick={onDelete} aria-label="Supprimer la facture" title="Supprimer" style={{ ...iconBtn('#DC2626', '#FEF2F2', '1px solid #FCA5A5'), cursor: 'pointer' }}>
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  )
}

// ============================================================
// UI helpers
// ============================================================
function Flash({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0', borderRadius: 10, padding: '9px 12px', fontSize: 12.5, marginBottom: 12, lineHeight: 1.45 }}>
      <span style={{ flex: 1 }}>{text}</span>
      <button onClick={onClose} aria-label="Fermer" style={{ border: 'none', background: 'none', color: '#065F46', cursor: 'pointer', padding: 0 }}><X size={14} /></button>
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
      border: 'none', background: active ? '#111827' : '#F3F4F6', color: active ? '#FFF' : '#374151',
    }}>{children}</button>
  )
}

const page: React.CSSProperties = { fontFamily: 'Inter, sans-serif', maxWidth: 760, margin: '0 auto', padding: '12px 16px var(--mw-page-pb)' }
const chipRow: React.CSSProperties = { display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 8 }
const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 14, background: '#FFF', boxSizing: 'border-box', minWidth: 0 }
// deux champs date côte à côte, même sur iPhone
const dateLabel: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#6B7280', flex: '1 1 150px', minWidth: 0, maxWidth: 230 }
const addBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10,
  border: 'none', background: '#69C9CA', color: '#06363B', fontSize: 13, fontWeight: 700, cursor: 'pointer',
}
const ghostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 10,
  border: '1px solid #69C9CA', background: '#69C9CA14', color: '#0E6B6E', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
}
const linkBtn: React.CSSProperties = { border: 'none', background: 'none', color: '#6B7280', fontSize: 12, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', padding: 0 }
const iconBtn = (color: string, bg: string, border: string): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34,
  borderRadius: 8, color, background: bg, border, boxSizing: 'border-box',
})
