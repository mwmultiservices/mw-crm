import { ReactNode } from 'react'

interface Props {
  title: string
  description?: string
  children: ReactNode
}

export default function SettingsSection({ title, description, children }: Props) {
  return (
    <div style={{
      background: '#FFFFFF',
      borderRadius: 12,
      border: '1px solid #E5E7EB',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #F3F4F6' }}>
        <p style={{ color: '#111827', fontWeight: 700, fontSize: 14, margin: 0 }}>{title}</p>
        {description && (
          <p style={{ color: '#6B7280', fontSize: 12, margin: '2px 0 0' }}>{description}</p>
        )}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  )
}
