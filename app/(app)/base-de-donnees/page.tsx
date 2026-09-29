import { redirect } from 'next/navigation'

// « Base D2D » retirée (demande client 2026-09-28) : la recherche d'un nom se
// fait maintenant en haut du Pipeline. Les portes (table `doors`) restent sur
// la carte D2D ; un vendu y crée toujours client + lead « Gagné ».
// On garde la route pour rediriger les anciens favoris.
export default function BaseDeDonneesPage() {
  redirect('/pipeline')
}
