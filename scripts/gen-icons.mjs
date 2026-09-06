#!/usr/bin/env node
// ============================================================
// Génère les icônes PWA (public/icons/*) depuis public/logo-mw.svg.
//
// Pourquoi un script plutôt qu'un export manuel : l'emblème (le « M »
// montagne + l'étincelle) n'occupe PAS toute la boîte du SVG, et son
// vrai rectangle englobant ne correspond pas au viewBox. La 1re version
// des icônes utilisait une bbox estimée à la main → la patte droite du M
// se retrouvait collée/coupée au bord droit sur l'écran d'accueil iOS.
//
// Méthode fiable : on rend l'emblème sur fond TRANSPARENT, on laisse
// sharp.trim() calculer la bbox réelle des pixels, puis on redimensionne
// ce bloc pour qu'il tienne dans une zone de contenu centrée (marge
// garantie sur les 4 côtés) et on le colle au centre du fond foncé.
//
// Usage :  node scripts/gen-icons.mjs
// (sharp arrive avec Next — pas de dépendance à ajouter.)
// ============================================================
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'public/logo-mw.svg')
const OUT = join(ROOT, 'public/icons')

const BG = '#0D1F1F' // = manifest background_color / theme_color

// Part de l'icône occupée par l'emblème (le reste = marge).
//   any       : marge visuelle classique d'une icône d'app
//   maskable  : Android/iOS peuvent rogner jusqu'à ~20 % de chaque bord,
//               le contenu doit rester dans le cercle de sûreté (80 %)
const RATIO = { any: 0.68, maskable: 0.55 }

// L'emblème = les paths AVANT le <g> (qui contient le lettrage « MW
// Multiservices »). On garde le viewBox du fichier : la bbox réelle est
// recalculée ensuite par trim().
function emblemSvg(size) {
  const svg = readFileSync(SRC, 'utf8')
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1]
  if (!viewBox) throw new Error('viewBox introuvable dans logo-mw.svg')
  const body = svg.slice(0, svg.indexOf('<g>'))
  const paths = [...body.matchAll(/<path\b[^>]*\/>/g)].map((m) => m[0])
  if (paths.length === 0) throw new Error('aucun <path> d’emblème trouvé')
  // fill sur la racine : les paths du logo n'ont pas de fill propre et héritent.
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${size}" height="${size}" fill="#ffffff">${paths.join('')}</svg>`,
  )
}

// Emblème blanc, détouré au pixel près (fond transparent + trim).
async function trimmedEmblem(renderSize) {
  return sharp(emblemSvg(renderSize), { density: 384 })
    .png()
    .trim({ threshold: 1 })
    .toBuffer({ resolveWithObject: true })
}

async function makeIcon(size, ratio, file) {
  // rendu large puis réduit : garde les bords nets après trim/resize
  const { data, info } = await trimmedEmblem(2048)
  const box = Math.round(size * ratio)
  // `contain` : l'emblème tient ENTIÈREMENT dans le carré de contenu,
  // sans déformation — c'est ce qui garantit qu'aucun côté n'est coupé.
  const art = await sharp(data)
    .resize(box, box, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer()

  await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: art, gravity: 'centre' }])
    .png()
    .toFile(join(OUT, file))

  const w = (info.width / info.height).toFixed(3)
  console.log(`✓ ${file.padEnd(24)} ${size}px · contenu ${box}px · ratio emblème ${w}`)
}

mkdirSync(OUT, { recursive: true })
await makeIcon(192, RATIO.any, 'icon-192.png')
await makeIcon(512, RATIO.any, 'icon-512.png')
await makeIcon(180, RATIO.any, 'apple-touch-icon.png')
await makeIcon(512, RATIO.maskable, 'icon-maskable-512.png')
