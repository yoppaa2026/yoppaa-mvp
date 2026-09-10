// Harnais de mutation de la RESERVATION DE TABLE.
//
// Le banc est parti vert du premier coup, ce qui ne prouve rien : une garde
// qui n a jamais rougi ne garde rien. Chaque mutation ci-dessous remet un
// defaut plausible, et le banc doit le voir.
//
// ⚠️ Aucune ancre ne contient de saut de ligne. Restauration par CONTENU.
import { ecrireSur } from './harnais-mutation.mjs'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
// ⚠️ DEUX BANCS, ET C EST LA LECON DU MATIN. Ce harnais mute aussi les gardes
// de la commande en ligne, dont les verifications vivent dans `verif:gardes`.
// Avec le seul `verif:table`, ces mutations auraient ete declarees NON
// ATTRAPEES alors que la garde existait : un harnais qui mesure avec le mauvais
// instrument fait douter d un code juste.
const BANC = 'verif:table && npm run verif:gardes'
const MODULE = 'lib/reservation-metier.js'

const MUTATIONS = [
  // 🔴 LE METIER DECIDE DE LA FONCTION. L inverser donnerait `rdv` au
  // restaurant, une fonction que la matrice reserve a la vitrine : il perdrait
  // sa reservation sans qu aucune erreur ne le dise.
  { nom: '🔴 le restaurant repasse sur la fonction rdv',
    de: "  return isAlimentaire(commercant) ? 'reservation_table' : 'rdv'",
    vers: "  return 'rdv'" },

  { nom: '🔴 le salon bascule sur la reservation de table',
    de: "  return isAlimentaire(commercant) ? 'reservation_table' : 'rdv'",
    vers: "  return 'reservation_table'" },

  // 🔴 LES DEUX CONDITIONS. Le droit sans l interrupteur affiche une
  // reservation chez quelqu un qui n a jamais ouvert une plage.
  { nom: '🔴 l interrupteur cesse de compter',
    de: "  return commercant?.rdv_actif === true && peutReserver(commercant, maintenant)",
    vers: '  return peutReserver(commercant, maintenant)' },

  // 🔴 ET LE DROIT AUSSI : sans lui, la reservation reste allumee apres un
  // changement de forfait et le client reserve dans le vide.
  { nom: '🔴 le forfait cesse de compter',
    de: "  return commercant?.rdv_actif === true && peutReserver(commercant, maintenant)",
    vers: '  return commercant?.rdv_actif === true' },

  // ⚠️ UNE CLE INCONNUE NE DOIT PAS S AFFICHER : un `undefined` se rend tel
  // quel dans du JSX, et se lit a l ecran du client.
  { nom: '⚠️ une cle de libelle inconnue rend undefined',
    de: "  return Object.prototype.hasOwnProperty.call(mots, cle) ? mots[cle] : ''",
    vers: '  return mots[cle]' },

  // 🔴 UN RESTAURANT N A PAS DEUX FICHES. Le renvoyer sur la fiche agenda lui
  // ferait perdre sa carte a emporter, qui est son autre metier.
  { nom: '🔴 la fiche du restaurant devient son agenda',
    de: "  return isAlimentaire(commercant) || commercant.categorie === 'detail'",
    vers: '  return false' },

  // 🔴 LA PASTILLE : elle s ajoute, elle ne remplace pas.
  { nom: '🔴 la pastille de table s affiche sans l interrupteur',
    fichier: 'lib/plans.js',
    de: "    if (canDoAvecCategorie(plan, 'reservation_table', categorie) && commercant?.rdv_actif === true) {",
    vers: "    if (canDoAvecCategorie(plan, 'reservation_table', categorie)) {" },

  { nom: '🔴 la pastille de table disparait',
    fichier: 'lib/plans.js',
    de: "      pills.push({ key: 'table', label: 'Réserver une table' })",
    vers: '      void 0' },

  // 🔴 LE CABLAGE : la page de reservation redevient reservee aux vitrines.
  { nom: '🔴 la page de reservation referme la porte au restaurant',
    fichier: 'app/commander/rdv/[slug]/page.js',
    de: '      if (!isVitrine(c) && !reservationActive(c)) {',
    vers: '      if (!isVitrine(c)) {' },

  { nom: '🔴 la fiche du restaurant perd son bouton',
    fichier: 'app/commander/[slug]/page.js',
    de: '  const peutPrendreRdv = reservationActive(commercant)',
    vers: "  const peutPrendreRdv = isVitrine(commercant) && commercant?.rdv_actif === true" },

  { nom: '🔴 l onglet du tableau de bord se referme',
    fichier: 'app/dashboard/page.js',
    de: 'visible: !!commercant?.rdv_actif || peutReserver(commercant) }',
    vers: 'visible: !!commercant?.rdv_actif }' },

  // ⚠️ ANCRE REMISE LE 09/09 : les interrupteurs ont ete regroupes dans un seul
  // bloc, et la condition a migre dans une variable. On vise la DEFINITION.
  { nom: '🔴 l interrupteur se referme sur la vitrine',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '          const aResa      = peutReserver(form)',
    vers: "          const aResa      = form.categorie === 'vitrine' && peut(form, 'rdv')" },

  // ─── LOT 2 : LES COUVERTS ─────────────────────────────────────────────────
  //
  // 🔴 UNE TABLE N EST PAS UNE PLACE. Compter les lignes ferait entrer vingt
  // tables dans une salle de vingt couverts.
  { nom: '🔴 la salle recompte des lignes au lieu des couverts',
    fichier: 'lib/cours-collectifs.js',
    de: '  return (reservations || []).reduce((s, r) => s + (enCouverts ? couvertsDe(r) : 1), 0)',
    vers: '  return (reservations || []).length' },

  // 🔴 LE MAXIMUM NE DOIT JAMAIS DEPASSER LA SALLE : sinon le client choisit
  // douze couverts dans une salle de huit et va jusqu au bout pour lire
  // « complet ».
  { nom: '🔴 le maximum de couverts cesse d etre borne par la salle',
    fichier: 'lib/cours-collectifs.js',
    de: '  return { min: Math.min(min, capacite), max: Math.max(Math.min(min, capacite), Math.min(max, capacite)) }',
    vers: '  return { min, max }' },

  { nom: '🔴 le serveur accepte n importe quel nombre de couverts',
    fichier: 'lib/cours-collectifs.js',
    de: '  return n >= min && n <= max ? n : null',
    vers: '  return n' },

  // 🔴 DEUX TABLES NE SONT PAS DEUX SEANCES. Avec l egalite stricte des bornes,
  // une table a 20h30 tombait dans « les autres » et etait refusee pour
  // occupation : un restaurant n aurait pris qu une table par heure ronde.
  { nom: '🔴 les tables qui se chevauchent se bloquent de nouveau',
    de: '      ? plages.filter(p => (prestationId === null || p.prestation_id === prestationId)',
    vers: '      ? plages.filter(p => p.start === debut && p.end === fin && (prestationId === null || p.prestation_id === prestationId)',
    fichier: 'lib/rdv-slots.js' },

  { nom: '🔴 la salle recompte des lignes dans le moteur',
    fichier: 'lib/rdv-slots.js',
    de: '    ? memeSeance.reduce((s, p) => s + p.couverts, 0)',
    vers: '    ? memeSeance.length' },

  // 🔴 CE QU ON DEMANDE COMPTE AUSSI : une salle ou il reste deux couverts
  // n est pas libre pour une table de six.
  { nom: '🔴 la taille de la table demandee cesse de compter',
    fichier: 'lib/rdv-slots.js',
    de: '  if (places > 1 && occupes + demandes > places) {',
    vers: '  if (places > 1 && occupes >= places) {' },

  // 🔴 L INDEX UNIQUE NE PROTEGE PAS CETTE JAUGE : sans ce controle, une
  // requete forgee reserve cinquante couverts.
  { nom: '🔴 le serveur cesse de compter la salle',
    fichier: 'lib/rdv-creation-server.js',
    de: '    if (occupes + couvertsRetenus > capacite) {',
    vers: '    if (false) {' },

  { nom: '🔴 l appelant peut imposer son propre nombre de couverts',
    fichier: 'lib/rdv-creation-server.js',
    de: '    couverts: couvertsRetenus,',
    vers: '    ...(null || {}),' },

  // 🔴 LA CASE « C EST UNE TABLE » NE DOIT PAS SORTIR DE L ALIMENTAIRE : un
  // salon de coiffure garderait une prestation en mode table apres un
  // changement de categorie.
  { nom: '🔴 le mode table se pose hors de l alimentaire',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '      par_couverts: estTable ? !!form.par_couverts : false,',
    vers: '      par_couverts: !!form.par_couverts,' },

  { nom: '🔴 la case table s affiche chez tout le monde',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '  const estTable = isAlimentaire(commercant) && peutReserver(commercant)',
    vers: '  const estTable = true' },

  // ⚠️ UNE BORNE VIDE VAUT NULL, PAS ZERO : zero passe la contrainte de base
  // et proposerait « 0 personne » au client.
  { nom: '⚠️ une borne vide devient zero',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: "      couverts_min: estTable && form.par_couverts && form.couverts_min !== '' ? Number(form.couverts_min) : null,",
    vers: '      couverts_min: Number(form.couverts_min) || 0,' },

  // ─── L INTERRUPTEUR DE LA COMMANDE EN LIGNE ───────────────────────────────
  //
  // 🔴 LE PIEGE QUI AURAIT COUPE LE PARC ENTIER. La colonne s ajoute a la table
  // AVANT d exister dans la vue publique : pendant ce temps-la elle vaut
  // `undefined` chez chaque visiteur. Avec `=== true`, la commande en ligne
  // disparaissait partout le temps d une migration, sans une seule erreur.
  { nom: '🔴 une colonne pas encore lue FERME au lieu d ouvrir',
    fichier: 'lib/plans.js',
    de: '  return commercant?.commande_actif !== false',
    vers: '  return commercant?.commande_actif === true' },

  { nom: '🔴 la pastille Commander ignore l interrupteur',
    fichier: 'lib/plans.js',
    de: "    if (canDoAvecCategorie(plan, 'commande', categorie) && commandeAllumee(commercant)) {",
    vers: "    if (canDoAvecCategorie(plan, 'commande', categorie)) {" },

  // 🔴 UNE GARDE D ECRAN N EST JAMAIS UNE REPONSE : sans le serveur, la fiche
  // n affiche plus rien mais un lien direct vers le tunnel passe encore.
  { nom: '🔴 le serveur accepte une commande chez qui l a eteinte',
    fichier: 'app/api/stripe/checkout/create-commande/route.js',
    de: '      if (!commandeAllumee(commercant)) {',
    vers: '      if (false) {' },

  // ⚠️ ANCRE REMISE LE 09/09 : la variable a change de nom quand « ce que le
  // commerce accepte » a ete distingue de « ce que le client fait maintenant ».
  { nom: '🔴 la fiche publique ignore l interrupteur',
    fichier: 'app/commander/[slug]/page.js',
    de: "  const commerceAccepteCommandes = canDo(forfaitVivant, 'commande') && commandeAllumee(commercant)",
    vers: "  const commerceAccepteCommandes = canDo(forfaitVivant, 'commande')" },

  // ─── LA JOURNEE QUI FINIT APRES MINUIT ────────────────────────────────────
  //
  // 🔴 SIX JOURS SUR SEPT ETAIENT MUETS chez une brasserie ouverte jusqu a
  // minuit ou 02:00, et aucune erreur ne le disait.
  // ⚠️ LA REGLE A CHANGE DE FICHIER LE 09/09, ET LES ANCRES ONT SUIVI. Elle vit
  // dans le module bas, `deplacement-rdv`, parce que l agenda du commercant en
  // a besoin lui aussi et que `rdv-slots` importe deja de la-bas. Sans ce
  // deplacement d ancre, les deux mutations auraient continue de passer en
  // silence sur un fichier qui ne porte plus la fonction.
  { nom: '🔴 une fermeture apres minuit retombe avant l ouverture',
    fichier: 'lib/deplacement-rdv.js',
    de: '  return franchitMinuit(debutMin, finMin) ? finMin + 1440 : finMin',
    vers: '  return finMin' },

  // ⚠️ L EGALITE COMPTE : 09:00-09:00 veut dire vingt-quatre heures, pas zero.
  { nom: '⚠️ une fermeture a l heure d ouverture cesse de faire le tour',
    fichier: 'lib/deplacement-rdv.js',
    de: '  return Number.isFinite(debutMin) && Number.isFinite(finMin) && finMin <= debutMin',
    vers: '  return Number.isFinite(debutMin) && Number.isFinite(finMin) && finMin < debutMin' },

  { nom: '🔴 le moteur reclippe la journee a deux heures du matin',
    fichier: 'lib/rdv-slots.js',
    de: '    ? finApresMinuit(shopOpen, timeToMinutes(horaireJour.fin))',
    vers: '    ? timeToMinutes(horaireJour.fin)' },

  // ⚠️ UNE ALERTE QUI SE DECLENCHE SUR TOUT NE PROTEGE PLUS RIEN.
  { nom: '🔴 l alerte hors horaires redevient aveugle a minuit',
    fichier: 'lib/rdv-slots.js',
    de: '    plages.push([d1, finApresMinuit(d1, timeToMinutes(h.fin))])',
    vers: '    plages.push([d1, timeToMinutes(h.fin)])' },

  { nom: '🔴 la copie de plages rabote chez un bar de nuit',
    fichier: 'lib/rdv-slots.js',
    de: '    plages.push([a1, finApresMinuit(a1, timeToMinutes(horaireJour.fin))])',
    vers: '    plages.push([a1, timeToMinutes(horaireJour.fin)])' },

  { nom: '🔴 le controle final du tunnel oublie minuit',
    fichier: 'app/commander/rdv/[slug]/page.js',
    de: '        plagesShop.push([a1, finApresMinuit(a1, timeToMinutes(horaireJour.fin))])',
    vers: '        plagesShop.push([a1, timeToMinutes(horaireJour.fin)])' },

  // ─── EMPORTER OU S ASSEOIR ────────────────────────────────────────────────
  //
  // 🔴 LE COEUR DE LA CORRECTION : sans cette ligne, le choix ne serait qu un
  // bandeau de plus, et la carte se remplirait quand meme. Le client venu
  // reserver une table croirait devoir composer son repas.
  { nom: '🔴 la carte se remplit avant que le client ait choisi',
    fichier: 'app/commander/[slug]/page.js',
    de: "  const peutCommander = commerceAccepteCommandes && (!choisitSonParcours || intentionResto === 'emporter')",
    vers: '  const peutCommander = commerceAccepteCommandes' },

  // ⚠️ ET LE CHOIX NE S IMPOSE PAS HORS DU RESTAURANT : chez un salon, acheter
  // son shampoing en prenant son rendez-vous est le geste le plus naturel.
  { nom: '⚠️ le choix s impose aussi aux salons',
    fichier: 'app/commander/[slug]/page.js',
    de: '  const choisitSonParcours = commerceAccepteCommandes && peutPrendreRdv && isAlimentaire(commercant)',
    vers: '  const choisitSonParcours = commerceAccepteCommandes && peutPrendreRdv' },

  // ⚠️ CE QUI DECRIT LE COMMERCE NE SUIT PAS L INTENTION DU CLIENT.
  { nom: '🔴 on reclame l activation de la commande a qui l a activee',
    fichier: 'app/commander/[slug]/page.js',
    de: '                {!commerceAccepteCommandes && !vitrine && (',
    vers: '                {!peutCommander && !vitrine && (' },

  { nom: '🔴 le bouton qui transporte le panier reapparait au restaurant',
    fichier: 'app/commander/[slug]/page.js',
    de: '                {peutPrendreRdv && !choisitSonParcours && (() => {',
    vers: '                {peutPrendreRdv && (() => {' },

  // ─── « OUVERT OU FERME » AUX TROIS AUTRES ENDROITS ────────────────────────
  //
  // 🔴 LE DEFAUT QU ALEX A VU A 11h20 : « Ferme · ouvre demain a 09:00 » sur un
  // commerce ouvert de 09:00 a 00:00.
  { nom: '🔴 la pastille de fiche oublie minuit',
    fichier: 'lib/ouverture.js',
    de: '  const finDe = (d, f) => finApresMinuit(parseHHMM(d), parseHHMM(f))',
    vers: '  const finDe = (d, f) => parseHHMM(f)' },

  // ⚠️ A UNE HEURE DU MATIN, C EST LA VEILLE QUI COURT ENCORE.
  { nom: '⚠️ la nuit d avant cesse de compter',
    fichier: 'lib/ouverture.js',
    de: '    if (fin > 1440 && minNow + 1440 < fin) {',
    vers: '    if (false) {' },

  // 🔴 LA LIMITE DE COMMANDE TRIAIT DES CHAINES : entre « 00:00 » et « 14:00 »
  // elle rendait 14:00, et sur une seule plage 09:00-00:00 elle rendait ZERO.
  { nom: '🔴 la limite de commande retombe a zero a minuit',
    fichier: 'lib/ouverture.js',
    de: '  const derniere = Math.max(...fins)',
    vers: '  const derniere = Math.min(...fins)' },

  { nom: '🔴 le statut de la liste oublie minuit',
    fichier: 'app/commander/page.js',
    de: '      if (nowMin >= heureEnMinutes(d) && nowMin < finMin(d, f)) {',
    vers: '      if (nowMin >= heureEnMinutes(d) && nowMin < heureEnMinutes(f)) {' },

  // 🔴 L ONGLET S OUVRAIT SUR DU VIDE : la barre etait ouverte au restaurant,
  // le CONTENU gardait la fonction reservee a la vitrine.
  { nom: '🔴 l onglet Reservations redevient blanc chez un restaurant',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '  const peutRdv       = peutReserver(commercant)',
    vers: "  const peutRdv       = peut(commercant, 'rdv')" },

  // ═══ 10/09 : « POURQUOI CA BLOQUE APRES DEUX RESAS ? » ══════════════════
  //
  // 🔴 LE DEFAUT QU ALEX A TOUCHE : le rang de la table retenue se cherchait
  // dans son seul format, et l index sans prestation le rejetait.
  { nom: '🔴 le rang d une table retombe a 1',
    fichier: 'lib/rdv-creation-server.js',
    de: '    placeNo = rangLibre((memeHeure || []).map(r => r.place_no))',
    vers: '    placeNo = 1' },

  { nom: '🔴 le rang d une table retrouve un plafond',
    fichier: 'lib/cours-collectifs.js',
    de: '  while (prises.has(rang)) rang++',
    vers: '  while (prises.has(rang) && rang < 2) rang++' },

  // 🔴 LA DUREE CONTROLEE ET LA DUREE ECRITE : la meme variable.
  { nom: '🔴 la duree ecrite redevient celle de la table retenue',
    fichier: 'lib/rdv-creation-server.js',
    de: '    duree_minutes: dureeRetenue,',
    vers: '    duree_minutes: dureeSelonCouverts(prestationRetenue, couvertsRetenus),' },

  { nom: '🔴 la table designee par la requete decide de la duree',
    fichier: 'lib/rdv-creation-server.js',
    de: '      if (reference) dureeRetenue = dureeSelonCouverts(reference, couvertsRetenus)',
    vers: '      void reference' },

  { nom: '🔴 le controle du creneau mesure une autre duree que celle ecrite',
    fichier: 'lib/rdv-creation-server.js',
    de: '      finMin: timeToMinutes(heure) + dureeRetenue,',
    vers: '      finMin: timeToMinutes(heure) + dureeSelonCouverts(prestation, champs?.couverts),' },

  // 🔴 LA GRILLE : une table d un autre format n est pas un conflit.
  { nom: '🔴 la regle ignore la salle qu on lui donne',
    fichier: 'lib/rdv-slots.js',
    de: '  if (salle && enModeInventaire(salle.formats)) {',
    vers: '  if (false) {' },

  { nom: '🔴 la grille ne transmet plus la salle',
    fichier: 'lib/rdv-slots.js',
    de: '        salle,',
    vers: '        salle: null,' },

  // 🔴 LE PIEGE DU ZERO : des minutes lues comme des heures vident la salle.
  // ⚠️ MANQUEE AU PREMIER PASSAGE : un debut a 0 chevauche encore 19h. C est une
  // fenetre AVANT la reservation qui la voit, ajoutee au banc.
  { nom: '🔴 le debut d une reservation en minutes retombe a zero',
    fichier: 'lib/inventaire-salle.js',
    de: "    const d = typeof r.start === 'number' ? r.start : timeToMinutes(r.heure_debut)",
    vers: '    const d = timeToMinutes(r.heure_debut)' },

  { nom: '🔴 la grille perd les couverts en recopiant les reservations',
    fichier: 'lib/rdv-slots.js',
    de: '    couverts: r.couverts,',
    vers: '' },

  { nom: '🔴 la fin d une reservation en minutes retombe a zero',
    fichier: 'lib/inventaire-salle.js',
    de: "    const f = typeof r.end === 'number' ? r.end : timeToMinutes(r.heure_fin)",
    vers: '    const f = timeToMinutes(r.heure_fin)' },

  // 🔴 LA FICHE : trois questions, une regle.
  { nom: '🔴 le controle d avant envoi recopie ses arguments et oublie la salle',
    fichier: 'app/commander/rdv/[slug]/page.js',
    de: '        ...regleOccupation(busy),',
    vers: '        capacite: capacitePrestation(prestationChoisie),' },

  { nom: '⚠️ la salle recoit les reservations filtrees par praticien',
    fichier: 'app/commander/rdv/[slug]/page.js',
    de: '        ...regleOccupation(reservations),',
    vers: '        ...regleOccupation(reservationsFiltrees),' },

  { nom: '⚠️ une table prise redit « la derniere place »',
    fichier: 'app/commander/rdv/[slug]/page.js',
    de: '          setSubmitError(estParCouverts(prestationChoisie) ? phraseTablePrise : j.collectif',
    vers: '          setSubmitError(j.collectif' },

  // 🔴 LE TABLEAU DE BORD : la saisie au telephone et le deplacement.
  { nom: '🔴 deux tables redeviennent un conflit au telephone',
    fichier: 'lib/deplacement-rdv.js',
    de: '    if (estTable && idsSalle.has(String(r.prestation_id))) return false',
    vers: '    if (false) return false' },

  { nom: '🔴 la saisie au telephone ne donne plus le catalogue',
    fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: '        prestations,',
    vers: '' },

  { nom: '🔴 le deplacement ne donne plus le catalogue',
    fichier: 'app/dashboard/ModalDeplacerRdv.js',
    de: '    prestations,',
    vers: '' },

  { nom: '🔴 la saisie cherche encore le rang dans le seul format',
    fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: '        for (const d of toutesLesDates) placeParDate[d] = rangLibre(rangsParDate[d] || [])',
    vers: '        for (const d of toutesLesDates) placeParDate[d] = 1' },

  { nom: '🔴 une table deplacee redevient un cours',
    fichier: 'app/dashboard/ModalDeplacerRdv.js',
    de: '  const estCours = !estTable && capacite > 1',
    vers: '  const estCours = capacite > 1' },

  // 🔴 LA DIXIEME COLONNE ABSENTE, et la garde qui ne la voyait pas.
  { nom: '🔴 le tableau de bord recharge ses prestations sans par_couverts',
    fichier: 'app/dashboard/page.js',
    de: ", capacite, par_couverts, couverts_min, couverts_max, duree_paliers')",
    vers: ", capacite')" },

  // ✅ DECISION D ALEX DU 10/09 : le minimum d une table reste STRICT, et
  // l ecran le dit la ou on le regle et sur la carte.
  { nom: '🔴 le moteur ignore le minimum d une table',
    fichier: 'lib/inventaire-salle.js',
    de: '      return taille !== null && n >= minimumDe(f) && n <= taille',
    vers: '      return taille !== null && n <= taille' },

  { nom: '🔴 le formulaire ne dit plus ce que fait le minimum',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '                {Number(form.couverts_min) > 1',
    vers: '                {false' },

  { nom: '🔴 la carte cache de nouveau le minimum',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '                          {Number(p.couverts_min) > 1',
    vers: '                          {false' },

  // ═══ 10/09 : L AGENDA D UNE SALLE ════════════════════════════════════════
  { nom: '🔴 un rendez-vous a 18h15 ne trouve plus sa case',
    fichier: 'lib/cours-collectifs.js',
    de: '  const rang = Math.floor((Number(debutMin) - Number(heureMin)) / pas)',
    vers: '  const rang = (Number(debutMin) - Number(heureMin)) / pas' },

  { nom: '🔴 l agenda repose ses blocs sur l egalite stricte',
    fichier: 'app/dashboard/AgendaRdv.js',
    de: '                const commenceIci = (debutMin) => caseDeDepart(debutMin, heureMin, PAS_MINUTES).caseMin === slotMin',
    vers: '                const commenceIci = (debutMin) => debutMin === slotMin' },

  { nom: '🔴 chaque table redevient son propre service',
    fichier: 'lib/cours-collectifs.js',
    de: '    if (!courant || t.debut >= courant.finMin) {',
    vers: '    if (true) {' },

  { nom: '🔴 le service ne s allonge plus jusqu au dernier depart',
    fichier: 'lib/cours-collectifs.js',
    de: '    courant.finMin = Math.max(courant.finMin, t.fin)',
    vers: '    void 0' },

  { nom: '🔴 tout rendez-vous passe pour une table',
    fichier: 'lib/cours-collectifs.js',
    de: '  return reservation?.prestation?.par_couverts === true',
    vers: '  return !!reservation?.prestation' },

  { nom: '🔴 les tables retournent dans les blocs de cours',
    fichier: 'app/dashboard/AgendaRdv.js',
    de: '                const rdvsCommencantIci = debutsIci.filter(r => !estReservationDeTable(r))',
    vers: '                const rdvsCommencantIci = debutsIci' },

  { nom: '🔴 le service cloture aussi les tables pas encore parties',
    fichier: 'app/dashboard/AgendaRdv.js',
    de: '        const aClore = tables.filter(r => estAClore(r))',
    vers: '        const aClore = tables' },

  // 🔴 L ECRAN BLANC DU 10/09 : la fonction passee par reference recevait
  // l index du tableau comme « maintenant ».
  { nom: '🔴 l agenda repasse estAClore par reference a filter',
    fichier: 'app/dashboard/AgendaRdv.js',
    de: '        const aClore = tables.filter(r => estAClore(r))',
    vers: '        const aClore = tables.filter(estAClore)' },

  { nom: '🔴 estAClore fait de nouveau confiance a son second argument',
    fichier: 'lib/rdv-statut.js',
    de: '  const reference = maintenant instanceof Date && !Number.isNaN(maintenant.getTime()) ? maintenant : new Date()',
    vers: '  const reference = maintenant' },

  { nom: '🔴 la jointure des reservations perd par_couverts',
    fichier: 'app/dashboard/page.js',
    de: 'prestation:rdv_prestations(nom, duree_minutes, prix, par_couverts)',
    vers: 'prestation:rdv_prestations(nom, duree_minutes, prix)' },

  { nom: '🔴 la cloture d un service reparle de personnes',
    fichier: 'app/dashboard/page.js',
    de: '              table: seanceAHonorer.length > 0 && seanceAHonorer.every(r => estReservationDeTable(r)),',
    vers: '              table: false,' },

  { nom: '🔴 la question dit de nouveau ces personnes a une salle',
    fichier: 'lib/confirmation-rdv.js',
    de: "    ? (n === 1 ? 'Marquer cette table comme venue ?' : `Marquer ces ${n} tables comme venues ?`)",
    vers: "    ? (n === 1 ? 'Marquer cette personne comme venue ?' : `Marquer ces ${n} personnes comme venues ?`)" },

  { nom: '🔴 la question repromet un email qui ne part plus',
    fichier: 'lib/confirmation-rdv.js',
    de: "        ? 'Le montant entre dans ton chiffre d’affaires, et le passage est compté sur la carte de fidélité quand il y en a une. Ce geste ne se défait pas.'",
    vers: "        ? 'Chacune reçoit son email de fin de séance. Ce geste ne se défait pas.'" },

  { nom: '⚠️ la garde structurelle relit le code AVEC sa prose',
    fichier: 'scripts/verif-reservation-table.mjs',
    de: "      const src = sansProse(readFileSync(f, 'utf8'))",
    vers: "      const src = readFileSync(f, 'utf8')" },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    const plante = !/vérifications/.test(sortie)
    return { rouge: true, plante, extrait: sortie.slice(-400) }
  }
}

const depart = lancer()
if (depart.rouge) {
  console.log(`🔴 ${BANC} EST DEJA ROUGE. On ne mesure rien sur un banc rouge.`)
  console.log(depart.extrait)
  process.exit(1)
}
console.log('Banc vert au depart.\n')

let attrapees = 0
const manquees = []

for (const m of MUTATIONS) {
  const f = chemin(m.fichier || MODULE)
  const original = readFileSync(f, 'utf8')
  if (!original.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ! ${m.nom} — texte introuvable`)
    continue
  }
  ecrireSur(f, original.split(m.de).join(m.vers))
  const r = lancer()
  ecrireSur(f, original)
  if (readFileSync(f, 'utf8') !== original) {
    console.log('RESTAURATION RATEE, on arrete tout.')
    process.exit(2)
  }
  // ⚠️ Une mutation change le RESULTAT, jamais la TERMINAISON.
  if (r.rouge && !r.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else {
    manquees.push(m.nom + (r.plante ? ' (le banc a PLANTÉ, il n a rien mesuré)' : ''))
    console.log(`  ✕ NON attrapée : ${m.nom}${r.plante ? ' (PLANTAGE)' : ''}`)
  }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
const fin = lancer()
if (fin.rouge) { console.log(`🔴 ${BANC} ROUGE APRES RESTAURATION.`); process.exit(2) }
console.log('Banc vert après restauration. Dépôt intact.')
if (manquees.length) { console.log('\nMANQUÉES :'); manquees.forEach(m => console.log('  - ' + m)); process.exit(1) }
