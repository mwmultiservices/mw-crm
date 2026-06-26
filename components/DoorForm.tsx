'use client'
import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import AddressDisplay from '@/components/AddressDisplay'

const SERVICES = [
  { value: 'vitres_ext', label: 'Lavage vitres ext.' },
  { value: 'vitres_int_ext', label: 'Lavage int./ext.' },
  { value: 'gouttières', label: 'Gouttières' },
  { value: 'paysager', label: 'Entretien paysager' },
  { value: 'pave_uni', label: 'Pavé uni' },
  { value: 'tourbe', label: 'Pose de tourbe' },
  { value: 'plates_bandes', label: 'Plates-bandes' },
  { value: 'autre', label: 'Autre' },
]

const OBJECTIONS = [
  { value: 'pas_interesse', label: 'Pas intéressé' },
  { value: 'trop_cher', label: 'Trop cher' },
  { value: 'deja_quelquun', label: "Déjà quelqu'un" },
  { value: 'conjoint', label: 'Parler au conjoint' },
  { value: 'a_rappeler', label: 'À rappeler' },
  { value: 'reflechir', label: 'Veut réfléchir' },
  { value: 'autre', label: 'Autre' },
]

const STATUSES = [
  { value: 'pas_repondu',   label: 'Sans réponse',   bg: '#F3F4F6', color: '#374151', activeBg: '#1F2937', activeColor: '#FFFFFF' },
  { value: 'pas_interesse', label: 'Pas intéressé',  bg: '#FEE2E2', color: '#991B1B', activeBg: '#EF4444', activeColor: '#FFFFFF' },
  { value: 'interesse',     label: 'Intéressé',      bg: '#FEF3C7', color: '#92400E', activeBg: '#F59E0B', activeColor: '#FFFFFF' },
  { value: 'a_rappeler',    label: 'À rappeler',     bg: '#FEF3C7', color: '#92400E', activeBg: '#F59E0B', activeColor: '#FFFFFF' },
  { value: 'soumission',    label: 'Soumission',     bg: '#E8F8F8', color: '#0D6E6F', activeBg: '#69C9CA', activeColor: '#000000' },
  { value: 'vendu',         label: '✓ Vendu',        bg: '#D1FAE5', color: '#065F46', activeBg: '#10B981', activeColor: '#FFFFFF' },
]

const OBJECTION_IA_LABELS: Record<string, string> = {
  prix: 'Prix',
  timing: 'Timing',
  conjoint_absent: 'Conjoint absent',
  confiance: 'Confiance',
  besoin_faible: 'Besoin faible',
  deja_servi: 'Déjà servi',
  pas_interesse: 'Pas intéressé',
  indecis: 'Indécis',
  autre: 'Autre',
}

export interface Door {
  id: string
  user_id: string
  latitude: number
  longitude: number
  address?: string
  status: string
  service_type?: string | null
  contract_value?: number | null
  scheduled_date?: string | null
  objection?: string | null
  notes?: string | null
  follow_up_needed?: boolean
  follow_up_date?: string | null
  client_name?: string | null
  phone?: string | null
  created_at?: string
  profiles?: { full_name: string; color: string }
  transcription?: string | null
  transcription_corrigee?: string | null
  feedback_ia?: string | null
  objection_detectee?: string | null
  suivi_necessaire?: boolean
  note_suivi?: string | null
  date_rappel?: string | null
  analyse_ia_statut?: string | null
}

type Step = 'repondu' | 'close' | 'vente' | 'objection'

interface Props {
  coords: { lat: number; lng: number; address?: string; approximate?: boolean }
  profile: any
  onSave: (data: any) => void
  onClose: () => void
  mode?: 'create' | 'edit'
  initialData?: Door
  onAddressSelect?: (lat: number, lng: number, address: string) => void
}

const fieldInput: React.CSSProperties = {
  width: '100%',
  border: '1px solid #E5E7EB',
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 16,
  color: '#1F2937',
  outline: 'none',
  fontFamily: 'Inter, sans-serif',
  background: '#FFFFFF',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function FocusInput({ type = 'text', placeholder, value, onChange, autoFocus }: {
  type?: string; placeholder?: string; value: string; autoFocus?: boolean
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <input
      type={type} placeholder={placeholder} value={value} onChange={onChange}
      autoFocus={autoFocus}
      style={fieldInput}
      onFocus={e => { e.target.style.borderColor = '#69C9CA'; e.target.style.boxShadow = '0 0 0 3px rgba(105,201,202,0.2)' }}
      onBlur={e => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none' }}
    />
  )
}

function FocusTextarea({ placeholder, value, onChange, rows = 2 }: {
  placeholder?: string; value: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; rows?: number
}) {
  return (
    <textarea
      placeholder={placeholder} value={value} onChange={onChange} rows={rows}
      style={{ ...fieldInput, resize: 'none' }}
      onFocus={e => { e.target.style.borderColor = '#69C9CA'; e.target.style.boxShadow = '0 0 0 3px rgba(105,201,202,0.2)' }}
      onBlur={e => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none' }}
    />
  )
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

function isPhoneValid(value: string): boolean {
  return value.replace(/\D/g, '').length >= 10
}

export default function DoorForm({ coords, onSave, onClose, mode = 'create', initialData, onAddressSelect }: Props) {
  const isEdit = mode === 'edit'

  // Existing state
  const [step, setStep] = useState<Step>('repondu')
  const [editStatus, setEditStatus] = useState(initialData?.status || 'pas_repondu')
  const [service, setService] = useState(initialData?.service_type || '')
  const [amount, setAmount] = useState(initialData?.contract_value?.toString() || '')
  const [scheduledDate, setScheduledDate] = useState(initialData?.scheduled_date || '')
  const [objection, setObjection] = useState(initialData?.objection || '')
  const [notes, setNotes] = useState(initialData?.notes || '')
  const [followUp, setFollowUp] = useState(initialData?.follow_up_needed || false)
  const [followUpDate, setFollowUpDate] = useState(initialData?.follow_up_date || '')
  const [clientName, setClientName] = useState(initialData?.client_name || '')
  const [phone, setPhone] = useState(initialData?.phone || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [venteSubmitAttempted, setVenteSubmitAttempted] = useState(false)
  const [address, setAddress] = useState(coords.address || '')
  const [addressError, setAddressError] = useState('')
  const [addressApproximate, setAddressApproximate] = useState(coords.approximate ?? false)
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const debounceRef = useRef<any>(null)

  // AI coaching state
  const [transcriptionRaw, setTranscriptionRaw] = useState(initialData?.transcription || '')
  const [transcriptionText, setTranscriptionText] = useState(
    initialData?.transcription_corrigee || initialData?.transcription || ''
  )
  const [feedbackIA, setFeedbackIA] = useState(initialData?.feedback_ia || '')
  const [objectionDetectee, setObjectionDetectee] = useState(initialData?.objection_detectee || '')
  const [suiviCoach, setSuiviCoach] = useState(initialData?.suivi_necessaire ?? false)
  const [noteCoach, setNoteCoach] = useState(initialData?.note_suivi || '')
  const [dateRappel, setDateRappel] = useState(initialData?.date_rappel || '')
  const [isListening, setIsListening] = useState(false)
  const [iaLoading, setIaLoading] = useState(false)
  const [speechAvailable, setSpeechAvailable] = useState(false)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    setSpeechAvailable(!!SR)
  }, [])

  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR || isListening) return
    let currentTranscript = ''
    const recognition = new SR()
    recognition.lang = 'fr-CA'
    recognition.continuous = false
    recognition.interimResults = true
    recognition.onresult = (event: any) => {
      currentTranscript = Array.from(event.results as any[]).map((r: any) => r[0].transcript).join('')
      setTranscriptionText(currentTranscript)
    }
    recognition.onend = () => {
      setIsListening(false)
      if (currentTranscript) setTranscriptionRaw(currentTranscript)
    }
    recognition.onerror = () => setIsListening(false)
    recognition.start()
    setIsListening(true)
    recognitionRef.current = recognition
  }

  const stopListening = () => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }

  const analyzeWithIA = async () => {
    const text = transcriptionText.trim()
    if (!text || iaLoading) return
    setIaLoading(true)
    try {
      const res = await fetch('/api/coach-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcription: text }),
      })
      const data = await res.json()
      if (res.ok && data.feedback) {
        setFeedbackIA(data.feedback)
        if (data.objection_detectee) setObjectionDetectee(data.objection_detectee)
      } else {
        setFeedbackIA('Feedback IA non disponible — tu peux enregistrer sans analyse.')
      }
    } catch {
      setFeedbackIA('Feedback IA non disponible — tu peux enregistrer sans analyse.')
    } finally {
      setIaLoading(false)
    }
  }

  const handleAddressChange = (val: string) => {
    setAddress(val)
    setAddressError('')
    setAddressApproximate(false)
    setShowSuggestions(false)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (val.trim().length < 3) { setAddressSuggestions([]); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val)}&addressdetails=1&limit=5&countrycodes=ca&accept-language=fr-CA`,
          { headers: { 'Accept-Language': 'fr-CA', 'User-Agent': 'MW-Multiservices-App/1.0' } }
        )
        if (!res.ok) return
        const results = await res.json()
        setAddressSuggestions(results)
        setShowSuggestions(results.length > 0)
      } catch {}
    }, 400)
  }

  const handleSuggestionSelect = (suggestion: any) => {
    const lat = parseFloat(suggestion.lat)
    const lng = parseFloat(suggestion.lon)
    const a = suggestion.address || {}
    const house = a.house_number || ''
    const road = a.road || a.pedestrian || ''
    const city = a.city || a.town || a.village || a.municipality || ''
    const postcode = a.postcode || ''
    const street = [house, road].filter(Boolean).join(' ')
    const addr = [street, city, postcode].filter(Boolean).join(', ') || suggestion.display_name
    setAddress(addr)
    setAddressApproximate(false)
    setShowSuggestions(false)
    setAddressSuggestions([])
    onAddressSelect?.(lat, lng, addr)
  }

  const isEditVendu = isEdit && editStatus === 'vendu'
  const isEditClientValid = !isEditVendu || (clientName.trim().length > 0 && isPhoneValid(phone))

  const buildPayload = (overrideData?: any) => {
    const base: Record<string, any> = {
      service_type: service || null,
      contract_value: amount ? parseFloat(amount) : null,
      scheduled_date: scheduledDate || null,
      objection: objection || null,
      notes: notes || null,
      follow_up_needed: followUp,
      follow_up_date: followUpDate || null,
      client_name: clientName || null,
      phone: phone || null,
      transcription: transcriptionRaw || null,
      transcription_corrigee: (transcriptionText && transcriptionText !== transcriptionRaw) ? transcriptionText : null,
      feedback_ia: feedbackIA || null,
      objection_detectee: objectionDetectee || null,
      suivi_necessaire: suiviCoach,
      note_suivi: (suiviCoach && noteCoach) ? noteCoach : null,
      date_rappel: (suiviCoach && dateRappel) ? dateRappel : null,
      analyse_ia_statut: feedbackIA ? 'analyse' : (transcriptionRaw ? 'non_analyse' : 'sans_transcription'),
    }
    if (!isEdit) {
      base.address = address.trim() || null
    }
    return { ...base, ...overrideData }
  }

  const save = async (overrideData?: any) => {
    if (!address.trim()) {
      setAddressError("L'adresse est obligatoire.")
      return
    }
    setAddressError('')
    setSaving(true)
    await onSave(buildPayload(overrideData))
    setSaving(false)
  }

  const saveEdit = async () => {
    if (!initialData) return
    if (!isEditClientValid) {
      setError('Veuillez entrer le nom et le téléphone du client pour enregistrer une vente.')
      return
    }
    setSaving(true)
    setError('')
    const { error: supaErr } = await supabase
      .from('doors')
      .update(buildPayload({ status: editStatus }))
      .eq('id', initialData.id)
    if (supaErr) {
      setError('Erreur lors de la mise à jour. Veuillez réessayer.')
      setSaving(false)
      return
    }
    setSaving(false)
    onSave({})
    onClose()
  }

  const title = isEdit ? 'Modifier la porte' : 'Nouvelle porte'

  // Shared vocal coach section (used in both create 'objection' step and edit mode)
  const showVocalSection = isEdit
    ? (editStatus !== 'pas_repondu' && editStatus !== 'vendu')
    : true // always shown in objection step (only reached when répondu=OUI, vendu=NON)

  const vocalSection = (
    <div style={{ border: '1px solid #D1D5DB', borderRadius: 12, padding: 16, background: '#F9FAFB' }}>
      <p style={{ color: '#374151', fontWeight: 700, fontSize: 14, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        🎙️ Résumé vocal de la discussion
      </p>

      {/* Mic button */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
        {speechAvailable ? (
          <button
            type="button"
            onClick={isListening ? stopListening : startListening}
            style={{
              width: 80, height: 80, borderRadius: '50%',
              background: isListening ? '#EF4444' : '#69C9CA',
              border: 'none', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
              animation: isListening ? 'mw-pulse 1s ease-in-out infinite' : 'none',
              transition: 'background 200ms ease',
            }}
          >
            <span style={{ fontSize: 28 }}>🎤</span>
            <span style={{ fontSize: 10, color: 'white', fontWeight: 700, letterSpacing: '0.02em' }}>
              {isListening ? 'STOP' : 'MICRO'}
            </span>
          </button>
        ) : (
          <div style={{ background: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: 10, padding: '10px 14px', width: '100%' }}>
            <p style={{ color: '#6B7280', fontSize: 13, margin: 0, textAlign: 'center' }}>
              Dictée vocale non disponible — écris ce qui s&apos;est passé
            </p>
          </div>
        )}
      </div>

      {isListening && (
        <p style={{ color: '#EF4444', fontSize: 13, textAlign: 'center', margin: '0 0 10px', fontWeight: 600, letterSpacing: '0.03em' }}>
          ● Transcription en cours...
        </p>
      )}

      {/* Transcript textarea */}
      <FocusTextarea
        placeholder="La transcription apparaîtra ici après avoir appuyé sur le micro, ou écris directement ce qui s'est passé..."
        value={transcriptionText}
        onChange={e => setTranscriptionText(e.target.value)}
        rows={4}
      />

      {/* Suivi OUI/NON */}
      <div style={{ marginTop: 14 }}>
        <p style={{ color: '#374151', fontSize: 13, fontWeight: 600, margin: '0 0 8px' }}>Suivi nécessaire ?</p>
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { val: true, label: 'Oui' },
            { val: false, label: 'Non' },
          ].map(({ val, label }) => (
            <button
              key={String(val)}
              type="button"
              onClick={() => setSuiviCoach(val)}
              style={{
                flex: 1, padding: '10px', borderRadius: 8, fontSize: 14, fontWeight: 600,
                border: `1.5px solid ${suiviCoach === val ? '#69C9CA' : '#E5E7EB'}`,
                background: suiviCoach === val ? '#E8F8F8' : '#FFFFFF',
                color: suiviCoach === val ? '#0D6E6F' : '#374151',
                cursor: 'pointer', fontFamily: 'Inter, sans-serif', transition: 'all 150ms ease',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {suiviCoach && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <FocusInput
            placeholder="Note de suivi (optionnel)"
            value={noteCoach}
            onChange={e => setNoteCoach(e.target.value)}
          />
          <input
            type="date"
            value={dateRappel}
            onChange={e => setDateRappel(e.target.value)}
            style={fieldInput}
            onFocus={e => { e.target.style.borderColor = '#69C9CA'; e.target.style.boxShadow = '0 0 0 3px rgba(105,201,202,0.2)' }}
            onBlur={e => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none' }}
          />
        </div>
      )}

      {/* Analyser button */}
      <button
        type="button"
        onClick={analyzeWithIA}
        disabled={!transcriptionText.trim() || iaLoading}
        style={{
          width: '100%', marginTop: 14, padding: '12px',
          background: !transcriptionText.trim() || iaLoading ? '#E5E7EB' : '#111827',
          color: !transcriptionText.trim() || iaLoading ? '#9CA3AF' : '#FFFFFF',
          border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600,
          cursor: !transcriptionText.trim() || iaLoading ? 'not-allowed' : 'pointer',
          fontFamily: 'Inter, sans-serif', transition: 'background 150ms',
        }}
      >
        {iaLoading ? 'Analyse en cours...' : '✦ Analyser avec le coach IA'}
      </button>

      {/* IA spinner */}
      {iaLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 22, height: 22, border: '3px solid rgba(105,201,202,0.2)', borderTopColor: '#69C9CA', borderRadius: '50%', animation: 'mw-spin 0.8s linear infinite' }} />
        </div>
      )}

      {/* IA feedback */}
      {feedbackIA && !iaLoading && (
        <div style={{ marginTop: 12, background: '#E8F8F8', border: '1px solid #69C9CA', borderRadius: 10, padding: 14 }}>
          <p style={{ color: '#0D6E6F', fontSize: 11, fontWeight: 700, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Feedback Coach IA
          </p>
          <p style={{ color: '#111827', fontSize: 14, lineHeight: 1.65, margin: 0, whiteSpace: 'pre-line' }}>
            {feedbackIA}
          </p>
          {objectionDetectee && (
            <span style={{
              display: 'inline-block', marginTop: 10,
              background: '#FEF3C7', color: '#92400E',
              padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
            }}>
              {OBJECTION_IA_LABELS[objectionDetectee] || objectionDetectee}
            </span>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 9999 }}>
      <style>{`
        @keyframes mw-client-in { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
        @keyframes mw-spin { to { transform: rotate(360deg) } }
        @keyframes mw-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
          50% { box-shadow: 0 0 0 12px rgba(239,68,68,0); }
        }
      `}</style>
      <div style={{ background: '#FFFFFF', width: '100%', borderRadius: '20px 20px 0 0', maxHeight: '92vh', overflowY: 'auto', fontFamily: 'Inter, sans-serif' }}>

        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, background: '#E5E7EB', borderRadius: 2 }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 20px 14px', borderBottom: '1px solid #F3F4F6', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: '#111827', fontWeight: 600, fontSize: 17, margin: '0 0 6px' }}>{title}</p>

            {!isEdit && (
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
                  Adresse *
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={address}
                    onChange={e => handleAddressChange(e.target.value)}
                    placeholder={coords.address ? '' : "Récupération de l'adresse..."}
                    style={{
                      ...fieldInput,
                      fontSize: 16,
                      padding: '8px 12px',
                      borderColor: addressError ? '#EF4444' : '#E5E7EB',
                    }}
                    onFocus={e => { e.target.style.borderColor = addressError ? '#EF4444' : '#69C9CA'; e.target.style.boxShadow = '0 0 0 3px rgba(105,201,202,0.2)' }}
                    onBlur={e => {
                      e.target.style.borderColor = addressError ? '#EF4444' : '#E5E7EB'
                      e.target.style.boxShadow = 'none'
                      setTimeout(() => setShowSuggestions(false), 150)
                    }}
                  />
                  {showSuggestions && addressSuggestions.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #E5E7EB', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.18)', zIndex: 10001, maxHeight: 200, overflowY: 'auto', marginTop: 2 }}>
                      {addressSuggestions.map((s: any, i: number) => (
                        <button
                          key={i}
                          onMouseDown={() => handleSuggestionSelect(s)}
                          style={{
                            display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px',
                            border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12,
                            color: '#374151', lineHeight: 1.4, fontFamily: 'Inter, sans-serif',
                            borderBottom: i < addressSuggestions.length - 1 ? '1px solid #F3F4F6' : 'none',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#F9FAFB' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                        >
                          {s.display_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {addressApproximate && !addressError && (
                  <p style={{ color: '#B45309', fontSize: 12, margin: '4px 0 0', background: '#FEF3C7', padding: '4px 8px', borderRadius: 4 }}>
                    ⚠ Adresse à valider — numéro non détecté, corrigez ou sélectionnez une suggestion
                  </p>
                )}
                {addressError && (
                  <p style={{ color: '#EF4444', fontSize: 12, margin: '4px 0 0' }}>{addressError}</p>
                )}
              </div>
            )}

            {isEdit && (
              <div style={{ marginTop: 2 }}>
                <AddressDisplay lat={coords.lat} lng={coords.lng} />
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: '#F3F4F6', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <X size={16} color="#6B7280" />
          </button>
        </div>

        <div style={{ padding: '20px 20px 40px' }}>

          {/* ──────────── MODE ÉDITION ──────────── */}
          {isEdit && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              <Field label="Statut">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {STATUSES.map(s => {
                    const active = editStatus === s.value
                    return (
                      <button key={s.value} onClick={() => { setEditStatus(s.value); setError('') }} style={{
                        padding: '10px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                        border: `1.5px solid ${active ? 'transparent' : '#E5E7EB'}`,
                        background: active ? s.activeBg : s.bg,
                        color: active ? s.activeColor : s.color,
                        cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter, sans-serif',
                        transition: 'all 150ms ease',
                      }}>
                        {s.label}
                      </button>
                    )
                  })}
                </div>
              </Field>

              <div style={{
                borderLeft: isEditVendu ? '3px solid #69C9CA' : '3px solid transparent',
                background: isEditVendu ? '#E8F8F8' : 'transparent',
                padding: isEditVendu ? '16px' : '0',
                borderRadius: isEditVendu ? 8 : 0,
                transition: 'background 200ms ease, padding 200ms ease, border-color 200ms ease',
              }}>
                {isEditVendu && (
                  <p style={{ color: '#0D6E6F', fontWeight: 700, fontSize: 14, margin: '0 0 12px', animation: 'mw-client-in 200ms ease both' }}>
                    Informations client requises
                  </p>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field label={isEditVendu ? 'Nom complet *' : 'Nom client'}>
                    <FocusInput placeholder="Jean Tremblay" value={clientName} onChange={e => setClientName(e.target.value)} />
                  </Field>
                  <Field label={isEditVendu ? 'Téléphone *' : 'Téléphone'}>
                    <FocusInput type="tel" placeholder="(514) 555-1234" value={phone} onChange={e => setPhone(formatPhone(e.target.value))} />
                  </Field>
                </div>
              </div>

              <Field label="Service">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {SERVICES.map(s => (
                    <button key={s.value} onClick={() => setService(service === s.value ? '' : s.value)} style={{
                      padding: '10px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                      border: `1.5px solid ${service === s.value ? '#69C9CA' : '#E5E7EB'}`,
                      background: service === s.value ? '#E8F8F8' : '#FFFFFF',
                      color: service === s.value ? '#0D6E6F' : '#374151',
                      cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter, sans-serif',
                      transition: 'all 150ms ease',
                    }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Montant ($)">
                  <FocusInput type="number" placeholder="250" value={amount} onChange={e => setAmount(e.target.value)} />
                </Field>
                <Field label="Date prévue">
                  <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)}
                    style={fieldInput}
                    onFocus={e => { e.target.style.borderColor = '#69C9CA'; e.target.style.boxShadow = '0 0 0 3px rgba(105,201,202,0.2)' }}
                    onBlur={e => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none' }}
                  />
                </Field>
              </div>

              <Field label="Objection">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {OBJECTIONS.map(o => (
                    <button key={o.value} onClick={() => setObjection(objection === o.value ? '' : o.value)} style={{
                      padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                      border: `1.5px solid ${objection === o.value ? '#69C9CA' : '#E5E7EB'}`,
                      background: objection === o.value ? '#E8F8F8' : '#FFFFFF',
                      color: objection === o.value ? '#0D6E6F' : '#374151',
                      cursor: 'pointer', fontFamily: 'Inter, sans-serif', transition: 'all 150ms ease',
                    }}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </Field>

              {/* Coach IA section in edit mode — only when répondu=OUI & vendu=NON */}
              {showVocalSection && vocalSection}

              <Field label="Notes">
                <FocusTextarea placeholder="Particularités, remarques..." value={notes} onChange={e => setNotes(e.target.value)} />
              </Field>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button onClick={() => setFollowUp(!followUp)} style={{
                    width: 44, height: 26, borderRadius: 13,
                    background: followUp ? '#69C9CA' : '#E5E7EB',
                    border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0,
                    transition: 'background 200ms ease',
                  }}>
                    <div style={{
                      position: 'absolute', top: 3, left: followUp ? 21 : 3,
                      width: 20, height: 20, borderRadius: '50%', background: 'white',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 200ms ease',
                    }} />
                  </button>
                  <span style={{ color: '#374151', fontSize: 14, fontWeight: 500 }}>Suivi nécessaire</span>
                </div>
                {followUp && (
                  <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)}
                    style={fieldInput}
                    onFocus={e => { e.target.style.borderColor = '#69C9CA'; e.target.style.boxShadow = '0 0 0 3px rgba(105,201,202,0.2)' }}
                    onBlur={e => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none' }}
                  />
                )}
              </div>

              {error && (
                <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: '#991B1B', fontSize: 14 }}>
                  {error}
                </div>
              )}

              <button onClick={saveEdit} disabled={saving || !isEditClientValid} style={{
                background: saving || !isEditClientValid ? '#E5E7EB' : '#69C9CA',
                color: saving || !isEditClientValid ? '#9CA3AF' : '#000000',
                fontWeight: 600, padding: '14px', borderRadius: 10, fontSize: 15,
                border: 'none', cursor: saving || !isEditClientValid ? 'not-allowed' : 'pointer',
                minHeight: 48, fontFamily: 'Inter, sans-serif', transition: 'background 150ms',
              }}>
                {saving ? 'Mise à jour...' : 'Mettre à jour'}
              </button>
              {isEditVendu && !isEditClientValid && (
                <p style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', margin: 0 }}>
                  Veuillez entrer le nom et le téléphone du client pour enregistrer une vente.
                </p>
              )}
            </div>
          )}

          {/* ──────────── MODE CRÉATION ──────────── */}
          {!isEdit && (
            <>
              {step === 'repondu' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ color: '#111827', fontWeight: 600, fontSize: 17, margin: '0 0 6px' }}>Quelqu&apos;un a répondu ?</p>
                  <button onClick={() => save({ status: 'pas_repondu' })} disabled={saving}
                    style={{ width: '100%', background: '#F1F2F2', color: '#1F2937', fontWeight: 500, padding: '16px 20px', borderRadius: 12, fontSize: 15, border: '1.5px solid #E5E7EB', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 56, fontFamily: 'Inter, sans-serif' }}>
                    <span>Non — Personne</span>
                    <span style={{ color: '#374151', fontSize: 13 }}>Enregistrer →</span>
                  </button>
                  <button onClick={() => { if (!address.trim()) { setAddressError("L'adresse est obligatoire."); return } setStep('close') }}
                    style={{ width: '100%', background: '#69C9CA', color: '#000000', fontWeight: 600, padding: '16px 20px', borderRadius: 12, fontSize: 15, border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 56, fontFamily: 'Inter, sans-serif' }}>
                    <span>Oui — Quelqu&apos;un a répondu</span>
                    <span>›</span>
                  </button>
                </div>
              )}

              {step === 'close' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ color: '#111827', fontWeight: 600, fontSize: 17, margin: '0 0 6px' }}>C&apos;est closé ?</p>
                  <button onClick={() => setStep('vente')}
                    style={{ width: '100%', background: '#10B981', color: '#FFFFFF', fontWeight: 600, padding: '16px 20px', borderRadius: 12, fontSize: 15, border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 56, fontFamily: 'Inter, sans-serif' }}>
                    <span>Oui — Vendu !</span><span>›</span>
                  </button>
                  <button onClick={() => setStep('objection')}
                    style={{ width: '100%', background: '#F1F2F2', color: '#1F2937', fontWeight: 500, padding: '16px 20px', borderRadius: 12, fontSize: 15, border: '1.5px solid #E5E7EB', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 56, fontFamily: 'Inter, sans-serif' }}>
                    <span>Non — Pas closé</span><span>›</span>
                  </button>
                </div>
              )}

              {step === 'vente' && (() => {
                const venteClientValid = clientName.trim().length > 0 && isPhoneValid(phone)
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />
                      <p style={{ color: '#10B981', fontWeight: 700, fontSize: 18, margin: 0 }}>Vente !</p>
                    </div>
                    <div style={{ borderLeft: '3px solid #69C9CA', background: '#E8F8F8', padding: 16, borderRadius: 8 }}>
                      <p style={{ color: '#0D6E6F', fontWeight: 700, fontSize: 14, margin: '0 0 12px' }}>
                        Informations client requises
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <Field label="Nom complet *">
                          <FocusInput placeholder="Jean Tremblay" value={clientName} onChange={e => setClientName(e.target.value)} />
                        </Field>
                        <Field label="Téléphone *">
                          <FocusInput type="tel" placeholder="(514) 555-1234" value={phone} onChange={e => setPhone(formatPhone(e.target.value))} />
                        </Field>
                      </div>
                    </div>
                    <Field label="Service vendu">
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {SERVICES.map(s => (
                          <button key={s.value} onClick={() => setService(s.value)} style={{
                            padding: '10px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                            border: `1.5px solid ${service === s.value ? '#69C9CA' : '#E5E7EB'}`,
                            background: service === s.value ? '#E8F8F8' : '#FFFFFF',
                            color: service === s.value ? '#0D6E6F' : '#374151',
                            cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter, sans-serif', transition: 'all 150ms ease',
                          }}>{s.label}</button>
                        ))}
                      </div>
                    </Field>
                    <Field label="Montant ($)">
                      <FocusInput type="number" placeholder="Ex: 250" value={amount} onChange={e => setAmount(e.target.value)} />
                    </Field>
                    <Field label="Date prévue">
                      <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)}
                        style={fieldInput}
                        onFocus={e => { e.target.style.borderColor = '#69C9CA'; e.target.style.boxShadow = '0 0 0 3px rgba(105,201,202,0.2)' }}
                        onBlur={e => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none' }}
                      />
                    </Field>
                    <Field label="Notes">
                      <FocusTextarea placeholder="Particularités..." value={notes} onChange={e => setNotes(e.target.value)} />
                    </Field>
                    {venteSubmitAttempted && !venteClientValid && (
                      <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: '#991B1B', fontSize: 14 }}>
                        Veuillez entrer le nom et le téléphone du client pour enregistrer une vente.
                      </div>
                    )}
                    <button
                      onClick={() => {
                        setVenteSubmitAttempted(true)
                        if (!venteClientValid) return
                        save({ status: 'vendu' })
                      }}
                      disabled={saving}
                      style={{
                        background: saving ? '#E5E7EB' : !venteClientValid ? '#D1D5DB' : '#10B981',
                        color: saving || !venteClientValid ? '#9CA3AF' : '#FFFFFF',
                        fontWeight: 600, padding: '14px', borderRadius: 10, fontSize: 15,
                        border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                        minHeight: 48, fontFamily: 'Inter, sans-serif', transition: 'background 150ms',
                      }}
                    >
                      {saving ? 'Enregistrement...' : '✓ Enregistrer la vente'}
                    </button>
                  </div>
                )
              })()}

              {step === 'objection' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <p style={{ color: '#111827', fontWeight: 600, fontSize: 17, margin: 0 }}>Raison / Objection</p>

                  {/* Objection buttons */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {OBJECTIONS.map(o => (
                      <button key={o.value} onClick={() => setObjection(objection === o.value ? '' : o.value)} style={{
                        padding: '8px 14px', borderRadius: 8, fontSize: 14, fontWeight: 500,
                        border: `1.5px solid ${objection === o.value ? '#69C9CA' : '#E5E7EB'}`,
                        background: objection === o.value ? '#E8F8F8' : '#FFFFFF',
                        color: objection === o.value ? '#0D6E6F' : '#374151',
                        cursor: 'pointer', fontFamily: 'Inter, sans-serif', transition: 'all 150ms ease',
                      }}>{o.label}</button>
                    ))}
                  </div>

                  {/* Vocal coach section */}
                  {vocalSection}

                  <FocusTextarea placeholder="Notes (optionnel)" value={notes} onChange={e => setNotes(e.target.value)} />

                  {/* Save button — toujours actif */}
                  <button
                    onClick={() => save({ status: objection === 'a_rappeler' ? 'a_rappeler' : 'pas_interesse' })}
                    disabled={saving}
                    style={{
                      background: saving ? '#E5E7EB' : '#69C9CA',
                      color: saving ? '#9CA3AF' : '#000000',
                      fontWeight: 600, padding: '14px', borderRadius: 10, fontSize: 15,
                      border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                      minHeight: 48, fontFamily: 'Inter, sans-serif', transition: 'background 150ms',
                    }}
                  >
                    {saving ? 'Enregistrement...' : 'Enregistrer la porte'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
