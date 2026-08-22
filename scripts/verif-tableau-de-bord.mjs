// BANC : les règles du tableau de bord commerçant.
//
// ⚠️ LES DEUX RÈGLES SONT PURES ET S'EXÉCUTENT ICI. Le branchement des écrans,
// lui, se vérifie au source EN DÉCOUPANT LA SECTION concernée.
//
//   npm run verif:bord

import { readFileSync } from 'node:fs'
import { retourArriereAutorise, alerteAutreOnglet, travailEnAttente } from '../lib/tableau-de-bord.js'

let ok = 0
const echecs = []
const verifie = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}

// ═══ 1) LE RETOUR ARRIÈRE, ET IL N'Y EN A QU'UN ═══════════════════════════
//
// ⚠️ CE BANC PROTÈGE SURTOUT CE QUI N'EST **PAS** OFFERT. Alex a demandé un
// retour arrière général, puis a demandé s'il était nécessaire avant que je
// code : trois des quatre transitions ne méritent pas de bouton, et l'une
// d'elles ferait un dégât de stock. Élargir la règle « pour bien faire » est
// donc le risque numéro un ici.
{
  const retrait = { statut: 'recupere', mode_retrait: 'retrait' }
  const r = retourArriereAutorise(retrait)
  verifie('un retrait récupéré se défait', !!r)
  verifie('et il revient en « prête »', r?.versStatut === 'pret', r?.versStatut)
  verifie('le bouton dit le geste, pas le statut',
    /Annuler le retrait/.test(r?.libelle || ''), r?.libelle)
  verifie('un retrait ne touche pas au statut de livraison', r?.effaceStatutLivraison === false)

  const liv = retourArriereAutorise({ statut: 'recupere', mode_retrait: 'livraison' })
  verifie('une livraison livrée se défait', !!liv)
  // ⚠️ SANS CECI, la commande redeviendrait active tout en restant hors de la
  // tournée : le commerçant la verrait sans jamais pouvoir la relivrer.
  verifie('et son statut de livraison est effacé', liv?.effaceStatutLivraison === true)
  verifie('son bouton parle de livraison', /Annuler la livraison/.test(liv?.libelle || ''), liv?.libelle)

  // 🔴 LES QUATRE REFUS, ET CHACUN A SA RAISON.
  verifie('🔴 « non retirée » ne se défait PAS (le stock a été rendu)',
    retourArriereAutorise({ statut: 'non_retire', mode_retrait: 'retrait' }) === null)
  verifie('🔴 une expédition ne se défait PAS (le colis est parti)',
    retourArriereAutorise({ statut: 'recupere', mode_retrait: 'expedition' }) === null)
  verifie('« prête » ne se défait pas (l\'email est déjà parti)',
    retourArriereAutorise({ statut: 'pret', mode_retrait: 'retrait' }) === null)
  verifie('« en préparation » non plus (un clic raté n\'y coûte rien)',
    retourArriereAutorise({ statut: 'en_preparation', mode_retrait: 'retrait' }) === null)
  verifie('une commande annulée ne revient pas',
    retourArriereAutorise({ statut: 'annule', mode_retrait: 'retrait' }) === null)
  verifie('aucun argument ne casse rien', retourArriereAutorise() === null)
  verifie('une commande absente non plus', retourArriereAutorise(null) === null)

  // ⚠️ ET LA RÈGLE NE DIT JAMAIS D'EFFACER L'ENCAISSEMENT. Si l'argent est
  // entré, la trace comptable reste : on ne supprime pas une écriture pour
  // réparer un clic. Le banc l'exige, parce que c'est le genre de champ qu'on
  // ajoute « pour faire propre » sans mesurer ce qu'on efface.
  const clefs = Object.keys(r || {})
  verifie('la règle ne touche jamais à l\'encaissement',
    !clefs.some(k => /encaisse/i.test(k)), clefs.join(', '))
}

// ═══ 2) « TU AS DU TAF DE L'AUTRE CÔTÉ » ══════════════════════════════════
{
  const cmds = [
    { mode_retrait: 'retrait',   statut: 'en_attente' },
    { mode_retrait: 'retrait',   statut: 'en_preparation' },
    { mode_retrait: 'retrait',   statut: 'pret' },          // attend LE CLIENT
    { mode_retrait: 'retrait',   statut: 'recupere' },      // terminée
    { mode_retrait: 'livraison', statut: 'en_attente' },
    // ⚠️ AJOUTÉE PARCE QUE LE BANC M'A REPRIS. J'attendais trois livraisons en
    // n'en mettant que deux dans le jeu d'essai : c'est mon ATTENTE qui était
    // fausse, pas le code. Plutôt que de baisser l'attente à deux, on couvre
    // le cas qui manquait vraiment, une livraison en préparation.
    { mode_retrait: 'livraison', statut: 'en_preparation' },
    { mode_retrait: 'livraison', statut: 'pret', statut_livraison: null },        // à charger
    { mode_retrait: 'livraison', statut: 'pret', statut_livraison: 'en_livraison' }, // partie
    { mode_retrait: 'livraison', statut: 'recupere', statut_livraison: 'livree' },
  ]

  verifie('le retrait compte ses deux gestes en attente', travailEnAttente(cmds, 'retrait') === 2,
    String(travailEnAttente(cmds, 'retrait')))
  // ⚠️ L'ASYMÉTRIE EST VOULUE : une livraison « prête » n'est pas terminée, le
  // sac est sur le comptoir et personne ne viendra le chercher. La compter
  // comme un retrait tairait la livraison au moment précis où il faut partir.
  verifie('la livraison en compte trois, dont la prête à charger',
    travailEnAttente(cmds, 'livraison') === 3, String(travailEnAttente(cmds, 'livraison')))

  // ⚠️ CE QUI NE RÉCLAME PLUS RIEN NE DOIT PAS ALERTER : envoyer le commerçant
  // voir pour ne rien trouver, c'est lui apprendre à ignorer la pastille.
  verifie('une commande terminée ne réclame rien',
    travailEnAttente([{ mode_retrait: 'retrait', statut: 'recupere' }], 'retrait') === 0)
  verifie('une livraison déjà partie non plus',
    travailEnAttente([{ mode_retrait: 'livraison', statut: 'pret', statut_livraison: 'en_livraison' }], 'livraison') === 0)

  const surRetrait = alerteAutreOnglet(cmds, 'retrait')
  verifie('depuis le retrait, l\'alerte parle de LIVRAISON', surRetrait?.mode === 'livraison', surRetrait?.mode)
  verifie('elle donne le nombre', surRetrait?.nb === 3, String(surRetrait?.nb))
  verifie('et le texte le porte', /3 livraisons/.test(surRetrait?.texte || ''), surRetrait?.texte)

  const surLivraison = alerteAutreOnglet(cmds, 'livraison')
  verifie('depuis la livraison, elle parle de RETRAIT', surLivraison?.mode === 'retrait', surLivraison?.mode)
  // ⚠️ LES DEUX BRANCHES, MESURÉ. Le banc ne jugeait que le texte de la
  // livraison : en vidant celui du retrait de son nombre, il restait VERT.
  // Deux textes symétriques se vérifient tous les deux, sinon l'un des deux
  // dérive en silence (reference_tests_faussement_verts, « chercher au lieu de
  // compter »).
  verifie('et son texte porte AUSSI le nombre',
    /2 commandes à retirer/.test(surLivraison?.texte || ''), surLivraison?.texte)
  verifie('son singulier est respecté aussi',
    /^1 commande à retirer t/.test(alerteAutreOnglet([{ mode_retrait: 'retrait', statut: 'en_attente' }], 'livraison')?.texte || ''))
  verifie('le singulier est respecté',
    /^1 livraison t/.test(alerteAutreOnglet([{ mode_retrait: 'livraison', statut: 'en_attente' }], 'retrait')?.texte || ''))

  // ⚠️ ON N'ALERTE JAMAIS SUR L'ONGLET OUVERT. Ce qu'il a sous les yeux n'a
  // pas besoin d'une pastille, et une alerte sur la vue courante apprend à
  // ignorer les alertes.
  verifie('rien à faire ailleurs → aucune alerte',
    alerteAutreOnglet([{ mode_retrait: 'retrait', statut: 'en_attente' }], 'retrait') === null)
  verifie('liste vide → aucune alerte', alerteAutreOnglet([], 'retrait') === null)
  verifie('liste absente → aucune alerte', alerteAutreOnglet(null, 'retrait') === null)
  verifie('une entrée nulle ne casse pas le compte',
    travailEnAttente([null, { mode_retrait: 'retrait', statut: 'en_attente' }], 'retrait') === 1)
}

// ═══ 3) LE BRANCHEMENT, ET SES TROIS PRÉCAUTIONS ══════════════════════════
{
  const src = readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

  const debut = src.indexOf('async function annulerRemise')
  const corps = debut === -1 ? '' : src.slice(debut, src.indexOf('\n  }', debut))
  verifie('le corps de l\'annulation se découpe', corps.length > 200)

  // ⚠️ IL RELIT LA RÈGLE, IL NE LA REFAIT PAS. Une seconde copie finirait par
  // autoriser le retour depuis « non retirée », qui rendrait le stock deux fois.
  verifie('l\'annulation consulte la règle partagée', /retourArriereAutorise\(commande\)/.test(corps))
  verifie('et renonce quand elle refuse', /if \(!regle\) return/.test(corps))

  // 🔴 LA PRÉCAUTION QUI COMPTE : l'écriture est filtrée sur l'ancien statut,
  // donc deux taps rapides ou deux onglets ouverts ne peuvent pas la rejouer.
  verifie('🔴 l\'écriture est filtrée sur l\'ancien statut',
    /\.eq\('statut', 'recupere'\)/.test(corps), 'un double tap pourrait rejouer l\'annulation')
  verifie('et une écriture sans effet ne touche pas l\'écran',
    /if \(!data \|\| data\.length === 0\) return/.test(corps))
  // L'encaissement n'est jamais effacé, même ici.
  verifie('l\'annulation n\'efface pas l\'encaissement', !/encaisse_mode: null/.test(corps))

  // Le bouton ne vit que dans le filtre « Récupérées ».
  verifie('le retour arrière n\'apparaît que dans les récupérées',
    /filtreCourant === 'recupere' && retourArriereAutorise\(commande\)/.test(src))

  // La pastille ne s'allume que sur l'onglet qu'il ne regarde pas.
  verifie('l\'alerte inter-onglets est branchée',
    /alerteAutreOnglet\(commandesDuJourTous, vueMode\)/.test(src))
  verifie('la pastille ne s\'affiche que sur l\'AUTRE onglet',
    /alerte\?\.mode === m\.v &&/.test(src))
}

console.log(`\nTableau de bord : ${ok} vérifications`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
