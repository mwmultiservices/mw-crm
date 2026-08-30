import { randomInt } from 'node:crypto'

// Alphabet sans caractères ambigus (pas de O/0, I/l/1) — dictable par texto.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

// Mot de passe temporaire au format MW-XXXX-XXXX. Serveur uniquement (node:crypto).
export function makeTempPassword(): string {
  const pick = (n: number) =>
    Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
  return `MW-${pick(4)}-${pick(4)}`
}
