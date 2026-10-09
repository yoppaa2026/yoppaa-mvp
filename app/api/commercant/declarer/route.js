// POST /api/commercant/declarer
// Body : { commercant_id, version, texte, bce?, prenom?, nom? }
//
// LA DÉCLARATION SUR L'HONNEUR DU COMMERÇANT, ÉCRITE PAR LE SERVEUR (09/10,
// décision d'Alex : la carte d'identité disparaît, la déclaration la remplace).
//
// ⚠️ LE TITULAIRE DU COMPTE, ET LUI SEUL. L'administrateur ne passe PAS :
// déclarer sur l'honneur au nom de quelqu'un d'autre est exactement ce que la
// déclaration doit empêcher.
//
// ⚠️ LE TEXTE ENREGISTRÉ EST CELUI QUE L'ÉCRAN A MONTRÉ. Le serveur reconstruit
// le texte à partir de la fiche (`texteDeclaration`) et le compare à celui que
// l'écran a affiché : s'ils diffèrent (fiche modifiée dans un autre onglet,
// version périmée), il refuse. Sans ce contrôle, la preuve pourrait porter sur
// un numéro que la personne n'a jamais lu.
//
// ⚠️ LA FICHE FAIT FOI. Si le numéro et les noms y sont déjà, ce sont eux qui
// sont déclarés, quoi que dise la requête. Ceux qu'on envoie ne servent qu'à
// compléter une fiche ancienne à qui ils manquent.
//
// Ce qui est gardé (`declarations_honneur`) : le texte exact, le numéro, les
// noms, le nom du commerce, l'heure du serveur, l'adresse IP, le navigateur.
// Conservation : vie du compte + 5 ans.

import { NextResponse } from 'next/server'
import { utilisateurAppelant, clientAdmin } from '@/lib/api-auth'
import { validerBCE } from '@/lib/kyb'
import { DECLARATION_VERSION, texteDeclaration, origineRequete } from '@/lib/declaration'

export const dynamic = 'force-dynamic'

const nomValide = (s) => typeof s === 'string' && s.trim().length >= 2 && s.trim().length <= 80

export async function POST(request) {
  try {
    const user = await utilisateurAppelant(request)
    if (!user) return NextResponse.json({ ok: false, error: 'Session expirée, reconnecte-toi.' }, { status: 401 })

    const corps = await request.json().catch(() => ({}))
    const { commercant_id, version, texte } = corps || {}
    if (!commercant_id) return NextResponse.json({ ok: false, error: 'commercant_id requis' }, { status: 400 })
    if (version !== DECLARATION_VERSION) {
      return NextResponse.json({ ok: false, error: 'Le texte de la déclaration a été mis à jour : recharge la page pour lire la version en vigueur.' }, { status: 409 })
    }

    const admin = clientAdmin()
    const { data: fiche, error: errLecture } = await admin
      .from('commercants')
      .select('id, nom, auth_user_id, bce, representant_legal_prenom, representant_legal_nom')
      .eq('id', commercant_id)
      .maybeSingle()
    if (errLecture) return NextResponse.json({ ok: false, error: 'Lecture impossible, réessaie.' }, { status: 500 })
    // ⚠️ FICHE INTROUVABLE OU D'UN AUTRE : même refus, pas d'exception admin.
    if (!fiche || fiche.auth_user_id !== user.id) {
      return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })
    }

    // La fiche fait foi ; la requête ne complète que ce qui manque.
    const bceFiche = validerBCE(typeof fiche.bce === 'string' ? fiche.bce : '')
    const bceDemande = validerBCE(typeof corps.bce === 'string' ? corps.bce : '')
    const bce = bceFiche.valide ? bceFiche.raw : (bceDemande.valide ? bceDemande.raw : null)
    const nomsFiche = nomValide(fiche.representant_legal_prenom) && nomValide(fiche.representant_legal_nom)
    const prenom = nomsFiche ? fiche.representant_legal_prenom.trim() : (nomValide(corps.prenom) ? corps.prenom.trim() : null)
    const nom = nomsFiche ? fiche.representant_legal_nom.trim() : (nomValide(corps.nom) ? corps.nom.trim() : null)
    if (!bce) return NextResponse.json({ ok: false, error: 'Le numéro d’entreprise n’est pas valide : vérifie les chiffres.' }, { status: 400 })
    if (!prenom || !nom) return NextResponse.json({ ok: false, error: 'Indique le prénom et le nom du représentant légal.' }, { status: 400 })

    const texteServeur = texteDeclaration({ prenom, nom, bce, commerce: fiche.nom })
    if (!texteServeur || texte !== texteServeur) {
      return NextResponse.json({ ok: false, error: 'Les informations de ta fiche ont changé : relis la déclaration avant de la confirmer.' }, { status: 409 })
    }

    // Une fiche ancienne à qui il manquait le numéro ou les noms : on complète.
    const complement = {}
    if (!bceFiche.valide) complement.bce = bce
    if (!nomsFiche) { complement.representant_legal_prenom = prenom; complement.representant_legal_nom = nom }
    if (Object.keys(complement).length > 0) {
      const { error: errComp } = await admin.from('commercants').update(complement).eq('id', commercant_id)
      if (errComp) {
        const doublon = errComp.code === '23505'
        return NextResponse.json({
          ok: false,
          error: doublon
            ? 'Ce numéro d’entreprise est déjà associé à un autre compte Yoppaa. Contacte-nous si tu penses à une erreur.'
            : 'Enregistrement impossible, réessaie.',
        }, { status: doublon ? 409 : 500 })
      }
    }

    const maintenant = new Date().toISOString()
    const { ip, navigateur } = origineRequete(request.headers)
    // La preuve d'abord : une déclaration sans trace ne vaut rien, une trace
    // sans mise à jour de la fiche se rattrape à la connexion suivante.
    const { error: errJournal } = await admin.from('declarations_honneur').insert({
      commercant_id,
      auth_user_id: user.id,
      commerce_nom: fiche.nom,
      version: DECLARATION_VERSION,
      texte: texteServeur,
      bce,
      representant_prenom: prenom,
      representant_nom: nom,
      ip,
      navigateur,
      acceptee_at: maintenant,
    })
    if (errJournal) {
      console.error('[commercant/declarer] journal', errJournal.message)
      return NextResponse.json({ ok: false, error: 'Enregistrement impossible, réessaie.' }, { status: 500 })
    }

    const { error: errMaj } = await admin.from('commercants')
      .update({ declaration_version: DECLARATION_VERSION, declaration_acceptee_at: maintenant })
      .eq('id', commercant_id)
    if (errMaj) return NextResponse.json({ ok: false, error: 'Enregistrement impossible, réessaie.' }, { status: 500 })

    return NextResponse.json({
      ok: true,
      declaration_version: DECLARATION_VERSION,
      declaration_acceptee_at: maintenant,
      ...complement,
    })
  } catch (e) {
    console.error('[commercant/declarer] erreur', e?.message || e)
    return NextResponse.json({ ok: false, error: 'Erreur serveur, réessaie.' }, { status: 500 })
  }
}
