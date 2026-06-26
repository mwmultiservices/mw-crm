'use client'
import { X, Phone } from 'lucide-react'
import AddressDisplay from '@/components/AddressDisplay'

const STATUS_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  pas_repondu:   { label: 'Sans réponse',   bg: '#F3F4F6', color: '#6B7280' },
  pas_interesse: { label: 'Pas intéressé',  bg: '#FEE2E2', color: '#991B1B' },
  interesse:     { label: 'Intéressé',      bg: '#FEF3C7', color: '#92400E' },
  a_rappeler:    { label: 'À rappeler',      bg: '#FEF3C7', color: '#92400E' },
  soumission:    { label: 'Soumission',      bg: '#E8F8F8', color: '#0D6E6F' },
  vendu:         { label: '✓ Vendu',         bg: '#D1FAE5', color: '#065F46' },
}

const SERVICE_LABELS: Record<string, string> = {
  vitres_ext:     'Lavage vitres ext.',
  vitres_int_ext: 'Lavage vitres int./ext.',
  gouttières:     'Lavage gouttières',
  paysager:       'Entretien paysager',
  pave_uni:       'Pavé uni',
  tourbe:         'Pose de tourbe',
  plates_bandes:  'Plates-bandes',
  autre:          'Autre',
}

export default function PinPopup({ door, onClose }: { door: any; onClose: () => void }) {
  const statusInfo = STATUS_LABELS[door.status] || { label: door.status, bg: '#F3F4F6', color: '#6B7280' }
  const date = new Date(door.created_at)
  const dateStr = date.toLocaleDateString('fr-CA') + ' à ' + date.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 9999 }}>
      <div style={{ background: '#FFFFFF', width: '100%', borderRadius: '20px 20px 0 0', maxHeight: '70vh', overflowY: 'auto', fontFamily: 'Inter, sans-serif' }}>

        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, background: '#E5E7EB', borderRadius: 2 }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 20px 14px', borderBottom: '1px solid #F3F4F6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: door.profiles?.color || '#69C9CA', flexShrink: 0 }} />
            <div>
              <p style={{ color: '#111827', fontWeight: 600, fontSize: 15, margin: 0 }}>{door.profiles?.full_name}</p>
              <p style={{ color: '#374151', fontSize: 12, margin: '2px 0 0' }}>{dateStr}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: '#F3F4F6', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color="#6B7280" />
          </button>
        </div>

        <div style={{ padding: '18px 20px 36px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Badge statut */}
          <div style={{
            display: 'inline-flex', padding: '4px 12px', borderRadius: 999,
            fontSize: 13, fontWeight: 500,
            background: statusInfo.bg, color: statusInfo.color,
            alignSelf: 'flex-start',
          }}>
            {statusInfo.label}
          </div>

          {door.client_name && <Row label="Client" value={door.client_name} />}

          {door.phone && (
            <Row label="Téléphone" value={
              <a href={`tel:${door.phone}`} style={{ color: '#69C9CA', fontWeight: 500, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Phone size={13} />
                {door.phone}
              </a>
            } />
          )}

          {door.service_type && <Row label="Service" value={SERVICE_LABELS[door.service_type] || door.service_type} />}

          {door.contract_value && (
            <Row label="Montant" value={
              <span style={{ color: '#065F46', fontWeight: 700, background: '#D1FAE5', padding: '2px 8px', borderRadius: 6, fontSize: 13 }}>
                {Number(door.contract_value).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}
              </span>
            } />
          )}

          {door.scheduled_date && <Row label="Date prévue" value={new Date(door.scheduled_date).toLocaleDateString('fr-CA')} />}
          {door.objection && <Row label="Objection" value={door.objection.replace(/_/g, ' ')} />}
          {door.follow_up_needed && door.follow_up_date && (
            <Row label="Suivi" value={new Date(door.follow_up_date).toLocaleDateString('fr-CA')} />
          )}

          {door.notes && (
            <div>
              <p style={{ color: '#374151', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Notes</p>
              <p style={{ color: '#374151', fontSize: 14, background: '#F9FAFB', border: '1px solid #F3F4F6', padding: '10px 12px', borderRadius: 8, margin: 0 }}>{door.notes}</p>
            </div>
          )}

          <div style={{ marginTop: 4 }}>
            <AddressDisplay lat={door.latitude} lng={door.longitude} />
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
      <span style={{ color: '#374151', fontSize: 13, flexShrink: 0 }}>{label}</span>
      <span style={{ color: '#111827', fontSize: 13, textAlign: 'right' }}>{value}</span>
    </div>
  )
}
