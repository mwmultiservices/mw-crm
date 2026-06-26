'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { DoorOpen, CheckCircle, Percent, DollarSign, RefreshCw, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useDashboardVendeur } from '@/lib/hooks/useDashboardVendeur'
import * as Q from '@/lib/queries/dashboard'
import StatCard from '@/components/dashboard/shared/StatCard'
import ProgressBar from '@/components/dashboard/shared/ProgressBar'
import SkeletonDashboard from '@/components/dashboard/shared/SkeletonDashboard'
import { GOAL_DANGER_PERCENT } from '@/lib/config'

const STATUS_LABELS: Record<string, string> = {
  pas_repondu: 'Sans réponse',
  pas_interesse: 'Pas intéressé',
  interesse: 'Intéressé',
  a_rappeler: 'À rappeler',
  soumission: 'Soumission',
  vendu: 'Vendu',
}

function getFollowUpBadge(dateStr: string): { bg: string; color: string; label: string } {
  const today = new Date().toISOString().slice(0, 10)
  const d = dateStr.slice(0, 10)
  if (d < today) return { bg: '#FEE2E2', color: '#991B1B', label: 'En retard' }
  if (d === today) return { bg: '#FEF3C7', color: '#92400E', label: "Aujourd'hui" }
  return { bg: '#F3F4F6', color: '#374151', label: d }
}

function getMotivationalMessage(pct: number): string {
  if (pct === 0) return 'Commencez fort — chaque porte compte!'
  if (pct < 25) return 'Bon départ! Continuez sur cette lancée.'
  if (pct < 50) return 'Bonne progression, gardez le rythme!'
  if (pct < 75) return 'Plus que la moitié — vous y êtes presque!'
  if (pct < 90) return "Excellent travail! L'objectif est proche."
  if (pct < 100) return 'Dernière ligne droite — vous pouvez le faire!'
  return 'Objectif atteint! Félicitations! 🎉'
}

function getWeekRange(offset: number): { dateDebut: string; dateFin: string; label: string } {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff + offset * 7)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return {
    dateDebut: monday.toISOString().slice(0, 10),
    dateFin: sunday.toISOString().slice(0, 10),
    label: `Sem. du ${monday.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' })} au ${sunday.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' })}`,
  }
}

export default function VendeurDashboard() {
  const [userId, setUserId] = useState<string>('')
  const [userLoading, setUserLoading] = useState(true)

  // Personal goals (Mod 2)
  const [personalGoalDoors, setPersonalGoalDoors] = useState(0)
  const [personalGoalRevenue, setPersonalGoalRevenue] = useState(0)
  const [personalGoalSaving, setPersonalGoalSaving] = useState(false)
  const [personalGoalSaved, setPersonalGoalSaved] = useState(false)

  // Commission weekly (Mod 3)
  const [commissionOffset, setCommissionOffset] = useState(0)
  const [commissionWeekData, setCommissionWeekData] = useState<Array<{ date: string; montant: number; nbVentes: number }>>([])
  const [commissionWeekLoading, setCommissionWeekLoading] = useState(false)

  // Refresh (Mod 5)
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setUserLoading(false); return }
      setUserId(user.id)
      setUserLoading(false)
    })
  }, [])

  const { stats, refetch } = useDashboardVendeur(userId)
  const loading = userLoading || stats.loading

  // Init personal goals from profile (Mod 2)
  useEffect(() => {
    const profile = stats.profile
    if (!profile) return
    if (profile.personal_goal_doors === undefined || profile.personal_goal_doors === null) {
      console.warn('[VendeurDashboard] personal_goal_doors manquant — migration SQL requise')
    }
    setPersonalGoalDoors(profile.personal_goal_doors ?? 0)
    setPersonalGoalRevenue(Number(profile.personal_goal_revenue) ?? 0)
  }, [stats.profile])

  // Fetch commission week data (Mod 3)
  const fetchCommissionWeek = useCallback(async () => {
    if (!userId) return
    setCommissionWeekLoading(true)
    const { dateDebut, dateFin } = getWeekRange(commissionOffset)
    const data = await Q.getVentesParDateRange(userId, dateDebut, dateFin)
    setCommissionWeekData(data)
    setCommissionWeekLoading(false)
  }, [userId, commissionOffset])

  useEffect(() => { fetchCommissionWeek() }, [fetchCommissionWeek])

  // Refresh all (Mod 5)
  const loadAll = useCallback(async () => {
    setIsRefreshing(true)
    await Promise.all([refetch(), fetchCommissionWeek()])
    setIsRefreshing(false)
  }, [refetch, fetchCommissionWeek])

  // Save personal goals (Mod 2)
  const savePersonalGoals = async () => {
    if (!userId) return
    setPersonalGoalSaving(true)
    await supabase.from('profiles').update({
      personal_goal_doors: personalGoalDoors,
      personal_goal_revenue: personalGoalRevenue,
    }).eq('id', userId)
    setPersonalGoalSaving(false)
    setPersonalGoalSaved(true)
    setTimeout(() => setPersonalGoalSaved(false), 2500)
  }

  if (loading) return <SkeletonDashboard />

  const profile = stats.profile
  const firstName = profile?.full_name?.split(' ')[0] || 'vous'

  // Objectifs manager (lus depuis la table objectifs)
  const objectifPortes = stats.objectifPortes
  const objectifVentes = stats.objectifVentes
  const hasObjectifManager = objectifPortes !== null || objectifVentes !== null

  const pctPortes = objectifPortes && objectifPortes > 0
    ? Math.min(Math.round((stats.portesToday / objectifPortes) * 100), 100)
    : 0
  const pctVentes = objectifVentes && objectifVentes > 0
    ? Math.min(Math.round((stats.ventesToday / objectifVentes) * 100), 100)
    : 0

  const progressColorPortes =
    pctPortes >= 100 ? '#10B981' : pctPortes >= GOAL_DANGER_PERCENT ? '#F59E0B' : '#69C9CA'
  const progressColorVentes =
    pctVentes >= 100 ? '#10B981' : pctVentes >= GOAL_DANGER_PERCENT ? '#F59E0B' : '#69C9CA'

  const todayDate = new Date().toLocaleDateString('fr-CA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  // ── Commission section ────────────────────────────────────
  const commissionForData = (data: { montant: number; nbVentes: number }) => {
    if (!profile) return 0
    if (profile.commission_type === 'percent') {
      return data.montant * ((profile.commission_value || 0) / 100)
    }
    if (profile.commission_type === 'fixed') {
      return data.nbVentes * (profile.commission_value || 0)
    }
    return 0
  }

  const weekRange = getWeekRange(commissionOffset)
  const totalWeekCommission = commissionWeekData.reduce((sum, d) => sum + commissionForData(d), 0)
  const totalWeekVentes = commissionWeekData.reduce((sum, d) => sum + d.nbVentes, 0)

  const commissionChartData = commissionWeekData.map((d) => ({
    jour: d.date ? new Date(d.date + 'T12:00:00').toLocaleDateString('fr-CA', { weekday: 'short' }) : '',
    commission: commissionForData(d),
  }))

  const tauxLabel =
    profile?.commission_type === 'percent'
      ? `${profile.commission_value}%`
      : profile?.commission_type === 'fixed'
      ? `${profile.commission_value} $ / vente`
      : '—'

  const hasCommission = profile?.commission_type && profile?.commission_value > 0

  // Personal goals progress (Mod 2)
  const pctPersonalDoors = personalGoalDoors > 0 ? Math.min(Math.round((stats.portesToday / personalGoalDoors) * 100), 100) : 0
  const pctPersonalRevenue = personalGoalRevenue > 0 ? Math.min(Math.round((stats.revenusToday / personalGoalRevenue) * 100), 100) : 0

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#F1F2F2', fontFamily: 'Inter, sans-serif' }}>
      <style>{`@keyframes mw-spin { to { transform: rotate(360deg) } }`}</style>

      {/* Header */}
      <div style={{
        background: '#FFFFFF', borderBottom: '1px solid #E5E7EB', padding: '20px 20px 16px',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      }}>
        <div>
          <h1 style={{ color: '#111827', fontWeight: 700, fontSize: 22, margin: 0, letterSpacing: '-0.02em' }}>
            Bonjour {firstName}!
          </h1>
          <p style={{ color: '#374151', fontSize: 13, margin: '4px 0 0' }}>{todayDate}</p>
        </div>
        <button
          onClick={loadAll}
          disabled={isRefreshing}
          style={{ background: 'none', border: 'none', cursor: isRefreshing ? 'not-allowed' : 'pointer', padding: 8, color: '#6B7280', display: 'flex', alignItems: 'center', opacity: isRefreshing ? 0.6 : 1 }}
          title="Actualiser"
        >
          <RefreshCw size={18} style={{ animation: isRefreshing ? 'mw-spin 0.8s linear infinite' : 'none' }} />
        </button>
      </div>

      <div style={{ padding: '20px 16px 40px' }}>
        {/* Stats grid 2x2 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
          <StatCard
            title="Portes"
            value={stats.portesToday}
            icon={<DoorOpen size={20} />}
            delta={stats.portesToday - stats.portesHier}
            color="#69C9CA"
          />
          <StatCard
            title="Ventes"
            value={stats.ventesToday}
            icon={<CheckCircle size={20} />}
            delta={stats.ventesToday - stats.ventesHier}
            color="#10B981"
          />
          <StatCard
            title="Taux clos."
            value={stats.tauxClosing !== null ? `${stats.tauxClosing}%` : 'N/A'}
            icon={<Percent size={20} />}
            color="#3B82F6"
          />
          <StatCard
            title="Revenus"
            value={stats.revenusToday > 0 ? `${stats.revenusToday.toLocaleString('fr-CA')} $` : '—'}
            icon={<DollarSign size={20} />}
            delta={stats.revenusToday !== stats.revenusHier ? stats.revenusToday - stats.revenusHier : undefined}
            color="#8B5CF6"
          />
        </div>

        {/* Ligne réponses + taux de réponse */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <div style={{
            flex: 1, background: '#FFFFFF', borderRadius: 10, padding: '10px 14px',
            border: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <p style={{ color: '#6B7280', fontSize: 11, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Réponses</p>
            <p style={{ color: '#111827', fontWeight: 700, fontSize: 20, margin: 0 }}>{stats.reponsesToday}</p>
          </div>
          <div style={{
            flex: 1, background: '#FFFFFF', borderRadius: 10, padding: '10px 14px',
            border: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <p style={{ color: '#6B7280', fontSize: 11, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Taux répons.</p>
            <p style={{ color: '#111827', fontWeight: 700, fontSize: 20, margin: 0 }}>{stats.tauxReponse}%</p>
          </div>
        </div>

        {/* Mod 2: Mes objectifs du jour */}
        <div style={{
          background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12,
          padding: 16, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <h2 style={{
            color: '#374151', fontWeight: 600, fontSize: 14, margin: '0 0 14px',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            Mes objectifs du jour
          </h2>

          {/* Portes input + progress */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: '#374151', fontSize: 13, fontWeight: 500 }}>Portes</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#6B7280', fontSize: 12 }}>{stats.portesToday} / </span>
                <input
                  type="number" min={0} max={500}
                  value={personalGoalDoors}
                  onChange={(e) => setPersonalGoalDoors(Number(e.target.value))}
                  style={{ width: 60, padding: '4px 8px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: '#111827', textAlign: 'center' }}
                />
              </div>
            </div>
            {personalGoalDoors > 0 && (
              <ProgressBar value={pctPersonalDoors} color="#69C9CA" height={6} animated />
            )}
          </div>

          {/* Revenus input + progress */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: '#374151', fontSize: 13, fontWeight: 500 }}>Revenus ($)</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#6B7280', fontSize: 12 }}>{stats.revenusToday.toLocaleString('fr-CA')} / </span>
                <input
                  type="number" min={0} max={999999}
                  value={personalGoalRevenue}
                  onChange={(e) => setPersonalGoalRevenue(Number(e.target.value))}
                  style={{ width: 80, padding: '4px 8px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: '#111827', textAlign: 'center' }}
                />
              </div>
            </div>
            {personalGoalRevenue > 0 && (
              <ProgressBar value={pctPersonalRevenue} color="#8B5CF6" height={6} animated />
            )}
          </div>

          <button
            onClick={savePersonalGoals}
            disabled={personalGoalSaving}
            style={{
              width: '100%', background: personalGoalSaved ? '#10B981' : '#F3F4F6',
              color: personalGoalSaved ? '#FFFFFF' : '#374151',
              border: 'none', borderRadius: 8, padding: '9px 0',
              fontSize: 13, fontWeight: 600, cursor: personalGoalSaving ? 'not-allowed' : 'pointer',
              fontFamily: 'Inter, sans-serif', transition: 'background 200ms ease',
            }}
          >
            {personalGoalSaved ? '✓ Sauvegardé' : personalGoalSaving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>

        {/* Objectif manager (read-only, depuis table objectifs) */}
        <div style={{
          background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12,
          padding: 16, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <h2 style={{
              color: '#374151', fontWeight: 600, fontSize: 14, margin: 0,
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              Objectif manager
            </h2>
            <Lock size={13} color="#9CA3AF" />
          </div>

          {!hasObjectifManager ? (
            <p style={{ color: '#9CA3AF', fontSize: 13, margin: 0, textAlign: 'center', padding: '8px 0' }}>
              Aucun objectif fixé par le manager
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {objectifPortes !== null && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <p style={{ color: '#111827', fontWeight: 600, fontSize: 15, margin: 0 }}>
                      {stats.portesToday} / {objectifPortes} portes cognées
                    </p>
                    <span style={{ color: progressColorPortes, fontWeight: 700, fontSize: 15 }}>
                      {pctPortes}%
                    </span>
                  </div>
                  <ProgressBar value={pctPortes} color={progressColorPortes} height={10} animated />
                  <p style={{ color: '#6B7280', fontSize: 12, margin: '6px 0 0' }}>
                    {getMotivationalMessage(pctPortes)}
                  </p>
                </div>
              )}
              {objectifVentes !== null && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <p style={{ color: '#111827', fontWeight: 600, fontSize: 15, margin: 0 }}>
                      {stats.ventesToday} / {objectifVentes} ventes
                    </p>
                    <span style={{ color: progressColorVentes, fontWeight: 700, fontSize: 15 }}>
                      {pctVentes}%
                    </span>
                  </div>
                  <ProgressBar value={pctVentes} color={progressColorVentes} height={10} animated />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mod 3: Commission estimée (weekly) */}
        {hasCommission && (
          <div style={{
            background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12,
            padding: 16, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <h2 style={{
              color: '#374151', fontWeight: 600, fontSize: 14, margin: '0 0 12px',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              Commission estimée
            </h2>

            {/* Week navigation */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
              <button
                onClick={() => setCommissionOffset((o) => o - 1)}
                style={{
                  background: '#F3F4F6', border: 'none', borderRadius: 8,
                  padding: '6px 12px', cursor: 'pointer', fontSize: 12,
                  color: '#374151', fontFamily: 'Inter, sans-serif', fontWeight: 500, flexShrink: 0,
                }}
              >
                ← Sem. précédente
              </button>
              <span style={{ color: '#374151', fontSize: 11, fontWeight: 500, textAlign: 'center', flex: 1 }}>
                {weekRange.label}
              </span>
              <button
                onClick={() => setCommissionOffset((o) => Math.min(0, o + 1))}
                disabled={commissionOffset === 0}
                style={{
                  background: '#F3F4F6', border: 'none', borderRadius: 8,
                  padding: '6px 12px', cursor: commissionOffset === 0 ? 'not-allowed' : 'pointer',
                  fontSize: 12, color: '#374151', fontFamily: 'Inter, sans-serif', fontWeight: 500,
                  opacity: commissionOffset === 0 ? 0.4 : 1, flexShrink: 0,
                }}
              >
                Sem. actuelle →
              </button>
            </div>

            {commissionWeekLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
                <div style={{ width: 22, height: 22, border: '3px solid rgba(105,201,202,0.2)', borderTopColor: '#69C9CA', borderRadius: '50%', animation: 'mw-spin 0.8s linear infinite' }} />
              </div>
            ) : (
              <>
                <div style={{ textAlign: 'center', marginBottom: 8 }}>
                  <p style={{ color: '#111827', fontWeight: 800, fontSize: 28, margin: '0 0 4px' }}>
                    {totalWeekCommission.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $
                  </p>
                  <p style={{ color: '#6B7280', fontSize: 12, margin: 0 }}>
                    Basé sur {totalWeekVentes} vente{totalWeekVentes !== 1 ? 's' : ''} — taux {tauxLabel}
                  </p>
                </div>

                {commissionChartData.some((d) => d.commission > 0) && (
                  <ResponsiveContainer width="100%" height={100}>
                    <BarChart data={commissionChartData} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                      <XAxis dataKey="jour" tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                      <YAxis tick={{ fontSize: 9, fill: '#9CA3AF' }} />
                      <Tooltip
                        formatter={(val) => [`${(Number(val) || 0).toFixed(2)} $`, 'Commission']}
                        contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E5E7EB', fontFamily: 'Inter, sans-serif' }}
                      />
                      <Bar
                        dataKey="commission"
                        fill="#69C9CA"
                        radius={[3, 3, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </>
            )}
          </div>
        )}

        {/* Suivis */}
        {stats.suivis.length > 0 && (
          <div>
            <h2 style={{
              color: '#374151', fontWeight: 600, fontSize: 14, margin: '0 0 12px',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              Prochains suivis
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats.suivis.map((suivi: any) => {
                const badge = suivi.follow_up_date
                  ? getFollowUpBadge(suivi.follow_up_date)
                  : { bg: '#F3F4F6', color: '#374151', label: '—' }
                return (
                  <div key={suivi.id} style={{
                    background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12,
                    padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        color: '#111827', fontWeight: 600, fontSize: 13, margin: '0 0 2px',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {suivi.client_name || suivi.address || 'Client'}
                      </p>
                      {suivi.phone && (
                        <p style={{ color: '#374151', fontSize: 12, margin: '0 0 1px' }}>{suivi.phone}</p>
                      )}
                      {suivi.notes && (
                        <p style={{
                          color: '#6B7280', fontSize: 11, margin: 0,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {suivi.notes}
                        </p>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{
                        display: 'inline-block', padding: '3px 10px', borderRadius: 999,
                        fontSize: 11, fontWeight: 600, background: badge.bg, color: badge.color,
                        marginBottom: 4,
                      }}>
                        {badge.label}
                      </span>
                      <p style={{ color: '#6B7280', fontSize: 11, margin: 0 }}>
                        {STATUS_LABELS[suivi.status] || suivi.status}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
