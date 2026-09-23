// BANC : les règles du tableau de bord commerçant.
//
// ⚠️ LES DEUX RÈGLES SONT PURES ET S'EXÉCUTENT ICI. Le branchement des écrans,
// lui, se vérifie au source EN DÉCOUPANT LA SECTION concernée.
//
//   npm run verif:bord

import { readFileSync } from 'node:fs'
// ⚠️ LE DÉPOUILLEUR PARTAGÉ, jamais une expression écrite à la main : un `/*`
// dans un `//` avalait deux mille caractères en silence et rendait les bancs
// aveugles (03/09).
import { sansProse } from './lire-code.mjs'
import { retourArriereAutorise, alerteAutreOnglet, travailEnAttente, indexBlocages, appliquerBlocage, etatCreneau, ongletDouverture } from '../lib/tableau-de-bord.js'
import { calculerCapaciteCreneau } from '../lib/creneaux.js'
import { chiffreAffaires } from '../lib/statistiques.js'

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

  // ⚠️ 🔴 LE RELEVÉ DU COMPTOIR S'EFFACE, ET J'AVAIS TRANCHÉ L'INVERSE.
  // Alex l'a vu à l'essai le 23/08 : la commande revenait dans la liste « à
  // remettre » en restant marquée PAYÉE. Il n'y a qu'UN clic — la fenêtre
  // d'encaissement s'ouvre AU MOMENT de la remise depuis le 17/08 — donc un
  // clic raté emporte forcément une réponse ratée sur le paiement.
  verifie('🔴 un relevé au comptoir s\'efface avec la remise',
    retourArriereAutorise({ statut: 'recupere', mode_retrait: 'retrait', encaisse_mode: 'especes' })
      ?.effaceEncaissement === true)
  verifie('🔴 un paiement par terminal aussi',
    retourArriereAutorise({ statut: 'recupere', mode_retrait: 'retrait', encaisse_mode: 'terminal' })
      ?.effaceEncaissement === true)
  // ⚠️ `'rien'` EST UNE RÉPONSE, PAS UNE ABSENCE : c'est l'impayé assumé. Elle
  // a été donnée sur le même clic raté, elle part avec.
  verifie('un impayé assumé s\'efface aussi',
    retourArriereAutorise({ statut: 'recupere', mode_retrait: 'retrait', encaisse_mode: 'rien' })
      ?.effaceEncaissement === true)
  verifie('sans relevé, il n\'y a rien à effacer', r?.effaceEncaissement === false)
  // ⚠️ ET UNE LIVRAISON RÉGLÉE AU LIVREUR SUIT LA MÊME RÈGLE, sans quoi le cas
  // le plus exposé — le liquide, loin du comptoir — serait le seul oublié.
  verifie('une livraison encaissée au livreur s\'efface aussi',
    retourArriereAutorise({ statut: 'recupere', mode_retrait: 'livraison', encaisse_mode: 'especes' })
      ?.effaceEncaissement === true)

  // ⚠️ ET L'AIDE DIT CE QUE ÇA EFFACE. Une conséquence sur l'argent ne se
  // découvre pas après coup (feedback_information_complete). Mais elle ne
  // s'affiche pas quand il n'y a rien à effacer : elle inquiéterait pour rien.
  const aideAvec = retourArriereAutorise({ statut: 'recupere', mode_retrait: 'retrait', encaisse_mode: 'especes' })?.aide || ''
  verifie('l\'aide annonce ce que le retour efface', /relevé au comptoir est effacé/.test(aideAvec), aideAvec)
  verifie('et elle dit que la question se reposera', /se reposera/.test(aideAvec))
  verifie('sans relevé, l\'aide ne parle pas d\'argent', !/comptoir/.test(r?.aide || ''), r?.aide)

  // ⚠️ 🔴 LE PAIEMENT EN LIGNE N'EST JAMAIS TOUCHÉ. L'argent est chez Stripe,
  // il ne doit rien à ce clic. La règle ne doit même pas nommer ce champ.
  verifie('🔴 la règle ne parle JAMAIS du paiement en ligne',
    !Object.keys(r || {}).some(k => /ligne|stripe/i.test(k)),
    Object.keys(r || {}).join(', '))
  verifie('🔴 et une commande payée en ligne sans relevé n\'efface rien',
    retourArriereAutorise({ statut: 'recupere', mode_retrait: 'retrait', paye_en_ligne: true })
      ?.effaceEncaissement === false)
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
  // ⚠️ LES TROIS COLONNES DU RELEVÉ PARTENT ENSEMBLE. En laisser une seule
  // suffirait à mentir : un montant sans moyen, ou une date sans montant, et
  // le journal comptable garde une vente qui n'a pas eu lieu.
  verifie('🔴 le moyen relevé au comptoir est effacé', /patch\.encaisse_mode = null/.test(corps))
  verifie('🔴 le montant aussi', /patch\.encaisse_montant = null/.test(corps))
  verifie('🔴 et la date aussi', /patch\.encaisse_le = null/.test(corps))
  verifie('mais seulement quand la règle le dit', /if \(regle\.effaceEncaissement\) \{/.test(corps),
    'l\'effacement s\'appliquerait même sans relevé')
  // ⚠️ 🔴 ET JAMAIS LE PAIEMENT EN LIGNE : l'argent est chez Stripe, il ne doit
  // rien à ce clic. Ce champ ne doit pas être ÉCRIT ici.
  //
  // ⚠️ ANCRÉE SUR L'AFFECTATION, PAS SUR LE MOT — QUATRIÈME FOIS EN TROIS
  // JOURS. Écrite `!/paye_en_ligne/`, cette garde rougissait sur le COMMENTAIRE
  // qui explique précisément cette règle. La parade n'est jamais de retirer le
  // commentaire, c'est d'exiger une forme que la prose ne produit pas : une
  // affectation ou une clé d'objet (reference_tests_faussement_verts).
  verifie('🔴 le paiement en ligne n\'est JAMAIS écrit ici',
    !/paye_en_ligne\s*[:=]/.test(corps), 'une écriture toucherait à l\'argent de Stripe')

  // Le bouton ne vit que dans le filtre « Récupérées ».
  verifie('le retour arrière n\'apparaît que dans les récupérées',
    /filtreCourant === 'recupere' && retourArriereAutorise\(commande\)/.test(src))

  // La pastille ne s'allume que sur l'onglet qu'il ne regarde pas.
  verifie('l\'alerte inter-onglets est branchée',
    /alerteAutreOnglet\(commandesDuJourTous, vueMode\)/.test(src))
  verifie('la pastille ne s\'affiche que sur l\'AUTRE onglet',
    /alerte\?\.mode === m\.v &&/.test(src))
}

// ═══ 4) LE CRÉNEAU FERMÉ À LA VOLÉE ══════════════════════════════════════
{
  const blocages = [
    { creneau_id: 'A', date_blocage: '2026-08-22' },
    { creneau_id: 'B', date_blocage: '2026-08-23' },
  ]
  const idx = indexBlocages(blocages.filter(b => b.date_blocage === '2026-08-22'))
  verifie('le créneau fermé ce jour-là est reconnu', idx.has('A'))
  // ⚠️ UN BLOCAGE VAUT POUR UN JOUR, PAS POUR LE MODÈLE. `creneaux` décrit une
  // SEMAINE TYPE : sans ce filtrage par date, fermer « vendredi 16 h 15 » le
  // fermerait tous les vendredis, et le commerçant ne le découvrirait que la
  // semaine suivante.
  verifie('celui d\'un autre jour ne l\'est pas', !idx.has('B'))
  verifie('liste vide → aucun blocage', indexBlocages([]).size === 0)
  verifie('liste absente → aucun blocage', indexBlocages(null).size === 0)
  verifie('une entrée sans créneau est ignorée', indexBlocages([{ date_blocage: 'x' }]).size === 0)

  const libre = { capacite: 5, utilise: 2, utiliseEff: 2, complet: false, places: 3, bientot: false, presque: true }
  const ferme = appliquerBlocage(libre, true)
  // ⚠️ LA RÈGLE D'ALEX : « si des commandes sont déjà présentes, elles restent,
  // il bloque la capacité restante ». Le blocage NE TOUCHE PAS au réalisé.
  verifie('🔴 les commandes déjà prises restent comptées', ferme.utiliseEff === 2, String(ferme.utiliseEff))
  verifie('🔴 et la capacité affichée ne change pas', ferme.capacite === 5, String(ferme.capacite))
  verifie('mais il ne reste plus une place', ferme.places === 0, String(ferme.places))
  verifie('le créneau est clos pour la suite', ferme.complet === true)
  // Les états intermédiaires n'ont plus de sens sur un créneau fermé.
  verifie('« presque plein » s\'efface', ferme.presque === false)
  verifie('« bientôt plein » aussi', ferme.bientot === false)

  const ouvert = appliquerBlocage(libre, false)
  verifie('sans blocage, rien ne bouge', ouvert.complet === false && ouvert.places === 3)
  verifie('et le drapeau est explicitement faux', ouvert.bloque === false)
  verifie('une capacité absente ne casse rien', appliquerBlocage(null, true) === null)

  // ⚠️ « FERMÉ » ET « COMPLET » NE DISENT PAS LA MÊME CHOSE. Complet veut dire
  // que ses clients ont rempli, fermé qu'il a fermé LUI-MÊME. Les confondre,
  // c'est lui faire chercher des commandes qui n'existent pas.
  verifie('un créneau fermé le dit', etatCreneau(ferme) === 'Fermé par toi', etatCreneau(ferme))
  verifie('un créneau plein dit autre chose',
    etatCreneau({ complet: true, utiliseEff: 5 }) === 'Complet')
  verifie('les deux libellés diffèrent',
    etatCreneau(ferme) !== etatCreneau({ complet: true, utiliseEff: 5 }))
  verifie('un créneau vide est « Libre »', etatCreneau({ utiliseEff: 0 }) === 'Libre')
  verifie('un créneau entamé a « De la place »', etatCreneau({ utiliseEff: 1 }) === 'De la place')

  // ⚠️ CÔTÉ YOPPER, UN CRÉNEAU FERMÉ EST UN CRÉNEAU COMPLET (Alex, 23/08).
  // La règle descend dans le calcul de capacité : la fiche n'a rien à savoir
  // des blocages, elle lit `complet` comme pour n'importe quel créneau plein.
  // C'est aussi ce qui garantit que les deux écrans ne divergeront pas.
  const capFermee = calculerCapaciteCreneau({ max_commandes: 5, count: 2, bloque: true })
  verifie('🔴 un créneau fermé se rend COMPLET au client', capFermee.complet === true)
  verifie('🔴 sans effacer les commandes déjà prises', capFermee.utiliseEff === 2, String(capFermee.utiliseEff))
  verifie('et sans laisser une seule place', capFermee.places === 0, String(capFermee.places))
  verifie('« dernière place » ne s\'affiche pas dessus',
    capFermee.bientot === false && capFermee.presque === false)

  const capOuverte = calculerCapaciteCreneau({ max_commandes: 5, count: 2 })
  verifie('un créneau sans drapeau reste ouvert',
    capOuverte.complet === false && capOuverte.bloque === false)
  // ⚠️ LE DÉFAUT DOIT ÊTRE SÛR : les tournées de livraison passent par la même
  // fonction sans jamais connaître les blocages, qui ne valent que pour le
  // retrait. Une absence, ou toute valeur qui n'est pas exactement `true`, ne
  // doit fermer rien du tout (reference_deux_formes_absence).
  verifie('un drapeau absent ne ferme rien',
    calculerCapaciteCreneau({ max_commandes: 5, count: 0, bloque: undefined }).complet === false)
  verifie('un drapeau nul non plus',
    calculerCapaciteCreneau({ max_commandes: 5, count: 0, bloque: null }).complet === false)
  verifie('et une valeur qui n\'est pas `true` non plus',
    calculerCapaciteCreneau({ max_commandes: 5, count: 0, bloque: 'non' }).complet === false)
}

// ═══ 5) 🔴 LA BARRIÈRE EST SERVEUR, PAS ÉCRAN ════════════════════════════
//
// ⚠️ C'EST LA RAISON D'ÊTRE DE LA FONCTIONNALITÉ. Le commerçant ferme parce
// qu'il est débordé. Si seule la fiche cachait le créneau, un onglet ouvert
// depuis dix minutes ferait tomber exactement la commande qu'il vient de
// refuser. Une garde d'écran n'est jamais une réponse.
{
  const route = readFileSync(new URL('../app/api/stripe/checkout/create-commande/route.js', import.meta.url), 'utf8')
  const debut = route.indexOf('4.6) LE CRÉNEAU FERMÉ')
  const bloc = debut === -1 ? '' : route.slice(debut, route.indexOf('4.7)', debut))
  verifie('la garde serveur se découpe', bloc.length > 300)
  verifie('🔴 le serveur interroge les blocages', /from\('creneaux_blocages'\)/.test(bloc))
  verifie('🔴 pour CE créneau et CE jour',
    /\.eq\('creneau_id', creneau\.id\)/.test(bloc) && /\.eq\('date_blocage', date_commande\)/.test(bloc))
  verifie('🔴 et il refuse la commande', /status: 409/.test(bloc))
  // ⚠️ MESURÉ : les gardes ci-dessus jugeaient la REQUÊTE et le CODE DE REFUS,
  // pas la CONDITION entre les deux. En neutralisant le `if`, le serveur
  // laissait passer et le banc restait vert : la requête partait toujours, le
  // 409 était toujours écrit, il n'était simplement plus jamais atteint.
  // C'est « l'appel est écrit, son résultat ne sert pas ».
  verifie('🔴 et le refus est réellement déclenché par le blocage',
    /if \(blocage\) \{/.test(bloc), 'la condition de refus a disparu')
  // ⚠️ La note interne du commerçant ne doit pas partir au client : il n'a pas
  // à se justifier, on dit le fait, pas la raison.
  //
  // ⚠️ ANCRÉ SUR L'INTERPOLATION, PAS SUR LE MOT. Une garde qui cherchait le
  // mot seul rougissait sur le COMMENTAIRE qui explique cette règle — le même
  // piège que ce matin dans `create-commande`, et la troisième fois de la
  // journée. Un `${blocage…}` ne peut apparaître que dans du code.
  verifie('le refus ne renvoie rien de la ligne de blocage', !/\$\{blocage/.test(bloc))
  verifie('et il ne lit que l\'existence du blocage', /\.select\('id'\)/.test(bloc))

  const fiche = readFileSync(new URL('../app/commander/[slug]/page.js', import.meta.url), 'utf8')
  // ⚠️ IL S'AFFICHE COMPLET, IL NE DISPARAÎT PLUS (Alex, 23/08, après essai) :
  // un créneau retiré de la grille est indiscernable d'un créneau qui n'a
  // jamais existé, et le client en conclut que le commerce n'ouvre pas.
  verifie('la fiche MARQUE le créneau fermé', /bloque: fermesCeJour\.has\(cr\.id\)/.test(fiche))
  verifie('🔴 et elle ne le retire plus de la grille',
    !/filter\(cr => !fermesCeJour\.has/.test(fiche), 'le créneau redisparaîtrait')
  verifie('et elle le marque PAR JOUR', /=== jourISO/.test(fiche))

  // ⚠️ LES TROIS MAILLONS DU BRANCHEMENT, ET C'EST LÀ QUE LE DÉFAUT VIVAIT.
  // Le filtre était juste, testé, et parfaitement INERTE : les blocages étaient
  // lus en base, rangés dans le cache, et l'état ne les recevait jamais. La
  // garde d'avant vérifiait la PIÈCE, pas son BRANCHEMENT — c'est Alex qui l'a
  // vu à l'écran (reference_colonne_absente_du_select).
  verifie('🔴 les blocages lus en base arrivent dans l\'état',
    /setBlocagesCreneaux\(data\.blocagesCreneaux \|\| \[\]\)/.test(fiche),
    'l\'état resterait vide, le marquage serait inerte')
  verifie('🔴 et ils sont passés EN CLAIR au premier calcul',
    /buildJoursDispos\(data\.commercant, data\.creneaux, data\.fermetures, data\.chargeCreneaux \|\| \{\}, data\.blocagesCreneaux \|\| \[\]\)/.test(fiche),
    'setState ne vaut qu\'au rendu suivant, le calcul lirait l\'ancien tableau vide')
  verifie('🔴 et le calendrier se recalcule quand ils changent',
    /\}, \[commercant, creneaux, fermetures, chargeCreneaux, blocagesCreneaux\]\)/.test(fiche),
    'le calendrier garderait son calcul d\'avant')

  // ⚠️ SÉCURITÉ : `creneaux_blocages` est lisible par `anon` (la policy large
  // est la seule qui marche pour la fiche publique). Le `motif` est une note
  // que le commerçant écrit POUR LUI — « je suis débordé », « je pars tôt ».
  // La fiche ne doit demander que ce dont elle a besoin.
  verifie('la fiche ne rapatrie PAS le motif interne du commerçant',
    /from\('creneaux_blocages'\)\.select\('creneau_id, date_blocage'\)/.test(fiche),
    'le motif partirait dans le navigateur du client')

  const dash = readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8')
  const bascule = dash.slice(dash.indexOf('async function basculerBlocageCreneau'), dash.indexOf('async function annulerRemise'))
  verifie('le geste de bascule se découpe', bascule.length > 300)
  // ⚠️ AUCUNE COMMANDE N'EST TOUCHÉE PAR CE GESTE : il n'écrit que dans la
  // table des blocages. C'est la règle d'Alex, et le banc l'exige.
  verifie('🔴 le blocage ne touche AUCUNE commande', !/from\('commandes'\)/.test(bascule))
  verifie('il n\'écrit que dans la table des blocages', /from\('creneaux_blocages'\)/.test(bascule))
  // Deux taps rapides, ou deux appareils : la contrainte d'unicité renvoie
  // 23505, et ce n'est pas une erreur à montrer.
  verifie('un double tap n\'affiche pas d\'erreur', /error\.code !== '23505'/.test(bascule))
  verifie('l\'état se relit en base après écriture', /chargerBlocages\(commercant\.id\)/.test(bascule))

  // ⚠️ CES DEUX GARDES MANQUAIENT, ET LA MUTATION LES A RÉCLAMÉES. Sans elles,
  // le blocage pouvait valoir pour TOUS LES JOURS, ou n'être plus appliqué du
  // tout au remplissage, sans que rien ne rougisse.
  verifie('🔴 le blocage est filtré sur LE JOUR AFFICHÉ',
    /indexBlocages\(blocages\.filter\(b => b\.date_blocage === jourActif\)\)/.test(dash),
    'un blocage vaudrait pour tous les jours')
  verifie('et il est bien appliqué au remplissage',
    /appliquerBlocage\(c, blocagesDuJour\.has\(c\.creneau\?\.id\)\)/.test(dash))
}

// 🔴 LE TOTAL S'AFFICHAIT ICI, À LA LIGNE 367 D'UN BANC QUI EN FAIT 580. Les
// deux cents vérifications suivantes tournaient et pouvaient rougir, mais elles
// n'étaient PAS COMPTÉES : le banc annonçait « 100 vérifications » et en faisait
// bien davantage. ⚠️ Un banc qui annonce son total avant d'avoir fini ment sur
// son propre travail, et c'est ce chiffre-là qu'on recopie dans un commit.
// Trouvé le 06/09 en ajoutant cinq gardes qui n'ont pas fait bouger le total.

// ═══ LES ONGLETS : LE SEGMENT DÉCIDE QU'ILS EXISTENT, LE FORFAIT LEUR ÉTAT ══
//
// ⚠️ CE QUE CES GARDES PROTÈGENT N'EST PAS UNE FORME MAIS DEUX RÈGLES.
// Avant le 26/08, un onglet hors forfait n'était pas grisé, il était ABSENT :
// le commerçant en Exister ne savait même pas que la fidélité existait.
// Alex : « tous les onglets du segment affichés, grisés si besoin, ça montre
// l'ampleur des possibilités et ça donne envie ».
//
// Le COMPORTEMENT des quatre états est prouvé par exécution dans
// scripts/verif-plans.mjs. Ici on vérifie seulement que l'écran s'y branche.
{
  // ⚠️ LES COMMENTAIRES SONT RETIRÉS, ET C'EST LA LEÇON DU MATIN MÊME.
  // Le scanner de scripts/verif-plans.mjs prenait un appel CITÉ EN EXEMPLE
  // dans un commentaire pour un vrai appel. Le symptôme est bénin — une garde
  // qui rougit à tort — mais la maladie ne l'est pas : dans l'autre sens, un
  // appel MIS EN COMMENTAIRE validait une garde, et c'est la famille des tests
  // faussement verts. Une date écrite dans un commentaire ne ment à personne ;
  // la même date dans une chaîne affichée, si.
  const sansCommentaires = (src) => src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(l => (/^\s*\/\//.test(l) ? '' : l)).join('\n')
  const cfg = sansCommentaires(readFileSync(new URL('../app/dashboard/ConfigDashboard.js', import.meta.url), 'utf8'))
  const bord = sansCommentaires(readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8'))

  // ═══════════════════════════════════════════════════════════════════════
  // LE CATALOGUE NE PROMET QUE CE QU'IL CONTIENT (Alex, 06/09)
  // ═══════════════════════════════════════════════════════════════════════
  //
  // 🔴 LE SOUS-ONGLET S'APPELAIT « PRESTATIONS ET PRODUITS » ET NE LISAIT QUE
  // `articles`. Les prestations vivent dans `rdv_prestations`, sous Prise de
  // RDV. Et cette barre ne s'affiche QUE si le commerce a la prise de
  // rendez-vous : le titre ne se montrait donc qu'à ceux qui ont des
  // prestations, les seuls à qui il promettait quelque chose d'absent.
  verifie('🔴 le catalogue ne promet plus les prestations qu’il ne montre pas',
    !/label: 'Prestations et produits'/.test(cfg),
    'le sous-onglet annonce des prestations que `articles` ne contient pas')

  // ⚠️ ET IL MONTRE LA PORTE. Un titre juste mais muet laisse le commerçant
  // chercher : il vient d'apprendre qu'elles ne sont pas là, il ne sait
  // toujours pas où elles sont.
  verifie('et il dit où les prestations se règlent',
    /Tes prestations se règlent dans <strong>Prise de RDV<\/strong>/.test(cfg))

  // 🔴 LA GARDE QUI COMPTE : que l'onglet visé EXISTE. Renommer l'identifiant
  // de l'onglet sans toucher ce renvoi rendrait le bouton mort en silence — il
  // resterait cliquable et ne ferait rien.
  //
  // ⚠️ ON DÉCOUPE LA FONCTION, ON NE MESURE PAS UNE DISTANCE. Une première
  // version cherchait `onAllerA('…')` à moins de deux cents caractères du
  // libellé du bouton : elle a rougi sur la longueur d'un attribut de style,
  // c'est-à-dire sur rien. Ce projet s'est déjà fait prendre à mesurer un
  // écart entre deux lignes plutôt qu'un fait.
  const iCat = cfg.indexOf('function TabCatalogue(')
  const finCat = cfg.indexOf('\nfunction ', iCat + 1)
  const blocCat = iCat === -1 ? '' : cfg.slice(iCat, finCat === -1 ? undefined : finCat)
  verifie('le bloc du catalogue se découpe', blocCat.length > 500, String(blocCat.length))
  const cibleRenvoi = (blocCat.match(/onAllerA\('([a-z-]+)'\)/) || [])[1]
  // ⚠️ ON CHERCHE L'IDENTIFIANT, PAS LE LIBELLÉ (09/09). Cette garde exigeait
  // `label: 'Prise de RDV'` : le jour où ce nom a suivi le métier — un
  // restaurateur cherche « Réservations », pas un rendez-vous — elle a rougi
  // sur un renvoi parfaitement valable. Un libellé change, un identifiant non,
  // et c'est l'identifiant que le renvoi vise.
  // 🔴 PRÉCISÉE LE 11/09 : UN SOUS-ONGLET N'EST PAS UN ONGLET. Cette garde
  // acceptait tout `{ id: '…', label:` du fichier, y compris les sous-onglets
  // de l'agenda (« prestations », « praticiens »). La mutation qui envoyait le
  // renvoi vers « prestations » restait verte : `changerOnglet` ne connaît que
  // la barre du haut, et le bouton n'aurait rien ouvert. Les onglets de la barre
  // portent une icône, les sous-onglets non : c'est elle qu'on exige.
  verifie('🔴 le renvoi vise un onglet qui existe vraiment',
    !!cibleRenvoi && new RegExp(`\\{ id: '${cibleRenvoi}', label: [^\\n]*?icon: '`).test(cfg),
    `« ${cibleRenvoi} » ne correspond à aucun onglet de la barre`)

  // ⚠️ ET IL EMPRUNTE LA PORTE DE LA BARRE D'ONGLETS, comme le renvoi du
  // générateur : `changerOnglet` refuse un onglet hors forfait en ouvrant la
  // proposition et retient un formulaire non enregistré. `setTab` ferait ni
  // l'un ni l'autre.
  verifie('🔴 le renvoi du catalogue emprunte `changerOnglet`',
    /<TabCatalogue[^>]*onAllerA=\{changerOnglet\}/.test(cfg))

  // ═══════════════════════════════════════════════════════════════════════
  // LE DÉROULANT DE CIBLE D'UN DEAL NE PROMET QUE CE QU'IL CONTIENT (06/09)
  // ═══════════════════════════════════════════════════════════════════════
  //
  // 🔴 SUR « PRIX PROMO » LE LIBELLÉ DISAIT « ARTICLE CONCERNÉ » pendant que le
  // menu proposait aussi les catégories et les prestations : le branchement ne
  // connaissait que `remise_pct` et `bundle`.
  //
  // ⚠️ LE COMPORTEMENT EST PROUVÉ PAR EXÉCUTION dans `verif-logique.mjs`, où
  // `libelleCibleDeal` est appelée sur douze cas. Ici on vérifie seulement que
  // l'écran s'en sert au lieu de réécrire la règle dans son coin — deux gardes
  // pour deux endroits, parce qu'une garde qui mesure le module ne dit rien de
  // l'écran.
  verifie('🔴 le libellé de la cible vient du module',
    /<label style=\{s\.label\}>\{cibleDeal\.label\}<\/label>/.test(cfg),
    'l’écran réécrirait une règle qui se mesure ailleurs')
  verifie('🔴 et la première ligne du menu aussi',
    /<option value="">\{cibleDeal\.optionGenerale\}<\/option>/.test(cfg))
  // ⚠️ ET IL LUI PASSE CE QUI EXISTE VRAIMENT : sans ces trois-là, le libellé
  // annoncerait des cibles absentes du menu.
  verifie('et il lui passe ce que le commerçant a réellement',
    /aProduits: articlesLiables\.length > 0,/.test(cfg)
    && /aCategories: categoriesLiables\.length > 0,/.test(cfg)
    && /aPrestations: prestationsLiables\.length > 0,/.test(cfg))

  // ⚠️ RÈGLE 1 — UN DROIT NE SE CALCULE JAMAIS SUR UN `.plan` DÉTACHÉ.
  // C'est en détachant le plan de son commerçant qu'on perd `created_at`, donc
  // l'essai en cours, et qu'un commerçant se retrouve privé en silence de ce
  // qu'il vient d'activer. Le défaut « colonne absente du select », septième
  // occurrence du projet, prend exactement cette forme.
  verifie("le tableau de bord ne décide aucun droit sur un plan détaché",
    !/canDo\((?:commercant\??\.|form\.)plan\b/.test(cfg + bord),
    'un canDo(x.plan, …) subsiste')

  // ⚠️ RÈGLE 2 — CE QUI EST SANS OBJET DISPARAÎT, LE RESTE NE DISPARAÎT PLUS.
  // Un boulanger ne doit jamais voir « Prise de RDV », même grisée : ce n'est
  // pas une question d'argent, et la lui montrer serait lui promettre ce qui
  // n'arrivera pas, quel que soit son chèque.
  verifie("la liste d'onglets ne retire que ce qui est sans objet",
    /\.filter\(t => t\.etat !== null\)/.test(cfg))
  verifie("et l'état de chaque onglet vient de la matrice, pas d'un booléen maison",
    /etat: t\.feature \? etatDe\(t\.feature\) : FONCTION_INCLUSE/.test(cfg))

  // ⚠️ RÈGLE 3 — PENDANT SA PÉRIODE, RIEN N'EST VERROUILLÉ.
  // Un cadenas dit « tu n'as pas payé ». C'est la leçon des pastilles grises
  // retirées de la fiche publique le 03/08 : ce qui est gris ne se lit pas
  // comme un tarif, ça se lit comme un jugement. Il n'apparaît donc qu'une
  // fois la période passée.
  verifie('le cadenas ne se pose que sur une fonction fermée',
    /const ferme = t\.etat === FONCTION_FERMEE/.test(cfg)
    && /ferme\s*\n?\s*\? <Lock/.test(cfg))
  // ⚠️ UNE SECONDE GARDE A ÉTÉ ÉCRITE PUIS RETIRÉE ICI, VOLONTAIREMENT.
  // Elle cherchait `<Lock` dans les 120 caractères suivant
  // FONCTION_ESSAI_POSSIBLE : c'est la « fenêtre qui lit chez le voisin »,
  // piège consigné le 15/08, qui rougit ou verdit au gré d'une accolade
  // déplacée. La règle est déjà portée par la ligne ci-dessus, et le
  // comportement des quatre états par verif-plans. On ne rafistole pas une
  // garde fragile, on la retire.

  // ⚠️ RÈGLE 4 — LA GARDE D'ÉCRAN N'EST JAMAIS UNE RÉPONSE À ELLE SEULE.
  // Griser un onglet n'empêche rien : `tab` peut venir d'un raccourci, d'une
  // URL, d'un état resté en mémoire. Ce sont ces conditions-ci qui empêchent
  // vraiment le contenu de s'afficher.
  for (const [onglet, fonction] of [
    ['fidelite', 'fidelite'], ['bons', 'bons_cadeaux'],
    ['comptabilite', 'export_comptable'], ['deals', 'deals'],
  ]) {
    verifie(`le contenu de l'onglet « ${onglet} » reste gardé au rendu`,
      new RegExp(`tab === '${onglet}'[^\\n]*peut\\(commercant, '${fonction}'\\)`).test(cfg))
  }

  // ⚠️ RÈGLE 5 — LA DATE ANNONCÉE EST LA SIENNE, JAMAIS UNE DATE ÉCRITE À LA
  // MAIN. Celui qui s'inscrira en mars aura trente jours, pas cent. Et c'est
  // le DERNIER JOUR GRATUIT qu'on annonce : « offert jusqu'au 9 janvier »
  // serait faux d'une journée, distinction gardée depuis le 20/08.
  verifie("le bandeau d'essai calcule la date de fin",
    /libelleDernierJourGratuit\(/.test(cfg))
  verifie("et n'écrit aucune date en dur",
    !/9 janvier|8 janvier/.test(cfg), 'une date est écrite à la main')
}

// ═══ 6) LE PAVÉ « CA DU JOUR », ET LES QUATRE FAÇONS DONT IL MENTAIT ══════
//
// 🔴 TROUVÉ PAR ALEX EN PRODUCTION LE 28/08. Un nœud papillon à 8 € réglé
// ENTIÈREMENT par une récompense de fidélité entrait pour 8 € dans le CA du
// jour : le commerçant a offert l'article, personne ne lui a versé cet argent,
// et son tableau de bord le comptait quand même.
//
// ⚠️ LE CALCUL EST EXÉCUTÉ ICI, PAS DÉCRIT. Une garde qui cherche le nom
// `chiffreAffaires` dans le source resterait verte si la fonction rendait un
// mauvais nombre. Le cas d'Alex est donc rejoué tel quel, chiffres compris.
{
  const cmd = (o) => ({ statut: 'recupere', total: 0, fidelite_remise: 0, ...o })

  // La journée exacte de la capture : une robe à 36 €, un nœud papillon à 8 €
  // payé par une récompense de 8 €, et une troisième commande à 8 €.
  const journee = [
    cmd({ total: 36 }),
    cmd({ total: 8, fidelite_remise: 8 }),
    cmd({ total: 8 }),
  ]
  const ca = chiffreAffaires(journee).produits
  verifie('la journée d\'Alex ne vaut plus 52 €', ca !== 52, `rend ${ca}`)
  verifie('elle vaut les 44 € réellement encaissés', ca === 44, `rend ${ca}`)

  // ⚠️ ET LE BON CADEAU NE SE RETRANCHE PAS. Se tromper de sens ici coûte
  // aussi cher que l'oubli de la récompense : le bon est de l'argent DÉJÀ
  // encaissé le jour de sa vente, le retrancher effacerait cette vente-là.
  const avecBon = chiffreAffaires([cmd({ total: 30, bon_cadeau_montant: 30 })]).produits
  verifie('un bon cadeau ne sort pas du chiffre d\'affaires', avecBon === 30, `rend ${avecBon}`)

  // Une récompense plus grosse que le panier ne rend jamais un CA négatif.
  const trop = chiffreAffaires([cmd({ total: 8, fidelite_remise: 10 })]).produits
  verifie('une récompense plus grosse que le panier plancher à zéro', trop === 0, `rend ${trop}`)

  // ⚠️ DEUX STATUTS QUE LE PAVÉ COMPTAIT AUSSI, et qui n'ont rien à y faire :
  // `paiement_en_attente` est une commande dont Stripe n'a rien confirmé, et
  // `non_retire` de la marchandise restée sur l'étagère.
  for (const statut of ['paiement_en_attente', 'non_retire', 'annulee_client_refund', 'annulee_paiement_ko']) {
    const r = chiffreAffaires([cmd({ statut, total: 50 })]).produits
    verifie(`« ${statut} » n'entre pas dans le CA du jour`, r === 0, `rend ${r}`)
  }
  // Et les quatre qui, elles, comptent.
  for (const statut of ['en_attente', 'en_preparation', 'pret', 'recupere']) {
    const r = chiffreAffaires([cmd({ statut, total: 50 })]).produits
    verifie(`« ${statut} » compte bien`, r === 50, `rend ${r}`)
  }

  // ⚠️ LA GARDE DE BRANCHEMENT, ancrée sur l'EXPRESSION ENTIÈRE. Ancrée sur le
  // seul mot `chiffreAffaires`, elle resterait verte si le calcul revenait à
  // `Number(c.total)` juste à côté : c'est le défaut des six gardes molles du
  // 28/08, toutes vertes parce que le mot existait AILLEURS.
  const src = readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  verifie('le pavé appelle la fonction de la page Statistiques',
    /ca:\s*chiffreAffaires\(commandesDuJour\)\.produits/.test(src))
  verifie('et ne recalcule plus le CA à la main',
    !/acc \+ Number\(c\.total\)/.test(src),
    'le total brut est encore additionné')
}

// ═══ 7) UN MONTANT S'ÉCRIT « 12,50 € », Y COMPRIS CHEZ LE COMMERÇANT ══════
//
// 🔴 Alex, 28/08 : le tableau de bord affichait « 52.00€ » et « 8.00€ » sur la
// même commande dont l'email au Yopper disait « 8,00 € ». Le balayage de la
// virgule du 28/08 s'était arrêté au produit côté client.
{
  const FICHIERS = [
    'page.js', 'ConfigDashboard.js', 'ModalNouveauRdv.js', 'abonnement/page.js',
  ]
  for (const f of FICHIERS) {
    const src = readFileSync(new URL(`../app/dashboard/${f}`, import.meta.url), 'utf8')
    // ⚠️ UNE SEULE EXCEPTION, ET ELLE EST VOULUE : le `placeholder` d'un
    // `<input type="number">`, où la valeur se SAISIT avec un point. Y mettre
    // une virgule montrerait au commerçant un exemple qu'il ne peut pas taper.
    const restes = src.split('\n')
      .filter(l => l.includes('toFixed(2)') && !l.includes('placeholder='))
    verifie(`aucun montant formaté à la main dans ${f}`,
      restes.length === 0,
      restes.length > 0 ? `${restes.length} reste(s), dont : ${restes[0].trim().slice(0, 70)}` : '')
  }
}

// ═══ SUR QUOI LE TABLEAU DE BORD S'OUVRE (Alex, 08/09) ═══════════════════
//
// Tout le monde ouvrait sur « Commandes », y compris un centre de yoga dont la
// journée entière est dans son agenda.
{
  const yoga  = { categorie: 'vitrine', rdv_actif: true }
  const salon = { categorie: 'vitrine', rdv_actif: true }   // vend aussi des produits
  const boulangerie = { categorie: 'alimentaire', rdv_actif: false }
  const detail = { categorie: 'detail', rdv_actif: false }

  verifie('🔴 un service avec agenda ouvre sur ses rendez-vous',
    ongletDouverture(yoga) === 'rdv')
  verifie('⚠️ même s’il vend aussi des produits : c’est sa journée',
    ongletDouverture(salon, { commandesVisibles: true }) === 'rdv')
  verifie('un alimentaire ouvre sur ses commandes',
    ongletDouverture(boulangerie) === 'commandes')
  verifie('un commerce de détail aussi',
    ongletDouverture(detail) === 'commandes')
  // ⚠️ UN SERVICE SANS AGENDA GARDE LES COMMANDES : il vend au comptoir, et
  // c'est là que ça se passe.
  verifie('⚠️ un service sans agenda garde ses commandes',
    ongletDouverture({ categorie: 'vitrine', rdv_actif: false }) === 'commandes')
  // ⚠️ ET ON N'OUVRE JAMAIS SUR UN ONGLET QUE LA BARRE NE MONTRE PAS.
  verifie('⚠️ sans onglet commandes, l’agenda prend le relais',
    ongletDouverture({ categorie: 'alimentaire', rdv_actif: true }, { commandesVisibles: false }) === 'rdv')
  verifie('⚠️ et sans agenda non plus, on ouvre les réglages',
    ongletDouverture({ categorie: 'vitrine', rdv_actif: false }, { commandesVisibles: false }) === 'config')
  // ⚠️ PENDANT LE CHARGEMENT, RIEN NE BOUGE : le commerce n'est pas encore là.
  verifie('⚠️ un commerce inconnu ne déplace rien',
    ongletDouverture(null) === 'commandes')

  const PAGE_OUVERTURE = readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8')
  // 🔴 UNE SEULE FOIS, ET JAMAIS CONTRE L'ADRESSE. Un lien qui porte un onglet
  // est une intention explicite ; et rejouer le choix à chaque rechargement du
  // commerce ramènerait l'écran sous les doigts de celui qui vient d'en changer.
  verifie('🔴 l’ouverture ne se joue qu’une fois',
    /const ouvertureFaite = useRef\(false\)/.test(PAGE_OUVERTURE)
    && /if \(!commercant \|\| !pretUrl \|\| ouvertureFaite\.current\) return/.test(PAGE_OUVERTURE))
  // 🔴 ET « L'ADRESSE » VEUT DIRE CELLE DE L'ARRIVÉE, PAS CELLE D'APRÈS.
  //
  // Alex, 08/09 : « Centre Respire s'ouvre sur les commandes, pas sur
  // l'agenda ». `pretUrl` passe à vrai au montage, le commerce arrive plus
  // tard, et entre les deux l'effet d'écriture pose `?onglet=commandes` tout
  // seul. L'ouverture relisait alors `window.location.search` et y trouvait
  // NOTRE PROPRE ÉCRITURE, qu'elle prenait pour une intention de
  // l'utilisateur. Elle n'a jamais fonctionné pour personne.
  //
  // ⚠️ MA GARDE PRÉCÉDENTE NE POUVAIT PAS LE VOIR : elle vérifiait que le
  // garde-fou existe. Il existait, il marchait, il se déclenchait à tort.
  // C'est l'ORDRE des deux lignes qui est la correction, alors c'est l'ordre
  // qu'on mesure.
  verifie('🔴 et jamais contre un onglet écrit dans l’adresse',
    /if \(ongletDeLArrivee\.current\) return/.test(PAGE_OUVERTURE)
    && !/if \(new URLSearchParams\(window\.location\.search\)\.get\('onglet'\)\) return/.test(PAGE_OUVERTURE))
  verifie('🔴 l’onglet demandé est capturé AVANT d’autoriser l’écriture',
    /ongletDeLArrivee\.current = new URLSearchParams\(window\.location\.search\)\.get\('onglet'\)\s*setPretUrl\(true\)/
      .test(sansProse(PAGE_OUVERTURE)))
  // Et « Paramètres » ouvre sur le début de la marche à suivre.
  verifie('⚠️ les réglages ouvrent sur le Profil général',
    /const \[configTab, setConfigTab\] = useState\('profil'\)/.test(PAGE_OUVERTURE)
    && /const \[configTabUrl, setConfigTabUrl\] = useState\('profil'\)/.test(PAGE_OUVERTURE))
}

// ═══ LA COLONNE DE GAUCHE : LOGO, CONTRASTES, ET LE BOUTON QUI APPELLE ════
//
// Alex, 08/09 : « revois un peu les contrastes du texte et des onglets, plus de
// blanc, alertes activées doit se voir, si pas active ça doit inviter à
// l'activation, logo actualisé + les 5 dots ».
{
  const PAGE = readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8')

  // 🔴 LE LOGO NE SE REDESSINE PAS À LA MAIN. Trois copies vivaient dans ce
  // fichier, fausses de la même façon : TROIS dots au lieu de cinq, AU-DESSUS
  // du wordmark au lieu d'en dessous, et le premier à 35 % d'opacité, donc
  // gris. La spec du 12/06 interdit précisément l'opacité partielle.
  verifie('le tableau de bord passe par le composant du logo',
    /import YoppaaLogo from '@\/app\/components\/YoppaaLogo'/.test(PAGE)
    && (PAGE.match(/<YoppaaLogo /g) || []).length >= 2)
  verifie('et plus aucun dot n’y est dessiné à la main',
    !/\{c:'#fff',o:0\.35\}/.test(PAGE))

  // ⚠️ LES CONTRASTES DE LA COLONNE. Tout y était en violet clair sous 60 à
  // 75 % d'opacité, sur un fond presque noir. On découpe la colonne pour ne
  // mesurer QUE ce qui s'y trouve : ailleurs, un texte à 0,7 sur fond blanc
  // est parfaitement lisible, et une garde qui l'interdirait partout serait
  // une alarme qui sonne tout le temps.
  const iCol = PAGE.indexOf('{/* ── SIDEBAR PC ── */}')
  const colonne = iCol > 0 ? PAGE.slice(iCol, PAGE.indexOf('</aside>', iCol)) : ''
  verifie('la colonne de gauche a bien été trouvée', colonne.length > 500)
  const opacitesFaibles = (colonne.match(/opacity: 0\.[0-8]\d?/g) || [])
  verifie('aucun texte de la colonne ne se cache sous une opacité faible',
    opacitesFaibles.length === 0,
    opacitesFaibles.length > 0 ? `${opacitesFaibles.length} reste(s) : ${opacitesFaibles.join(', ')}` : '')
  verifie('elle écrit avec les deux tons faits pour ce fond',
    /colTexte:\s*'#EFE7FD'/.test(PAGE) && /colTexteFaible:\s*'#CDBAEE'/.test(PAGE)
    && colonne.includes('T.colTexte'))

  // 🔴 UN BOUTON ÉTEINT QUI CONSTATE N'APPELLE PERSONNE. « Alertes
  // désactivées » annonçait un manque avec l'apparence d'un réglage au repos,
  // sur le réglage qui décide si le commerçant apprend qu'une commande est
  // tombée.
  verifie('le bouton d’alertes éteint invite à agir',
    colonne.includes('Activer les alertes')
    && !colonne.includes('Alertes désactivées'))
  verifie('et il dit ce qu’on perd à le laisser éteint',
    /Sinon, personne ne te prévient d’une commande/.test(colonne))
  verifie('allumé, il se contente de confirmer',
    /notificationsActives \? \(\s*<span>Alertes actives<\/span>/.test(colonne))
  // ⚠️ ET LA BARRE MOBILE PORTE LA MÊME RÈGLE : la cloche y était un carré
  // gris de plus au milieu d'autres carrés gris.
  verifie('la barre mobile marque aussi les alertes éteintes',
    /\{!notificationsActives && \(\s*\n?\s*<span style=\{\{ position: 'absolute', top: -3, right: -3/.test(PAGE))
}

// ═══ « MON COMPTE » : LA PORTE QUI N'EXISTAIT PAS ═════════════════════════
// 🔴 LA PAGE D'ABONNEMENT ÉTAIT COMPLÈTE ET RELIÉE À RIEN. Ni onglet, ni menu :
// on n'y arrivait que par le bandeau d'essai, par une fonction verrouillée, ou
// par un email de relance qu'il faut avoir reçu. « Où je vois mon abonnement »
// est la question des premiers jours, et elle n'avait aucune réponse.
{
  const brut = readFileSync(new URL('../app/dashboard/ConfigDashboard.js', import.meta.url), 'utf8')
  const code = sansProse(brut.replace(/\r\n/g, '\n'))

  // ⚠️ ON DÉCOUPE LA LISTE DES ONGLETS, on ne cherche pas le mot dans tout le
  // fichier : « compte » s'y trouve partout, dans `commercant`, dans
  // `comptabilite`, dans les phrases des écrans.
  const iTabs = code.indexOf('const tabs = [')
  const iFinTabs = code.indexOf('].filter(Boolean)', iTabs)
  verifie('la barre d’onglets est là où on la cherche', iTabs >= 0 && iFinTabs > iTabs,
    'la liste des onglets a changé de forme : les gardes suivantes ne mesurent plus rien')
  const listeTabs = code.slice(iTabs, iFinTabs)

  // 🔴 ET « MON COMPTE » N'EST PLUS UN ONGLET DE CETTE BARRE (22/09). Il l'a
  // été deux jours, en même temps qu'il vivait dans le pied des deux barres :
  // Alex l'a vu à l'écran et a tranché, « il doit être uniquement proche des
  // alertes ». La garde mesure donc aujourd'hui l'inverse d'hier, et c'est
  // assumé : c'est exactement le défaut de la facturation à deux endroits,
  // corrigé le même jour sur la page d'abonnement.
  //
  // ⚠️ ELLE N'EST PAS UNE GARDE DE GOÛT. Deux portes pour une pièce, c'est
  // deux endroits à tenir à jour et un commerçant qui se demande s'il a bien
  // vu la même chose des deux côtés.
  verifie('🔴 « Mon compte » n’est pas un onglet de cette barre',
    !/id: 'compte'/.test(listeTabs),
    'le doublon est revenu : un bouton dans le pied ET un onglet au bout de seize autres')

  // ⚠️ ET LE CONTENU NON PLUS. La barre grise un onglet, mais c'est la seconde
  // condition qui empêche vraiment l'écran de s'afficher, le fichier le dit
  // lui-même à propos des autres onglets.
  const rendu = code.split('\n').find(l => /tab === 'compte'/.test(l)) || ''
  verifie('l’écran du compte est branché', rendu.length > 0,
    'l’onglet existe mais n’affiche rien')
  verifie('🔴 et son contenu n’est pas conditionné par le forfait',
    rendu.length > 0 && !/peut\(|canDo\(/.test(rendu),
    'une garde de forfait s’est posée sur le compte du commerçant')

  // ── Ce que l'écran dit, et d'où il le tient ─────────────────────────────
  const iCompte = code.indexOf('function TabMonCompte')
  const iFinCompte = code.indexOf('export default function ConfigDashboard')
  verifie('l’écran du compte est là où on le cherche', iCompte >= 0 && iFinCompte > iCompte,
    'TabMonCompte a été renommé ou déplacé : les gardes suivantes ne mesurent plus rien')
  const corpsCompte = code.slice(iCompte, iFinCompte)

  // 🔴 LA DATE VIENT DE STRIPE, JAMAIS D'UN CALCUL LOCAL. C'est la leçon de
  // l'offre de lancement : un texte qui devine sa date contredit la facture.
  //
  // ⚠️ ON VISE LA LIGNE, PAS LE COMPOSANT. Cherché dans tout le corps, le nom
  // de la colonne se trouvait aussi dans le calcul du rappel : la mutation qui
  // faisait afficher `essai_demande_le` passait au travers, et la garde restait
  // verte en mesurant un autre endroit. Mesuré, pas relu.
  const ligneFinEssai = corpsCompte.split('\n').find(l => /const finEssai\s*=/.test(l)) || ''
  verifie('la fin d’essai affichée est le miroir de Stripe',
    /subscription_trial_end/.test(ligneFinEssai),
    'la date affichée ne descend plus de ce que Stripe prélèvera')

  // ⚠️ LE MONTANT TVA COMPRISE, parce que « HTVA » est du vocabulaire de
  // comptable et que le commerçant compare à une ligne de son relevé.
  verifie('le montant réellement débité est affiché',
    /prixTTC\(/.test(corpsCompte) && /TVA comprise/.test(corpsCompte),
    'le commerçant ne voit plus ce qui sera prélevé, seulement le montant HTVA')

  // 🔴 LE RAPPEL QUI ÉVITE LA BASCULE SUBIE. Sans carte à la fin de l'essai,
  // Stripe échoue et le cron bascule en Exister à J+7. Les emails existent,
  // mais un email rebondit, part en indésirable, ou est lu par quelqu'un
  // d'autre ; le tableau de bord, lui, il l'ouvre tous les jours.
  //
  // ⚠️ ET ON VISE SA LIGNE, pour la même raison que la date : le nom
  // `rappelCarte` survit à un `= false`, puisqu'il reste sa propre définition
  // et son usage dans l'écran. Un nom présent ne prouve pas une règle vivante.
  const ligneRappel = corpsCompte.split('\n').find(l => /const rappelCarte\s*=/.test(l)) || ''
  verifie('le rappel du moyen de paiement dépend vraiment de l’essai et de sa date',
    /enEssai/.test(ligneRappel) && /joursAvantFin/.test(ligneRappel),
    'plus rien ne prévient dans le tableau de bord : il ne resterait que les emails')
  verifie('et il prévient un mois avant, pas la veille',
    /joursAvantFin\s*<=\s*30/.test(ligneRappel),
    'la fenêtre du rappel a changé : trop tard, il n’a plus le temps de réagir')

  // 🔴 LE 200 QUI DIT NON. `postPro` rend la `Response` et ne lève pas sur un
  // code HTTP : lire `res.ok` sans lire le corps annoncerait une réussite sur
  // un refus, et le commerçant attendrait un portail qui ne s'ouvre jamais.
  verifie('l’ouverture du portail lit le corps, pas seulement le code',
    /res\.json\(\)/.test(corpsCompte) && /corps\?\.url/.test(corpsCompte),
    'le portail annoncerait une réussite sur un refus')

  // ═════════════════════════════════════════════════════════════════════════
  // 🔴 LE MOT « CARTE » SE TROUVE SANS LE CHERCHER (22/09)
  // ═════════════════════════════════════════════════════════════════════════
  //
  // Question d'Alex : « où est-ce qu'il met ses données bancaires pour le
  // paiement de son abonnement ? » La réponse était bonne, l'écran ne la
  // donnait pas : le paragraphe parlait de sa carte, le bouton s'appelait
  // « Gérer mon abonnement », et le mot « carte » n'apparaissait sur aucun
  // bouton tant qu'il n'était pas à trente jours de sa première facture.
  //
  // ⚠️ ET C'EST L'UNIQUE ENDROIT OÙ IL PEUT LA SAISIR APRÈS COUP. Le Checkout
  // ne la demande pas (`payment_method_collection: 'if_required'`, décision
  // assumée de `lib/stripe-billing.js`) : tout passe donc par ce bouton.
  verifie('le bouton du portail nomme la carte',
    /'Gérer ma carte et mes factures'/.test(corpsCompte),
    'celui qui cherche où mettre sa carte ne reconnaît pas le bouton qui l’y mène')

  // ⚠️ ET « MON COMPTE » DIT D'OÙ IL PART, pour que Stripe l'y ramène. Sans
  // ce mot, le retour retombe sur la page d'abonnement et il doit refaire le
  // chemin, avec sa carte enregistrée mais l'impression de s'être perdu.
  verifie('et le départ depuis « Mon compte » est annoncé à la route',
    /retour: 'compte'/.test(corpsCompte),
    'le commerçant serait déposé sur un autre écran au retour de Stripe')

  // ⚠️ ET CELUI QUI N'A PAS ENCORE D'ABONNEMENT APPREND CE QUI L'ATTEND. Sans
  // cette phrase, l'écran constate qu'il n'a rien à gérer et s'arrête là :
  // c'est exactement la question restée sans réponse.
  verifie('et l’écran dit quand la carte sera demandée',
    /aucune carte ne te sera demandée tant que ton essai court/.test(corpsCompte),
    'il ne saurait ni quand ni où sa carte lui sera demandée')

  // 🔴 ET LE BANDEAU ROUGE SE TAIT CHEZ UN EXEMPTÉ (22/09). Le badge, trois
  // lignes plus haut, portait déjà `!exempt` ; ce bandeau non. La même règle
  // vivait à deux endroits dans le même écran, et c'est celui qu'on oublie qui
  // parle. Stripe ne sait rien de `billing_exempt` : un essai laissé ouvert sur
  // une fiche en partenariat bascule seul en `past_due`.
  verifie('le bandeau de retard ne s’affiche pas chez un exempté',
    /\{!exempt && enRetard && \(/.test(corpsCompte),
    'une fiche en partenariat lirait « un paiement n’est pas passé » sans qu’on lui demande rien')

  // ═════════════════════════════════════════════════════════════════════════
  // 🔴 UN EXEMPTÉ NE CHANGE PAS DE FORFAIT SUR UN ÉVÉNEMENT STRIPE (22/09)
  // ═════════════════════════════════════════════════════════════════════════
  //
  // `billing_exempt` veut dire « Yoppaa lui a ouvert cette formule, il ne paie
  // rien » : son forfait ne dépend d'aucun abonnement. Le webhook, lui,
  // rétrogradait en `exister` sur le seul statut Stripe. Un vieil essai qui
  // s'éteint suffisait donc à retirer Vendre à un partenaire, sans que
  // personne ne l'ait décidé et sans un mot à l'écran.
  //
  // 🔴 TROUVÉ EN PRÉPARANT LE SCRIPT QUI ANNULE CES ESSAIS : il aurait
  // déclenché ce webhook sur les six fiches de démonstration, en pleine revue
  // Google. C'est le geste prévu qui a révélé le piège, pas une relecture.
  {
    const hook = readFileSync(new URL('../app/api/stripe/billing/webhook/route.js', import.meta.url), 'utf8')

    // ⚠️ LA COLONNE D'ABORD : sans elle au `select`, la garde lit `undefined`
    // et laisse tout passer. C'est le défaut le plus fréquent du dépôt.
    //
    // 🔴 ET ON VISE LES DEUX SELECTS, PAS LE FICHIER. Première version : elle
    // comptait les occurrences de `billing_exempt` et en exigeait quatre. Le
    // harnais l'a laissée VERTE en retirant la colonne d'un select, parce que
    // les commentaires qui expliquent la règle contiennent le mot. Compter un
    // mot dans un fichier, c'est se compter soi-même.
    for (const [quoi, motif] of [
      ['la mise à jour', /\.select\('id, plan, stripe_subscription_id, billing_exempt'\)/],
      ['l’annulation', /\.select\('id, billing_exempt'\)/],
    ]) {
      verifie(`le select de ${quoi} porte l’exemption`, motif.test(hook),
        'la garde lirait `undefined` et s’ouvrirait au lieu de se fermer')
    }

    verifie('🔴 une mise à jour d’abonnement ne rétrograde pas un exempté',
      /if \(!commercant\.billing_exempt\) \{/.test(hook),
      'un partenaire perdrait sa formule quand son abonnement Stripe change de statut')

    verifie('🔴 et une annulation non plus',
      /if \(!commercant\.billing_exempt\) updates\.plan = 'exister'/.test(hook),
      'annuler un vieil essai retirerait Vendre à une fiche ouverte par Yoppaa, dans la seconde')

    // ⚠️ ET LE MIROIR CONTINUE DE SUIVRE STRIPE. On refuse de changer le
    // DROIT, pas de savoir : statut et dates restent à jour dans les deux cas.
    verifie('mais le statut reste le miroir de Stripe',
      /subscription_status: 'canceled',/.test(hook),
      'on ne saurait plus ce que Stripe pense de cet abonnement')
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 🔴 LA DÉGUSTATION EXISTE DANS CET ÉCRAN, ET AVEC LA DATE DE CELUI QUI LIT
  // ═════════════════════════════════════════════════════════════════════════
  //
  // 🔴 QUESTION D'ALEX, 22/09 : « normal qu'il n'y ait pas de mention de
  // période d'essai ? » Non. Cet écran ne lisait que le MIROIR STRIPE
  // (`subscription_status`), et la dégustation de lancement ne passe pas par
  // Stripe : elle vit dans `essai_plan` et dans la date d'inscription. Le
  // bandeau violet du haut l'annonçait, l'onglet juste en dessous l'ignorait.
  verifie('l’écran du compte connaît la dégustation, pas seulement Stripe',
    /planEnEssai\(commercant\)/.test(corpsCompte),
    'seul l’essai Stripe serait montré, et la dégustation de lancement resterait invisible')

  // ⚠️ SA DATE, PAS LA DATE DE TOUT LE MONDE. `finEssai` rend le MAX entre
  // l'inscription + 30 jours et le 9 janvier : qui s'inscrit en décembre a
  // plus que les autres. `libelleDernierJourGratuit()` ne prend aucun
  // commerçant en argument, c'est donc une constante ; ici on veut la sienne.
  verifie('et la date affichée est celle de CE commerçant',
    /dernierJourGratuit\(commercant\?\.created_at\)/.test(corpsCompte),
    'la date serait la même pour tout le monde, alors que la règle dépend de la date d’inscription')

  // 🔴 ET C'EST LE DERNIER JOUR OFFERT, PAS L'INSTANT DE FACTURATION. Les
  // deux dates sont voisines d'une journée, et `lib/lancement.js` prévient
  // en toutes lettres : « une journée fausse sur une promesse de gratuité,
  // c'est une réclamation ». La première version de cet écran affichait
  // `finDegustation` suivi du mot « inclus », donc promettait un jour de
  // trop. Trouvé par Alex le jour même, en lisant la règle et pas le code.
  verifie('l’écran ne confond pas le dernier jour offert et la facturation',
    !/finDegustation\(/.test(corpsCompte),
    'la date de première facture serait affichée comme dernier jour gratuit')

  // 🔴 ET CE QUI SE PASSE APRÈS, qui est la seule chose qu'un commerçant
  // veuille savoir en lisant son compte : ce qu'il perd, ce qu'il garde.
  verifie('la dégustation dit ce qu’il advient ensuite',
    /tu perds les fonctions de/.test(corpsCompte),
    'elle annoncerait une date sans dire ce qu’elle change')

  // ═════════════════════════════════════════════════════════════════════════
  // 🔴 LA FORMULE OUVERTE DEPUIS L'ADMINISTRATION SE DIT (22/09)
  // ═════════════════════════════════════════════════════════════════════════
  //
  // 🔴 LE CAS QU'ALEX A VU CHEZ UN COMMERÇANT RÉEL. La modale d'admin le
  // reconnaît elle-même : « ce changement n'ouvre que les fonctions, aucun
  // abonnement n'est créé chez Stripe ». Côté commerçant, l'écran annonçait
  // « 49,90 € HTVA par mois » ET « tu n'as pas encore d'abonnement payant »,
  // dans la même carte. Les deux phrases sont vraies séparément et se
  // contredisent ensemble.
  verifie('l’écran reconnaît une formule ouverte sans abonnement',
    /const ouvertSansFacture\s*=/.test(corpsCompte),
    'le commerçant lirait un tarif mensuel et « pas d’abonnement » sans savoir lequel le concerne')

  // ⚠️ ON MESURE LA RÈGLE, PAS LE NOM. Un `ouvertSansFacture = false` garderait
  // le nom et éteindrait le cas.
  {
    const ligne = corpsCompte.split('\n').find(l => /const ouvertSansFacture\s*=/.test(l)) || ''
    verifie('et il le déduit de l’absence d’abonnement, pas d’un drapeau',
      /!abonne/.test(ligne) && /!exempt/.test(ligne) && /plan !== 'exister'/.test(ligne),
      `la règle ne tient plus : ${ligne.trim().slice(0, 80)}`)
  }

  // 🔴 UN TARIF N'EST PAS UNE ÉCHÉANCE. « Ce que ça coûte » au présent faisait
  // croire à un prélèvement en cours à quelqu'un qui n'a jamais donné de carte.
  verifie('le tarif ne se présente pas comme un prélèvement en cours',
    /ouvertSansFacture \? 'Le tarif de cette formule'/.test(corpsCompte),
    'l’écran annoncerait un montant mensuel à un commerçant que personne ne débite')

  verifie('et l’écran dit clairement que rien n’est facturé',
    /rien ne t’est facturé aujourd’hui/.test(corpsCompte),
    'le commerçant resterait avec un tarif affiché et aucune réponse')

  // ═════════════════════════════════════════════════════════════════════════
  // 🔴 L'ÉCRAN NE RÉPOND JAMAIS À LA PLACE DU DOSSIER QU'IL N'A PAS (22/09)
  // ═════════════════════════════════════════════════════════════════════════
  //
  // 🔴 SANS COMMERÇANT, CET ÉCRAN AFFIRMAIT « EXISTER, GRATUIT À VIE ». Toutes
  // ses valeurs sont des replis (`commercant?.plan || 'exister'`,
  // `commercant?.subscription_status || null`) : ils s'alignent tous sur le cas
  // gratuit, et l'écran ANNONCE une formule au lieu d'avouer qu'il ne sait pas.
  // Un écran vide se remarque ; un écran faux se croit.
  //
  // ⚠️ LA GARDE DOIT VENIR AVANT LES REPLIS, sinon elle ne protège rien : on
  // vérifie donc qu'elle est dans le PREMIER tiers du composant.
  {
    const tete = corpsCompte.slice(0, Math.floor(corpsCompte.length / 3))
    verifie('l’écran du compte refuse de deviner une formule sans dossier',
      /if\s*\(!commercant\)/.test(tete),
      'sans dossier, l’écran retombe sur ses valeurs par défaut et annonce « Exister, gratuit à vie »')

    // ⚠️ DEUX CAS, DEUX MESSAGES. « Pas encore chargé » se répare tout seul,
    // « illisible » demande un geste. Les confondre fait attendre devant une
    // panne, ou crier à la panne devant un chargement.
    // ⚠️ ON VISE LA PROP, PAS LE MOT. Mesurée au harnais, une garde qui
    // cherchait « illisible » restait verte quand on retirait le paramètre
    // pour le remplacer par une constante locale à false : le mot survivait,
    // la distinction non. Ce qu'on veut savoir, c'est que l'information
    // ARRIVE de l'extérieur, donc qu'elle est dans la signature.
    verifie('et il distingue le chargement de la panne',
      /function TabMonCompte\(\{[^)]*illisible/.test(corpsCompte),
      'un dossier illisible et un dossier qui arrive donneraient le même écran')
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 🔴 UN RECHARGEMENT RATÉ N'EFFACE PAS LE COMMERÇANT (22/09)
  // ═════════════════════════════════════════════════════════════════════════
  //
  // 🔴 `setCommercant(data)` ÉTAIT APPELÉ SANS CONDITION, et l'`error` n'était
  // même pas destructurée. Une lecture qui échoue rend `data = null` : le
  // tableau de bord remplaçait donc un commerçant correct par rien.
  //
  // 🔴 ET CETTE FONCTION N'EST PAS APPELÉE QU'AU MONTAGE. Elle repasse après
  // chaque enregistrement du Profil, de la Fidélité, des Bons, et après le
  // démarrage d'un essai. Un commerçant en Vendre qui sauvegarde pendant une
  // coupure voyait son écran retomber sur « Exister, gratuit à vie », sans un
  // mot, puisque l'erreur n'était lue nulle part.
  {
    const iRecharge = code.indexOf('async function rechargerCommercant')
    verifie('le rechargeur du commerçant est là où on le cherche', iRecharge >= 0,
      'rechargerCommercant a été renommé : les deux gardes suivantes ne mesurent plus rien')
    // ⚠️ BORNÉ DES DEUX CÔTÉS. Une tranche ouverte trouverait un `error` lu
    // ailleurs dans le fichier et resterait verte quoi qu'il arrive ici.
    const corpsRecharge = iRecharge >= 0 ? code.slice(iRecharge, iRecharge + 900) : ''

    verifie('le rechargement lit son erreur',
      /const \{ data, error \}/.test(corpsRecharge),
      'une lecture qui échoue passerait inaperçue')
    // ⚠️ ON MESURE CE QUE LA BRANCHE FAIT, PAS QU'ELLE EXISTE. Mesurée au
    // harnais, la première version se contentait de « il y a un `if` et un
    // `return` » : on pouvait écrire `setCommercant(data)` À L'INTÉRIEUR de la
    // branche d'échec, donc réintroduire exactement le défaut, et elle restait
    // verte. Ce qui compte n'est pas la forme du garde-fou, c'est que RIEN ne
    // soit écrit avant d'en sortir.
    const iSi = corpsRecharge.indexOf('if (error || !data)')
    const iRet = iSi >= 0 ? corpsRecharge.indexOf('return', iSi) : -1
    const brancheEchec = iSi >= 0 && iRet > iSi ? corpsRecharge.slice(iSi, iRet) : ''
    verifie('le rechargement prévoit le cas où la lecture échoue',
      brancheEchec.length > 0,
      'plus aucune branche d’échec : une lecture ratée irait droit dans l’état')
    verifie('et il n’écrase pas le dossier par une absence',
      brancheEchec.length > 0 && !/setCommercant\(/.test(brancheEchec),
      'un rechargement raté remplacerait un commerçant payant par les valeurs par défaut')
  }
}


// ═══ 8bis) LES DEUX ÉCRANS DE L'ABONNEMENT DISENT LA MÊME CHOSE DU MÊME ═════
//      STATUT (22/09)
//
// 🔴 LE DÉFAUT : la page d'abonnement affichait « Abonnement actif », EN VERT,
// à un commerçant en retard de paiement. `hasActiveSub` range `past_due` parmi
// les statuts actifs, ce qui est juste pour décider de l'ACCÈS et faux pour
// décider d'un MESSAGE. Son badge ne distinguait que `trialing`.
//
// 🔴 ET C'EST L'ÉCRAN OÙ NOS PROPRES EMAILS L'ENVOIENT. Les deux relances
// d'échec de paiement (`lib/billing-emails.js`) pointent leur bouton vers
// `/dashboard/abonnement` : le commerçant lisait « ton paiement a échoué »,
// cliquait, et trouvait un badge vert. Pendant ce temps l'onglet « Mon compte »
// affichait un bandeau rouge sur le même statut, dans le même produit.
//
// ⚠️ CE N'EST PAS UN DÉFAUT D'AFFICHAGE, C'EST UNE CONTRADICTION. Deux écrans
// qui lisent la même colonne doivent en dire la même chose, sinon celui des
// deux qui rassure gagne, et c'est le mauvais.
{
  const abo = readFileSync(new URL('../app/dashboard/abonnement/page.js', import.meta.url), 'utf8')
  const bord = readFileSync(new URL('../app/dashboard/ConfigDashboard.js', import.meta.url), 'utf8')

  // ⚠️ ON MESURE LA RÈGLE, PAS LE NOM. Mesurée au harnais, la première
  // version restait verte quand `enRetard` devenait `false` : le nom vivait,
  // `past_due` vivait ailleurs dans la liste des statuts actifs, et plus rien
  // ne reliait les deux. Un nom présent ne prouve pas une règle vivante.
  verifie('la page d’abonnement connaît le retard de paiement',
    /const enRetard\s*=\s*commercant\.subscription_status === 'past_due'/.test(abo),
    'elle rangeait past_due parmi les actifs sans jamais le nommer à l’écran')

  // ⚠️ ON VISE LA LIGNE DU BADGE VERT, PAS LE FICHIER. Le mot « past_due »
  // existait déjà dans le fichier, dans la liste des statuts actifs et dans un
  // commentaire d'en-tête qui promettait un message jamais écrit. Chercher le
  // mot aurait donc été vert AVANT la correction.
  // ⚠️ ET ON REMONTE DEPUIS LE LIBELLÉ, pas depuis la condition. Première
  // version : « aucune ligne ne porte `hasActiveSub &&` sans `enRetard` ».
  // Elle rougissait sur le bloc qui ouvre la section du portail, lequel a
  // parfaitement le droit de s'afficher pendant un retard de paiement puisque
  // c'est LÀ qu'on met sa carte à jour. Viser un mot attrape ses homonymes :
  // on part du texte affiché, et on remonte à la condition qui le gouverne.
  const iActif = abo.indexOf("'Abonnement actif'")
  const ouvertureBadge = iActif < 0 ? '' : (abo.slice(Math.max(0, iActif - 500), iActif)
    .split('\n').reverse().find(l => /hasActiveSub/.test(l)) || '')
  verifie('le libellé « Abonnement actif » existe encore', iActif >= 0,
    'le badge a été renommé : la garde suivante ne mesure plus rien')
  verifie('le badge vert exclut le retard de paiement',
    /!enRetard/.test(ouvertureBadge),
    `un commerçant en retard lirait « Abonnement actif » en vert · condition : ${ouvertureBadge.trim().slice(0, 60)}`)

  // ⚠️ DEUX ENDROITS, DEUX GARDES. `{enRetard && (` apparaît deux fois : le
  // badge en tête de carte et le bandeau qui porte le geste. Une seule garde
  // sur le motif laissait retirer l'un des deux en silence, et c'est ce que le
  // harnais a montré.
  // 🔴 ET LES DEUX SE TAISENT CHEZ UN EXEMPTÉ (22/09). `cron/billing-relances`
  // ignore les fiches en partenariat, mais STRIPE ne sait rien de
  // `billing_exempt` : un abonnement d'essai laissé ouvert sur l'une d'elles
  // bascule en `past_due` tout seul, et le rouge apparaît chez quelqu'un à qui
  // on ne demande rien. Le badge de tête le savait déjà, pas les deux autres :
  // la même règle vivait à trois endroits, et deux l'ignoraient.
  // ⚠️ ON REMONTE DEPUIS LE LIBELLÉ, comme pour le badge vert. Chercher le
  // motif dans tout le fichier le trouvait dans le BANDEAU : la garde restait
  // verte alors que le badge avait disparu, et le harnais l'a montré.
  const iAttente = abo.indexOf('Paiement en attente')
  const ouvertureRetard = iAttente < 0 ? '' : (abo.slice(Math.max(0, iAttente - 500), iAttente)
    .split('\n').reverse().find(l => /&& \(/.test(l)) || '')
  verifie('le retard a son propre badge',
    /\{!isExempt && enRetard && \(/.test(ouvertureRetard),
    `le statut est connu mais rien ne le montre, ou il crie chez un exempté · ${ouvertureRetard.trim().slice(0, 60)}`)
  verifie('et son bandeau rouge, distinct du badge',
    (abo.match(/\{!isExempt && enRetard && \(/g) || []).length >= 2,
    'il ne resterait que la pastille, sans le bloc qui explique et qui agit')
  verifie('et aucun des deux ne s’affiche chez un exempté',
    !/\{enRetard && \(/.test(abo),
    'une fiche en partenariat verrait « paiement en attente » sans qu’on lui demande rien')

  // 🔴 LE GESTE, PAS SEULEMENT LE CONSTAT. Un badge rouge qui ne dit pas quoi
  // faire laisse chercher. Le mail promet « Mettre à jour mes informations de
  // paiement » : la page doit tenir cette promesse.
  verifie('et il dit quoi faire',
    /Mets ton moyen de paiement à jour/.test(abo),
    'le commerçant voit qu’il y a un problème sans savoir par où le régler')

  // ⚠️ ET LES DEUX ÉCRANS EMPLOIENT LE MÊME MOT. « Paiement en attente » d'un
  // côté et autre chose de l'autre ferait douter d'être au bon endroit.
  for (const [nom, src] of [['la page d’abonnement', abo], ['l’onglet « Mon compte »', bord]]) {
    verifie(`${nom} nomme le retard « Paiement en attente »`,
      /Paiement en attente/.test(src),
      'les deux écrans emploieraient deux mots pour le même état')

  // ═════════════════════════════════════════════════════════════════════════
  // 🔴 CE QUE CONTIENT CHAQUE FORMULE RESTE LISIBLE, MÊME ABONNÉ (22/09)
  // ═════════════════════════════════════════════════════════════════════════
  //
  // 🔴 LES CARTES DE FORMULES DISPARAISSAIENT DÈS QU'ON ÉTAIT ABONNÉ, et
  // c'était le SEUL endroit du produit qui dit ce que chaque formule contient.
  // Un commerçant en Communiquer ne pouvait donc plus lire ce que Vendre lui
  // apporterait : pour monter en gamme, il fallait déjà savoir ce qu'on montait
  // chercher. C'est un manque à gagner, pas un détail d'affichage.
  verifie('les formules restent lisibles quand on est abonné',
    /\{!isExempt && \(/.test(abo),
    'le seul endroit qui dit ce que contient chaque formule se ferme dès la première souscription')

  // 🔴 MAIS LE GESTE N'EST PAS LE MÊME DES DEUX CÔTÉS, et c'est une question
  // d'argent : proposer « souscrire » à quelqu'un qui a déjà un abonnement lui
  // en créerait un SECOND. Un changement de formule passe par le portail, qui
  // sait faire le prorata.
  verifie('un abonné est envoyé au portail, pas vers une seconde souscription',
    /onClick=\{abonne \? onPortail : onClick\}/.test(abo),
    'un abonné qui clique sur une autre formule souscrirait une deuxième fois')

  verifie('et la carte de sa propre formule ne lui propose rien',
    /\{actuelle \? \(/.test(abo),
    'il pourrait « changer » pour la formule qu’il a déjà')

  // ⚠️ ET LES DEUX CARTES SAVENT LAQUELLE EST LA SIENNE. Sans ça, la garde
  // ci-dessus est vraie et n'a jamais de cas à traiter.
  verifie('les trois formules savent si elles sont la sienne',
    (abo.match(/actuelle=\{plan === '/g) || []).length >= 3,
    'une carte ne se reconnaîtrait pas et proposerait de souscrire à ce qu’il a déjà')

  // ═════════════════════════════════════════════════════════════════════════
  // 🔴 EXISTER ÉTAIT ABSENTE DE LA PAGE DES FORMULES (22/09)
  // ═════════════════════════════════════════════════════════════════════════
  //
  // Alex : « la formule exister est absente des formules ». L'écran s'appelait
  // « Choisis ta formule » et n'en montrait que deux, toutes les deux
  // payantes. Celui qui hésite ne lisait nulle part ce qu'il GARDE s'il ne
  // prend rien ; celui qui paie ne voyait pas ce qui lui reste s'il arrête.
  // Le signup, lui, l'affiche depuis toujours : deux écrans du même parcours
  // ne proposaient pas le même produit.
  verifie('🔴 la formule gratuite est sur la page des formules',
    /title="Exister"/.test(abo),
    'la formule de départ de tout le monde n’est proposée nulle part dans le tableau de bord')

  verifie('et elle vient en premier, comme partout ailleurs',
    abo.indexOf('title="Exister"') >= 0 &&
    abo.indexOf('title="Exister"') < abo.indexOf('title="Communiquer"'),
    'les formules ne se lisent plus du moins cher au plus cher, contrairement à la landing et au signup')

  // 🔴 LE PIÈGE DU ZÉRO, ET IL SE SERAIT VU À L'ÉCRAN. `prixTTC` accepte le
  // vrai 0 d'Exister, comme il le doit : sans ce garde-fou, la carte annonçait
  // « 0,00 € HTVA / mois » puis « soit 0,00 € TVA comprise ».
  verifie('la formule gratuite n’annonce pas une TVA sur zéro',
    /const ttc = gratuite \? null : prixTTC\(price\)/.test(abo),
    'la carte afficherait « soit 0,00 € TVA comprise » sous un prix de zéro')
  verifie('et son prix se dit en mots, pas en euros',
    /\{gratuite \? 'Gratuit' : euros\(price\)\}/.test(abo),
    '« 0,00 € » à la place de « Gratuit » : le chiffre fait douter là où le mot rassure')

  // 🔴 ET LE BOUTON DIT LE GESTE VRAI. Descendre à Exister, ce n'est pas
  // changer de formule, c'est RÉSILIER. « Changer pour cette formule » aurait
  // envoyé un abonné au portail sans lui dire ce qu'il allait y faire.
  //
  // ⚠️ SUR LE CODE DÉPOUILLÉ, parce que le commentaire qui explique pourquoi ce
  // bouton dit « Résilier » contient le mot « Résilier ». Six gardes ont déjà
  // verdi sur ma propre prose, d'où `sansProse`.
  const aboNu = sansProse(abo.replace(/\r\n/g, '\n'))
  verifie('descendre en Exister s’appelle par son nom',
    /Résilier mon abonnement/.test(aboNu),
    'un abonné lirait « changer pour cette formule » sur ce qui est une résiliation')

  // ⚠️ ET LA LISTE DE LA GRATUITE NE VEND RIEN QU'ELLE N'A PAS. C'est la
  // matrice qui tranche (lib/plans.js) : en Exister, `deals`, `commande`,
  // `rdv`, `paiement_ligne`, `fidelite` et `push_cibles_favoris` valent tous
  // false. Promettre l'un d'eux ici, c'est vider Communiquer de son sens et
  // décevoir le jour où il cherche le bouton.
  {
    // ⚠️ DÉPOUILLÉE, ELLE AUSSI : le commentaire qui rappelle le plafond du
    // Good Morning cite « chaque matin » pour dire que c'est Communiquer, et
    // la garde du dessous cherche exactement ces mots-là.
    const i = aboNu.indexOf('title="Exister"')
    const liste = i < 0 ? '' : aboNu.slice(i, aboNu.indexOf(']}', i))
    verifie('la liste de la formule gratuite est là où on la cherche',
      i >= 0 && liste.includes('features={['),
      'la carte a changé de forme : les gardes suivantes ne mesurent plus rien')
    for (const [quoi, motif] of [
      ['les deals', /deals?/i], ['la commande en ligne', /commande/i],
      ['les rendez-vous', /rendez-vous/i], ['le paiement en ligne', /paiement/i],
      ['la carte de fidélité', /fidélité/i], ['les push', /push/i],
    ]) {
      verifie(`la formule gratuite ne promet pas ${quoi}`,
        !motif.test(liste),
        'la matrice le réserve à Communiquer ou à Vendre : c’est une promesse que l’écran ne tiendra pas')
    }
    // 🔴 ET LE GOOD MORNING Y EST PLAFONNÉ À UNE ACTU PAR SEMAINE, décision
    // d'Alex du 01/07 contre la cannibalisation. Deux écrans du produit
    // annonçaient encore « chaque jour ».
    verifie('et elle dit le plafond du Good Morning',
      /par semaine/.test(liste) && !/chaque jour|chaque matin/.test(liste),
      'elle annoncerait une place quotidienne que le code refuse après la première actu de la semaine')
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 🔴 LE RETOUR RAMÈNE LÀ D'OÙ L'ON VIENT (22/09)
  // ═════════════════════════════════════════════════════════════════════════
  //
  // On arrive sur cette page par l'onglet « Mon compte », par un email de
  // facturation ou par un retour de Stripe. Dans les trois cas, c'est « Mon
  // compte » qu'on veut retrouver ; le lien reposait à l'entrée du tableau de
  // bord, c'est-à-dire sur les commandes du jour.
  verifie('le retour ramène à l’onglet « Mon compte »',
    /href="\/dashboard\?onglet=config&config=compte"/.test(abo),
    'le commerçant est reposé à l’entrée du tableau de bord, pas là où il était')

  // 🔴 ET L'ADRESSE DOIT ÊTRE ACCEPTÉE, SINON ELLE REPLIE SUR LE DÉFAUT EN
  // SILENCE. `CONFIG_VALIDES` refuse toute valeur qu'elle ne connaît pas :
  // « compte » y manquait depuis la création de l'onglet, le 20/09.
  {
    const dash = readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8')
    const liste = dash.split('const CONFIG_VALIDES')[1]?.split(']')[0] || ''
    verifie('l’adresse ?config=compte est acceptée par le tableau de bord',
      /'compte'/.test(liste),
      'l’adresse est refusée et repliée sur l’accueil, sans rien dire')
  }

  // ⚠️ ET LA PAGE PARLE LA LANGUE DU PRODUIT. Tout Yoppaa tutoie ; cette page
  // vouvoyait, ce qui fait douter d'être encore chez soi.
  //
  // 🔴 QUATRE VOUVOIEMENTS AVAIENT SURVÉCU À LA PREMIÈRE PASSE (22/09), dont
  // « VOTRE FORMULE ACTUELLE » en capitales sur la capture qu'Alex a envoyée,
  // et une phrase qui mélangeait « Tu as » et « quand vous serez prêt ». La
  // liste ne cherchait que trois formulations : viser des phrases, c'est
  // n'attraper que celles qu'on a déjà vues. On vise les mots du vouvoiement.
  //
  // ⚠️ SUR LE CODE DÉPOUILLÉ, sinon les commentaires qui citent les anciennes
  // phrases pour expliquer la correction font rougir la garde.
  for (const motif of [/\b[Vv]otre\b/, /\b[Vv]os\b/, /\bVous \w+ez\b/, /\bvous serez\b/,
                       /reconnectez-vous/, /contactez-nous/]) {
    verifie(`la page d’abonnement ne vouvoie plus (${motif.source})`,
      !motif.test(aboNu),
      'le reste du produit tutoie : le commerçant croit changer de site')
  }
  // ⚠️ ET ELLE ANNONCE SON ÉCRAN DE DÉPART, comme « Mon compte » le fait.
  verifie('la page d’abonnement annonce son propre retour',
    /retour: 'abonnement'/.test(abo),
    'les deux écrans retomberaient sur le même retour, dont un faux')
  }
}


// ═══ 8ter) LES COORDONNÉES DE FACTURATION, ET LEUR ALLER-RETOUR STRIPE ══════
//
// 🔴 POURQUOI CET ÉCRAN EXISTE. Alex, 22/09 : « est-ce que toutes les
// coordonnées utiles à la facturation sont visibles dans Mon compte ? » Non.
// L'écran montrait la formule, le prix et le portail, et pas une seule des
// données qui apparaissent sur la facture. Le commerçant payait sans jamais
// voir sous quel nom il était facturé.
//
// 🔴 ET RIEN NE REMONTAIT CHEZ STRIPE. `stripe.customers.update` n'existait
// NULLE PART dans le dépôt : le Customer était créé une fois, et une
// correction d'adresse restait en base pendant que la facture gardait
// l'ancienne, pour toujours. Sur une facture belge, c'est de la conformité,
// pas du confort.
{
  // ⚠️ CE BLOC LIT SES PROPRES SOURCES, et ce n'est pas de la redondance : le
  // bloc voisin a les siennes dans sa portée. Les emprunter de loin marcherait
  // tant que les deux se suivent, et casserait le jour où l'un des deux bouge.
  const code = sansProse(readFileSync(new URL('../app/dashboard/ConfigDashboard.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n'))
  const fact = readFileSync(new URL('../app/api/dashboard/facturation/route.js', import.meta.url), 'utf8')
  const iTabsF = code.indexOf('const tabs = [')
  const iFinTabsF = code.indexOf('].filter(Boolean)', iTabsF)
  const listeTabs = iTabsF >= 0 && iFinTabsF > iTabsF ? code.slice(iTabsF, iFinTabsF) : ''
  verifie('la barre d’onglets reste lisible depuis ce bloc', listeTabs.length > 200, String(listeTabs.length))
  // ─── L'écran ─────────────────────────────────────────────────────────────
  // 🔴 LA FACTURATION A ÉTÉ UN ONGLET PENDANT UNE HEURE (22/09). Alex l'a
  // demandée séparée, l'a vue à l'écran, et a tranché : « facturation doit
  // aller dans Mon compte ». La garde suit : ce qu'on veut, ce n'est pas un
  // onglet, c'est que les coordonnées soient LISIBLES quelque part.
  //
  // ⚠️ ET ON VÉRIFIE L'INVERSE AUSSI : pas de second onglet qui referait la
  // même chose ailleurs. Deux endroits pour un même sujet, c'est le défaut
  // qu'on vient de corriger sur la page d'abonnement.
  verifie('la facturation n’a pas repris un onglet à elle',
    !/label: 'Facturation'/.test(listeTabs),
    'les coordonnées vivraient à deux endroits, comme l’abonnement avant le 22/09')

  // ⚠️ ET AUCUN DES DEUX N'EST REVENU DANS LA BARRE. La facturation vit dans
  // « Mon compte », et « Mon compte » vit dans le pied des deux barres : cette
  // liste-ci ne doit porter ni l'un ni l'autre, sinon le sujet se dédouble.
  {
    verifie('ni « Mon compte » ni la facturation ne reprennent un onglet',
      !/id: 'compte'/.test(listeTabs) && !/id: 'facturation'/.test(listeTabs),
      'le même sujet vivrait à deux endroits, et chacun dirait sa version')
  }

  const iFact = code.indexOf('function BlocFacturation')
  const iFinFact = code.indexOf('function TabMonCompte')
  verifie('le bloc de facturation est là où on le cherche',
    iFact >= 0 && iFinFact > iFact,
    'BlocFacturation a été renommé : les gardes suivantes ne mesurent plus rien')

  // 🔴 ET IL EST BIEN RENDU DEPUIS « MON COMPTE ». Un composant qui existe et
  // que personne ne pose est un écran que personne ne verra : c'est exactement
  // ce que la garde des maquettes de la landing attrape, et ça vaut ici aussi.
  verifie('et il est rendu depuis « Mon compte »',
    /<BlocFacturation commercant=\{commercant\} toast=\{toast\} onSaved=\{onSaved\} \/>/.test(code),
    'le bloc existerait sans que personne ne l’affiche')
  const corpsFact = iFact >= 0 && iFinFact > iFact ? code.slice(iFact, iFinFact) : ''

  // 🔴 LA MÊME GARDE QUE « MON COMPTE », POUR UNE RAISON PIRE : ici c'est un
  // FORMULAIRE. Sans dossier, des champs vides ressemblent à des valeurs, et un
  // enregistrement les écrirait pour de bon.
  // ⚠️ LE FILET MINIMAL RESTE, MÊME SI LE PARENT GARDE DÉJÀ. Un composant ne
  // doit jamais supposer son parent : le jour où on le rend ailleurs, la garde
  // de « Mon compte » ne le protégera plus.
  verifie('le bloc ne s’affiche pas sans dossier',
    /if \(!commercant\) return null/.test(corpsFact),
    'des champs vides seraient pris pour des valeurs, et enregistrés comme telles')

  // ⚠️ ET IL NE RECOPIE LE DOSSIER QU'UNE FOIS. Remplir à chaque rendu
  // écraserait ce que le commerçant est en train de taper.
  verifie('et il ne réécrit pas les champs pendant la saisie',
    /if \(charge \|\| !commercant\) return/.test(corpsFact),
    'une mise à jour venue du parent effacerait la saisie en cours')

  // 🔴 LE NUMÉRO D'ENTREPRISE RESTE EN LECTURE. Alex le vérifie au KYB : le
  // laisser changer après coup voudrait dire qu'un dossier validé peut désigner
  // une autre entreprise.
  verifie('le numéro d’entreprise n’est pas modifiable depuis l’écran',
    /disabled readOnly/.test(corpsFact),
    'un dossier validé pourrait désigner une autre entreprise')

  // ⚠️ ET L'ÉCRAN DIT QUE CE SONT LES MÊMES DONNÉES QUE LA FICHE PUBLIQUE.
  // Sans ça, « corriger sa raison sociale » changerait le nom vu par les
  // clients, par surprise.
  verifie('il prévient que ces données sont aussi celles de la fiche',
    /change aussi ce que tes clients voient/.test(corpsFact),
    'le commerçant changerait sa fiche publique sans le savoir')

  // ─── La route ────────────────────────────────────────────────────────────
  verifie('🔴 la route pousse vraiment vers Stripe',
    /stripe\.customers\.update\(/.test(fact),
    'la correction resterait en base et la facture garderait l’ancienne adresse')

  // 🔴 ET ELLE N'ANNULE PAS L'ÉCRITURE SI STRIPE REFUSE. La base est maîtresse
  // (décision d'Alex, 22/09) : perdre la saisie du commerçant parce qu'un
  // service tiers ne répond pas, ce serait lui faire payer un problème qui
  // n'est pas le sien.
  verifie('un échec Stripe ne fait pas perdre la saisie',
    /stripeSynchro = 'en retard'/.test(fact),
    'une panne Stripe annulerait la correction du commerçant')

  // ⚠️ MAIS ELLE LE DIT. Un silence ici recréerait exactement le défaut qu'on
  // vient de corriger : une base à jour, une facture fausse, et personne
  // prévenu.
  verifie('et l’écran le répète au commerçant',
    /Stripe n’a pas pu être mis à jour/.test(corpsFact),
    'la base et la facture divergeraient en silence')

  // 🔴 LA PROPRIÉTÉ SE VÉRIFIE PAR LE JETON, JAMAIS PAR LE CORPS DE LA REQUÊTE.
  // Sans ça, il suffirait de changer un identifiant pour écrire chez un autre.
  // 🔴 LA GARDE VIENT DU POINT CENTRAL, ELLE N’EST PLUS RECOPIÉE (22/09).
  // Première version : une vérification écrite dans la route. Alex l’a essayée
  // depuis son MODE ADMIN, sur la fiche d’un commerçant, et a lu « Fiche
  // introuvable ou accès refusé ». Ce n’était pas un défaut : la garde faisait
  // exactement ce qu’on lui avait écrit, elle ignorait que l’administrateur
  // existe. Et `lib/api-auth.js` portait déjà la réponse, avec son intention :
  // « l’administrateur Yoppaa passe, il ouvre des dossiers qui ne sont pas les
  // siens, c’est son métier ».
  //
  // ⚠️ ET ÇA ÉVITE UNE VINGT-NEUVIÈME COPIE DE L’ADRESSE ADMIN : la constante
  // vit dans `api-auth`, et c’est le seul endroit où elle doit vivre.
  verifie('la route passe par la garde centrale, elle ne la recopie pas',
    /gardeCommercant\(request, supabase, commercantId\)/.test(fact),
    'une copie de la vérification ignorerait le mode admin, et recopierait l’adresse admin une 29e fois')
  verifie('et elle refuse quand la garde refuse',
    /if \(!garde\.ok\) return null/.test(fact),
    'n’importe qui écrirait les coordonnées de n’importe quel commerce')

  // ⚠️ LE NUMÉRO DE TVA PASSE LE CONTRÔLE OFFICIEL. En Belgique ce sont les
  // mêmes chiffres que le numéro d'entreprise, avec la même clé modulo 97. Un
  // numéro qui ne la passe pas n'existe pas, et Billit l'enverrait quand même :
  // la facture reviendrait rejetée, longtemps après.
  verifie('le numéro de TVA est vérifié, pas seulement compté',
    /validerBCE\(chiffres\)/.test(fact),
    'un numéro inexistant partirait chez Billit et reviendrait rejeté')

  // ⚠️ ET LA FRANCHISE RESTE POSSIBLE. Un commerce en franchise n'a pas de
  // numéro à donner : le refuser l'empêcherait d'enregistrer le reste.
  verifie('un champ vide reste accepté (franchise de TVA)',
    /if \(net === ''\) return \{ ok: true, valeur: null \}/.test(fact),
    'un commerce en franchise ne pourrait plus enregistrer ses coordonnées')

  // ═════════════════════════════════════════════════════════════════════════
  // 🔴 LE MODE ADMIN ÉTAIT À MOITIÉ FONCTIONNEL (22/09)
  // ═════════════════════════════════════════════════════════════════════════
  //
  // Alex a essayé d'enregistrer des coordonnées depuis son accès admin, sur la
  // fiche d'un commerçant, et a lu « accès refusé ». Trois autres routes du
  // tableau de bord faisaient pareil : on pouvait REGARDER un dossier sans
  // jamais s'en servir. Un mode admin qui ne peut que regarder ne sert qu'à
  // moitié, et il existe pour dépanner un commerçant au téléphone.
  //
  // ⚠️ ET LA RÉPONSE VIENT D'UN POINT CENTRAL, PAS D'UNE COPIE. Chaque route
  // qui voulait laisser passer l'admin recopiait son adresse : le dépôt en
  // comptait vingt-huit dans le code. La fonction estAdminYoppaa en a retiré
  // deux, et evite trois de plus.
  {
    verifie('le point central sait reconnaître l’administrateur',
      /export function estAdminYoppaa\(user\)/.test(readFileSync(new URL('../lib/api-auth.js', import.meta.url), 'utf8')),
      'chaque route recopierait l’adresse admin, et celles qu’on oublie s’éteindraient sans rien dire')

    for (const r of ['dashboard/signaux', 'dashboard/statistiques', 'dashboard/export-comptable',
                     'accompagnement/checkout', 'accompagnement/souhaits']) {
      const src = readFileSync(new URL(`../app/api/${r}/route.js`, import.meta.url), 'utf8')
      verifie(`${r} laisse passer l’administrateur`,
        /estAdminYoppaa\(user\)/.test(src),
        'le mode admin y resterait aveugle')
      // 🔴 ET AUCUNE N'A GARDÉ SA COPIE DE L'ADRESSE.
      verifie(`${r} ne recopie pas l’adresse admin`,
        !/verstappenalexandre@/.test(src),
        'une copie de plus à retrouver le jour où l’adresse change')
    }

    // 🔴 ET LES DEUX ROUTES DE L'ABONNEMENT, TROUVÉES LE 22/09 EN CHERCHANT
    // AUTRE CHOSE. Alex : « où est-ce qu'il met ses données bancaires pour le
    // paiement de son abonnement ? » En suivant le chemin, les deux routes qui
    // ouvrent Stripe portaient chacune sa copie de l'adresse admin et sa
    // propre vérification de propriété, écrites avant `api-auth.js`.
    //
    // ⚠️ ELLES N'ÉTAIENT PAS DANS LE RELEVÉ DE LA VEILLE, et ce sont LES
    // routes de l'argent. Un relevé qui s'arrête aux routes qu'on a sous les
    // yeux laisse toujours la suivante : celle-là s'est rappelée à nous par
    // une question qui n'avait rien à voir.
    //
    // ⚠️ ELLES PASSENT PAR `gardeCommercant`, PAS PAR `estAdminYoppaa` seul :
    // c'est la garde complète qu'il leur faut, propriété comprise, et
    // l'administrateur y est déjà prévu.
    for (const r of ['stripe/billing/portal', 'stripe/billing/checkout']) {
      const src = readFileSync(new URL(`../app/api/${r}/route.js`, import.meta.url), 'utf8')
      verifie(`${r} passe par la garde partagée`,
        /gardeCommercant\(req, supabase, commercantId\)/.test(src),
        'elle réapprendrait seule ce que la garde partagée sait déjà, l’administrateur compris')
      verifie(`${r} ne recopie pas l’adresse admin`,
        !/verstappenalexandre@/.test(src),
        'une copie de plus à retrouver le jour où l’adresse change')
      // ⚠️ ET ELLE NE GARDE PAS SA PROPRE VÉRIFICATION DE PROPRIÉTÉ À CÔTÉ :
      // deux gardes pour une porte, c'est celle qu'on oublie qui décide.
      verifie(`${r} ne garde pas sa vérification de propriété en double`,
        !/auth_user_id !== user\.id/.test(src),
        'la règle vivrait à deux endroits, et la copie ne saurait rien des corrections de l’autre')
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 🔴 LE RETOUR DE STRIPE RAMÈNE LÀ D'OÙ L'ON VIENT, SANS OUVRIR DE PORTE
    // ═════════════════════════════════════════════════════════════════════════
    //
    // Le portail s'ouvre depuis deux écrans ; le retour était écrit en dur pour
    // l'un des deux. Celui qui partait de « Mon compte » revenait ailleurs.
    //
    // 🔴 ET C'EST LA GARDE QUI COMPTE ICI : le client envoie un NOM, jamais une
    // adresse. Accepter une URL dans le corps de la requête offrirait une
    // redirection vers n'importe quel site à qui sait fabriquer un appel, et
    // Stripe y renverrait le commerçant lui-même, au retour de sa facturation.
    // Une fausse page Yoppaa à ce moment-là récolte ce qu'elle veut.
    {
      const src = readFileSync(new URL('../app/api/stripe/billing/portal/route.js', import.meta.url), 'utf8')
      verifie('le retour du portail se choisit dans une liste tenue par le serveur',
        /const RETOURS = \{/.test(src) && /Object\.hasOwn\(RETOURS, demande\)/.test(src),
        'l’adresse de retour viendrait d’ailleurs que de cette liste')
      verifie('🔴 et jamais d’une adresse envoyée par le client',
        /const returnUrl = `\$\{appUrl\}\$\{chemin\}`/.test(src) && !/returnUrl = (body|corps)\./.test(src),
        'redirection ouverte : Stripe renverrait le commerçant vers le site de son choix')
      // ⚠️ ET LES DEUX ÉCRANS SONT DANS LA LISTE, sinon l'un des deux retombe
      // en silence sur le défaut, ce qui est exactement le défaut d'origine.
      for (const cle of ["compte: '/dashboard?onglet=config&config=compte'", "abonnement: '/dashboard/abonnement'"]) {
        verifie(`la liste connaît ${cle.split(':')[0]}`, src.includes(cle),
          'cet écran retomberait sur le retour par défaut, sans rien dire')
      }
    }
  }

  // ─── L'adresse ───────────────────────────────────────────────────────────
  // ⚠️ ET L'ADRESSE DE L'ONGLET DISPARU EST RETIRÉE. Une valeur qui ne
  // correspond plus à rien serait acceptée par l'URL et déposerait le
  // commerçant sur un onglet vide, sans rien dire.
  {
    const dash = readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8')
    const liste = dash.split('const CONFIG_VALIDES')[1]?.split(']')[0] || ''
    verifie('l’adresse ?config=compte reste acceptée', /'compte'/.test(liste),
      'le bouton des deux barres ne mènerait nulle part')
    verifie('et ?config=facturation ne l’est plus', !/'facturation'/.test(liste),
      'une adresse mènerait à un onglet qui n’existe plus')
  }
}


// ═══ 8quater) « MON COMPTE » EST ATTEIGNABLE SANS FAIRE DÉFILER (22/09) ═════
//
// 🔴 IL N'ÉTAIT DANS AUCUNE DES DEUX BARRES. Alex : « est-ce qu'on peut mettre
// le bouton mon compte dans la barre latérale ? » Il vivait au BOUT d'une bande
// à défilement de dix-sept onglets, donc hors de l'écran tant qu'on ne faisait
// pas défiler, et c'est l'endroit où mènent cinq emails de facturation.
//
// ⚠️ ET IL EST DANS LE PIED, PAS DANS LA NAVIGATION. « Commandes » et
// « Rendez-vous » sont des activités quotidiennes ; son compte se regarde une
// fois par mois. Le poser à côté d'elles lui donnerait le poids d'une commande
// qui arrive, et déplacerait l'œil chaque jour pour rien.
{
  const dash = readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8')

  verifie('une icône de compte existe, en SVG',
    /function IconCompte\(/.test(dash),
    'le bouton n’aurait pas d’icône, ou porterait un emoji')

  // 🔴 LES DEUX BARRES, ET C'EST LA GARDE QUI COMPTE. La barre latérale
  // n'existe pas sous 1100 px : la poser d'un seul côté laisserait sans réponse
  // ceux qui travaillent sur leur téléphone, c'est-à-dire la plupart.
  // 🔴 ET EXACTEMENT DEUX, PAS TROIS (22/09). Le compte a vécu deux jours dans
  // le pied des deux barres ET dans la barre d'onglets : « l'onglet mon compte
  // est à deux endroits » (Alex). Compter au moins deux laissait le doublon
  // passer ; on compte les portes, et il y en a une par barre.
  const boutons = (dash.match(/ouvrirConfig\('compte'\)/g) || []).length
  verifie('le bouton « Mon compte » est dans les DEUX barres, et nulle part ailleurs',
    boutons === 2, `${boutons} bouton(s) trouvé(s), 2 attendus`)

  // 🔴 ET IL DIT QU'ON Y EST. Depuis qu'il n'est plus un onglet, aucun onglet
  // ne s'allume quand on regarde son compte : sans ce repère, l'écran flotte
  // au-dessus d'une barre au repos et on ne sait plus d'où il sort.
  verifie('le bouton s’allume quand on est sur son compte',
    /const surCompte = ongletPrincipal === 'config' && configTabUrl === 'compte'/.test(dash),
    'rien ne montre où l’on est : la barre du haut reste au repos sur cet écran')

  // ⚠️ ET LES DEUX BOUTONS LE LISENT, pas seulement celui du grand écran.
  verifie('et les deux boutons le lisent',
    (dash.match(/surCompte \? 'CC' : '44'/g) || []).length === 2,
    'un seul des deux s’allumerait, et l’autre laisserait le doute')

  // ⚠️ ON LIT L'ONGLET COURANT, PAS LA CLÉ DE MONTAGE. `configTab` sert de
  // `key` à ConfigDashboard et ne bouge plus quand le commerçant change
  // d'onglet à l'intérieur : le bouton resterait allumé sur les seize autres.
  verifie('et il lit l’onglet courant, pas la clé de montage',
    !/const surCompte = ongletPrincipal === 'config' && configTab === 'compte'/.test(dash),
    'le bouton resterait allumé sur tous les autres onglets de configuration')

  // 🔴 ET AUCUN FORFAIT NE LE FERME. C'était tout le point quand il était un
  // onglet, et ça ne change pas en changeant de barre : celui qui est en
  // Exister doit pouvoir lire qu'il ne paie rien, et celui dont l'essai se
  // termine doit pouvoir lire sa date.
  //
  // ⚠️ ET LA FENÊTRE VA JUSQU'AU BOUT DU BOUTON. Mesurée au harnais, une
  // première version s'arrêtait 200 caractères après le `onClick` : le style
  // en fait trois cents à lui seul, donc le cadenas posé sur l'icône passait
  // sans rougir. Une garde qui regarde à côté est une garde muette.
  {
    const i = dash.indexOf("ouvrirConfig('compte')")
    const fin = i < 0 ? 0 : dash.indexOf('</button>', i)
    const autour = i < 0 ? '' : dash.slice(Math.max(0, i - 400), fin)
    verifie('« Mon compte » n’est derrière aucun forfait',
      i >= 0 && fin > i && !/peut\(|canDo\(/.test(autour),
      'un cadenas est apparu sur le compte du commerçant : il ne voit plus ce qu’il paie')
  }

  // ⚠️ ET LA BARRE LATÉRALE EST BIEN CELLE QUI DISPARAÎT SOUS 1100 px : si ce
  // point de rupture changeait, la garde ci-dessus resterait vraie et la
  // raison d'avoir deux boutons deviendrait fausse.
  verifie('la barre latérale n’apparaît qu’au-dessus de 1100 px',
    /@media \(min-width: 1100px\)[\s\S]{0,120}\.sidebar \{ display: flex/.test(dash),
    'le point de rupture a changé : le second bouton n’a peut-être plus lieu d’être')

  // 🔴 ET IL N'EST PAS DEVENU UN QUATRIÈME ONGLET. La navigation principale
  // compte trois entrées de chaque côté : Commandes, Rendez-vous, Paramètres.
  // Un compte n'est pas une activité quotidienne.
  for (const [nom, motif] of [['latérale', /\{ key: 'config',\s+label: 'Paramètres'/], ['du haut', /\{ key: 'config',\s+label: 'Config'/]]) {
    const i = dash.search(motif)
    verifie(`la navigation ${nom} garde ses trois entrées`,
      i >= 0 && !/key: 'compte'/.test(dash.slice(Math.max(0, i - 900), i + 300)),
      'le compte a été posé au même niveau que les commandes du jour')
  }

  // ⚠️ ET IL MÈNE VRAIMENT À L'ONGLET, pas à la page des paramètres au hasard.
  verifie('le bouton ouvre l’onglet du compte, pas les paramètres',
    /ouvrirConfig\('compte'\)/.test(dash) && /function ouvrirConfig\(tab\) \{ setConfigTab\(tab\); setOngletPrincipal\('config'\) \}/.test(dash),
    'il déposerait le commerçant sur le dernier onglet consulté')
}

// ⚠️ LE TOTAL SE DIT ICI, QUAND TOUT A TOURNÉ. Il vivait au deux tiers du
// fichier et n'annonçait donc qu'un tiers du travail.
console.log(`\nTableau de bord : ${ok} vérifications`)

if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
