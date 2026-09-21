// HARNAIS DE MUTATION — SIGNALER UN AVIS (20/09)
//
// 🔴 CE QU ON MESURE. Les avis sont du contenu ecrit par des habitants et
// publie sur les fiches. Les huit motifs de la modale visaient tous la FICHE
// d un commerce : ferme, horaires, adresse, telephone, articles, site web,
// doublon, autre. Aucun ne parlait du contenu, et rien ne permettait de
// signaler un avis. Apple l a demande lors de la revue du 20/09, et c est ce
// qu un relecteur verifiera dans la video.
//
// Chacune des mutations ci-dessous remet une des formes fausses possibles. Si
// le banc reste vert sur l une d elles, ce lot ne protege pas ce qu il pretend.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   node scripts/mutations-signalement-avis.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:signaux'
const MODULE = 'lib/signaux.js'

const ROUTE = 'app/api/signaux/route.js'
const MODAL = 'app/commander/ModalSignalement.js'
const FICHE = 'app/commander/[slug]/page.js'

const MUTATIONS = [
  // ─── LES MOTIFS ─────────────────────────────────────────────────────────
  // 🔴 LE PIEGE DE `in` : `'constructor' in MOTIFS_AVIS` rend VRAI, donc
  // `constructor` et `toString` entreraient en base comme motifs.
  // ⚠️ L ANCRE NE VISE QUE LA SECONDE LIGNE, parce qu une cible ne peut pas
  // contenir de saut de ligne : les fichiers sont en CRLF et un `\n` ecrit ici
  // ne trouverait jamais sa cible. La mutation produit le meme defaut.
  { nom: '🔴 la verification passe par `in` : « constructor » devient un motif',
    de: '    && Object.prototype.hasOwnProperty.call(MOTIFS_AVIS, motif)',
    vers: '    && motif in MOTIFS_AVIS' },

  { nom: '⚠️ « autre » disparait : un cas non prevu n a plus nulle part ou aller',
    de: "  autre:      'Autre',",
    vers: '' },

  { nom: '🔴 un motif s affiche sous sa cle brute au lieu de son libelle',
    de: "  hors_sujet: 'Hors sujet, publicité ou spam',",
    vers: "  hors_sujet: 'hors_sujet'," },

  { nom: '⚠️ un motif inconnu ne retombe plus sur « autre » : libelle vide',
    de: '  return motifAvisConnu(motif) ? MOTIFS_AVIS[motif] : MOTIFS_AVIS.autre',
    vers: "  return MOTIFS_AVIS[motif] || ''" },

  // ─── LE SERVEUR ─────────────────────────────────────────────────────────
  // 🔴 UNE GARDE D ECRAN N EST JAMAIS UNE REPONSE : la route est appelable
  // directement, sans passer par la modale.
  { nom: '🔴 le serveur ne verifie plus le motif : n importe quel mot entre en base',
    fichier: ROUTE,
    de: '      if (motifDemande && !connu) {',
    vers: '      if (false) {' },

  // 🔴 LE DECALAGE QUI A COUTE UN 500 : la base contraint `type` a une liste
  // fermee, et le code acceptait soixante caracteres libres sur une fiche.
  { nom: '🔴 les motifs de fiche redeviennent du texte libre, que la base refusera',
    fichier: ROUTE,
    de: '      const connu = surUnAvis ? motifAvisConnu(motifDemande) : motifFicheConnu(motifDemande)',
    vers: '      const connu = surUnAvis ? motifAvisConnu(motifDemande) : true' },

  // ⚠️ TROIS ENDROITS, TROIS VERITES POSSIBLES : l ecran, le serveur, la base.
  { nom: '⚠️ la liste des motifs de fiche retourne vivre dans l ecran',
    fichier: MODAL,
    de: 'const TYPES = TYPES_MOTIF_FICHE.map(key => ({',
    vers: "const TYPES = [{ key: 'autre', label: 'Autre', icon: '💬' }].map(key => ({" },

  { nom: '🔴 l identifiant de l avis n est plus range : la cible devient introuvable',
    fichier: ROUTE,
    de: '        avis_id: body.avis_id || null,',
    vers: '        avis_id: null,' },

  { nom: '🔴 un avis signale declenche l email des FICHES : on juge la mauvaise chose',
    fichier: ROUTE,
    de: '          emailSignalementAvis({',
    vers: '          emailSignalementFiche({' },

  { nom: '⚠️ un avis n est plus une cible valable : le signalement est refuse',
    fichier: ROUTE,
    de: '      if (!body.commercant_id && !body.service_id && !body.avis_id) {',
    vers: '      if (!body.commercant_id && !body.service_id) {' },

  // ─── LA MODALE ──────────────────────────────────────────────────────────
  { nom: '🔴 LES DEUX LISTES FUSIONNENT : « horaires incorrects » s affiche sur un avis',
    fichier: MODAL,
    de: '  const motifs = surUnAvis ? MOTIFS_POUR_AVIS : TYPES',
    vers: '  const motifs = TYPES' },

  { nom: '🔴 la modale n envoie plus l identifiant de l avis',
    fichier: MODAL,
    de: "      avis_id:       target.kind === 'avis'     ? target.id : null,",
    vers: '      avis_id:       null,' },

  // ─── LES TEXTES DE LA MODALE ────────────────────────────────────────────
  // 🔴 TROUVES SUR UNE CAPTURE D ALEX, APRES LA MISE EN LIGNE. La modale avait
  // gardé le sous-titre et l exemple des FICHES : on ne « met pas Yoppaa a
  // jour » en signalant des propos haineux, et l exemple parlait d horaires de
  // fermeture au moment ou l on decrit un contenu abusif.
  { nom: '🔴 le sous-titre des FICHES revient sur un signalement de contenu',
    fichier: MODAL,
    de: "                  ? 'Cet avis ne respecte pas les règles ? Dis-nous pourquoi, on le relit.'",
    vers: "                  ? 'Tes signalements aident la tribu à garder Yoppaa à jour.'" },

  { nom: '⚠️ l exemple de precision parle encore d horaires de fermeture',
    fichier: MODAL,
    de: '                placeholder={surUnAvis',
    vers: '                placeholder={false' },

  { nom: '🔴 le message de succes promet que le commercant est prevenu',
    fichier: MODAL,
    de: "                  ? 'Notre équipe va relire cet avis et décider s’il doit être retiré. Le commerçant n’est pas prévenu.'",
    vers: "                  ? 'Le commerçant va recevoir ton retour.'" },

  // ─── LE TEMPS DE LIRE ───────────────────────────────────────────────────
  // 🔴 TROUVE PAR ALEX EN TESTANT SUR SON TELEPHONE le 21/09. A 1800 ms, on
  // voit qu un texte apparait, on ne le lit pas. Le message des avis annonce
  // les deux choses qui comptent : que l equipe relit, et que le commercant n
  // est pas prevenu.
  { nom: '🔴 la confirmation se referme avant qu on ait pu la lire',
    fichier: MODAL,
    de: 'const DELAI_FERMETURE_MS = 4500',
    vers: 'const DELAI_FERMETURE_MS = 1800' },

  { nom: '⚠️ la croix disparait pendant la confirmation : plus aucun moyen visible de refermer',
    fichier: MODAL,
    de: '        <button onClick={onClose} aria-label="Fermer"',
    vers: '        {!done && (<button onClick={onClose} aria-label="Fermer"' },

  // ─── L ECRAN ────────────────────────────────────────────────────────────
  // ⚠️ SANS CE BOUTON, TOUT LE RESTE EST DU CODE MORT, et c est exactement ce
  // qu un relecteur Apple cherchera dans la video.
  { nom: '🔴 LE DEFAUT D ORIGINE : plus aucun bouton pour signaler un avis',
    fichier: FICHE,
    de: '            Signaler cet avis',
    vers: '            Voir le commerce' },

  { nom: '⚠️ le bouton referme la carte sous le doigt au lieu d ouvrir la modale',
    fichier: FICHE,
    de: '            onClick={(e) => { e.stopPropagation(); setSignaler(true) }}',
    vers: '            onClick={() => setSignaler(true)}' },

  // 🔴 LE DEFAUT D ORIGINE DE LA PASTILLE : elle recalculait depuis une colonne
  // que la vue n expose pas. `avis_public` fait le calcul et ne rend que son
  // resultat. Aucune erreur, aucun avertissement, juste une pastille absente.
  { nom: '🔴 la pastille « Verifie » recalcule depuis une colonne absente de la vue',
    fichier: FICHE,
    de: '  const verifie = a.verifie === true',
    vers: '  const verifie = !!a.commande_id' },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTE ». Un banc qui explose au lieu de
    // rougir n est pas une mesure, c est un accident.
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
