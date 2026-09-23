// HARNAIS DE MUTATION — « MON COMPTE » (20/09)
//
// 🔴 CE QU ON MESURE. La page `/dashboard/abonnement` existait, complete, et
// n etait RELIEE A RIEN : ni onglet, ni menu. On n y arrivait que par le
// bandeau d essai, par une fonction verrouillee, ou par un email de relance
// qu il faut avoir recu. « Ou je vois mon abonnement » est la question des
// premiers jours, et elle n avait aucune reponse (Alex, 10/09).
//
// Chacune des mutations ci-dessous remet une des formes fausses possibles. Si
// le banc reste vert sur l une d elles, ce lot ne protege pas ce qu il pretend.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   node scripts/mutations-mon-compte.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:bord'
const MODULE = 'app/dashboard/ConfigDashboard.js'

const MUTATIONS = [
  // ─── 22/09 : LE MODE ADMIN ETAIT A MOITIE FONCTIONNEL ───────────────────
  //
  // 🔴 Alex a essaye d enregistrer des coordonnees depuis son acces admin, sur
  // la fiche d un commercant, et a lu « acces refuse ». Trois autres routes du
  // tableau de bord faisaient pareil : on pouvait REGARDER un dossier sans
  // jamais s en servir.
  { nom: '🔴 le point central cesse de reconnaitre l administrateur',
    fichier: 'lib/api-auth.js',
    de: 'export function estAdminYoppaa(user) {',
    vers: 'function estAdminYoppaaInterne(user) {',
    garde: 'le point central sait reconnaître l’administrateur' },

  { nom: '🔴 les signaux redeviennent aveugles au mode admin',
    fichier: 'app/api/dashboard/signaux/route.js',
    de: '&& !estAdminYoppaa(user)',
    vers: '&& true',
    garde: 'dashboard/signaux laisse passer l’administrateur' },

  { nom: '🔴 les statistiques redeviennent aveugles au mode admin',
    fichier: 'app/api/dashboard/statistiques/route.js',
    de: '&& !estAdminYoppaa(user)',
    vers: '&& true',
    garde: 'dashboard/statistiques laisse passer l’administrateur' },

  { nom: '🔴 l export comptable redevient aveugle au mode admin',
    fichier: 'app/api/dashboard/export-comptable/route.js',
    de: '&& !estAdminYoppaa(user)',
    vers: '&& true',
    garde: 'dashboard/export-comptable laisse passer l’administrateur' },

  // ⚠️ ET LA COPIE DE L ADRESSE, qui revient par la petite porte a chaque fois
  // qu une route veut laisser passer l admin sans appeler le point central.
  { nom: '⚠️ une route recopie l adresse admin au lieu d appeler le point central',
    fichier: 'app/api/accompagnement/souhaits/route.js',
    de: 'estAdminYoppaa(user)',
    vers: "(user.email === 'verstappenalexandre@gmail.com')",
    garde: 'accompagnement/souhaits ne recopie pas l’adresse admin' },


  // ─── 22/09 : « MON COMPTE » ATTEIGNABLE SANS FAIRE DEFILER ──────────────
  //
  // 🔴 IL N ETAIT DANS AUCUNE DES DEUX BARRES. Il vivait au BOUT d une bande a
  // defilement de dix-sept onglets, donc hors de l ecran, et c est la que
  // menent cinq emails de facturation.
  { nom: '🔴 le bouton disparait de la barre laterale (PC)',
    fichier: 'app/dashboard/page.js',
    de: "            <button onClick={() => ouvrirConfig('compte')}",
    vers: "            <button onClick={() => {}}",
    garde: 'le bouton « Mon compte » est dans les DEUX barres' },

  // 🔴 ET SUR TELEPHONE. La barre laterale n existe pas sous 1100 px : poser le
  // bouton d un seul cote laisserait sans reponse ceux qui travaillent sur leur
  // telephone, c est-a-dire la plupart des commercants.
  { nom: '🔴 le bouton disparait de la barre du haut (moins de 1100 px)',
    fichier: 'app/dashboard/page.js',
    de: "                <button onClick={() => ouvrirConfig('compte')}",
    vers: "                <button onClick={() => {}}",
    garde: 'le bouton « Mon compte » est dans les DEUX barres' },

  { nom: '⚠️ l icone de compte disparait',
    fichier: 'app/dashboard/page.js',
    de: 'function IconCompte({ size = 18, color = ',
    vers: 'function IconCompteInutilisee({ size = 18, color = ',
    garde: 'une icône de compte existe, en SVG' },

  // 🔴 ET IL NE DEVIENT PAS UN QUATRIEME ONGLET. Un compte se regarde une fois
  // par mois ; lui donner le poids d une commande qui arrive deplacerait l oeil
  // chaque jour pour rien.
  { nom: '🔴 le compte est pose au meme niveau que les commandes du jour',
    fichier: 'app/dashboard/page.js',
    de: "              { key: 'config',    label: 'Paramètres',  Icon: IconConfig,    visible: true },",
    vers: "              { key: 'compte', label: 'Mon compte', Icon: IconCompte, visible: true },\n              { key: 'config',    label: 'Paramètres',  Icon: IconConfig,    visible: true },",
    garde: 'la navigation latérale garde ses trois entrées' },

  { nom: '🔴 le bouton depose le commercant sur le dernier onglet consulte',
    fichier: 'app/dashboard/page.js',
    de: "  function ouvrirConfig(tab) { setConfigTab(tab); setOngletPrincipal('config') }",
    vers: "  function ouvrirConfig(tab) { setOngletPrincipal('config') }",
    garde: 'le bouton ouvre l’onglet du compte, pas les paramètres' },


  // ─── 22/09 : L ONGLET « FACTURATION » ────────────────────────────────────
  //
  // 🔴 POURQUOI IL EXISTE. Alex : « est-ce que toutes les coordonnees utiles a
  // la facturation sont visibles dans Mon compte ? » Non. L ecran montrait la
  // formule, le prix et le portail, et pas une seule des donnees qui
  // apparaissent sur la facture. Le commercant payait sans jamais voir sous
  // quel nom il etait facture.
  // ⚠️ ANCRE SUR UNE SEULE LIGNE, comme la règle du dépôt l'exige. La version
  // d'avant portait un bloc entier avec ses sauts de ligne, parce que la ligne
  // de garde n'était pas unique dans le fichier. Elle l'est devenue en
  // supprimant la duplication : c'est le code qu'on a réparé, pas l'ancre.
  { nom: '🔴 le formulaire s affiche sans dossier : des champs vides passent pour des valeurs',
    // ⚠️ L ANCRE PORTE SON COMMENTAIRE, et c est ce qui la rend unique :
    // `BandeauEssai` ecrit exactement la meme ligne, cent lignes plus haut.
    de: '  if (!commercant) return null  // le filet, le parent garde déjà',
    vers: '  if (commercant === undefined) return null  // le filet, le parent garde déjà',
    garde: 'le bloc ne s’affiche pas sans dossier' },

  { nom: '🔴 les champs se reecrivent pendant que le commercant tape',
    de: '    if (charge || !commercant) return',
    vers: '    if (!commercant) return',
    garde: 'et il ne réécrit pas les champs pendant la saisie' },

  // 🔴 LE NUMERO D ENTREPRISE EST VERIFIE PAR ALEX AU KYB. Le laisser changer
  // apres coup voudrait dire qu un dossier valide peut designer une autre
  // entreprise.
  { nom: '🔴 le numero d entreprise redevient modifiable apres validation',
    de: '        <input style={{ ...s.input, background: T.bg, color: T.muted }} value={bceLisible || \'—\'} disabled readOnly />',
    vers: '        <input style={{ ...s.input, background: T.bg, color: T.muted }} value={bceLisible || \'—\'} />',
    garde: 'le numéro d’entreprise n’est pas modifiable depuis l’écran' },

  { nom: '⚠️ l ecran ne dit plus que ces donnees sont aussi celles de la fiche',
    de: 'change aussi ce que tes clients voient',
    vers: 'sert a te facturer',
    garde: 'il prévient que ces données sont aussi celles de la fiche' },

  // ─── LA ROUTE, ET LA MOITIE QUI MANQUAIT ────────────────────────────────
  //
  // 🔴 `stripe.customers.update` N EXISTAIT NULLE PART dans le depot : une
  // correction d adresse restait en base et la facture gardait l ancienne.
  { nom: '🔴 LE DEFAUT D ORIGINE : plus rien ne remonte chez Stripe',
    fichier: 'app/api/dashboard/facturation/route.js',
    de: '        await stripe.customers.update(commercant.stripe_customer_id, {',
    vers: '        await Promise.resolve({ id: commercant.stripe_customer_id, ignore: {',
    garde: 'la route pousse vraiment vers Stripe' },

  // 🔴 LA BASE EST MAITRESSE : perdre la saisie du commercant parce qu un
  // service tiers ne repond pas, ce serait lui faire payer un probleme qui n
  // est pas le sien.
  { nom: '🔴 un echec Stripe fait perdre la saisie du commercant',
    fichier: 'app/api/dashboard/facturation/route.js',
    de: "        stripeSynchro = 'en retard'",
    vers: "        stripeSynchro = 'à jour'",
    garde: 'un échec Stripe ne fait pas perdre la saisie' },

  { nom: '🔴 l ecran cesse de dire que Stripe n a pas suivi',
    de: 'Stripe n’a pas pu être mis à jour',
    vers: 'tout est enregistré',
    garde: 'et l’écran le répète au commerçant' },

  // 🔴 LA PROPRIETE SE VERIFIE PAR LE JETON, JAMAIS PAR LE CORPS DE LA REQUETE.
  { nom: '🔴 n importe qui ecrit les coordonnees de n importe quel commerce',
    fichier: 'app/api/dashboard/facturation/route.js',
    // ⚠️ ANCRE RECALEE LE 22/09 : la route ne recopie plus la verification,
    // elle appelle la garde centrale. Alex l avait trouvee en essayant l ecran
    // depuis son mode admin : la copie ignorait que l administrateur existe.
    de: '  if (!garde.ok) return null',
    vers: '  if (false) return null',
    garde: 'et elle refuse quand la garde refuse' },

  { nom: '🔴 la route recopie la verification au lieu d appeler la garde centrale',
    fichier: 'app/api/dashboard/facturation/route.js',
    de: '  const garde = await gardeCommercant(request, supabase, commercantId)',
    vers: '  const garde = { ok: true }',
    garde: 'la route passe par la garde centrale, elle ne la recopie pas' },

  { nom: '🔴 le numero de TVA n est plus verifie, seulement compte',
    fichier: 'app/api/dashboard/facturation/route.js',
    de: '  const { valide } = validerBCE(chiffres)',
    vers: '  const valide = true',
    garde: 'le numéro de TVA est vérifié, pas seulement compté' },

  // ⚠️ LA FRANCHISE EST UN ETAT NORMAL. Refuser le vide empecherait un commerce
  // en franchise d enregistrer le reste de ses coordonnees.
  { nom: '⚠️ un commerce en franchise ne peut plus enregistrer',
    fichier: 'app/api/dashboard/facturation/route.js',
    de: "  if (net === '') return { ok: true, valeur: null }",
    vers: "  if (net === '') return { ok: false, erreur: 'Numéro obligatoire.' }",
    garde: 'un champ vide reste accepté (franchise de TVA)' },

  // ⚠️ ET L ADRESSE, sans quoi l onglet n est atteignable par aucun lien.
  { nom: '🔴 l adresse ?config=facturation redevient invalide',
    fichier: 'app/dashboard/page.js',
    de: "    'avis', 'signaux', 'compte']",
    vers: "    'avis', 'signaux', 'compte', 'facturation']",
    garde: 'et ?config=facturation ne l’est plus' },


  // ─── 22/09 : CE QUE CONTIENT CHAQUE FORMULE RESTE LISIBLE ───────────────
  //
  // 🔴 LES CARTES DISPARAISSAIENT DES QU ON ETAIT ABONNE, et c etait le SEUL
  // endroit du produit qui dit ce que chaque formule contient. Pour monter en
  // gamme, il fallait deja savoir ce qu on montait chercher.
  { nom: '🔴 les formules se referment des la premiere souscription',
    fichier: 'app/dashboard/abonnement/page.js',
    de: '        {!isExempt && (',
    vers: '        {!hasActiveSub && !isExempt && (',
    garde: 'les formules restent lisibles quand on est abonné' },

  // 🔴 ET C EST UNE QUESTION D ARGENT : proposer « souscrire » a un abonne lui
  // creerait un SECOND abonnement. Un changement de formule passe par le
  // portail, qui sait faire le prorata.
  { nom: '🔴 un abonne peut souscrire une deuxieme fois',
    fichier: 'app/dashboard/abonnement/page.js',
    de: '          onClick={abonne ? onPortail : onClick}',
    vers: '          onClick={onClick}',
    garde: 'un abonné est envoyé au portail, pas vers une seconde souscription' },

  { nom: '🔴 la carte de sa propre formule lui propose d y souscrire',
    fichier: 'app/dashboard/abonnement/page.js',
    de: '      {actuelle ? (',
    vers: '      {false ? (',
    garde: 'et la carte de sa propre formule ne lui propose rien' },

  // ⚠️ TROIS DEPUIS LE 22/09, la gratuite ayant rejoint les deux payantes.
  { nom: '🔴 une seule des trois cartes se reconnait',
    fichier: 'app/dashboard/abonnement/page.js',
    de: "                actuelle={plan === 'vendre'}",
    vers: '                actuelle={false}',
    garde: 'les trois formules savent si elles sont la sienne' },

  // ─── 22/09 : LE RETOUR RAMENE LA D OU L ON VIENT ────────────────────────
  { nom: '🔴 le retour repose le commercant a l entree du tableau de bord',
    fichier: 'app/dashboard/abonnement/page.js',
    de: '        <a href="/dashboard?onglet=config&config=compte"',
    vers: '        <a href="/dashboard"',
    garde: 'le retour ramène à l’onglet « Mon compte »' },

  // 🔴 ET L ADRESSE DOIT ETRE ACCEPTEE, SINON ELLE REPLIE SUR LE DEFAUT EN
  // SILENCE. « compte » manquait a la liste depuis la creation de l onglet.
  { nom: '🔴 l adresse ?config=compte redevient invalide',
    fichier: 'app/dashboard/page.js',
    // ⚠️ ANCRE RECALEE LE 22/09 : la liste a gagne 'facturation' depuis.
    de: "'signaux', 'compte']",
    vers: "'signaux']",
    garde: 'l’adresse ?config=compte est acceptée par le tableau de bord' },

  // ⚠️ ET LA LANGUE DU PRODUIT. Tout Yoppaa tutoie.
  { nom: '⚠️ la page d abonnement se remet a vouvoyer',
    fichier: 'app/dashboard/abonnement/page.js',
    de: 'Ta formule, tes paiements et tes factures.',
    vers: 'Gérez votre formule, vos paiements et vos factures.',
    garde: 'la page d’abonnement ne vouvoie plus' },


  // ─── 22/09 : LA DEGUSTATION EXISTE DANS CET ECRAN ───────────────────────
  //
  // 🔴 QUESTION D ALEX : « normal qu il n y ait pas de mention de periode
  // d essai ? » Non. L ecran ne lisait que le MIROIR STRIPE, et la degustation
  // de lancement ne passe pas par Stripe : elle vit dans `essai_plan` et dans
  // la date d inscription. Le bandeau du haut l annoncait, l onglet juste en
  // dessous l ignorait.
  { nom: '🔴 LE DEFAUT D ALEX : l ecran redevient aveugle a la degustation',
    de: '  const degustation = planEnEssai(commercant)',
    vers: '  const degustation = null',
    garde: 'l’écran du compte connaît la dégustation, pas seulement Stripe' },

  // ⚠️ SA DATE, PAS CELLE DE TOUT LE MONDE. `finEssai` rend le MAX entre
  // l inscription + 30 jours et le 9 janvier : qui s inscrit en decembre a plus
  // que les autres. `libelleDernierJourGratuit()` ne prend aucun commercant en
  // argument, c est donc une constante.
  { nom: '🔴 la date de degustation redevient la meme pour tout le monde',
    de: '  const finDeg = dateLongue(dernierJourGratuit(commercant?.created_at))',
    vers: '  const finDeg = libelleDernierJourGratuit()',
    garde: 'et la date affichée est celle de CE commerçant' },

  // 🔴 UN JOUR DE TROP SUR UNE PROMESSE DE GRATUITE. `finDegustation` rend
  // l INSTANT DE FACTURATION : l afficher suivi de « inclus » promet une
  // journee de plus que la regle. C est la premiere version de cet ecran, et
  // c est Alex qui l a vue, en lisant la regle plutot que le code.
  { nom: '🔴 la date affichee redevient celle de la premiere facture',
    de: '  const finDeg = dateLongue(dernierJourGratuit(commercant?.created_at))',
    vers: '  const finDeg = dateLongue(finDegustation(commercant?.created_at))',
    garde: 'l’écran ne confond pas le dernier jour offert et la facturation' },

  { nom: '🔴 la degustation annonce une date sans dire ce qu elle change',
    de: 'tu perds les fonctions de {getPlanLabel(degustation)}',
    vers: 'tu continues comme avant',
    garde: 'la dégustation dit ce qu’il advient ensuite' },

  // ─── 22/09 : LA FORMULE OUVERTE DEPUIS L ADMINISTRATION ─────────────────
  //
  // 🔴 LE CAS VU CHEZ UN COMMERCANT REEL. L ecran annoncait « 49,90 € HTVA par
  // mois » ET « tu n as pas encore d abonnement payant », dans la meme carte.
  // Les deux phrases sont vraies separement et se contredisent ensemble.
  { nom: '🔴 l ecran ne reconnait plus la formule ouverte sans abonnement',
    de: "  const ouvertSansFacture = !exempt && !abonne && plan !== 'exister' && !degustation",
    vers: '  const ouvertSansFacture = false',
    garde: 'et il le déduit de l’absence d’abonnement, pas d’un drapeau' },

  { nom: '🔴 le tarif se represente comme un prelevement en cours',
    de: "            <Ligne quoi={ouvertSansFacture ? 'Le tarif de cette formule' : 'Ce que ça coûte'} fort valeur={",
    vers: "            <Ligne quoi=\"Ce que ça coûte\" fort valeur={",
    garde: 'le tarif ne se présente pas comme un prélèvement en cours' },

  { nom: '🔴 l ecran cesse de dire que rien n est facture',
    de: 'rien ne t’est facturé aujourd’hui',
    vers: 'ta formule est active',
    garde: 'et l’écran dit clairement que rien n’est facturé' },


  // ─── 22/09 : L ECRAN NE REPOND PAS A LA PLACE DU DOSSIER QU IL N A PAS ───
  //
  // 🔴 SANS COMMERCANT, CET ECRAN AFFIRMAIT « EXISTER, GRATUIT A VIE ». Toutes
  // ses valeurs sont des replis : avec un dossier absent elles s alignent sur
  // le cas gratuit, et l ecran ANNONCE une formule au lieu d avouer qu il ne
  // sait pas. Un ecran vide se remarque ; un ecran faux se croit.
  { nom: '🔴 la garde de chargement saute : l ecran redevine « Exister, gratuit a vie »',
    de: '  if (!commercant) return <DossierAbsent illisible={illisible} quoi="ta formule et tes paiements" />',
    vers: '  if (false) return <DossierAbsent illisible={illisible} quoi="ta formule et tes paiements" />',
    garde: 'l’écran du compte refuse de deviner une formule sans dossier' },

  { nom: '🔴 le chargement et la panne redonnent le meme ecran',
    de: 'function TabMonCompte({ commercant, toast, onSaved = null, illisible = false }) {',
    vers: 'function TabMonCompte({ commercant, toast, onSaved = null }) {\n  const illisible = false',
    garde: 'et il distingue le chargement de la panne' },

  // ─── 22/09 : UN RECHARGEMENT RATE N EFFACE PAS LE COMMERCANT ────────────
  //
  // 🔴 `setCommercant(data)` ETAIT APPELE SANS CONDITION, et l `error` n etait
  // meme pas destructuree. Cette fonction repasse apres CHAQUE enregistrement
  // du Profil, de la Fidelite, des Bons : un commercant en Vendre qui
  // sauvegarde pendant une coupure voyait son ecran retomber sur « Exister ».
  { nom: '🔴 le rechargement cesse de lire son erreur',
    // ⚠️ L ANCRE PORTE LA REQUETE ENTIERE, et c est mesure : « const { data,
    // error } » vit SEIZE fois dans ce fichier, et `replace` ne touche que la
    // premiere. La mutation mutait une autre fonction, la garde restait verte,
    // et on aurait conclu qu elle ne protege pas.
    de: "    const { data, error } = await supabase.from('commercants').select('*').eq('id', commercantId).maybeSingle()",
    vers: "    const { data } = await supabase.from('commercants').select('*').eq('id', commercantId).maybeSingle()",
    garde: 'le rechargement lit son erreur' },

  { nom: '🔴 une lecture ratee ecrase le commercant payant par une absence',
    // ⚠️ L ANCRE EST UNIQUE, ET C EST MESURE. « if (error || !data) { » avec
    // quatre espaces se trouve AUSSI dans une ligne indentee de HUIT espaces
    // huit mille lignes plus haut, parce qu une sous-chaine ignore les lignes :
    // la mutation mutait cette ligne-la et laissait la vraie intacte.
    //
    // 🔴 ET ELLE REINTRODUIT LE DEFAUT EXACT : ecrire dans l etat AVANT de
    // sortir de la branche d echec, donc remplacer un commercant payant par
    // `null`. C est ce que faisait le code avant le 22/09.
    de: '      setCommercantIllisible(true)',
    vers: '      setCommercant(data)',
    garde: 'et il n’écrase pas le dossier par une absence' },

  // ─── 22/09 : LES DEUX ECRANS DISENT LA MEME CHOSE DU MEME STATUT ────────
  //
  // 🔴 LA PAGE D ABONNEMENT AFFICHAIT « ABONNEMENT ACTIF », EN VERT, A UN
  // COMMERCANT EN RETARD DE PAIEMENT. Et c est l ecran ou nos propres emails
  // de relance l envoient : il lisait « ton paiement a echoue », cliquait, et
  // trouvait un badge vert.
  { nom: '🔴 LE DEFAUT D ORIGINE : le badge vert reprend le retard de paiement',
    fichier: 'app/dashboard/abonnement/page.js',
    de: '            {hasActiveSub && !enRetard && (',
    vers: '            {hasActiveSub && (',
    garde: 'le badge vert exclut le retard de paiement' },

  { nom: '🔴 le badge rouge disparait : le statut est connu, rien ne le montre',
    fichier: 'app/dashboard/abonnement/page.js',
    // ⚠️ « {enRetard && ( » VIT DEUX FOIS : le badge en tete de carte, puis le
    // bandeau qui porte le geste. `replace` ne touche que la PREMIERE, donc
    // cette mutation retire le BADGE et laisse le bandeau. C est exactement ce
    // qu il faut mesurer, et c est ce qui a montre que la garde d origine
    // etait trop faible : elle cherchait le motif, qui survivait dans l autre.
    de: '            {!isExempt && enRetard && (',
    vers: '            {false && (',
    garde: 'le retard a son propre badge' },

  { nom: '🔴 la page ne sait plus ce qu est un retard de paiement',
    fichier: 'app/dashboard/abonnement/page.js',
    de: "  const enRetard = commercant.subscription_status === 'past_due'",
    vers: '  const enRetard = false',
    garde: 'la page d’abonnement connaît le retard de paiement' },

  // 🔴 LE GESTE, PAS SEULEMENT LE CONSTAT. Le mail promet « Mettre a jour mes
  // informations de paiement » : la page doit tenir cette promesse.
  { nom: '🔴 le bandeau rouge constate sans dire quoi faire',
    fichier: 'app/dashboard/abonnement/page.js',
    de: 'Mets ton moyen de paiement à jour',
    vers: 'Ton abonnement est suspendu',
    garde: 'et il dit quoi faire' },


  // ─── LA PORTE, ET UNE SEULE ─────────────────────────────────────────────
  //
  // 🔴 LES TROIS MUTATIONS QUI VIVAIENT ICI GARDAIENT L ONGLET DE LA BARRE, et
  // cet onglet n existe plus : Alex l a vu a l ecran le 22/09, en meme temps
  // que le bouton du pied. « L onglet mon compte est a deux endroits, il doit
  // etre uniquement proche des alertes. » Ce qu on mesure s est donc INVERSE,
  // et les ancres qui visaient l onglet ne pointaient plus sur rien.
  { nom: '🔴 LE DEFAUT DU 22/09 : l onglet revient dans la barre, en double du bouton du pied',
    de: '  ].filter(Boolean)',
    vers: "    { id: 'compte', label: 'Mon compte', icon: 'user' } ].filter(Boolean)",
    garde: '« Mon compte » n’est pas un onglet de cette barre' },

  // 🔴 ET LE BOUTON DU PIED DISPARAIT D UNE DES DEUX BARRES. La barre laterale
  // n existe pas sous 1100 px : n en garder qu un laisse sans reponse ceux qui
  // travaillent sur leur telephone, c est-a-dire la plupart.
  { nom: '🔴 le bouton ne reste que dans une seule des deux barres',
    fichier: 'app/dashboard/page.js',
    de: "            <button onClick={() => ouvrirConfig('compte')}",
    vers: '            <button onClick={() => {}}',
    garde: 'le bouton « Mon compte » est dans les DEUX barres, et nulle part ailleurs' },

  // 🔴 LUI POSER UN FORFAIT LE FERMERAIT A CEUX QUI EN ONT LE PLUS BESOIN :
  // celui qui est en Exister ne pourrait plus lire qu il ne paie rien, et celui
  // dont l essai se termine ne verrait pas sa date.
  { nom: '🔴 un cadenas de forfait se pose sur le compte du commercant',
    fichier: 'app/dashboard/page.js',
    de: "              <IconCompte size={15} color={T.colTexte}/>",
    vers: "              {peut(commercant, 'export_comptable') && <IconCompte size={15} color={T.colTexte}/>}",
    garde: '« Mon compte » n’est derrière aucun forfait' },

  // 🔴 ET RIEN NE DIT PLUS OU L ON EST. Depuis que le compte n est plus un
  // onglet, aucun onglet ne s allume quand on le regarde : sans ce repere,
  // l ecran flotte au-dessus d une barre au repos.
  { nom: '🔴 le bouton ne montre plus qu on est sur son compte',
    fichier: 'app/dashboard/page.js',
    de: "  const surCompte = ongletPrincipal === 'config' && configTabUrl === 'compte'",
    vers: '  const surCompte = false',
    garde: 'le bouton s’allume quand on est sur son compte' },

  // ⚠️ ET IL LIT L ONGLET COURANT, PAS LA CLE DE MONTAGE. `configTab` sert de
  // `key` a ConfigDashboard : il ne bouge plus quand le commercant change
  // d onglet a l interieur, donc le bouton resterait allume sur les seize
  // autres. La mutation remet exactement cette version-la.
  { nom: '⚠️ le bouton lit la cle de montage au lieu de l onglet courant',
    fichier: 'app/dashboard/page.js',
    de: "  const surCompte = ongletPrincipal === 'config' && configTabUrl === 'compte'",
    vers: "  const surCompte = ongletPrincipal === 'config' && configTab === 'compte'",
    garde: 'et il lit l’onglet courant, pas la clé de montage' },

  { nom: '🔴 l onglet existe mais n affiche plus rien',
    de: "      {tab === 'compte' && <TabMonCompte commercant={commercant} toast={showToast} onSaved={rechargerCommercant} illisible={commercantIllisible} />}",
    vers: '' },

  { nom: '🔴 le contenu se cache derriere le forfait, en plus de la barre',
    de: "      {tab === 'compte' && <TabMonCompte commercant={commercant} toast={showToast} onSaved={rechargerCommercant} illisible={commercantIllisible} />}",
    vers: "      {tab === 'compte' && peut(commercant, 'export_comptable') && <TabMonCompte commercant={commercant} toast={showToast} />}" },

  // ─── CE QUE L ECRAN DIT ─────────────────────────────────────────────────
  // 🔴 LA LECON DE L OFFRE DE LANCEMENT : un texte qui devine sa date finit par
  // contredire la facture. La date affichee doit etre le miroir de Stripe.
  { nom: '🔴 la date de fin d essai se calcule en local au lieu de venir de Stripe',
    de: "  const finEssai = dateLongue(commercant?.subscription_trial_end)",
    vers: "  const finEssai = dateLongue(commercant?.essai_demande_le)" },

  { nom: '⚠️ le montant TVA comprise disparait : il ne voit plus ce qui sera debite',
    de: "              prix?.mensuel ? `${euros(prix.mensuel)} HTVA par mois, soit ${euros(ttc)} TVA comprise` : 'Gratuit à vie'",
    vers: "              prix?.mensuel ? `${euros(prix.mensuel)} HTVA par mois` : 'Gratuit à vie'" },

  { nom: '🔴 le rappel du moyen de paiement ne se declenche plus jamais',
    de: "  const rappelCarte = enEssai && joursAvantFin !== null && joursAvantFin <= 30",
    vers: "  const rappelCarte = false" },

  // ⚠️ UN RAPPEL QUI ARRIVE LA VEILLE NE SERT A RIEN : il faut le temps de
  // sortir sa carte, et souvent d en parler a son comptable.
  { nom: '⚠️ le rappel n arrive plus qu a la veille de la fin d essai',
    de: "  const rappelCarte = enEssai && joursAvantFin !== null && joursAvantFin <= 30",
    vers: "  const rappelCarte = enEssai && joursAvantFin !== null && joursAvantFin <= 1" },

  // 🔴 LE 200 QUI DIT NON. `postPro` rend la `Response` et ne leve pas sur un
  // code HTTP : lire le code sans lire le corps annonce une reussite sur un
  // refus, et le commercant attend un portail qui ne s ouvrira jamais.
  { nom: '🔴 le portail ne lit plus le corps de la reponse, seulement le code',
    de: "    if (!res.ok || !corps?.url) {",
    vers: "    if (!res.ok) {" },


  // ─── 22/09 : LA FORMULE GRATUITE ETAIT ABSENTE DES FORMULES ─────────────
  //
  // 🔴 Alex : « la formule exister est absente des formules ». L ecran
  // s appelait « Choisis ta formule » et n en montrait que deux, toutes les
  // deux payantes. Celui qui hesite ne lisait nulle part ce qu il GARDE s il
  // ne prend rien ; celui qui paie ne voyait pas ce qui lui reste s il arrete.
  { nom: '🔴 LE DEFAUT D ORIGINE : la formule gratuite disparait de la page',
    fichier: 'app/dashboard/abonnement/page.js',
    de: '                title="Exister"',
    vers: '                title="Formule de base"',
    garde: '🔴 la formule gratuite est sur la page des formules' },

  // ⚠️ ET LA CARTE GRATUITE SE RECONNAIT. Sans ca, un commercant deja en
  // Exister se verrait proposer de resilier un abonnement qu il n a pas.
  { nom: '🔴 la carte gratuite ne sait plus si c est sa formule',
    fichier: 'app/dashboard/abonnement/page.js',
    de: "                actuelle={plan === 'exister'}",
    vers: '                actuelle={false}',
    garde: 'les trois formules savent si elles sont la sienne' },

  // 🔴 LE PIEGE DU ZERO, ET IL SE VOIT A L ECRAN : `prixTTC` accepte le vrai 0
  // d Exister, comme il le doit. Sans le garde-fou, la carte annonce
  // « 0,00 € HTVA / mois » puis « soit 0,00 € TVA comprise ».
  { nom: '🔴 la carte gratuite annonce une TVA sur zero',
    fichier: 'app/dashboard/abonnement/page.js',
    de: '  const ttc = gratuite ? null : prixTTC(price)',
    vers: '  const ttc = prixTTC(price)',
    garde: 'la formule gratuite n’annonce pas une TVA sur zéro' },

  { nom: '⚠️ le prix de la gratuite se dit en euros au lieu de mots',
    fichier: 'app/dashboard/abonnement/page.js',
    de: "          {gratuite ? 'Gratuit' : euros(price)}",
    vers: '          {euros(price)}',
    garde: 'et son prix se dit en mots, pas en euros' },

  // 🔴 DESCENDRE EN EXISTER, C EST RESILIER. « Changer pour cette formule »
  // envoie un abonne au portail sans lui dire ce qu il va y faire.
  { nom: '🔴 la resiliation reprend le libelle d un changement de formule',
    fichier: 'app/dashboard/abonnement/page.js',
    de: "'Résilier mon abonnement'",
    vers: "'Changer pour cette formule'",
    garde: 'descendre en Exister s’appelle par son nom' },

  // ⚠️ ET LA LISTE NE VEND RIEN QU ELLE N A PAS : la matrice ferme `deals`,
  // `push_cibles_favoris`, `commande`, `rdv`, `paiement_ligne` et `fidelite`
  // en Exister. Promettre l un d eux vide Communiquer de son sens.
  { nom: '🔴 la gratuite se met a promettre les deals et les push',
    fichier: 'app/dashboard/abonnement/page.js',
    de: "                  'Favoris et signaux : le quartier te dit ce qu’il cherche',",
    vers: "                  'Deals du jour et push à tes favoris',",
    garde: 'la formule gratuite ne promet pas les deals' },

  // 🔴 UNE ACTU PAR SEMAINE, PAS UNE PAR JOUR. Le plafond vit dans le code
  // depuis le 01/07, decision d Alex contre la cannibalisation de Communiquer,
  // et deux ecrans du produit l annoncaient encore faux.
  { nom: '🔴 la gratuite annonce une place quotidienne dans le Good Morning',
    fichier: 'app/dashboard/abonnement/page.js',
    de: "                  'Une actu par semaine, publiée dans le Good Morning de ta commune',",
    vers: "                  'Ta place chaque matin dans le Good Morning de ta commune',",
    garde: 'et elle dit le plafond du Good Morning' },


  // ─── 22/09 : OU MET-IL SA CARTE ? ───────────────────────────────────────
  //
  // 🔴 Question d Alex. La reponse etait bonne, l ecran ne la donnait pas : le
  // paragraphe parlait de sa carte, le bouton s appelait « Gerer mon
  // abonnement », et le mot « carte » n apparaissait sur aucun bouton tant
  // qu il n etait pas a trente jours de sa premiere facture.
  { nom: '🔴 le bouton du portail ne nomme plus la carte',
    de: "              {portail ? 'Ouverture…' : 'Gérer ma carte et mes factures'}",
    vers: "              {portail ? 'Ouverture…' : 'Gérer mon abonnement'}",
    garde: 'le bouton du portail nomme la carte' },

  // ⚠️ ET CELUI QUI N A PAS ENCORE D ABONNEMENT APPREND CE QUI L ATTEND. Sans
  // cette phrase, l ecran constate qu il n a rien a gerer et s arrete la.
  { nom: '⚠️ l ecran ne dit plus quand la carte sera demandee',
    de: 'Quand tu prendras une formule, aucune carte ne te sera demandée tant que ton essai court : on te préviendra un mois avant la première facture, et tu l’enregistreras depuis cet écran.',
    vers: '',
    garde: 'et l’écran dit quand la carte sera demandée' },

  // 🔴 LES DEUX ROUTES DE L ABONNEMENT, ramenees au point central le 22/09.
  // Elles portaient chacune sa copie de l adresse admin et sa propre
  // verification de propriete, et ce sont LES routes de l argent.
  { nom: '🔴 le portail de facturation reecrit sa propre garde',
    fichier: 'app/api/stripe/billing/portal/route.js',
    de: '    const garde = await gardeCommercant(req, supabase, commercantId)',
    vers: '    const garde = { ok: true }',
    garde: 'stripe/billing/portal passe par la garde partagée' },

  { nom: '🔴 la souscription reecrit sa propre garde',
    fichier: 'app/api/stripe/billing/checkout/route.js',
    de: '    const garde = await gardeCommercant(req, supabase, commercantId)',
    vers: '    const garde = { ok: true }',
    garde: 'stripe/billing/checkout passe par la garde partagée' },

  { nom: '🔴 la souscription recopie l adresse admin',
    fichier: 'app/api/stripe/billing/checkout/route.js',
    de: "import { gardeCommercant } from '@/lib/api-auth'",
    vers: "import { gardeCommercant } from '@/lib/api-auth'; const ADMIN_EMAIL = 'verstappenalexandre@gmail.com'",
    garde: 'stripe/billing/checkout ne recopie pas l’adresse admin' },

  // ⚠️ ET LA VERIFICATION DE PROPRIETE NE REVIENT PAS A COTE DE LA GARDE :
  // deux gardes pour une porte, c est celle qu on oublie qui decide.
  { nom: '⚠️ le portail garde sa verification de propriete en double',
    fichier: 'app/api/stripe/billing/portal/route.js',
    de: '    if (!commercant.stripe_customer_id) {',
    vers: "    if (commercant.auth_user_id !== user.id) { return NextResponse.json({ error: 'accès refusé' }, { status: 403 }) } if (!commercant.stripe_customer_id) {",
    garde: 'stripe/billing/portal ne garde pas sa vérification de propriété en double' },


  // ─── 22/09 : LE RETOUR DE STRIPE ────────────────────────────────────────
  //
  // 🔴 LA MUTATION QUI COMPTE EST LA PREMIERE : elle remet la forme naturelle,
  // celle qu on ecrit sans y penser, et qui ouvre une redirection vers
  // n importe quel site au retour de la facturation.
  { nom: '🔴 la route accepte une adresse de retour envoyee par le client',
    fichier: 'app/api/stripe/billing/portal/route.js',
    de: '    const returnUrl = `${appUrl}${chemin}`',
    vers: '    const returnUrl = body.retour || `${appUrl}${chemin}`',
    garde: '🔴 et jamais d’une adresse envoyée par le client' },

  { nom: '⚠️ la liste des retours oublie « Mon compte »',
    fichier: 'app/api/stripe/billing/portal/route.js',
    de: "      compte: '/dashboard?onglet=config&config=compte',",
    vers: "      compte: '/dashboard/abonnement',",
    garde: 'la liste connaît compte' },

  { nom: '⚠️ la cle inconnue n est plus filtree par la liste',
    fichier: 'app/api/stripe/billing/portal/route.js',
    de: '    const chemin = Object.hasOwn(RETOURS, demande) ? RETOURS[demande] : RETOURS.abonnement',
    vers: '    const chemin = RETOURS[demande] || RETOURS.abonnement',
    garde: 'le retour du portail se choisit dans une liste tenue par le serveur' },

  { nom: '🔴 « Mon compte » n annonce plus son ecran de depart',
    de: "    const res = await postPro('/api/stripe/billing/portal', { commercantId: commercant.id, retour: 'compte' })",
    vers: "    const res = await postPro('/api/stripe/billing/portal', { commercantId: commercant.id })",
    garde: 'et le départ depuis « Mon compte » est annoncé à la route' },

  { nom: '⚠️ la page d abonnement n annonce plus le sien',
    fichier: 'app/dashboard/abonnement/page.js',
    de: "        body: JSON.stringify({ commercantId: commercant.id, retour: 'abonnement' }),",
    vers: '        body: JSON.stringify({ commercantId: commercant.id }),',
    garde: 'la page d’abonnement annonce son propre retour' },

  // ⚠️ ET LE VOUVOIEMENT REVIENT PAR OU IL ETAIT RESTE : le titre en capitales
  // de la carte, que quatre passes de relecture n avaient pas vu.
  { nom: '⚠️ le titre de la carte revouvoie le commercant',
    fichier: 'app/dashboard/abonnement/page.js',
    de: '>Ta formule actuelle</p>',
    vers: '>Votre formule actuelle</p>',
    garde: 'la page d’abonnement ne vouvoie plus (\\b[Vv]otre\\b)' },


  // ─── 22/09 : LE ROUGE CHEZ QUELQU UN A QUI ON NE DEMANDE RIEN ───────────
  //
  // 🔴 `cron/billing-relances` ignore les fiches en partenariat, mais STRIPE ne
  // sait rien de `billing_exempt` : un abonnement d essai laisse ouvert sur une
  // de ces fiches bascule en `past_due` tout seul. La regle vivait a TROIS
  // endroits et deux l ignoraient.
  { nom: '🔴 le bandeau de retard revient chez un exempte (Mon compte)',
    de: '      {!exempt && enRetard && (',
    vers: '      {enRetard && (',
    garde: 'le bandeau de retard ne s’affiche pas chez un exempté' },

  { nom: '🔴 le badge de retard revient chez un exempte (page abonnement)',
    fichier: 'app/dashboard/abonnement/page.js',
    de: '            {!isExempt && enRetard && (',
    vers: '            {enRetard && (',
    garde: 'et aucun des deux ne s’affiche chez un exempté' },

  { nom: '🔴 le bandeau de retard revient chez un exempte (page abonnement)',
    fichier: 'app/dashboard/abonnement/page.js',
    de: '              {!isExempt && enRetard && (',
    vers: '              {enRetard && (',
    garde: 'et son bandeau rouge, distinct du badge' },


  // ─── 22/09 : LE WEBHOOK RETROGRADAIT UN EXEMPTE ─────────────────────────
  //
  // 🔴 TROUVE EN PREPARANT LE SCRIPT QUI ANNULE LES ESSAIS DES SIX FICHES DE
  // DEMONSTRATION : l annulation declenche `customer.subscription.deleted`, et
  // ce webhook ecrivait `plan = 'exister'` sans regarder l exemption. Le geste
  // prevu aurait vide les fiches de leurs fonctions en pleine revue Google.
  { nom: '🔴 une mise a jour d abonnement retrograde de nouveau un exempte',
    fichier: 'app/api/stripe/billing/webhook/route.js',
    de: '  if (!commercant.billing_exempt) {',
    vers: '  if (true) {',
    garde: '🔴 une mise à jour d’abonnement ne rétrograde pas un exempté' },

  { nom: '🔴 l annulation retrograde de nouveau un exempte',
    fichier: 'app/api/stripe/billing/webhook/route.js',
    de: "  if (!commercant.billing_exempt) updates.plan = 'exister'",
    vers: "  updates.plan = 'exister'",
    garde: '🔴 et une annulation non plus' },

  // ⚠️ ET LA COLONNE DISPARAIT DU SELECT : la garde lirait `undefined` et
  // s ouvrirait au lieu de se fermer. Defaut le plus frequent du depot.
  { nom: '🔴 l exemption disparait du select du webhook',
    fichier: 'app/api/stripe/billing/webhook/route.js',
    de: "    .select('id, plan, stripe_subscription_id, billing_exempt')",
    vers: "    .select('id, plan, stripe_subscription_id')",
    garde: 'le select de la mise à jour porte l’exemption' },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    const echecs = [...sortie.matchAll(/• ([^\n—]+)/g)].map(m => m[1].trim())
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTE ». Un banc qui explose au lieu de
    // rougir n est pas une mesure, c est un accident.
    const plante = !/vérifications/.test(sortie)
    return { rouge: true, echecs, plante, extrait: sortie.slice(-400) }
  }
}

const depart = lancer()
if (depart.rouge) {
  console.log(`🔴 ${BANC} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
  console.log(depart.extrait)
  process.exit(1)
}
console.log('Banc vert au départ.\n')

let attrapees = 0
const manquees = []

for (const m of MUTATIONS) {
  const f = chemin(m.fichier || MODULE)
  const original = readFileSync(f, 'utf8')
  if (!original.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  ecrireSur(f, original.replace(m.de, m.vers))
  const res = lancer()
  ecrireSur(f, original)

  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier || MODULE}. On s'arrête.`)
    process.exit(2)
  }

  // 🔴 ROUGE NE SUFFIT PAS : ROUGE SUR LA BONNE GARDE (ajoute le 22/09). Une
  // mutation peut casser une garde VOISINE et passer pour une mesure de celle
  // qu on visait ; la vraie garde reste alors non eprouvee tout en paraissant
  // tenue. Les mutations qui declarent une `garde` sont donc verifiees par son
  // nom ; celles d avant, qui n en declarent pas, gardent l ancien contrat.
  if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else if (!res.rouge) { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
  else if (m.garde && !(res.echecs || []).some(e => e.includes(m.garde))) {
    manquees.push(`${m.nom} — rouge sur une AUTRE garde : ${(res.echecs || []).slice(0, 2).join(' / ') || '(aucune nommée)'}`)
    console.log(`  ⚠ mauvaise garde : ${m.nom}`)
  }
  else { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach(x => console.log('   • ' + x)) }

const finalRouge = lancer().rouge
if (finalRouge) console.log(`🔴 ${BANC} ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
