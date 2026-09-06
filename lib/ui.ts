/**
 * Petits helpers d'interface partagés.
 */

/**
 * `autoFocus` seulement au clavier/souris, jamais sur un écran tactile.
 *
 * Sur téléphone, un champ auto-focusé ouvre le clavier dès l'ouverture du modal :
 * la zone visible est coupée en deux, iOS remonte tout l'écran et le bottom-nav
 * part vers le haut. Sur un <select>, iOS ouvre carrément le sélecteur tout seul.
 *
 * `min-width` ne suffit PAS : un iPad fait 1024 px et plus. On exige donc aussi
 * un pointeur fin qui survole (souris/trackpad de bureau) — un doigt répond
 * `pointer: coarse` / `hover: none`.
 */
export function autoFocusDesktop(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)').matches
}
