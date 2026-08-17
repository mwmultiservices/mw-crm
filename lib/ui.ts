/**
 * Petits helpers d'interface partagés.
 */

/**
 * `autoFocus` seulement sur grand écran.
 *
 * Sur téléphone, un champ auto-focusé ouvre le clavier dès l'ouverture du modal :
 * la zone visible est coupée en deux, iOS remonte tout l'écran et le bottom-nav
 * part vers le haut. On garde donc l'auto-focus au clavier physique (≥1024px).
 */
export function autoFocusDesktop(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(min-width: 1024px)').matches
}
