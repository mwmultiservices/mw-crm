'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createJob, updateJob, deleteJob, clientName, type Job, type JobInput, type AssignProfile } from '@/lib/queries/calendar'
import { searchClients, fullAddress, type Client } from '@/lib/queries/clients'
import { GAZON_ROUTES, findRoute, routeLabel } from '@/lib/gazon-routes'
import { autoFocusDesktop } from '@/lib/ui'
import { PAY_MODES, PAY_MODE_BY_ID, autoPayMode, type PayMode } from '@/lib/payes'
import { serviceCatalogFor, servicesFromValue, freeServiceText, joinServiceValue } from '@/lib/services'
import { getQuotesForClient, getQuote, STATUS_BY_ID, type Quote } from '@/lib/queries/soumissions'
import { getFermetureRunLabels } from '@/lib/queries/fermeture'
import { FERMETURE_COLOR } from '@/lib/fermeture'
import { JOB_STATUSES, jobStatusMeta, normalizeJobStatus } from '@/lib/job-status'
import type { Lane, ProfileMini } from './WeekCalendar'
import JobExtras from './JobExtras'
import JobUpsells from './JobUpsells'
import JobPayPanel from './JobPayPanel'
import NewClientModal from './NewClientModal'
import MultiPicker from '@/components/ui/MultiPicker'
import QuoteDetailModal from '@/components/soumissions/QuoteDetailModal'
import { Trash2, Navigation, Phone, Play, UserPlus, Eye } from 'lucide-react'

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
  initialEnd?: string   // HH:MM — défaut : début + 2 h
  initialType?: string  // ex. 'fermeture' (bouton « Planifier » de la Run fermeture)
  initialRoute?: string // route/journée pré-choisie (« Longueuil #2 »)
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
const TYPE_OPTIONS = [{ id: 'gazon', l: '🌿 Gazon' }, { id: 'fermeture', l: '🍂 Fermeture' }, { id: 'projet', l: '🔨 Projet' }]
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

export default function JobModal({ kind, canEdit = true, userId = null, lanes, assignProfiles, profileMap = {}, initialDate, initialStart, initialTeam, initialEnd, initialType, initialRoute, job, onClose, onSaved }: Props) {
  const isEdit = !!job
  const ro = !canEdit // lecture seule (employés non-admin)

  const [type, setType] = useState(job?.type ?? initialType ?? (kind === 'fenetre' ? 'fenetre' : 'gazon'))
  // catalogue du menu déroulant Service : vitres (fenêtres) ou projets (paysagement).
  // Réactif : basculer gazon → projet change la liste (et vide la sélection).
  const catalog = useMemo(() => serviceCatalogFor(type), [type])
  const [title, setTitle] = useState(job ? (clientName(job) || job.title || '') : '')
  // Fenêtres ET projets : plusieurs services cochables dans le menu déroulant
  // (lib/services.ts). Ce qui n'est pas au catalogue (ancienne saisie libre)
  // atterrit dans le champ « Autre service ».
  const [servicePicks, setServicePicks] = useState<string[]>(
    () => servicesFromValue(job?.service, catalog).map((s) => s.label),
  )
  const [serviceOther, setServiceOther] = useState(
    () => freeServiceText(job?.service, catalog),
  )
  const [serviceFree, setServiceFree] = useState(
    () => !!freeServiceText(job?.service, catalog),
  )
  // total des upsells enregistrés sur cette job (remonté par <JobUpsells>)
  const [upsellTotal, setUpsellTotal] = useState(0)
  // route de gazon : on stocke l'id de la route (tolère les anciennes valeurs texte libre).
  // Fermeture : le libellé de la journée tel quel (« Longueuil #2 »).
  const [routeName, setRouteName] = useState(
    job
      ? (job.type === 'fermeture' ? (job.route_name ?? '') : (findRoute(job.route_name)?.id ?? ''))
      : (initialRoute ?? ''),
  )
  const [address, setAddress] = useState(job?.address ?? '')
  const [clientPhone, setClientPhone] = useState(job?.client_phone ?? '')
  const [clientEmail, setClientEmail] = useState(job?.client_email ?? '')
  const [date, setDate] = useState(job ? dateInput(job.start_at) : (initialDate ?? ''))
  const [start, setStart] = useState(job ? timeInput(job.start_at) : (initialStart || '08:00'))
  const [end, setEnd] = useState(job ? timeInput(job.end_at) : (initialEnd || plusHours(initialStart || '08:00', 2)))
  const [team, setTeam] = useState(job?.team ?? initialTeam ?? lanes[0]?.id ?? 'equipe1')
  const [assigned, setAssigned] = useState<string[]>(job?.assigned_ids ?? [])
  const [price, setPrice] = useState(job?.price != null ? String(job.price) : '')
  // '' = auto (déduit du type/service/nb d'assignés au moment du calcul de paye)
  const [payMode, setPayMode] = useState<string>(job?.pay_mode ?? '')
  // temps de la job en heures — payé à CHAQUE employé assigné (modes horaires)
  const [payHours, setPayHours] = useState(job?.pay_hours != null ? String(job.pay_hours) : '')
  // 'scheduled' (ancienne valeur en base) → « Job confirmée » ; nouveau job = confirmée
  const [status, setStatus] = useState<string>(normalizeJobStatus(job?.status))
  // vendeur (« closer ») : sa commission de vente tombe dans sa paye
  const [soldBy, setSoldBy] = useState<string>(job?.sold_by ?? '')
  const [notes, setNotes] = useState(job?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isGazon = kind === 'paysagement' && type === 'gazon'
  const isFermeture = kind === 'paysagement' && type === 'fermeture'
  // gazon ET fermeture = une run de plusieurs clients : ni client, ni adresse,
  // ni prix, ni vendeur — juste la route (ou la journée) à suivre.
  const isRun = isGazon || isFermeture
  // Valeur réellement stockée dans jobs.service : les services cochés joints
  // par « + », plus l'éventuel service libre.
  const serviceValue = joinServiceValue(servicePicks, serviceFree ? serviceOther : '')
  // mode déduit si l'admin laisse « Auto » (dépend du nb d'assignés → réactif)
  const autoMode: PayMode = autoPayMode(type, serviceValue, assigned.length)
  const effectiveMode: PayMode = (payMode as PayMode) || autoMode

  // --- journées préparées dans Run fermeture (menu « Journée de fermeture ») ---
  const [fermetureRuns, setFermetureRuns] = useState<string[]>([])
  useEffect(() => {
    if (!isFermeture) return
    let cancelled = false
    getFermetureRunLabels().then((list) => { if (!cancelled) setFermetureRuns(list) })
    return () => { cancelled = true }
  }, [isFermeture])
  // la journée déjà choisie reste proposée, même vidée de ses clients depuis
  const runOptions = useMemo(
    () => (routeName && !fermetureRuns.includes(routeName) ? [routeName, ...fermetureRuns] : fermetureRuns),
    [routeName, fermetureRuns],
  )

  // --- autocomplétion client (fenêtres + projets) : taper un nom existant
  // remplit adresse / téléphone / courriel et rattache le job au client.
  const [clientId, setClientId] = useState<string | null>(job?.client_id ?? null)
  const [suggestions, setSuggestions] = useState<Client[]>([])
  const [showSug, setShowSug] = useState(false)
  const [newClient, setNewClient] = useState(false) // modal « Ajouter nouveau »
  const [flash, setFlash] = useState('')            // ex. « client créé, QuickBooks ignoré »
  const skipSearch = useRef(false) // évite de rouvrir la liste juste après un choix

  // --- soumission signée rattachée (projets de paysagement) ---
  // L'admin choisit une des soumissions du client ; le bouton « Prévisualiser »
  // n'apparaît QUE pour lui — la fiche affiche les prix.
  const [quoteId, setQuoteId] = useState<string | null>(job?.quote_id ?? null)
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [linkedQuote, setLinkedQuote] = useState<Quote | null>(null)
  const [previewQuote, setPreviewQuote] = useState<string | null>(null)
  const canLinkQuote = type === 'projet'

  useEffect(() => {
    if (!canLinkQuote || (!clientId && !title.trim())) { setQuotes([]); return }
    let cancelled = false
    getQuotesForClient(clientId, title.trim()).then((list) => {
      if (!cancelled) setQuotes(list)
    })
    return () => { cancelled = true }
  }, [canLinkQuote, clientId, title])

  // La soumission DÉJÀ rattachée peut ne pas ressortir de la recherche (nom du
  // client modifié depuis) : on la charge par id pour qu'elle reste affichée.
  useEffect(() => {
    if (!job?.quote_id) return
    let cancelled = false
    getQuote(job.quote_id).then((q) => { if (!cancelled) setLinkedQuote(q) })
    return () => { cancelled = true }
  }, [job?.quote_id])

  const quoteOptions = useMemo(() => (
    linkedQuote && !quotes.some((q) => q.id === linkedQuote.id) ? [linkedQuote, ...quotes] : quotes
  ), [linkedQuote, quotes])

  // Vendeurs possibles : toute l'équipe (n'importe qui peut closer une vente).
  const sellerOptions = useMemo(() => {
    const fromMap = Object.entries(profileMap).map(([id, p]) => ({ id, full_name: p.full_name }))
    const list = fromMap.length ? fromMap : assignProfiles.map((p) => ({ id: p.id, full_name: p.full_name }))
    return list.sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? ''))
  }, [profileMap, assignProfiles])

  useEffect(() => {
    if (isRun) return
    if (skipSearch.current) { skipSearch.current = false; return }
    const term = title.trim()
    if (term.length < 2) { setSuggestions([]); return }
    let cancelled = false
    const t = setTimeout(async () => {
      const list = await searchClients(term)
      if (!cancelled) { setSuggestions(list); setShowSug(true) }
    }, 200)
    return () => { cancelled = true; clearTimeout(t) }
  }, [title, isRun])

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

  // fiche créée depuis « Ajouter nouveau » : on la rattache tout de suite au job
  const onClientCreated = (c: Client, quickbooks: 'ok' | 'skipped', qbError?: string) => {
    setNewClient(false)
    pickClient(c)
    setFlash(quickbooks === 'ok'
      ? `Client « ${c.name} » créé dans le CRM et dans QuickBooks.`
      : `Client « ${c.name} » créé dans le CRM. QuickBooks non synchronisé${qbError ? ` (${qbError})` : ''}.`)
  }

  // Durée de l'horaire (début → fin), proposée comme temps de la job.
  const scheduledHours = useMemo(() => {
    if (!start || !end) return 0
    const [h1, m1] = start.split(':').map(Number)
    const [h2, m2] = end.split(':').map(Number)
    const mins = h2 * 60 + m2 - (h1 * 60 + m1)
    return mins > 0 ? Math.round((mins / 60) * 100) / 100 : 0
  }, [start, end])

  const toggleAssign = (id: string) =>
    setAssigned((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const save = async () => {
    // gazon / fermeture = une route à suivre : ni client, ni adresse, ni prix — juste la route
    if (isRun && !routeName) { setError(isFermeture ? 'Journée requise.' : 'Route requise.'); return }
    // un slot dispo n'a pas encore de client — titre optionnel
    if (!isRun && !title.trim() && status !== 'dispo') { setError(kind === 'fenetre' ? 'Nom du client / job requis.' : 'Nom du job requis.'); return }
    if (!date) { setError('Date requise.'); return }
    setSaving(true); setError('')
    const payload: JobInput = {
      title: isGazon ? routeLabel(routeName)
        : isFermeture ? `Fermeture ${routeName}`
        : (title.trim() || (status === 'dispo' ? 'Dispo' : null)),
      service: isRun ? null : (serviceValue || null),
      type,
      team,
      assigned_ids: assigned,
      route_name: isRun ? routeName : null,
      address: isRun ? null : (address.trim() || null),
      start_at: buildISO(date, start),
      end_at: buildISO(date, end),
      status,
      price: isRun ? null : (price ? Number(price) : null),
      notes: notes || null,
      client_id: isRun ? null : clientId,
    }
    // colonnes récentes : omises si vides pour tolérer une migration pas encore appliquée
    if (!isRun && (clientPhone.trim() || clientEmail.trim() || job?.client_phone != null || job?.client_email != null)) {
      payload.client_phone = clientPhone.trim() || null
      payload.client_email = clientEmail.trim() || null
    }
    if (payMode || job?.pay_mode != null) payload.pay_mode = payMode || null
    // jobs.pay_hours / jobs.quote_id : colonnes récentes (migration_crm_job_heures)
    // — omises tant qu'elles sont vides, pour tolérer la migration pas appliquée
    if (payHours.trim() || job?.pay_hours != null) payload.pay_hours = payHours.trim() ? Number(payHours) : null
    if (canLinkQuote && (quoteId || job?.quote_id != null)) payload.quote_id = quoteId || null
    // jobs.sold_by : colonne récente (migration_crm_job_vendeur) — omise si vide
    if (!isRun && (soldBy || job?.sold_by != null)) payload.sold_by = soldBy || null
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

        {flash && (
          <div style={{ background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0', borderRadius: 10, padding: '9px 12px', fontSize: 12, marginBottom: 12, lineHeight: 1.45 }}>
            {flash}
          </div>
        )}

        {/* gazon / fermeture : ouvre la run filtrée sur CETTE route ou journée
            (l'employé ne voit que la sienne) */}
        {isEdit && isRun && routeName && (
          <Link href={isGazon
            ? `/gazon?route=${encodeURIComponent(routeName)}`
            : `/fermeture?run=${encodeURIComponent(routeName)}`} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14,
            padding: '12px 14px', borderRadius: 10, background: isGazon ? '#697035' : FERMETURE_COLOR, color: '#FFF',
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
                    <button key={t.id} onClick={() => {
                      if (t.id === type) return
                      setType(t.id)
                      // les catalogues diffèrent : on repart d'une sélection vide
                      setServicePicks([]); setServiceOther(''); setServiceFree(false)
                      // une route de gazon n'est pas une journée de fermeture
                      setRouteName('')
                    }} style={{
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
              {/* PAS d'autoFocus sur un <select> : sur iPad/iPhone le sélecteur
                  s'ouvre tout seul à l'ouverture du modal (cf. lib/ui.ts). */}
              <select value={routeName} onChange={(e) => setRouteName(e.target.value)} style={inp}>
                <option value="">— Choisir une route —</option>
                {GAZON_ROUTES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </Field>
          ) : isFermeture ? (
            /* fermeture = une journée préparée dans Run fermeture (« Longueuil #2 ») */
            <Field label="Journée de fermeture *">
              <select value={routeName} onChange={(e) => setRouteName(e.target.value)} style={inp}>
                <option value="">— Choisir une journée —</option>
                {runOptions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              {runOptions.length === 0 && (
                <p style={{ margin: '5px 2px 0', fontSize: 11, color: '#9CA3AF', lineHeight: 1.45 }}>
                  Aucune journée préparée : divise d&apos;abord les villes en journées dans Run fermeture.
                </p>
              )}
            </Field>
          ) : (
            <>
              <Field label={kind === 'fenetre' ? 'Client / job *' : 'Nom du job *'}>
                <div style={{ position: 'relative' }}>
                  <input
                    value={title}
                    onChange={(e) => onTitleChange(e.target.value)}
                    onFocus={() => { if (title.trim().length >= 2) setShowSug(true) }}
                    onBlur={() => setTimeout(() => setShowSug(false), 150)}
                    style={inp}
                    autoFocus={autoFocusDesktop()}
                    autoComplete="off"
                    placeholder={kind === 'fenetre' ? 'Famille Tremblay' : 'Aménagement pavé uni'}
                  />
                  {clientId && (
                    <span style={{ position: 'absolute', right: 8, top: 9, fontSize: 10, fontWeight: 800, color: '#0E6B6E', background: '#69C9CA1F', padding: '2px 7px', borderRadius: 999 }}>CLIENT</span>
                  )}
                  {/* la liste s'ouvre même sans résultat : « Ajouter nouveau » y vit */}
                  {showSug && !clientId && (suggestions.length > 0 || title.trim().length >= 2) && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, marginTop: 4,
                      background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden',
                      boxShadow: '0 8px 20px rgba(0,0,0,0.10)', maxHeight: 240, overflowY: 'auto',
                    }}>
                      {/* « Ajouter nouveau » EN PREMIER : c'est le geste le plus
                          fréquent quand on tape un nom qui n'existe pas encore */}
                      {title.trim().length >= 2 && (
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { setShowSug(false); setNewClient(true) }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                            padding: '10px', border: 'none', borderBottom: '1px solid #E5E7EB',
                            background: '#69C9CA14', color: '#0E6B6E', cursor: 'pointer',
                          }}
                        >
                          <UserPlus size={15} />
                          <span style={{ fontSize: 13, fontWeight: 700 }}>
                            Ajouter nouveau
                            <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#6B7280' }}>
                              « {title.trim()} » — enregistré dans le CRM et QuickBooks
                            </span>
                          </span>
                        </button>
                      )}
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

              <Field label="Services (plusieurs possibles)">
                {/* menu déroulant à cases à cocher : une job peut cumuler
                    plusieurs services (ext. + gouttières, pavé + haies…).
                    Sur les fenêtres, les services cochés fixent aussi le mode
                    de paye (int/ext l'emporte) quand « Commission (défaut) »
                    est laissé plus bas ; les projets sont payés à l'heure. */}
                <MultiPicker
                  options={catalog.map((s) => ({ id: s.label, label: s.label }))}
                  selected={servicePicks}
                  onChange={setServicePicks}
                  placeholder="— Choisir un ou plusieurs services —"
                  summary={serviceValue}
                  footer={
                    <button
                      type="button"
                      onClick={() => setServiceFree((v) => !v)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', padding: '9px 10px',
                        border: 'none', borderTop: '1px solid #E5E7EB', background: serviceFree ? '#69C9CA14' : '#F9FAFB',
                        color: '#0E6B6E', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      {serviceFree ? '− Retirer le service libre' : '+ Autre service…'}
                    </button>
                  }
                />
                {serviceFree && (
                  <input value={serviceOther} onChange={(e) => setServiceOther(e.target.value)} style={{ ...inp, marginTop: 6 }} placeholder="Décrire le service" />
                )}
              </Field>

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

              {/* Soumission déjà signée avec ce client (projets). Le menu
                  n'affiche AUCUN prix — seul l'admin peut ouvrir la fiche. */}
              {canLinkQuote && (
                <Field label="Soumission du client">
                  <select value={quoteId ?? ''} onChange={(e) => setQuoteId(e.target.value || null)} style={inp}>
                    <option value="">— Aucune —</option>
                    {quoteOptions.map((q) => (
                      <option key={q.id} value={q.id}>{quoteOptionLabel(q)}</option>
                    ))}
                  </select>
                  {quoteOptions.length === 0 && (
                    <p style={{ margin: '5px 2px 0', fontSize: 11, color: '#9CA3AF' }}>
                      {clientId || title.trim().length >= 2
                        ? 'Aucune soumission trouvée pour ce client.'
                        : 'Choisis d\u2019abord le client pour voir ses soumissions.'}
                    </p>
                  )}
                  {canEdit && quoteId && (
                    <button
                      type="button"
                      onClick={() => setPreviewQuote(quoteId)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%',
                        marginTop: 6, padding: '9px 12px', borderRadius: 9, cursor: 'pointer',
                        border: '1px solid #69C9CA', background: '#69C9CA14', color: '#0E6B6E',
                        fontSize: 13, fontWeight: 700,
                      }}
                    >
                      <Eye size={15} />Prévisualiser la soumission
                    </button>
                  )}
                </Field>
              )}
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
            {!isRun && <Field label="Prix ($)" flex><input value={price} onChange={(e) => setPrice(e.target.value)} type="number" inputMode="decimal" style={inp} /></Field>}
          </div>

          {!isRun && (
            <Field label="Mode de paye">
              {/* trois choix au quotidien : commission (défaut), copro/commercial
                  à l'heure, paysagement à l'heure. Le détail de la commission
                  (solo / ext / int-ext) se déduit des services et du nombre
                  d'assignés, et reste forçable dans le sous-menu. */}
              <select value={payMode} onChange={(e) => setPayMode(e.target.value)} style={inp}>
                <option value="">
                  {PAY_MODE_BY_ID[autoMode].kind === 'percent'
                    ? `💰 Commission (défaut) — ${PAY_MODE_BY_ID[autoMode].short}`
                    : `🌿 Paysagement — à l'heure (défaut)`}
                </option>
                <option value="commercial">🏢 Copropriété / Commercial — à l&apos;heure</option>
                <option value="horaire">🌿 Paysagement — à l&apos;heure</option>
                <optgroup label="Forcer un taux précis">
                  {PAY_MODES.filter((m) => m.kind === 'percent').map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </optgroup>
              </select>
              <p style={{ margin: '5px 2px 0', fontSize: 11, color: '#9CA3AF', lineHeight: 1.45 }}>
                {PAY_MODE_BY_ID[effectiveMode].kind === 'percent'
                  ? `Chaque technicien assigné touche son % ${PAY_MODE_BY_ID[effectiveMode].short.toLowerCase()} du prix complet.`
                  : `Payé aux heures pointées au taux ${effectiveMode === 'commercial' ? 'commercial' : 'paysagement'}, pas au prix de la job.`}
                {' '}Commission = solo si un seul assigné, sinon équipe (ext. ou int/ext selon les services).
              </p>
            </Field>
          )}

          {/* Temps de la job — modes horaires (copropriété/commercial, paysagement).
              C'est CE temps qui paye chaque employé assigné à son taux horaire ;
              sans lui, seules les heures pointées comptent. */}
          {PAY_MODE_BY_ID[effectiveMode].kind === 'hourly' && (
            <Field label="Temps de la job (h)">
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={payHours}
                  onChange={(e) => setPayHours(e.target.value)}
                  type="number" step="0.25" min="0" inputMode="decimal" style={inp}
                  placeholder={scheduledHours > 0 ? String(scheduledHours) : '0'}
                />
                {!ro && scheduledHours > 0 && payHours !== String(scheduledHours) && (
                  <button
                    type="button"
                    onClick={() => setPayHours(String(scheduledHours))}
                    style={{
                      flex: '0 0 auto', padding: '0 12px', borderRadius: 8, cursor: 'pointer',
                      border: '1px solid #697035', background: '#6970350F', color: '#697035',
                      fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                    }}
                  >= {scheduledHours} h</button>
                )}
              </div>
              <p style={{ margin: '5px 2px 0', fontSize: 11, color: '#9CA3AF', lineHeight: 1.45 }}>
                Payé à CHAQUE employé assigné, à son taux {effectiveMode === 'commercial' ? 'commercial' : 'paysagement'}.
                Laisse vide pour t&apos;en tenir aux heures pointées.
              </p>
            </Field>
          )}

          {!isRun && (
            <Field label="Vendeur (closer)">
              <select value={soldBy} onChange={(e) => setSoldBy(e.target.value)} style={inp}>
                <option value="">— Aucun —</option>
                {sellerOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name ?? '—'}{p.id === userId ? ' (moi)' : ''}</option>
                ))}
              </select>
              <p style={{ margin: '5px 2px 0', fontSize: 11, color: '#9CA3AF', lineHeight: 1.45 }}>
                Sa commission de vente (% de son profil) tombe dans sa paye quand la job passe à « done ».
              </p>
            </Field>
          )}

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
            {/* couleurs partagées avec la carte du calendrier (lib/job-status.ts) */}
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={{
              ...inp,
              borderColor: jobStatusMeta(status).color,
              background: jobStatusMeta(status).bg,
              color: jobStatusMeta(status).text,
              fontWeight: 600,
            }}>
              {JOB_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>

          <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inp, minHeight: 54, resize: 'vertical' }} /></Field>

          {error && <div style={{ color: '#991B1B', fontSize: 13 }}>{error}</div>}
        </fieldset>

        {/* upsells + paye + photos/dépenses : hors fieldset — les employés y ont
            accès même en lecture seule (ils vendent et saisissent sur le chantier) */}
        {isEdit && !isRun && (
          <JobUpsells jobId={job!.id} userId={userId} isAdmin={canEdit} onTotalChange={setUpsellTotal} />
        )}
        {isEdit && !isRun && (
          <JobPayPanel
            job={{
              type, service: serviceValue, price: price ? Number(price) : null,
              pay_mode: payMode || null, assigned_ids: assigned,
              pay_hours: payHours.trim() ? Number(payHours) : null,
            }}
            soldBy={soldBy || null}
            upsellTotal={upsellTotal}
            userId={userId}
            isAdmin={canEdit}
          />
        )}
        {isEdit && <JobExtras jobId={job!.id} userId={userId} isAdmin={canEdit} showPhotos={!isRun} />}

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

      {previewQuote && (
        <QuoteDetailModal quoteId={previewQuote} stacked onClose={() => setPreviewQuote(null)} />
      )}

      {newClient && (
        <NewClientModal
          initialName={title}
          onCancel={() => setNewClient(false)}
          onCreated={onClientCreated}
        />
      )}
    </div>
  )
}

/** Libellé d'une soumission dans le menu — SANS prix (les employés le voient). */
function quoteOptionLabel(q: Quote): string {
  const kind = q.type === 'facture' ? 'Facture' : 'Devis'
  const st = STATUS_BY_ID[q.status]?.label ?? q.status
  const date = q.created_at
    ? new Date(q.created_at).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' })
    : ''
  const svc = (q.service_type ?? '').split('\n')[0].trim().slice(0, 40)
  return [`${kind} · ${st}`, date, svc].filter(Boolean).join(' — ')
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
