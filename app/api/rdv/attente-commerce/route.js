// POST /api/rdv/attente-commerce
//
// { action: 'compter', commercant_id }                       → { ok, seances, fenetres }
// { action: 'prevenir', prestation_id, date_rdv, heure_debut } → { ok, prevenus, file }
// { action: 'liste', prestation_id, date_rdv, heure_debut }    → { ok, personnes }
// { action: 'prevenir-cours', prestation_id }                   → { ok, prevenus, seances }
//
// 🔴 LA FILE D'ATTENTE N'EXISTAIT PAS CÔTÉ COMMERÇANTE (I12, audit du 03/10).
// Elle était ouverte sur tous ses cours (trois places par défaut), mais elle ne
// voyait pas qui attendait, et rien ne lui permettait de prévenir la file quand
// c'était ELLE qui libérait une place. La table `rdv_attente` n'a AUCUNE
// policy : cette route est la seule porte, derrière la garde commune.
//
// ⚠️ LE COMPTE NE PORTE AUCUN NOM. Les personnes d'UNE séance (prénom et
// téléphone, décision d'Alex du 04/10) ne sortent que par `liste`, quand la
// commerçante les demande, derrière la même garde que `prevenir`.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { refus } from '@/lib/api-auth'
import { gardeEquipe, gardeLigneEquipe } from '@/lib/equipe-server'
import { attentesDuCommerce, prevenirSurDemande, personnesDeLaSeance, prevenirLesSeancesDuCours } from '@/lib/attente-rdv-server'

const MESSAGES = {
  demande_invalide: 'Cette séance n’est pas reconnue.',
  seance_passee: 'Ce cours a déjà commencé : il n’y a plus personne à prévenir.',
  prestation_introuvable: 'Ce cours n’existe plus.',
  pas_un_cours: 'Seul un cours collectif se prévient d’ici.',
  complet: 'Le cours est encore complet : libère d’abord une place.',
  lecture_ko: 'Impossible de lire le cours pour le moment. Réessaie dans un instant.',
}

export async function POST(request) {
  try {
    const corps = await request.json().catch(() => ({}))
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    if (corps?.action === 'compter') {
      const garde = await gardeEquipe(request, admin, corps?.commercant_id, 'agenda')
      const nonAutorise = refus(garde, NextResponse)
      if (nonAutorise) return nonAutorise
      const comptes = await attentesDuCommerce(admin, corps.commercant_id)
      if (!comptes) return NextResponse.json({ ok: false, error: 'lecture_ko' }, { status: 500 })
      return NextResponse.json({ ok: true, ...comptes })
    }

    if (corps?.action === 'prevenir') {
      // ⚠️ LE COMMERCE VIENT DE LA PRESTATION, jamais du corps : la garde lit
      // à qui elle appartient avant d'autoriser quoi que ce soit.
      const garde = await gardeLigneEquipe(request, admin, 'rdv_prestations', corps?.prestation_id, 'agenda')
      const nonAutorise = refus(garde, NextResponse)
      if (nonAutorise) return nonAutorise
      const res = await prevenirSurDemande(admin, {
        prestationId: corps.prestation_id, dateRdv: corps.date_rdv, heureDebut: corps.heure_debut,
      })
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: MESSAGES[res.error] || 'Impossible de prévenir la file pour le moment.' }, { status: res.error === 'lecture_ko' ? 500 : 409 })
      }
      return NextResponse.json({ ok: true, prevenus: res.prevenus || 0, file: res.file || 0 })
    }

    // 🔴 UN COURS PREND DES PLACES (Audit 1 I7, 04/10) : chaque séance à venir
    // où quelqu'un attend est prévenue, si une place y est vraiment libre.
    if (corps?.action === 'prevenir-cours') {
      const gardeCours = await gardeLigneEquipe(request, admin, 'rdv_prestations', corps?.prestation_id, 'agenda')
      const nonAutorise = refus(gardeCours, NextResponse)
      if (nonAutorise) return nonAutorise
      const res = await prevenirLesSeancesDuCours(admin, corps.prestation_id)
      if (!res.ok) return NextResponse.json({ ok: false, error: MESSAGES[res.error] || 'Impossible de prévenir la file pour le moment.' }, { status: 500 })
      return NextResponse.json({ ok: true, prevenus: res.prevenus, seances: res.seances })
    }

    if (corps?.action === 'liste') {
      // ⚠️ DES DONNÉES PERSONNELLES : le commerce vient de la prestation,
      // jamais du corps, et seule la case agenda les ouvre.
      const gardeListe = await gardeLigneEquipe(request, admin, 'rdv_prestations', corps?.prestation_id, 'agenda')
      const nonAutorise = refus(gardeListe, NextResponse)
      if (nonAutorise) return nonAutorise
      const res = await personnesDeLaSeance(admin, {
        prestationId: corps.prestation_id, dateRdv: corps.date_rdv, heureDebut: corps.heure_debut,
      })
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: MESSAGES[res.error] || 'Impossible de lire la liste d’attente pour le moment.' }, { status: res.error === 'lecture_ko' ? 500 : 400 })
      }
      return NextResponse.json({ ok: true, personnes: res.personnes })
    }

    return NextResponse.json({ ok: false, error: 'Action inconnue.' }, { status: 400 })
  } catch (e) {
    console.error('[rdv/attente-commerce]', e)
    return NextResponse.json({ ok: false, error: 'Erreur serveur.' }, { status: 500 })
  }
}
