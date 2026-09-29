'use client'
// OUVRIR LE TABLEAU DE BORD D'UN COMMERÇANT EN MODE ADMIN.
//
// ⚠️ ÉCRIT UNE FOIS, APPELÉ DE DEUX ENDROITS : la liste « Tous les
// commerçants » et le bloc « Fiches à mettre en ligne ». Deux copies de ce
// geste finiraient par ne plus journaliser la même chose, et ce journal
// (`admin_impersonations`) est une obligation RGPD.
//
// 🔴 POURQUOI LE BLOC DES FICHES EN A BESOIN (Alex, 29/09). Son lien
// « Aperçu » menait à la fiche publique, qui n'existe pas tant que la fiche
// n'est pas publiée : on atterrissait sur la liste des commerces. Or c'est
// justement AVANT de publier qu'Alex veut voir comment la fiche a été remplie.
// Le tunnel client étant gelé pendant l'examen Play, on ne lui ouvre pas une
// page publique de prévisualisation : on ouvre le tableau de bord, qui montre
// tout.

import { supabase } from '@/lib/supabase'
import { poserImpersonation } from '@/lib/impersonation'

// Rend rien si tout va bien, lève une erreur lisible sinon. L'appelant
// navigue vers /dashboard.
export async function demarrerModeAdmin(commercantId, raison) {
  // Demarre une session d'impersonation : POST /api/admin/impersonate-start qui logue
  // dans admin_impersonations (conformite RGPD). Retourne l'impersonation_id que
  // le tableau de bord fait confirmer par le serveur à chaque chargement.
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/admin/impersonate-start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token || ''}` },
    body: JSON.stringify({ commercant_id: commercantId, raison }),
  })
  const j = await res.json()
  if (!j.ok) throw new Error(j.error || 'Erreur impersonation')

  // 🔴 DANS L'ONGLET, PLUS DANS LE NAVIGATEUR (15/09, trouvé par Alex). Le
  // localStorage est commun à tous les onglets et ne s'efface jamais seul :
  // le dernier « Voir Dashboard » gagnait partout, pour toujours. Et
  // `yoppaa_dashboard_commercant_id`, écrit ici aussi, rouvrait ce commerce
  // SANS BANDEAU dans la page Abonnement. On n'écrit plus que dans l'onglet.
  if (!poserImpersonation(commercantId, j.impersonation_id)) {
    throw new Error('ce navigateur refuse le stockage de l’onglet')
  }
}
