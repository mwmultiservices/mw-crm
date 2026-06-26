// ============================================================
// Règles d'automatisation du pipeline (Phase 3.4)
// >>> TOUT SE MODIFIE ICI <<< — templates, délais, on/off.
// Tant que Twilio est en stub, les SMS sont enregistrés sans partir ;
// les relances "notify_rep" (flag in-app) marchent sans Twilio.
// ============================================================

export const AUTOMATIONS = {
  // 1. SMS de bienvenue à la création d'un lead entrant
  welcome: {
    enabled: true,
    // sources qui déclenchent le SMS auto (les leads manuels / D2D en sont exclus)
    sources: ['site_web', 'meta_ads'] as string[],
    text:
      'Bonjour! Merci de votre intérêt pour MW Multiservices. ' +
      'Un membre de notre équipe vous contactera très bientôt. ' +
      'Pour toute question : 438-391-8780',
  },

  // 2. SMS automatique lors d'un changement de stage (clé = id du stage cible)
  stageMessages: {
    scheduled:
      'Bonjour! Votre rendez-vous avec MW Multiservices est confirmé. ' +
      'Au plaisir de vous servir. Questions? 438-391-8780',
    won:
      'Merci pour votre confiance! Votre avis nous aide énormément : ' +
      'https://share.google/CrlBX54OzZ2hFcsqS ⭐',
  } as Record<string, string>,

  // 3. Relance d'inactivité
  followUp: {
    enabled: true,
    delayDays: 3,
    // un lead dans ces stages, sans mouvement depuis delayDays, est marqué « à relancer »
    activeStages: ['new', 'contacted', 'quoted'] as string[],
    // 'notify_rep' (flag in-app, sans Twilio) | 'sms_client' | 'both'
    action: 'notify_rep' as 'notify_rep' | 'sms_client' | 'both',
    smsText:
      'Bonjour! On voulait simplement faire un suivi concernant votre projet ' +
      'avec MW Multiservices. Avez-vous des questions? 438-391-8780',
  },
}

// SMS à envoyer pour un stage donné (ou null si aucune règle).
export function stageMessageFor(stage: string): string | null {
  return AUTOMATIONS.stageMessages[stage] ?? null
}
