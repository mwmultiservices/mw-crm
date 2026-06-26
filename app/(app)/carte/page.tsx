'use client'
import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import DoorForm, { Door } from '@/components/DoorForm'
import DoorDetailSheet, { DoorDetail } from '@/components/DoorDetailSheet'
import AddressSearchModal from '@/components/AddressSearchModal'
import { Plus } from 'lucide-react'
import { isSeller } from '@/lib/roles'

const MapComponent = dynamic(
  () => import('@/components/MapComponent').then(mod => ({ default: mod.default })),
  {
    ssr: false,
    loading: () => (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F1F2F2' }}>
        <p style={{ color: '#374151', fontSize: 14, fontFamily: 'Inter, sans-serif' }}>Chargement de la carte...</p>
      </div>
    ),
  }
)

export default function CartePage() {
  const [profile, setProfile] = useState<any>(null)
  const [doors, setDoors] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [formCoords, setFormCoords] = useState<{ lat: number; lng: number; address?: string; approximate?: boolean } | null>(null)
  const [editDoor, setEditDoor] = useState<Door | null>(null)
  const [detailDoor, setDetailDoor] = useState<DoorDetail | null>(null)
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [clearTempSignal, setClearTempSignal] = useState(0)
  const [externalTrigger, setExternalTrigger] = useState<{ lat: number; lng: number; id: number } | null>(null)
  const [objectifPortes, setObjectifPortes] = useState<number | null>(null)
  const [objectifVentes, setObjectifVentes] = useState<number | null>(null)

  // Charge le profil + les objectifs du jour
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(data)

      if (!isSeller(data?.role)) return
      const today = new Date().toISOString().split('T')[0]
      const { data: objData } = await supabase
        .from('objectifs')
        .select('type, valeur')
        .eq('vendeur_id', user.id)
        .eq('date', today)
      setObjectifPortes(objData?.find((o: any) => o.type === 'portes')?.valeur ?? null)
      setObjectifVentes(objData?.find((o: any) => o.type === 'ventes')?.valeur ?? null)
    })
  }, [])

  // Subscription realtime sur les objectifs du vendeur connecté
  // (si le manager change l'objectif pendant la journée, la carte se met à jour)
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || cancelled) return

      channel = supabase
        .channel(`objectifs-carte-${user.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'objectifs', filter: `vendeur_id=eq.${user.id}` },
          async () => {
            const today = new Date().toISOString().split('T')[0]
            const { data: objData } = await supabase
              .from('objectifs')
              .select('type, valeur')
              .eq('vendeur_id', user.id)
              .eq('date', today)
            setObjectifPortes(objData?.find((o: any) => o.type === 'portes')?.valeur ?? null)
            setObjectifVentes(objData?.find((o: any) => o.type === 'ventes')?.valeur ?? null)
          }
        )
        .subscribe()
    })

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  const loadDoors = useCallback(async () => {
    const { data } = await supabase
      .from('doors')
      .select('id, user_id, latitude, longitude, address, status, service_type, contract_value, scheduled_date, objection, notes, follow_up_needed, follow_up_date, client_name, phone, created_at, transcription, transcription_corrigee, feedback_ia, objection_detectee, suivi_necessaire, note_suivi, date_rappel, analyse_ia_statut, profiles(full_name, color)')
      .order('created_at', { ascending: false })
    setDoors(data || [])
  }, [])

  useEffect(() => {
    loadDoors()
    const channel = supabase
      .channel('doors-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'doors' }, loadDoors)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadDoors])

  const openNewDoorFlow = useCallback((lat: number, lng: number, address: string, approximate = false, triggerMap = false) => {
    setFormCoords({ lat, lng, address, approximate })
    setShowForm(true)
    if (triggerMap) {
      setExternalTrigger({ lat, lng, id: Date.now() })
    }
  }, [])

  const handleLongPress = useCallback((lat: number, lng: number, address: string, approximate: boolean) => {
    openNewDoorFlow(lat, lng, address, approximate, false)
  }, [openNewDoorFlow])

  const handleAddressSelect = useCallback((lat: number, lng: number, address: string) => {
    setFormCoords(prev => prev ? { ...prev, lat, lng, address, approximate: false } : null)
    setExternalTrigger({ lat, lng, id: Date.now() })
  }, [])

  const handleDoorClick = useCallback((door: any) => {
    setDetailDoor(door as DoorDetail)
  }, [])

  const handleEditFromDetail = useCallback(() => {
    if (!detailDoor) return
    setEditDoor(detailDoor as unknown as Door)
    setDetailDoor(null)
  }, [detailDoor])

  const handleFormSave = async (formData: any) => {
    if (!profile || !formCoords) return
    await supabase.from('doors').insert({
      user_id: profile.id,
      latitude: formCoords.lat,
      longitude: formCoords.lng,
      address: formCoords.address || null,
      ...formData,
    })
    setShowForm(false)
    setFormCoords(null)
    setClearTempSignal(s => s + 1)
    loadDoors()
  }

  const handleFormClose = useCallback(() => {
    setShowForm(false)
    setFormCoords(null)
    setClearTempSignal(s => s + 1)
  }, [])

  const handleEditSave = useCallback(() => {
    setEditDoor(null)
    loadDoors()
  }, [loadDoors])

  // ── Calculs pour le widget vendeur ────────────────────────────────────────
  const today = new Date().toDateString()
  const portesAujourdhui = isSeller(profile?.role)
    ? doors.filter(d => d.user_id === profile.id && new Date(d.created_at).toDateString() === today).length
    : 0
  const ventesAujourdhui = isSeller(profile?.role)
    ? doors.filter(d => d.user_id === profile.id && new Date(d.created_at).toDateString() === today && d.status === 'vendu').length
    : 0
  const hasObjectifs = objectifPortes !== null || objectifVentes !== null

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', fontFamily: 'Inter, sans-serif' }}>
      <MapComponent
        doors={doors}
        onLongPress={handleLongPress}
        onDoorClick={handleDoorClick}
        clearTempMarkerSignal={clearTempSignal}
        externalTrigger={externalTrigger}
      />

      {/* ── Header flottant ──────────────────────────────────────────────── */}
      <div style={{ position: 'absolute', top: 12, left: 12, right: 12, zIndex: 1000, pointerEvents: 'none' }}>
        {isSeller(profile?.role) ? (
          /* Vendeur : widget combiné nom + objectifs du jour */
          <div style={{
            background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)',
            borderRadius: 12, padding: '10px 14px',
            border: '1px solid rgba(229,231,235,0.8)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}>
            {/* Ligne 1 : nom | portes aujourd'hui */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: hasObjectifs ? 10 : 0 }}>
              <span style={{ color: '#111827', fontWeight: 600, fontSize: 14 }}>
                {profile.full_name}
              </span>
              <span style={{ color: '#374151', fontSize: 13, fontWeight: 500 }}>
                {portesAujourdhui} {portesAujourdhui === 1 ? 'porte' : 'portes'} auj.
              </span>
            </div>

            {/* Ligne 2 : progress bars ou message vide */}
            {hasObjectifs ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {objectifPortes !== null && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color: '#6B7280' }}>Portes aujourd&apos;hui</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>
                        {portesAujourdhui} / {objectifPortes}
                      </span>
                    </div>
                    <div style={{ background: '#E5E7EB', borderRadius: 3, height: 5 }}>
                      <div style={{
                        background: portesAujourdhui >= objectifPortes ? '#10B981' : '#69C9CA',
                        borderRadius: 3, height: 5,
                        width: `${Math.min(objectifPortes > 0 ? Math.round(portesAujourdhui / objectifPortes * 100) : 0, 100)}%`,
                        transition: 'width 300ms ease',
                      }} />
                    </div>
                  </div>
                )}
                {objectifVentes !== null && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color: '#6B7280' }}>Ventes aujourd&apos;hui</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>
                        {ventesAujourdhui} / {objectifVentes}
                      </span>
                    </div>
                    <div style={{ background: '#E5E7EB', borderRadius: 3, height: 5 }}>
                      <div style={{
                        background: ventesAujourdhui >= objectifVentes ? '#10B981' : '#8B5CF6',
                        borderRadius: 3, height: 5,
                        width: `${Math.min(objectifVentes > 0 ? Math.round(ventesAujourdhui / objectifVentes * 100) : 0, 100)}%`,
                        transition: 'width 300ms ease',
                      }} />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ color: '#9CA3AF', fontSize: 12, margin: 0 }}>Aucun objectif fixé</p>
            )}
          </div>
        ) : (
          /* Manager / non chargé : deux pills séparées */
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={{
              background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)',
              borderRadius: 10, padding: '8px 14px',
              border: '1px solid rgba(229,231,235,0.8)', boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}>
              <span style={{ color: '#111827', fontWeight: 600, fontSize: 14 }}>{profile?.full_name || '…'}</span>
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)',
              borderRadius: 10, padding: '8px 12px',
              border: '1px solid rgba(229,231,235,0.8)', boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}>
              <span style={{ color: '#374151', fontSize: 13, fontWeight: 500 }}>{doors.length} portes</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Bouton Nouvelle porte ─────────────────────────────────────────── */}
      <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 1000 }}>
        <button
          onClick={() => setShowSearchModal(true)}
          style={{
            background: '#69C9CA', color: '#000000', fontWeight: 600,
            padding: '13px 28px', borderRadius: 12, fontSize: 15, border: 'none',
            cursor: 'pointer', boxShadow: '0 4px 20px rgba(105,201,202,0.45)',
            display: 'flex', alignItems: 'center', gap: 8,
            fontFamily: 'Inter, sans-serif', transition: 'background 150ms ease, box-shadow 150ms ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#4AADAE'; e.currentTarget.style.boxShadow = '0 4px 24px rgba(74,173,174,0.5)' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#69C9CA'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(105,201,202,0.45)' }}
        >
          <Plus size={18} strokeWidth={2.5} />
          Nouvelle porte
        </button>
      </div>

      {showSearchModal && (
        <AddressSearchModal
          onSelect={(lat, lng, address) => {
            setShowSearchModal(false)
            openNewDoorFlow(lat, lng, address, false, true)
          }}
          onClose={() => setShowSearchModal(false)}
        />
      )}

      {showForm && formCoords && profile && (
        <DoorForm
          coords={formCoords}
          profile={profile}
          mode="create"
          onSave={handleFormSave}
          onClose={handleFormClose}
          onAddressSelect={handleAddressSelect}
        />
      )}

      {detailDoor && (
        <DoorDetailSheet
          door={detailDoor}
          onClose={() => setDetailDoor(null)}
          onEdit={handleEditFromDetail}
          userRole={profile?.role}
        />
      )}

      {editDoor && profile && (
        <DoorForm
          coords={{ lat: editDoor.latitude, lng: editDoor.longitude }}
          profile={profile}
          mode="edit"
          initialData={editDoor}
          onSave={handleEditSave}
          onClose={() => setEditDoor(null)}
        />
      )}
    </div>
  )
}
