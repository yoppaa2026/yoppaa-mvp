// POST /api/rdv/empreinte-details
//
// CE QUE LE CLIENT LIT AVANT DE SORTIR SA CARTE.
//
// 🔴 SANS CETTE ROUTE, LA PAGE NE DISAIT PAS LE MONTANT (16/09). Le client
// arrivait par le lien, cliquait « Enregistrer ma carte » et donnait sa carte
// sans savoir ce qu'il garantissait : l'email le disait, le SMS non, la page
// jamais. Un mandat signé sur un montant qu'on n'a pas lu, c'est la
// contestation le jour du débit, et elle se gagne contre nous.
//
// ⚠️ ELLE NE REND RIEN DE PERSONNEL, et les colonnes ne sont même pas lues : ni
// nom, ni email, ni téléphone, ni l'identifiant de la réservation. Le jeton est
// une clé, pas une preuve d'identité ; il ouvre ce que son porteur sait déjà,
// son restaurant, sa table, et ce qu'elle garantit.
//
// ⚠️ ET ELLE N'OUVRE RIEN CHEZ STRIPE : elle lit, elle ne crée aucun client,
// aucune session, aucun mandat.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { chargerLienEmpreinte } from '@/lib/empreinte-lien-serveur'
import { delaiAnnulationHeures } from '@/lib/rdv-delai-annulation'

export async function POST(request) {
  try {
    const { jeton } = await request.json()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // 🔴 LA MÊME LECTURE, LA MÊME RÈGLE ET LE MÊME MONTANT QUE LA ROUTE QUI
    // OUVRE LA SAISIE DE CARTE. C'est tout l'intérêt du module partagé : ce qui
    // s'affiche ici est ce qui sera signé là-bas.
    const lien = await chargerLienEmpreinte(supabase, jeton, { avecClient: false })
    if (!lien.ok) {
      return NextResponse.json({ ok: false, code: lien.code, error: lien.error }, { status: lien.status })
    }

    const { rdv, commercant, montant } = lien
    return NextResponse.json({
      ok: true,
      montant,
      commerce: commercant.nom,
      date_rdv: rdv.date_rdv,
      // ⚠️ `HH:MM`, jamais les secondes de la base : l'écran affiche ce qu'il
      // reçoit, et « 20:00:00 » sur une table se lit comme un horaire de train.
      heure_debut: String(rdv.heure_debut || '').slice(0, 5),
      couverts: rdv.couverts,
      // Ce que le client peut encore annuler sans rien devoir. Zéro est une
      // valeur : la page n'en parle pas, elle ne l'écrase pas.
      delai_heures: delaiAnnulationHeures(commercant),
    })
  } catch (e) {
    console.error('[empreinte-details] erreur', e)
    return NextResponse.json({ ok: false, error: 'erreur serveur' }, { status: 500 })
  }
}
