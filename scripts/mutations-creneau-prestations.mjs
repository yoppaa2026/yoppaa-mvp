// HARNAIS DE MUTATION — CE QU'UN CRENEAU ACCEPTE (07/09).
//
// 🔴 CE QU'ON MESURE : qu'un cours collectif cesse d etre propose a toutes les
// heures de tous les jours. Le defaut d origine ne levait rien, ne se voyait
// nulle part, et se decouvrait le jour ou une personne seule reservait un cours
// de yoga un mardi a 13h. C est Alex qui l a trouve, pas un banc.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES, verifie par npm run verif:ancres.
//
//   node scripts/mutations-creneau-prestations.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
// ⚠️ DEUX BANCS, ET C'EST INDISPENSABLE DEPUIS LE 08/09. Ce harnais mute aussi
// `app/dashboard/page.js`, dont les gardes d'ouverture vivent dans
// `verif:bord`. Avec le seul `verif:slots`, ces mutations-là auraient été
// déclarées « non attrapées » alors que la garde existait : le harnais aurait
// mesuré avec le mauvais instrument, ce qui est pire que ne pas mesurer.
const BANC = 'verif:slots && npm run verif:bord'
const MODULE = 'lib/rdv-slots.js'

const MUTATIONS = [
  // ─── LE COMPTEUR DE PLACES EN « SANS PREFERENCE » (Alex, 18/09) ────────
  //
  // 🔴 SES MOTS : « le nombre de places restantes ne se met a jour que sur le
  // praticien, sans preference n actualise pas ». Une inscription chez Emily ne
  // BLOQUE pas Carole : elle etait donc ecartee du filtre, et disparaissait
  // aussi du COMPTAGE. Le cours s affichait vide alors qu il ne l etait pas.
  { nom: '🔴 LE DEFAUT DU 18/09 : les inscriptions au cours cessent d etre comptees',
    de: '  if (prestationCours) {',
    vers: '  if (false) {' },

  // 🔴 ET LE DOUBLE COMPTAGE EST L AUTRE DEFAUT POSSIBLE : une inscription
  // bloquante ET du meme cours, comptee deux fois, prendrait deux places a elle
  // seule et fermerait le cours trop tot.
  { nom: '🔴 une inscription bloquante est comptee DEUX fois',
    de: '      if (String(r.prestation_id) === String(prestationCours) && !dejaLa.has(r)) {',
    vers: '      if (String(r.prestation_id) === String(prestationCours)) {' },

  // 🔴 ET LA FICHE NE DOIT COMPTER COMME UN COURS QUE CE QUI EN EST UN : passer
  // l identifiant sur un rendez-vous INDIVIDUEL fermerait des creneaux a tort.
  { nom: '🔴 la fiche compte un rendez-vous individuel comme un cours',
    fichier: 'app/commander/rdv/[slug]/page.js',
    de: '    capacitePrestation(prestationChoisie) > 1 && !estParCouverts(prestationChoisie)',
    vers: '    true' },

  // ─── SUR QUELLE BASE IL CONFIGURE (Alex, 18/09) ────────────────────────
  //
  // 🔴 « Cela permet au commercant de savoir sur quelle base il configure ses
  // creneaux plutot que de decouvrir le message quand il valide. » Le trou etait
  // complet cote rendez-vous : l avertissement des horaires n existait que pour
  // le click & collect.
  { nom: '🔴 la config RDV cesse de dire les heures d ouverture',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '{nomJour}, tu es ouvert de <strong style={{ color: T.ink }}>',
    vers: '{nomJour}, tu es la <strong style={{ color: T.ink }}>' },

  // ⚠️ LE CAS QUE PERSONNE NE DISAIT : une plage a cheval s enregistre et le
  // moteur l ecrete EN SILENCE. Le commercant croit ouvrir sa fin de journee.
  { nom: '🔴 une plage a cheval cesse d annoncer ce qui sera vraiment propose',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: 'Cette plage déborde : elle sera proposée de <strong>',
    vers: 'Cette plage est enregistree. <strong>' },

  // 🔴 ET L ECRAN NE REECRIT AUCUNE DES DEUX REGLES. Un troisieme calcul du
  // meme fait, c est la prochaine divergence entre ce que l ecran annonce et ce
  // que le moteur fait.
  { nom: '🔴 l ecran cesse de demander au moteur ce qui restera de la plage',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '              const ajuste = ajusterPlagePourJour(',
    vers: '              const ajuste = (() => ({ morceaux: [] }))(' },

  // 🔴 ET LA SOURCE FAIT FOI. Chez un commerce qui change d endroit, les
  // horaires viennent des EMPLACEMENTS : afficher ceux du profil donnerait de
  // faux horaires a un food truck, pire que de ne rien afficher.
  { nom: '🔴 l affichage lit le profil au lieu des horaires qui font foi',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '              const h = horairesReference?.[jour]',
    vers: '              const h = commercant?.horaires_detail?.[jour]' },

  // ─── LE SERVEUR REFUSAIT CE QUE L ECRAN PROPOSAIT (Alex, 18/09) ────────
  //
  // 🔴 SA PHRASE : « Pourquoi il refuse alors qu il la propose dans les dates
  // et les heures ? » Cours de yoga, lundi 17h. La cause n etait pas dans la
  // regle mais dans le SELECT : `rdv-creation-server.js` chargeait ses plages
  // sans `praticien_id`. Absente, la colonne vaut `undefined`, la plage dediee
  // au pilates reservait la journee entiere contre le yoga, et le serveur
  // refusait exactement ce que la grille venait d ouvrir.
  //
  // ⚠️ UNE COLONNE ABSENTE NE LEVE JAMAIS. Defaut le plus frequent du depot, et
  // le seul qui applique la regle A L ENVERS en silence.
  { nom: '🔴 LE DEFAUT DU 18/09 : le serveur recharge ses plages sans praticien_id',
    fichier: 'lib/rdv-creation-server.js',
    de: ", actif, praticien_id')",
    vers: ", actif')" },

  // ⚠️ ET LA REGLE DOIT S APPELER PAREIL DES DEUX COTES.
  { nom: '🔴 la garde du serveur cesse de passer estCours',
    de: 'tranchesReservees(duJour, prestationId, liaisons, { estCours })',
    vers: 'tranchesReservees(duJour, prestationId, liaisons)' },

  // ─── « SANS PREFERENCE » NE PROPOSAIT PLUS RIEN (Alex, 18/09) ───────────
  //
  // 🔴 LE DEFAUT REEL, capture a l appui chez Studio Amandine. Deux plages
  // 09:00-18:00 superposees, Carole donne le pilates, Emily donne le yoga. Sur
  // Carole : neuf creneaux. Sur « sans preference » : AUCUN. La plage d Emily,
  // dediee au yoga, reservait la journee entiere contre le pilates.
  //
  // ⚠️ CETTE MUTATION REMET EXACTEMENT LE CODE D AVANT : une plage nommee qui
  // ne m accepte pas reserve son heure contre tout le monde, sans regarder s il
  // reste une collegue pour m accueillir.
  { nom: '🔴 LE DEFAUT DU 18/09 : la plage d une collegue reserve contre tous',
    de: '    if (c.praticien_id) {',
    vers: '    if (false) {' },

  // ⚠️ ET DANS L AUTRE SENS : sans le test du praticien, DEUX plages d une
  // MEME personne se libereraient l une l autre. Carole ne peut pas donner
  // deux cours a la fois, quel que soit le nombre de plages qu elle ouvre.
  { nom: '🔴 deux plages d une MEME praticienne se liberent l une l autre',
    de: '        if (!autre.praticien_id || String(autre.praticien_id) === String(c.praticien_id)) return false',
    vers: '        if (!autre.praticien_id) return false' },

  // ⚠️ ET LE CHEVAUCHEMENT COMPTE : sans lui, une plage de 19h libererait une
  // heure de 10h, a l autre bout de la journee.
  { nom: '🔴 le chevauchement horaire cesse d etre verifie',
    de: '        if (timeToMinutes(autre.heure_debut) >= fin) return false',
    vers: '        if (false) return false' },

  // 🔴 UN COURS N A PAS D HORAIRE HORS DE SA PLAGE (Alex, 08/09).
  //
  // ⚠️ CETTE MUTATION VISAIT AVANT `return !liaisons.some(...)`, la ligne qui
  // retirait AUSSI les prestations solo des plages libres. Elle cassait le
  // metier du coiffeur et a ete supprimee ; c est `verif:ancres` qui a dit que
  // l ancre ne mesurait plus rien. La seule restriction qui reste, et qu il
  // faut donc mesurer, est celle des cours.
  { nom: '🔴 une plage libre reaccepte un COURS rattache ailleurs',
    de: '  if (estCours) return false',
    vers: '  if (false) return false' },

  // 🔴 ET DANS L AUTRE SENS : la confiscation qu Alex a fait tomber le 08/09.
  // Une plage libre qui refuse un SOLO coche ailleurs, c est le soin du visage
  // qui disparait de tout l agenda de l esthéticienne.
  { nom: '🔴 une plage libre reconfisque une prestation SOLO',
    de: '  if (estCours) return false',
    vers: '  if (true) return false' },

  // 🔴 UNE PLAGE ETEINTE NE PORTE PLUS RIEN (Alex, 08/09). Sans ce filtre, le
  // tableau de bord ne prevenait PAS que le cours etait sorti de la vente,
  // pendant que la fiche publique affichait « Dates a venir ».
  { nom: '🔴 les plages eteintes redeviennent porteuses',
    de: '    ? new Set(creneaux.filter(c => c && c.actif !== false && !c.deleted_at).map(c => String(c.id)))',
    vers: '    ? new Set(creneaux.map(c => String(c.id)))' },

  // 🔴 ET LE FRERE SERVEUR : l ecran calcule, le serveur decide, et les deux
  // doivent lire les memes plages.
  { nom: '🔴 le serveur relit les liaisons des plages mortes',
    fichier: 'lib/rdv-creation-server.js',
    de: '    const idsCreneaux = (creneauxCom || []).filter(c => c.actif !== false).map(c => c.id)',
    vers: '    const idsCreneaux = (creneauxCom || []).map(c => c.id)' },

  // ─── LE PRATICIEN (Alex, 08/09) ────────────────────────────────────────────
  //
  // 🔴 `praticien_id` arrivait du corps de la requete et partait en base sans
  // aucun controle. La base porte une contrainte d exclusion sur le praticien
  // et l horaire : l identifiant d une praticienne d UN AUTRE COMMERCE fermait
  // son agenda depuis un formulaire public.
  { nom: '🔴 n importe quel praticien refait la prestation',
    de: '  return duMetier.some(l => String(l.praticien_id) === String(praticienId))',
    vers: '  return true' },

  // ⚠️ UNE ALARME QUI SONNE TOUT LE TEMPS NE PROTEGE PLUS RIEN : chez un
  // independant seul, la question de « qui fait quoi » n existe pas.
  { nom: '⚠️ l avertissement praticien sonne chez un independant seul',
    de: '  if (Number(nbPraticiens) < 2) return false',
    vers: '  if (false) return false' },

  { nom: '🔴 le serveur accepte un praticien eteint ou d une autre maison',
    fichier: 'lib/rdv-creation-server.js',
    de: '    if (!prat || prat.actif === false || prat.deleted_at) {',
    vers: '    if (false) {' },

  // 🔴 LA JUNCTION QUI DESCENDAIT TOUT LE PARC dans le navigateur du visiteur.
  { nom: '🔴 la fiche publique relit la junction de tout le parc',
    fichier: 'app/commander/rdv/[slug]/page.js',
    de: "          .in('prestation_id', idsPrestations)",
    vers: '          .limit(5000)' },

  { nom: '🔴 le tableau de bord relit la junction de tout le parc',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: "          .in('prestation_id', idsPrestations)",
    vers: '          .limit(5000)' },

  // 🔴 UN PRATICIEN COCHE MAIS PLUS ACTIF (Alex, 08/09). La liaison survit,
  // le moteur refuse tous les autres, et PLUS PERSONNE ne peut assurer la
  // prestation. Afficher « tout le monde » serait le contraire de la verite.
  { nom: '🔴 un praticien parti passe pour « tout le monde »',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '                    if (ids.length > 0 && eux.length === 0) return (',
    vers: '                    if (false) return (' },

  // ⚠️ UNE LIGNE QUI NE SERT A RIEN CHEZ UN INDEPENDANT SEUL EST DU BRUIT.
  { nom: '⚠️ la ligne des praticiens s affiche chez un praticien seul',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '                  {praticiens.length >= 2 && (() => {',
    vers: '                  {praticiens.length >= 0 && (() => {' },

  // 🔴 L OUVERTURE QUI SE TAISAIT CONTRE SA PROPRE ECRITURE (Alex, 08/09 :
  // « Centre Respire s ouvre sur les commandes, pas sur l agenda »).
  //
  // `pretUrl` passe a vrai au montage, le commerce arrive plus tard, et entre
  // les deux l effet d ecriture pose `?onglet=commandes` tout seul. L ouverture
  // relisait l adresse et y trouvait NOTRE ecriture, prise pour une intention
  // de l utilisateur. Elle n a jamais fonctionne pour personne.
  { nom: '🔴 l ouverture relit l adresse au lieu de l arrivee',
    fichier: 'app/dashboard/page.js',
    de: '    if (ongletDeLArrivee.current) return',
    vers: "    if (new URLSearchParams(window.location.search).get('onglet')) return" },

  // ⚠️ ET C EST L ORDRE DES DEUX LIGNES QUI EST LA CORRECTION : des que
  // l ecriture est autorisee, l adresse ne dit plus ce que l utilisateur
  // demandait, elle dit ce que nous avons ecrit.
  { nom: '⚠️ l onglet de l arrivee cesse d etre capture',
    fichier: 'app/dashboard/page.js',
    de: "    ongletDeLArrivee.current = new URLSearchParams(window.location.search).get('onglet')",
    vers: '    ongletDeLArrivee.current = null' },

  // 🔴 UN REFUS DE REGLE N EST PAS UNE PANNE : le client relancait a l infini
  // une demande que le serveur ne pouvait pas accepter.
  { nom: '🔴 un praticien refuse redevient une erreur serveur muette',
    fichier: 'app/api/rdv/reserver/route.js',
    de: "      if (res.code === 'praticien_hors_commerce' || res.code === 'praticien_hors_prestation') {",
    vers: '      if (false) {' },

  // 🔴 FERMER SUR UNE IGNORANCE VIDERAIT TOUS LES AGENDAS, sans une erreur.
  { nom: '🔴 des liaisons non chargees FERMENT au lieu d ouvrir',
    de: '  if (!Array.isArray(liaisons)) return true\n  if (!creneauId) return false',
    vers: '  if (!Array.isArray(liaisons)) return false\n  if (!creneauId) return false' },

  { nom: '🔴 un creneau restreint accepte n importe quelle prestation',
    de: '    return duCreneau.some(l => String(l.prestation_id) === String(prestationId))',
    vers: '    return true' },

  // 🔴 SANS LE CONTROLE DE L HEURE, LA GARDE SERVEUR EST DECORATIVE : un
  // creneau du lundi accepte bien le yoga... a 10h, pas a 13h.
  { nom: '🔴 la garde serveur cesse de regarder l heure',
    de: '    if (d < cd || f > cf) return false',
    vers: '    if (false) return false' },

  { nom: '🔴 la garde serveur ignore la pause',
    de: '    if (pd !== null && pf !== null && d < pf && f > pd) return false',
    vers: '    if (false) return false' },

  // ⚠️ LES DEUX SORTIES QUI PROTEGENT L EXISTANT. Les casser refuserait des
  // rendez-vous que le parc entier accepte aujourd hui.
  { nom: '⚠️ un commerce sans aucune liaison se met a etre juge',
    de: '  if (!Array.isArray(liaisons) || liaisons.length === 0) return true',
    vers: '  if (false) return true' },

  { nom: '⚠️ un jour sans aucune plage se met a etre juge',
    de: '  const duJour = creneauxDuJour(creneaux, { dateStr, jour })\n  if (duJour.length === 0) return true',
    vers: '  const duJour = creneauxDuJour(creneaux, { dateStr, jour })\n  if (duJour.length === 0) return false' },

  // 🔴 LE MOTEUR CESSE DE FILTRER : on revient au 06/09 exactement.
  { nom: '🔴 le moteur ne filtre plus les creneaux par prestation',
    de: '  const creneauxRetenus = creneauxPourPrestation(creneauxJour, prestationId, liaisonsCreneaux, { estCours })',
    vers: '  const creneauxRetenus = creneauxJour' },

  { nom: '🔴 l ecran cache des plages alors qu aucune prestation n est choisie',
    de: '  if (!Array.isArray(liaisons) || !prestationId) return creneaux || []',
    vers: '  if (!Array.isArray(liaisons)) return creneaux || []' },


  // 🔴 UN SEUL COURS PAR PLAGE (Alex, 07/09).
  { nom: '🔴 deux cours redeviennent possibles sur la meme plage',
    // ⚠️ ANCRE SUIVIE LE 10/09 : la condition exclut desormais les tables, qui
    // ne sont pas des cours. La mutation neutralise toujours le meme test.
    de: '    if (p && Number(p.capacite) > 1 && p.par_couverts !== true) return p',
    vers: '    if (false) return p' },

  // 🔴 LA PLAGE HORS HORAIRES, DEFAUT SILENCIEUX TROUVE PAR ALEX LE 07/09.
  { nom: '🔴 une plage entierement hors horaires ne se signale plus',
    de: "    return { raison: 'hors_ouverture', plages: lisible }",
    vers: '    return null' },

  { nom: '🔴 une plage a cheval sur la fermeture ne se signale plus',
    de: "    return { raison: 'deborde', plages: lisible }",
    vers: '    return null' },

  // ⚠️ ANCRE REMISE LE 09/09 : la ligne s est ouverte en bloc quand la regle de
  // minuit y est entree. On vise le `push` lui-meme, pas la condition.
  { nom: '⚠️ le second service du jour est oublie',
    de: '    plages.push([d2, finApresMinuit(d2, timeToMinutes(h.fin2))])',
    vers: '    void 0' },

  // 🔴 L HORIZON DE L AGENDA (Alex, 07/09).
  { nom: '🔴 le piege du zero ferme l agenda au lieu de le laisser a 60 jours',
    de: '  if (n < HORIZON_RDV_MIN || n > HORIZON_RDV_MAX) return HORIZON_RDV_DEFAUT',
    vers: '  if (false) return HORIZON_RDV_DEFAUT' },

  { nom: '🔴 un commercant absent n a plus d horizon du tout',
    de: '  if (!Number.isFinite(n)) return HORIZON_RDV_DEFAUT',
    vers: '  if (false) return HORIZON_RDV_DEFAUT' },

  { nom: '⚠️ le defaut du parc cesse d etre 60 jours',
    de: 'export const HORIZON_RDV_DEFAUT = 60',
    vers: 'export const HORIZON_RDV_DEFAUT = 90' },

  // 🔴 LA DEMI-CORRECTION, TROUVEE PAR ALEX EN TESTANT. Empecher le cours
  // d aller ailleurs sans reserver son heure ne corrigeait RIEN : le premier
  // client a prendre un soin a 10h fermait le cours pour tout le monde.
  { nom: '🔴 l heure du cours redevient ouverte aux autres prestations',
    de: '      if (tombeDansUneTrancheReservee(t, slotEnd, reservees)) continue',
    vers: '      if (false) continue' },

  // ⚠️ ANCRE REPOSEE LE 18/09. La correction de « sans preference » a sorti le
  // calcul des bornes de cette ligne : l ancienne ancre visait
  // `out.push([timeToMinutes(...), timeToMinutes(...)])`, qui n existe plus.
  // Le harnais a dit « TEXTE INTROUVABLE » — c est exactement ce qu il doit
  // faire, une ancre perimee ne mesure rien.
  { nom: '🔴 une plage dediee cesse de reserver son heure',
    de: '    out.push([debut, fin])',
    vers: '    void 0' },

  { nom: '🔴 une plage qui m accepte se met a se reserver contre moi',
    de: '    if (prestationId && duCreneau.some(l => String(l.prestation_id) === String(prestationId))) continue',
    vers: '    if (false) continue' },

  { nom: '⚠️ une plage libre se met a reserver son heure',
    de: '    if (duCreneau.length === 0) continue',
    vers: '    if (false) continue' },

  // 🔴 LE CHIFFRE FAUX DANS L ALERTE, TROUVE PAR ALEX EN TESTANT (07/09).
  { nom: '🔴 l alerte relit la grille perimee au lieu des emplacements',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '      horairesDetail: horairesReference,',
    vers: '      horairesDetail: commercant?.horaires_detail,' },

  { nom: '🔴 les jours fermes se relisent sur la grille perimee',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '  const joursFermesProfil = JOURS_SEMAINE.filter(j => horairesReference?.[j]?.ouvert === false)',
    vers: '  const joursFermesProfil = JOURS_SEMAINE.filter(j => commercant?.horaires_detail?.[j]?.ouvert === false)' },

  // 🔴 L AVERTISSEMENT QUI NOMME LE MAUVAIS COUPABLE (Alex, 07/09).
  { nom: '🔴 l avertissement renomme les cours qui ont deja leur plage',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '                    estCoursCollectif(p) && prestationSansCreneauDedie(p.id, liaisons, creneaux))',
    vers: '                    estCoursCollectif(p))' },

  // 🔴 L ONGLET QUI SURVIT AU RECHARGEMENT (Alex, 07/09).
  { nom: '🔴 l onglet cesse d etre ecrit dans l adresse',
    fichier: 'app/dashboard/page.js',
    de: "    url.searchParams.set('onglet', ongletPrincipal)",
    vers: '    void 0' },

  { nom: '🔴 aucun onglet n entre plus dans l historique',
    fichier: 'app/dashboard/page.js',
    de: "    const methode = premiereEcriture.current ? 'replaceState' : 'pushState'",
    vers: "    const methode = 'replaceState'" },

  { nom: '🔴 un retour en arriere empile une entree en avant',
    fichier: 'app/dashboard/page.js',
    de: '    if (viensDeLHistorique.current) { viensDeLHistorique.current = false; return }',
    vers: '    if (false) { viensDeLHistorique.current = false; return }' },

  { nom: '⚠️ un onglet inconnu de l adresse est accepte',
    fichier: 'app/dashboard/page.js',
    de: "      setOngletPrincipal(o && ONGLETS_VALIDES.includes(o) ? o : 'commandes')",
    vers: "      setOngletPrincipal(o || 'commandes')" },

  { nom: '⚠️ on ecrit l adresse avant de l avoir lue',
    fichier: 'app/dashboard/page.js',
    de: '    if (!pretUrl) return',
    vers: '    if (false) return' },

  // 🔴 LA COPIE QUI DEBORDAIT (Alex, 07/09), DES DEUX COTES.
  { nom: '🔴 une plage trop longue n est plus raccourcie',
    de: "    statut: (morceaux.length === 1 && debut === d && fin === f) ? 'inchangee' : 'raccourcie',",
    vers: "    statut: 'inchangee'," },

  { nom: '🔴 une plage hors ouverture est copiee quand meme',
    de: "      statut: 'ignoree',\n      raison: 'hors_ouverture',",
    vers: "      statut: 'inchangee',\n      raison: 'hors_ouverture'," },

  { nom: '⚠️ le second service est oublie a la copie',
    de: '    plages.push([a2, finApresMinuit(a2, timeToMinutes(horaireJour.fin2))])',
    vers: '    void 0' },

  { nom: '🔴 la copie des creneaux de commande cesse d ajuster',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '        const ajuste = ajusterPlagePourJour(c, horaires?.[cible])',
    vers: "        const ajuste = { statut: 'inchangee', debut: String(c.heure_debut).slice(0,5), fin: String(c.heure_fin).slice(0,5) }" },

  // 🔴 LE MOTIF DU REFUS (Alex, 07/09 : « je ne suis pas ferme le mercredi »).
  { nom: '🔴 un jour ouvert qui ferme tot redevient un jour ferme',
    de: "      raison: 'hors_ouverture',",
    vers: "      raison: 'jour_ferme'," },

  { nom: '⚠️ le message cesse de citer les heures reelles',
    de: '      heures: plages.map(([a, b]) => `${minutesToTime(a)}–${minutesToTime(b)}`),',
    vers: '      heures: [],' },

  { nom: '🔴 l emplacement qui ne colle pas ne pose plus de question',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: "          premier: 'Copier sur l’emplacement du jour',",
    vers: "          premier: 'Copier'," },

  { nom: '🔴 une question se pose meme quand la salle existe ce jour-la',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '          if (memeLieuCeJour(c.lieu_id, duJour)) continue',
    vers: '          if (false) continue' },

  { nom: '🔴 les details redeviennent un pave illisible',
    fichier: 'app/dashboard/ModaleConfirmation.js',
    de: '                {Array.isArray(details)',
    vers: '                {false && Array.isArray(details)' },
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

  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach(x => console.log('   • ' + x)) }

const finalRouge = lancer().rouge
if (finalRouge) console.log(`🔴 ${BANC} ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
