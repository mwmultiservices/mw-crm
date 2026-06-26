'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { upsertObjectifTyped } from '@/lib/queries/dashboard'
import { isSeller } from '@/lib/roles'

interface VendeurState {
  id: string
  full_name: string
  color: string
  portes_valeur: number
  ventes_valeur: number
  portes_saved: boolean
  ventes_saved: boolean
  portes_saving: boolean
  ventes_saving: boolean
}

interface Props {
  onClose: () => void
}

const SPIN = `@keyframes mw-spin { to { transform: rotate(360deg) } }`

export default function ObjectifsModal({ onClose }: Props) {
  const [vendeurs, setVendeurs] = useState<VendeurState[]>([])
  const [loading, setLoading] = useState(true)
  const [migrationNeeded, setMigrationNeeded] = useState(false)

  const today = new Date().toISOString().slice(0, 10)

  const loadData = useCallback(async () => {
    setLoading(true)

    const { data: allProfiles } = await supabase
      .from('profiles')
      .select('id, full_name, color, role')

    const vendeurProfiles = (allProfiles ?? []).filter((p: any) => isSeller(p.role))

    const vendeurIds = vendeurProfiles.map((v: any) => v.id)

    let objectifsMap: Record<string, { portes: number; ventes: number }> = {}

    if (vendeurIds.length > 0) {
      const { data: objectifsData, error } = await supabase
        .from('objectifs')
        .select('vendeur_id, type, valeur')
        .in('vendeur_id', vendeurIds)
        .eq('date', today)

      if (error) {
        setMigrationNeeded(true)
      } else {
        ;(objectifsData ?? []).forEach((o: any) => {
          if (!objectifsMap[o.vendeur_id]) objectifsMap[o.vendeur_id] = { portes: 0, ventes: 0 }
          if (o.type === 'portes') objectifsMap[o.vendeur_id].portes = o.valeur
          if (o.type === 'ventes') objectifsMap[o.vendeur_id].ventes = o.valeur
        })
      }
    }

    setVendeurs(
      vendeurProfiles.map((v: any) => ({
        id: v.id,
        full_name: v.full_name || '—',
        color: v.color || '#69C9CA',
        portes_valeur: objectifsMap[v.id]?.portes ?? 0,
        ventes_valeur: objectifsMap[v.id]?.ventes ?? 0,
        portes_saved: false,
        ventes_saved: false,
        portes_saving: false,
        ventes_saving: false,
      }))
    )

    setLoading(false)
  }, [today])

  useEffect(() => {
    loadData()
  }, [loadData])

  const updateField = (id: string, field: keyof VendeurState, value: unknown) => {
    setVendeurs((prev) => prev.map((v) => (v.id === id ? { ...v, [field]: value } : v)))
  }

  const handleSave = async (vendeurId: string, type: 'portes' | 'ventes') => {
    const v = vendeurs.find((x) => x.id === vendeurId)
    if (!v) return
    const valeur = type === 'portes' ? v.portes_valeur : v.ventes_valeur

    updateField(vendeurId, `${type}_saving`, true)

    console.log('[DEBUG MANAGER] vendeur sélectionné:', vendeurId, v.full_name)
    console.log('[DEBUG MANAGER] objectif à sauvegarder:', { vendeur_id: vendeurId, type, valeur, date: today })

    const { error } = await upsertObjectifTyped(vendeurId, type, today, valeur)
    console.log('[DEBUG MANAGER] erreur upsert:', error)

    updateField(vendeurId, `${type}_saving`, false)

    if (error) {
      setMigrationNeeded(true)
    } else {
      updateField(vendeurId, `${type}_saved`, true)
      setTimeout(() => updateField(vendeurId, `${type}_saved`, false), 2500)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1001, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#FFFFFF', borderRadius: '16px 16px 0 0', width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: '20px 16px 40px', fontFamily: 'Inter, sans-serif' }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{SPIN}</style>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ color: '#111827', fontWeight: 700, fontSize: 18, margin: '0 0 2px' }}>Objectifs du jour</h2>
            <p style={{ color: '#6B7280', fontSize: 12, margin: 0 }}>
              {new Date().toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: '#F3F4F6', border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <X size={18} color="#374151" />
          </button>
        </div>

        {/* Migration warning */}
        {migrationNeeded && (
          <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 10, padding: 14, marginBottom: 16 }}>
            <p style={{ color: '#92400E', fontWeight: 700, fontSize: 13, margin: '0 0 4px' }}>Migration SQL requise</p>
            <p style={{ color: '#78350F', fontSize: 12, margin: 0, lineHeight: 1.5 }}>
              La table <code>objectifs</code> doit être créée ou mise à jour. Exécutez{' '}
              <strong>supabase/migration_objectifs.sql</strong> dans Supabase → SQL Editor.
            </p>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
            <div style={{ width: 28, height: 28, border: '3px solid rgba(105,201,202,0.2)', borderTopColor: '#69C9CA', borderRadius: '50%', animation: 'mw-spin 0.8s linear infinite' }} />
          </div>
        ) : vendeurs.length === 0 ? (
          <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>Aucun vendeur trouvé</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {vendeurs.map((v) => (
              <div
                key={v.id}
                style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
              >
                {/* Vendeur header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: v.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                    {v.full_name.slice(0, 2).toUpperCase()}
                  </div>
                  <p style={{ color: '#111827', fontWeight: 600, fontSize: 15, margin: 0 }}>{v.full_name}</p>
                </div>

                {/* Portes row */}
                <ObjectifRow
                  label="Portes cognées"
                  value={v.portes_valeur}
                  saved={v.portes_saved}
                  saving={v.portes_saving}
                  onChange={(val) => updateField(v.id, 'portes_valeur', val)}
                  onSave={() => handleSave(v.id, 'portes')}
                />

                <div style={{ height: 8 }} />

                {/* Ventes row */}
                <ObjectifRow
                  label="Ventes"
                  value={v.ventes_valeur}
                  saved={v.ventes_saved}
                  saving={v.ventes_saving}
                  onChange={(val) => updateField(v.id, 'ventes_valeur', val)}
                  onSave={() => handleSave(v.id, 'ventes')}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface ObjectifRowProps {
  label: string
  value: number
  saved: boolean
  saving: boolean
  onChange: (val: number) => void
  onSave: () => void
}

function ObjectifRow({ label, value, saved, saving, onChange, onSave }: ObjectifRowProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <p style={{ color: '#374151', fontSize: 13, fontWeight: 500, margin: 0, flex: 1, minWidth: 90 }}>{label}</p>
      <input
        type="number"
        min={0}
        max={999}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        style={{ width: 70, padding: '7px 10px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 14, fontFamily: 'Inter, sans-serif', outline: 'none', color: '#111827', textAlign: 'center' }}
        onFocus={(e) => { e.target.style.borderColor = '#69C9CA' }}
        onBlur={(e) => { e.target.style.borderColor = '#E5E7EB' }}
      />
      {saved ? (
        <span style={{ background: '#D1FAE5', color: '#065F46', fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 999, whiteSpace: 'nowrap', flexShrink: 0 }}>
          ✓ Enregistré
        </span>
      ) : (
        <button
          onClick={onSave}
          disabled={saving}
          style={{ background: '#69C9CA', color: '#000', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', flexShrink: 0, opacity: saving ? 0.7 : 1 }}
        >
          {saving ? '...' : 'Enregistrer'}
        </button>
      )}
    </div>
  )
}
