// HARNAIS DE MUTATION — LES SIGNAUX DU YOPPER (04/09).
//
// 🔴 CE QU'ON MESURE : qu'on ne demande jamais à un commerçant ce qu'il fait
// DÉJÀ, et qu'on ne lui propose jamais ce que son métier ne permet pas.
//
// Les deux erreurs se ressemblent de l'extérieur et coûtent la même chose : le
// commerçant conclut que Yoppaa ne le connaît pas. Aucune des deux ne lève
// d'erreur, aucune ne se voit dans un journal.
//
// ⚠️ CE HARNAIS N'EXISTAIT PAS. `verif:signaux` tournait depuis des semaines
// sans que personne n'ait jamais vérifié qu'une seule de ses gardes pouvait
// rougir. C'est ce qu'on a passé la soirée à corriger ailleurs.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES. Le dépôt est stocké en LF, mais le
//    disque peut porter du CRLF là où git n'a pas encore normalisé : une ancre
//    à cheval sur deux lignes ne vaut alors que sur UNE machine.
//    Vérifié par `npm run verif:ancres`.
//
//   node scripts/mutations-signaux.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:signaux'
const MODULE = 'lib/signaux.js'
const FICHE = 'app/commander/[slug]/page.js'
const BLOC = 'app/commander/SignauxYopper.js'

const MUTATIONS = [
  // ─── ON NE DEMANDE PAS CE QUI SE FAIT DÉJÀ ──────────────────────────────
  //
  // 🔴 `proposeDesInvendus` N'ÉTAIT PASSÉ PAR PERSONNE jusqu'au 04/09 : le
  // signal s'affichait chez TOUS les commerces alimentaires, y compris ceux qui
  // publient leurs restes tous les soirs.
  { nom: '🔴 on propose les invendus a celui qui en publie deja',
    de: '  if (isAlimentaire(commercant) && !proposeDesInvendus) sorties.push(\'invendus\')',
    vers: '  if (isAlimentaire(commercant)) sorties.push(\'invendus\')' },

  // ⚠️ ET JAMAIS HORS DE L'ALIMENTAIRE : en détail le stock se décrémente en
  // dur, la même offre le compterait deux fois.
  { nom: '🔴 on propose les invendus a un commerce de detail',
    de: '  if (isAlimentaire(commercant) && !proposeDesInvendus) sorties.push(\'invendus\')',
    vers: '  if (!proposeDesInvendus) sorties.push(\'invendus\')' },

  // REPOINTÉE LE 17/10 : l'appel à `enviesProposables` est sorti du JSX pour
  // être calculé une fois (la ligne, la bulle et le bloc lisent la même liste).
  // Même ligne, autre indentation.
  { nom: '🔴 la fiche cesse de dire s il publie deja ses invendus',
    fichier: FICHE,
    de: '    proposeDesInvendus: (dealsActifs || []).some(porteUneFenetre),',
    vers: '    proposeDesInvendus: false,' },

  // ⚠️ LE MOT DE L'HABITANT, PAS LE NÔTRE. Il ne réclame pas « l'anti-gaspi ».
  { nom: '🔴 le signal reprend notre vocabulaire au lieu de celui du Yopper',
    de: "  invendus:  'anti_gaspi',",
    vers: "  invendus:  'invendus'," },

  // ─── LA LIVRAISON SANS COMMANDE, ET CE QUI AMÈNE AUX ENVIES (17/10) ─────
  //
  // ✅ ALEX, 17/10 (Carolifrit', friterie en Exister) : « c'est mon moteur pour
  // faire monter les Exister en formule payante ».
  { nom: '🔴 la livraison redisparait chez qui ne prend pas encore de commande',
    de: "  if ((peutCommander || !vitrine) && !sertADomicile) sorties.push('livraison')",
    vers: "  if (peutCommander && !sertADomicile) sorties.push('livraison')" },
  { nom: '🔴 on propose la livraison a un coiffeur',
    de: "  if ((peutCommander || !vitrine) && !sertADomicile) sorties.push('livraison')",
    vers: "  if (!sertADomicile) sorties.push('livraison')" },
  // 🔴 JAMAIS CHEZ UN PAYANT (bandeau Bistrologue retiré le 15/10).
  { nom: '🔴 un payant se fait interpeller en tete de carte',
    de: "  return planEffectif(commercant, maintenant) === 'exister'",
    vers: '  return true' },
  { nom: '🔴 le forfait lu n est plus celui en vigueur (essai)',
    de: "  return planEffectif(commercant, maintenant) === 'exister'",
    vers: "  return (commercant.plan || 'exister') === 'exister'" },
  { nom: '🔴 une fiche sans envie a proposer invite quand meme',
    de: '  if (!commercant || !(types || []).length) return false',
    vers: '  if (!commercant) return false' },
  { nom: '🔴 la ligne propose n importe quelle envie',
    de: '  return ENVIES_EN_TETE.find(t => types.includes(t)) || null',
    vers: '  return types[types.length - 1] || null' },
  // LA BULLE : jamais avec la ligne, plus une fois le bloc vu, refusée ou
  // une envie partie.
  { nom: '🔴 la bulle se montre avec la ligne a l ecran',
    de: '  return invite && carteDepassee && !blocVu && !fermee && !dejaRepondu',
    vers: '  return invite && !blocVu && !fermee && !dejaRepondu' },
  { nom: '🔴 la bulle revient une fois le bloc vu',
    de: '  return invite && carteDepassee && !blocVu && !fermee && !dejaRepondu',
    vers: '  return invite && carteDepassee && !fermee && !dejaRepondu' },
  { nom: '🔴 la bulle revient apres un non merci',
    de: '  return invite && carteDepassee && !blocVu && !fermee && !dejaRepondu',
    vers: '  return invite && carteDepassee && !blocVu && !dejaRepondu' },
  { nom: '🔴 la bulle insiste apres une envie envoyee',
    de: '  return invite && carteDepassee && !blocVu && !fermee && !dejaRepondu',
    vers: '  return invite && carteDepassee && !blocVu && !fermee' },
  { nom: '🔴 la bulle se montre chez un payant',
    de: '  return invite && carteDepassee && !blocVu && !fermee && !dejaRepondu',
    vers: '  return carteDepassee && !blocVu && !fermee && !dejaRepondu' },
  // L'ÉCRAN.
  { nom: '🔴 la fiche oublie qu une envie est deja partie',
    fichier: FICHE,
    de: '    dejaRepondu: etatEnvies.envoyes.length > 0,',
    vers: '    dejaRepondu: false,' },
  { nom: '🔴 le bloc vu ne se constate plus',
    fichier: FICHE,
    de: '    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setBlocEnviesVu(true) },',
    vers: '    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setBlocEnviesVu(false) },',
  },
  { nom: '🔴 la tete de carte compte comme depassee des qu elle sort par le bas',
    fichier: FICHE,
    de: '      setCarteDepassee(!e.isIntersecting && e.boundingClientRect.bottom <= haut)',
    vers: '      setCarteDepassee(!e.isIntersecting)' },
  { nom: '🔴 la ligne a son propre etat, le bloc ne sait pas qu elle a envoye',
    fichier: FICHE,
    de: '                  <SignauxYopper types={typesEnvies} commercant={commercant} etat={etatEnvies} eclaire={eclaireEnvies}/>',
    vers: '                  <SignauxYopper types={typesEnvies} commercant={commercant} eclaire={eclaireEnvies}/>' },
  { nom: '🔴 la ligne s affiche chez tout le monde',
    fichier: FICHE,
    de: '              {inviteAuxEnvies && (',
    vers: '              {true && (' },
  { nom: '🔴 la bulle ne passe plus par le module',
    fichier: FICHE,
    de: '        {montrerBulleEnvies && (',
    vers: '        {inviteAuxEnvies && (' },
  { nom: '🔴 le lien redit « D autres idees »',
    fichier: BLOC,
    de: '          D&rsquo;autres envies&nbsp;?',
    vers: '          D&rsquo;autres idées&nbsp;?' },
  { nom: '🔴 le bouton de la ligne n envoie rien',
    fichier: BLOC,
    de: '          <button type="button" onClick={() => envoyer(type)} disabled={!!enCours}',
    vers: '          <button type="button" onClick={() => {}} disabled={!!enCours}' },
  { nom: '🔴 la ligne dit « chez Chez Momo »',
    fichier: BLOC,
    de: '{PHRASE_EN_TETE[type]} {chezLeCommerce(commercant.nom)}.',
    vers: '{PHRASE_EN_TETE[type]} chez {commercant.nom}.' },
  { nom: '🔴 le bloc ignore l etat de la fiche',
    fichier: BLOC,
    de: '  const { envoyes, enCours, envoyer } = etat || local',
    vers: '  const { envoyes, enCours, envoyer } = local' },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTÉ ». Un banc qui explose au lieu de
    // rougir n'est pas une mesure, c'est un accident.
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
