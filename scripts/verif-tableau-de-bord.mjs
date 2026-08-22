// BANC : les règles du tableau de bord commerçant.
//
// ⚠️ LES DEUX RÈGLES SONT PURES ET S'EXÉCUTENT ICI. Le branchement des écrans,
// lui, se vérifie au source EN DÉCOUPANT LA SECTION concernée.
//
//   npm run verif:bord

import { readFileSync } from 'node:fs'
import { retourArriereAutorise, alerteAutreOnglet, travailEnAttente, indexBlocages, appliquerBlocage, etatCreneau } from '../lib/tableau-de-bord.js'
import { calculerCapaciteCreneau } from '../lib/creneaux.js'

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

console.log(`\nTableau de bord : ${ok} vérifications`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
