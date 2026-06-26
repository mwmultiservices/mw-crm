'use client'
import { useEffect, useRef } from 'react'
import { reverseGeocode } from '@/lib/geocoding'
import { getPinColor } from '@/lib/colors'

interface Door {
  id: string
  latitude: number
  longitude: number
  status: string
  profiles?: { full_name: string; color: string }
  client_name?: string
  contract_value?: number
  created_at: string
  notes?: string
  service_type?: string
  objection?: string
  address?: string
}

interface Props {
  doors: Door[]
  onLongPress: (lat: number, lng: number, address: string, approximate: boolean) => void
  onDoorClick: (door: Door) => void
  clearTempMarkerSignal?: number
  // When set (id changes), place temp marker + recenter map — used for search-modal flow
  externalTrigger?: { lat: number; lng: number; id: number } | null
}

const TEMP_MARKER_HTML = `
  <style>
    @keyframes mw-temp-ring { 0%,100%{transform:scale(1);opacity:0.7} 50%{transform:scale(1.6);opacity:0.15} }
    @keyframes mw-temp-dot  { 0%,100%{transform:scale(1)} 50%{transform:scale(1.12)} }
  </style>
  <div style="position:relative;width:28px;height:28px">
    <div style="position:absolute;inset:-7px;border-radius:50%;background:rgba(105,201,202,0.45);animation:mw-temp-ring 1.2s ease-in-out infinite"></div>
    <div style="position:absolute;top:4px;left:4px;width:20px;height:20px;border-radius:50%;background:#69C9CA;border:3px solid white;box-shadow:0 2px 10px rgba(105,201,202,0.7);animation:mw-temp-dot 1.2s ease-in-out infinite"></div>
  </div>
`

export default function MapComponent({ doors, onLongPress, onDoorClick, clearTempMarkerSignal, externalTrigger }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const leafletRef = useRef<any>(null)
  const cleanupRef = useRef<{
    container: HTMLElement
    onTouchStart: any
    onTouchMove: any
    onTouchEnd: any
    onContextMenu: any
  } | null>(null)
  const markersRef = useRef<any[]>([])
  const userMarkerRef = useRef<any>(null)
  const temporaryMarkerRef = useRef<any>(null)
  const pressTimerRef = useRef<any>(null)
  const pressStartRef = useRef<{ x: number; y: number } | null>(null)
  const movedRef = useRef(false)
  const watchIdRef = useRef<number | null>(null)

  // Clear temp marker when signal increments (form closed / saved)
  useEffect(() => {
    if (clearTempMarkerSignal === undefined) return
    if (temporaryMarkerRef.current) {
      temporaryMarkerRef.current.remove()
      temporaryMarkerRef.current = null
    }
  }, [clearTempMarkerSignal])

  // External trigger from search modal: place temp marker + recenter
  useEffect(() => {
    if (!externalTrigger) return
    if (!mapInstanceRef.current || !leafletRef.current) return
    placeTempMarker(externalTrigger.lat, externalTrigger.lng)
    mapInstanceRef.current.setView([externalTrigger.lat, externalTrigger.lng], 18)
  }, [externalTrigger])

  const placeTempMarker = (lat: number, lng: number) => {
    if (!mapInstanceRef.current || !leafletRef.current) return
    const L = leafletRef.current
    if (temporaryMarkerRef.current) {
      temporaryMarkerRef.current.remove()
      temporaryMarkerRef.current = null
    }
    const icon = L.divIcon({
      html: TEMP_MARKER_HTML,
      className: '',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    })
    temporaryMarkerRef.current = L.marker([lat, lng], { icon, zIndexOffset: 2000 }).addTo(mapInstanceRef.current)
  }

  useEffect(() => {
    if (!mapRef.current) return

    const initMap = async () => {
      const L = (await import('leaflet')).default

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }

      const map = L.map(mapRef.current!, {
        center: [45.45, -73.45],
        zoom: 15,
        zoomControl: false,
      })

      mapInstanceRef.current = map
      leafletRef.current = L

      L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      }).addTo(map)

      L.control.zoom({ position: 'bottomright' }).addTo(map)

      const updateUserPos = (pos: GeolocationPosition) => {
        if (!mapInstanceRef.current) return
        const { latitude, longitude } = pos.coords
        if (userMarkerRef.current) {
          userMarkerRef.current.setLatLng([latitude, longitude])
        } else {
          const icon = L.divIcon({
            html: `<div style="width:20px;height:20px;border-radius:50%;background:#69C9CA;border:3px solid white;box-shadow:0 0 0 5px rgba(105,201,202,0.25)"></div>`,
            className: '',
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          })
          userMarkerRef.current = L.marker([latitude, longitude], { icon, zIndexOffset: 1000 }).addTo(mapInstanceRef.current)
          mapInstanceRef.current.setView([latitude, longitude], 17)
        }
      }

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(updateUserPos)
        watchIdRef.current = navigator.geolocation.watchPosition(
          updateUserPos,
          () => {},
          { enableHighAccuracy: true, maximumAge: 5000 }
        )
      }

      // Desktop long press — 700 ms
      map.on('mousedown', (e: any) => {
        pressStartRef.current = { x: e.containerPoint.x, y: e.containerPoint.y }
        movedRef.current = false
        const lat = e.latlng.lat
        const lng = e.latlng.lng
        pressTimerRef.current = setTimeout(async () => {
          if (!movedRef.current) {
            placeTempMarker(lat, lng)
            const result = await reverseGeocode(lat, lng)
            const approximate = result?.approximate ?? true
            const address = result?.formatted || `${lat.toFixed(5)}, ${lng.toFixed(5)}`
            console.log('[LongPress] lat:', lat, 'lng:', lng, 'source: desktop')
            onLongPress(lat, lng, address, approximate)
          }
        }, 700)
      })
      map.on('mousemove', (e: any) => {
        if (pressStartRef.current) {
          const dx = Math.abs(e.containerPoint.x - pressStartRef.current.x)
          const dy = Math.abs(e.containerPoint.y - pressStartRef.current.y)
          if (dx > 10 || dy > 10) {
            movedRef.current = true
            if (pressTimerRef.current) clearTimeout(pressTimerRef.current)
          }
        }
      })
      map.on('mouseup', () => {
        if (pressTimerRef.current) clearTimeout(pressTimerRef.current)
        pressStartRef.current = null
      })

      // Mobile long press — 700 ms
      const container = map.getContainer()

      container.style.userSelect = 'none'
      ;(container.style as any).webkitUserSelect = 'none'
      ;(container.style as any).webkitTouchCallout = 'none'

      const onTouchStart = (e: TouchEvent) => {
        // Let taps on markers pass through unmodified — they fire their own click events
        const target = e.target as HTMLElement
        if (target.closest('.leaflet-marker-icon') || target.closest('.leaflet-marker-pane')) {
          return
        }

        e.preventDefault() // blocks context menu + iOS callout on map background
        const touch = e.touches[0]
        pressStartRef.current = { x: touch.clientX, y: touch.clientY }
        movedRef.current = false
        const cx = touch.clientX
        const cy = touch.clientY
        pressTimerRef.current = setTimeout(async () => {
          if (!movedRef.current) {
            // rect recalculated at trigger time — not at touchstart — to account for any layout shift during the 700ms hold
            const rect = container.getBoundingClientRect()
            const point = map.containerPointToLatLng(L.point(cx - rect.left, cy - rect.top))
            if (navigator.vibrate) navigator.vibrate(50)
            placeTempMarker(point.lat, point.lng)
            const result = await reverseGeocode(point.lat, point.lng)
            const approximate = result?.approximate ?? true
            const address = result?.formatted || `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`
            console.log('[LongPress] lat:', point.lat, 'lng:', point.lng, 'source: mobile')
            onLongPress(point.lat, point.lng, address, approximate)
          }
        }, 700)
      }
      const onTouchMove = (e: TouchEvent) => {
        if (pressStartRef.current) {
          const t = e.touches[0]
          if (Math.abs(t.clientX - pressStartRef.current.x) > 10 ||
              Math.abs(t.clientY - pressStartRef.current.y) > 10) {
            movedRef.current = true
            if (pressTimerRef.current) clearTimeout(pressTimerRef.current)
          }
        }
      }
      const onTouchEnd = () => {
        if (pressTimerRef.current) clearTimeout(pressTimerRef.current)
        pressStartRef.current = null
      }
      const onContextMenu = (e: MouseEvent) => { e.preventDefault() }

      container.addEventListener('touchstart', onTouchStart, { passive: false })
      container.addEventListener('touchmove', onTouchMove, { passive: true })
      container.addEventListener('touchend', onTouchEnd)
      container.addEventListener('contextmenu', onContextMenu)

      cleanupRef.current = { container, onTouchStart, onTouchMove, onTouchEnd, onContextMenu }
    }

    initMap()

    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current)
      if (cleanupRef.current) {
        const { container, onTouchStart, onTouchMove, onTouchEnd, onContextMenu } = cleanupRef.current
        container.removeEventListener('touchstart', onTouchStart)
        container.removeEventListener('touchmove', onTouchMove)
        container.removeEventListener('touchend', onTouchEnd)
        container.removeEventListener('contextmenu', onContextMenu)
        cleanupRef.current = null
      }
      if (temporaryMarkerRef.current) {
        temporaryMarkerRef.current.remove()
        temporaryMarkerRef.current = null
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!mapInstanceRef.current || !leafletRef.current) return
    const map = mapInstanceRef.current
    const L = leafletRef.current
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    doors.forEach(door => {
      const vendeurColor = door.profiles?.color || '#69C9CA'
      const outerColor = getPinColor(door.status)
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
        <path d="M16 0C7.2 0 0 7.2 0 16c0 11 16 24 16 24S32 27 32 16C32 7.2 24.8 0 16 0z"
          fill="${outerColor}" stroke="white" stroke-width="2"/>
        <circle cx="16" cy="16" r="7" fill="white"/>
        <circle cx="16" cy="16" r="5" fill="${vendeurColor}"/>
      </svg>`
      const icon = L.divIcon({ html: svg, className: '', iconSize: [32, 40], iconAnchor: [16, 40] })
      const marker = L.marker([door.latitude, door.longitude], { icon }).addTo(map)
      // stopPropagation prevents the map's mousedown from competing with the marker click
      marker.on('click', (e: any) => {
        L.DomEvent.stopPropagation(e)
        onDoorClick(door)
      })
      markersRef.current.push(marker)
    })
  }, [doors, onDoorClick])

  const recenter = () => {
    if (!mapInstanceRef.current) return
    const map = mapInstanceRef.current
    if (userMarkerRef.current) {
      map.setView(userMarkerRef.current.getLatLng(), 17)
    } else {
      navigator.geolocation.getCurrentPosition(pos => {
        map.setView([pos.coords.latitude, pos.coords.longitude], 17)
      })
    }
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', userSelect: 'none' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      <button
        onClick={recenter}
        style={{
          position: 'absolute', bottom: 16, left: 12, zIndex: 1000,
          background: 'white',
          border: '1px solid #E5E7EB',
          borderRadius: '50%',
          width: 44, height: 44,
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18,
        }}
      >
        📍
      </button>
    </div>
  )
}
