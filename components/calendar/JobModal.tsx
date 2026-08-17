'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createJob, updateJob, deleteJob, clientName, type Job, type JobInput, type AssignProfile } from '@/lib/queries/calendar'
import { searchClients, fullAddress, type Client } from '@/lib/queries/clients'
import { GAZON_ROUTES, findRoute, routeLabel } from '@/lib/gazon-routes'
import { autoFocusDesktop } from '@/lib/ui'
import type { Lane, ProfileMini } from './WeekCalendar'
import JobExtras from './JobExtras'
import { Trash2, Navigation, Phone, Play } from 'lucide-react'

interface Props {
  kind: 'fenetre' | 'paysagement'
  canEdit?: boolean
  userId?: string | null
  lanes: Lane[]
  assignProfiles: AssignProfile[]
  // tous les profils (id → nom/couleur) : sert à nommer les coéquipiers en lecture seule
  profileMap?: Record<string, ProfileMini>
  // création
  initialDate?: string // YYYY-MM-DD
  initialStart?: string // HH:MM (créneau cliqué dans la grille)
  initialTeam?: string
  // édition
  job?: Job | null
  onClose: () => void
  onSaved: () => void
}

function dateInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function timeInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const TYPE_OPTIONS = [{ id: 'gazon', l: '🌿 Gazon (route)' }, { id: 'projet', l: '🔨 Projet' }]
const TYPE_LABELS: Record<string, string> = Object.fromEntries(TYPE_OPTIONS.map((t) => [t.id, t.l]))

/** « 14:30 » + 2 h → « 16:30 » (borné à 23:59) */
function plusHours(time: string, hours: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = Math.min(h * 60 + m + hours * 60, 23 * 60 + 59)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
function buildISO(date: string, time: string): string | null {
  if (!date || !time) return null
  return new Date(`${date}T${time}`).toISOString()
}

export default function JobModal({ kind, canEdit = true, userId = null, lanes, assignProfiles, profileMap = {}, initialDate, initialStart, initialTeam, job, onClose, onSaved }: Props) {
  const isEdit = !!job
  const ro = !canEdit // lecture seule (employés non-admin)

  const [type, setType] = useState(job?.type ?? (kind === 'fenetre' ? 'fenetre' : 'gazon'))
  const [title, setTitle] = useState(job ? (clientName(job) || job.title || '') : '')
  const [service, setService] = useState(job?.service ?? '')
  // route de gazon : on stocke l'id de la route (tolère les anciennes valeurs texte libre)
  const [routeName, setRouteName] = useState(findRoute(job?.route_name)?.id ?? '')
  const [address, setAddress] = useState(job?.address ?? '')
  const [clientPhone, setClientPhone] = useState(job?.client_phone ?? '')
  const [clientEmail, setClientEmail] = useState(job?.client_email ?? '')
  const [date, setDate] = useState(job ? dateInput(job.start_at) : (initialDate ?? ''))
  const [start, setStart] = useState(job ? timeInput(job.start_at) : (initialStart || '08:00'))
  const [end, setEnd] = useState(job ? timeInput(job.end_at) : plusHours(initialStart || '08:00', 2))
  const [team, setTeam] = useState(job?.team ?? initialTeam ?? lanes[0]?.id ?? 'equipe1')
  const [assigned, setAssigned] = useState<string[]>(job?.assigned_ids ?? [])
  const [price, setPrice] = useState(job?.price != null ? String(job.price) : '')
  const [status, setStatus] = useState(job?.status ?? 'scheduled')
  const [notes, setNotes] = useState(job?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isGazon = kind === 'paysagement' && type === 'gazon'

  // --- autocomplétion client (fenêtres + projets) : taper un nom existant
  // remplit adresse / téléphone / courriel et rattache le job au client.
  const [clientId, setClientId] = useState<string | null>(job?.client_id ?? null)
  const [suggestions, setSuggestions] = useState<Client[]>([])
  const [showSug, setShowSug] = useState(false)
  const skipSearch = useRef(false) // évite de rouvrir la liste juste après un choix

  useEffect(() => {
    if (isGazon) return
    if (skipSearch.current) { skipSearch.current = false; return }
    const term = title.trim()
    if (term.length < 2) { setSuggestions([]); return }
    let cancelled = false
    const t = setTimeout(async () => {
      const list = await searchClients(term)
      if (!cancelled) { setSuggestions(list); setShowSug(true) }
    }, 200)
    return () => { cancelled = true; clearTimeout(t) }
  }, [title, isGazon])

  const pickClient = (c: Client) => {
    skipSearch.current = true
    setClientId(c.id)
    setTitle(c.name)
    setAddress(fullAddress(c))
    setClientPhone(c.phone ?? '')
    setClientEmail(c.email ?? '')
    setShowSug(false)
    setSuggestions([])
  }

  const onTitleChange = (v: string) => {
    skipSearch.current = false
    setTitle(v)
    setClientId(null) // saisie manuelle = nouveau nom, plus de client rattaché
  }

  const toggleAssign = (id: string) =>
    setAssigned((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const save = async () => {
    // gazon = une route à suivre : ni client, ni adresse, ni prix — juste la route
    if (isGazon && !routeName) { setError('Route requise.'); return }
    // un slot dispo n'a pas encore de client — titre optionnel
    if (!isGazon && !title.trim() && status !== 'dispo') { setError(kind === 'fenetre' ? 'Nom du client / job requis.' : 'Nom du job requis.'); return }
    if (!date) { setError('Date requise.'); return }
    setSaving(true); setError('')
    const payload: JobInput = {
      title: isGazon ? routeLabel(routeName) : (title.trim() || (status === 'dispo' ? 'Dispo' : null)),
      service: isGazon ? null : (service || null),
      type,
      team,
      assigned_ids: assigned,
      route_name: isGazon ? routeName : null,
      address: isGazon ? null : (address.trim() || null),
      start_at: buildISO(date, start),
      end_at: buildISO(date, end),
      status,
      price: isGazon ? null : (price ? Number(price) : null),
      notes: notes || null,
      client_id: isGazon ? null : clientId,
    }
    // colonnes récentes : omises si vides pour tolérer une migration pas encore appliquée
    if (!isGazon && (clientPhone.trim() || clientEmail.trim() || job?.client_phone != null || job?.client_email != null)) {
      payload.client_phone = clientPhone.trim() || null
      payload.client_email = clientEmail.trim() || null
    }
    const { error: e } = isEdit ? await updateJob(job!.id, payload) : await createJob(payload)
    setSaving(false)
    if (e) { setError(e); return }
    onSaved()
  }

  const remove = async () => {
    if (!isEdit) return
    if (!confirm('Supprimer ce job ?')) return
    setSaving(true)
    const { error: e } = await deleteJob(job!.id)
    setSaving(false)
    if (e) { setError(e); return }
    onSaved()
  }

  return (
    <div onClick={onClose} className="mw-modal-overlay">
      <div onClick={(e) => e.stopPropagation()} className="mw-modal-card" style={{ width: 'min(460px, 100%)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 16px' }}>{ro ? 'Détails du job' : isEdit ? 'Modifier le job' : 'Nouveau job'}</h2>

        {/* gazon : ouvre la run filtrée sur CETTE route (l'employé ne voit que la sienne) */}
        {isEdit && isGazon && routeName && (
          <Link href={`/gazon?route=${encodeURIComponent(routeName)}`} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14,
            padding: '12px 14px', borderRadius: 10, background: '#697035', color: '#FFF',
            fontSize: 15, fontWeight: 800, textDecoration: 'none',
          }}>
            <Play size={17} />Démarrer la job
          </Link>
        )}

        <fieldset disabled={ro} style={{ display: 'flex', flexDirection: 'column', gap: 10, border: 'none', padding: 0, margin: 0, minInlineSize: 'auto' }}>
          {kind === 'paysagement' && (
            <Field label="Type">
              {/* en lecture seule : seulement le type réel du job, pas le choix des deux */}
              {ro ? (
                <div style={{
                  display: 'inline-block', padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  border: '2px solid #697035', background: '#6970350F', color: '#374151',
                }}>{TYPE_LABELS[type] ?? type}</div>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  {TYPE_OPTIONS.map((t) => (
                    <button key={t.id} onClick={() => setType(t.id)} style={{
                      flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      border: type === t.id ? '2px solid #697035' : '1px solid #D1D5DB',
                      background: type === t.id ? '#6970350F' : '#FFF', color: '#374151',
                    }}>{t.l}</button>
                  ))}
                </div>
              )}
            </Field>
          )}

          {isGazon ? (
            /* gazon = une route de plusieurs clients : pas de nom, d'adresse ni de prix */
            <Field label="Route *">
              <select value={routeName} onChange={(e) => setRouteName(e.target.value)} style={inp} autoFocus={autoFocusDesktop()}>
                <option value="">— Choisir une route —</option>
                {GAZON_ROUTES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </Field>
          ) : (
            <>
              <Field label={kind === 'fenetre' ? 'Client / job *' : 'Nom du job *'}>
                <div style={{ position: 'relative' }}>
                  <input
                    value={title}
                    onChange={(e) => onTitleChange(e.target.value)}
                    onFocus={() => suggestions.length && setShowSug(true)}
                    onBlur={() => setTimeout(() => setShowSug(false), 150)}
                    style={inp}
                    autoFocus={autoFocusDesktop()}
                    autoComplete="off"
                    placeholder={kind === 'fenetre' ? 'Famille Tremblay' : 'Aménagement pavé uni'}
                  />
                  {clientId && (
                    <span style={{ position: 'absolute', right: 8, top: 9, fontSize: 10, fontWeight: 800, color: '#0E6B6E', background: '#69C9CA1F', padding: '2px 7px', borderRadius: 999 }}>CLIENT</span>
                  )}
                  {showSug && suggestions.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, marginTop: 4,
                      background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden',
                      boxShadow: '0 8px 20px rgba(0,0,0,0.10)', maxHeight: 200, overflowY: 'auto',
                    }}>
                      {suggestions.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()} /* garde le focus le temps du clic */
                          onClick={() => pickClient(c)}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', borderTop: '1px solid #F3F4F6', background: '#FFF', cursor: 'pointer' }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{c.name}</div>
                          {(fullAddress(c) || c.phone) && (
                            <div style={{ fontSize: 11, color: '#6B7280' }}>{[fullAddress(c), c.phone].filter(Boolean).join(' · ')}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Field>

              <Field label="Service"><input value={service} onChange={(e) => setService(e.target.value)} style={inp} placeholder={kind === 'fenetre' ? 'Lavage ext.' : 'Pavé + plate-bandes'} /></Field>

              <Field label="Adresse">
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={address} onChange={(e) => setAddress(e.target.value)} style={inp} placeholder="123 rue Principale, Magog" />
                  {address.trim() && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address.trim())}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Ouvrir l'itinéraire"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 40px', borderRadius: 8, border: '1px solid #69C9CA', background: '#69C9CA14', color: '#0E6B6E' }}
                    >
                      <Navigation size={16} />
                    </a>
                  )}
                </div>
              </Field>

              <div style={{ display: 'flex', gap: 10 }}>
                <Field label="Téléphone client" flex>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} style={inp} inputMode="tel" placeholder="514-555-1234" />
                    {clientPhone.trim() && (
                      <a href={`tel:${clientPhone.trim()}`} aria-label="Appeler" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 40px', borderRadius: 8, border: '1px solid #69C9CA', background: '#69C9CA14', color: '#0E6B6E' }}>
                        <Phone size={16} />
                      </a>
                    )}
                  </div>
                </Field>
                <Field label="Courriel client" flex>
                  <input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} style={inp} type="email" autoCapitalize="none" placeholder="client@exemple.com" />
                </Field>
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="Date" flex><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp} /></Field>
            {/* l'employé ne voit pas la répartition équipe 1 / équipe 2 */}
            {!ro && (
              <Field label="Équipe" flex>
                <select value={team} onChange={(e) => setTeam(e.target.value)} style={inp}>
                  {lanes.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              </Field>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="Début" flex><input type="time" value={start} onChange={(e) => setStart(e.target.value)} style={inp} /></Field>
            <Field label="Fin" flex><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} style={inp} /></Field>
            {!isGazon && <Field label="Prix ($)" flex><input value={price} onChange={(e) => setPrice(e.target.value)} type="number" inputMode="decimal" style={inp} /></Field>}
          </div>

          <Field label={kind === 'fenetre' ? 'Techniciens assignés' : 'Équipe assignée'}>
            {ro ? (
              /* lecture seule : seulement les coéquipiers assignés, en couleur */
              assigned.length === 0 ? (
                <div style={{ fontSize: 12, color: '#9CA3AF' }}>Personne d&apos;autre sur cette job.</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {assigned.map((id) => {
                    const p = profileMap[id] ?? assignProfiles.find((a) => a.id === id)
                    const color = p?.color ?? '#69C9CA'
                    return (
                      <span key={id} style={{
                        padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                        border: `2px solid ${color}`, background: color + '14', color: '#374151',
                      }}>{p?.full_name ?? '—'}{id === userId ? ' (moi)' : ''}</span>
                    )
                  })}
                </div>
              )
            ) : assignProfiles.length === 0 ? (
              <div style={{ fontSize: 12, color: '#9CA3AF' }}>Aucun employé disponible.</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {assignProfiles.map((p) => {
                  const on = assigned.includes(p.id)
                  return (
                    <button key={p.id} onClick={() => toggleAssign(p.id)} style={{
                      padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: on ? `2px solid ${p.color ?? '#69C9CA'}` : '1px solid #D1D5DB',
                      background: on ? (p.color ?? '#69C9CA') + '14' : '#FFF', color: '#374151',
                    }}>{p.full_name ?? '—'}</button>
                  )
                })}
              </div>
            )}
          </Field>

          <Field label="Statut">
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={{
              ...inp,
              ...(status === 'dispo' ? { borderColor: '#8B5CF6', background: '#F5F3FF', color: '#6D28D9', fontWeight: 600 } : null),
            }}>
              <option value="scheduled">Cédulé</option>
              <option value="dispo">🟣 Slot dispo (à vendre)</option>
              <option value="done">Complété</option>
              <option value="canceled">Annulé</option>
            </select>
          </Field>

          <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inp, minHeight: 54, resize: 'vertical' }} /></Field>

          {error && <div style={{ color: '#991B1B', fontSize: 13 }}>{error}</div>}
        </fieldset>

        {/* photos + dépenses : hors fieldset — les employés y ont accès même en lecture seule */}
        {isEdit && <JobExtras jobId={job!.id} userId={userId} isAdmin={canEdit} showPhotos={!isGazon} />}

        <div className="mw-modal-actions">
          {ro ? (
            <button onClick={onClose} style={{ ...primaryBtn, flex: 1 }}>Fermer</button>
          ) : (
            <>
              {isEdit && (
                <button onClick={remove} disabled={saving} aria-label="Supprimer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 10, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer' }}>
                  <Trash2 size={17} />
                </button>
              )}
              <button onClick={onClose} style={{ ...primaryBtn, background: '#F3F4F6', color: '#374151', flex: 1 }}>Annuler</button>
              <button onClick={save} disabled={saving} style={{ ...primaryBtn, flex: 1, opacity: saving ? 0.6 : 1 }}>{saving ? '…' : isEdit ? 'Enregistrer' : 'Créer'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children, flex }: { label: string; children: React.ReactNode; flex?: boolean }) {
  return (
    <label style={{ display: 'block', flex: flex ? 1 : undefined }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  )
}

const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 14, background: '#FFF', boxSizing: 'border-box' }
const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 14px', borderRadius: 10,
  border: 'none', background: '#69C9CA', color: '#06363B', fontSize: 14, fontWeight: 700, cursor: 'pointer',
}
