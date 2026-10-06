// HARNAIS DE MUTATION — UNE FICHE N EST MONTREE QUE COMPLETE
//
// 🔴 CE QU ON MESURE (Alex, 28/09) : « je ne peux pas laisser les fiches non
// completees etre publiees ». Chaque mutation casse UNE garde, et le banc
// `verif:fiche-complete` doit rougir.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   npm run mutations:fiche-complete

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:fiche-complete'

const REGLE = 'lib/fiche-complete.js'
const SERVEUR = 'lib/fiche-complete-server.js'
const PUBLIER = 'app/api/admin/publier/route.js'
const RELANCER = 'app/api/admin/relancer-fiche/route.js'
const DEMANDER = 'app/api/fiche/demander-publication/route.js'
const VALIDER = 'app/api/admin/valider/route.js'
const LISTE = 'app/api/admin/fiches-a-publier/route.js'
const BANDEAU = 'app/dashboard/BandeauFicheAPublier.js'
const SECTION = 'app/admin/SectionFichesAPublier.js'
const EMAILS = 'lib/resend.js'
const LANDING = 'app/components/LandingReveal.js'

const MUTATIONS = [
  // ─── LA LISTE D ALEX ─────────────────────────────────────────────────────
  { nom: '🔴 deux articles suffisent a publier',
    fichier: REGLE, de: '      atteint: nbCat >= MIN_CATALOGUE,', vers: '      atteint: nbCat >= 2,' },
  { nom: '🔴 une seule photo suffit',
    fichier: REGLE, de: '      atteint: nbPh >= MIN_PHOTOS,', vers: '      atteint: nbPh >= 1,' },
  { nom: '⚠️ un logo fait d espaces passe pour un logo',
    fichier: REGLE, de: "      atteint: !!String(c.logo_url || '').trim(),", vers: '      atteint: !!c.logo_url,' },
  { nom: '⚠️ des espaces comptent dans la presentation',
    fichier: REGLE, de: "      atteint: String(c.description || '').trim().length >= MIN_PRESENTATION,", vers: "      atteint: String(c.description || '').length >= MIN_PRESENTATION," },
  { nom: '⚠️ une semaine sans aucun jour ouvert passe pour des horaires',
    fichier: REGLE, de: '        && Object.values(c.horaires_detail).some(h => h?.ouvert)),', vers: '        && true),' },
  { nom: '⚠️ « encore 1 produits »',
    fichier: REGLE, de: '  const pluriel = n > 1', vers: '  const pluriel = true' },

  // ─── LES CRITERES QUI NE LE CONCERNENT PAS ───────────────────────────────
  //
  // 🔴 UN CRITERE IMPOSSIBLE A REMPLIR BLOQUE LA PUBLICATION A VIE.
  { nom: '🔴 un service en Exister doit fournir des horaires',
    fichier: REGLE, de: "  if (plan === 'exister' && commercant?.categorie === 'vitrine') return false", vers: '  if (false) return false' },
  { nom: '🔴 un commerce qui change d endroit doit fournir des horaires',
    fichier: REGLE, de: '  if (commercant?.siege_social_est_lieu_activite === false) return false', vers: '  if (false) return false' },
  { nom: '🔴 un paiement est exige en Exister, ou rien ne s encaisse',
    fichier: REGLE, de: "  return peut(commercant, 'paiement_ligne', maintenant) || peut(commercant, 'paiement_cash', maintenant)", vers: '  return true' },
  { nom: '🔴 les DEUX moyens de paiement sont exiges au lieu d un sur deux',
    fichier: REGLE, de: '  return stripeOK || cashOK', vers: '  return stripeOK && cashOK' },
  { nom: '⚠️ une boutique qui expedie passe avec le seul paiement sur place',
    fichier: REGLE, de: '  const { stripeOK, cashOK } = modesPaiementOuverts({ commercant, estDetail, modeBoutique })', vers: '  const { stripeOK, cashOK } = modesPaiementOuverts({ commercant, estDetail: false, modeBoutique })' },

  // ─── QUI ATTEND UNE MISE EN LIGNE ────────────────────────────────────────
  { nom: '⚠️ une fiche deja en ligne se fait relancer',
    fichier: REGLE, de: "export const PUBLICATIONS_EN_ATTENTE = ['en_attente', 'suspendu']", vers: "export const PUBLICATIONS_EN_ATTENTE = ['en_attente', 'suspendu', 'publie']" },
  { nom: '🔴 un compte non valide peut demander sa mise en ligne',
    fichier: REGLE, de: '  return STATUTS_ACCES_AUTORISE.includes(commercant?.statut)', vers: '  return true' },
  { nom: '⚠️ la phrase de relance colle ses manques sans « et »',
    fichier: REGLE, de: "  return `${mots.slice(0, -1).join(', ')} et ${mots[mots.length - 1]}`", vers: "  return mots.join(', ')" },

  // ─── LE SERVEUR DECIDE ───────────────────────────────────────────────────
  //
  // 🔴 LE DEFAUT MEME QUE CE CHANTIER FERME : une fiche incomplete en ligne.
  { nom: '🔴 Publier ne verifie plus la fiche',
    fichier: PUBLIER, de: '    if (!bilan.complet) {', vers: '    if (false) {' },
  { nom: '🔴 Publier est ouvert a tout compte connecte',
    fichier: PUBLIER, de: "    if (!(await adminVerifie(request, user))) return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })", vers: '' },
  { nom: '🔴 Valider publie de nouveau la fiche',
    fichier: VALIDER, de: "      statut_publication: dejaEnLigne ? 'publie' : 'en_attente',", vers: "      statut_publication: 'publie'," },
  { nom: '⚠️ une demande de mise en ligne sur une fiche incomplete est acceptee',
    fichier: DEMANDER, de: '    if (!bilan.complet) {', vers: '    if (false) {' },
  { nom: '⚠️ deux clics simultanes envoient deux alertes',
    fichier: DEMANDER, de: "      .is('publication_demandee_at', null)", vers: "      .eq('id', commercant_id)" },
  { nom: '⚠️ une fiche complete se fait quand meme relancer',
    fichier: RELANCER, de: '    if (bilan.complet) {', vers: '    if (false) {' },
  { nom: '🔴 une relance ratee est comptee comme envoyee',
    fichier: RELANCER, de: '    if (!envoi?.ok) {', vers: '    if (false) {' },
  { nom: '⚠️ la liste melange des comptes non valides',
    fichier: LISTE, de: "      .in('statut', STATUTS_ACCES_AUTORISE)", vers: '' },

  // ─── LE COMMERCANT ET LE SERVEUR COMPTENT LA MEME CHOSE ──────────────────
  { nom: '⚠️ le serveur compte les prestations supprimees',
    fichier: SERVEUR, de: ".eq('commercant_id', commercantId).eq('actif', true).is('deleted_at', null), 'prestations'),", vers: ".eq('commercant_id', commercantId).eq('actif', true), 'prestations')," },
  { nom: '🔴 une erreur de comptage passe pour un zero',
    fichier: SERVEUR, de: '  if (error) throw new Error(`comptage des ${quoi} impossible : ${error.message}`)', vers: '  if (false) throw new Error(quoi)' },
  { nom: '⚠️ l encart compte les photos sans image',
    fichier: BANDEAU, de: ".eq('commercant_id', commercant.id).not('url', 'is', null)),", vers: ".eq('commercant_id', commercant.id))," },
  { nom: '⚠️ l encart s affiche sur une fiche deja en ligne',
    fichier: BANDEAU, de: '  if (!concerne) return null', vers: '  if (false) return null' },
  { nom: '⚠️ le bouton Demander s allume sur une fiche incomplete',
    fichier: BANDEAU, de: '<button onClick={demander} disabled={!bilan.complet || envoi}', vers: '<button onClick={demander} disabled={envoi}' },
  { nom: '⚠️ le bouton Publier s affiche sur une fiche incomplete',
    fichier: SECTION, de: '{f.complet && (', vers: '{true && (' },

  // ─── CE QU ON ECRIT ──────────────────────────────────────────────────────
  { nom: '🔴 le nom du commerce entre brut dans la relance',
    fichier: EMAILS, de: 'Bonjour <strong>${echapperHtml(nom)}</strong>, ton espace', vers: 'Bonjour <strong>${nom}</strong>, ton espace' },
  { nom: '⚠️ la relance ne montre plus ce qui est deja fait',
    fichier: EMAILS, de: "        ${k.atteint ? 'Fait' : echapperHtml(k.avancement || 'À faire')}", vers: "        ${echapperHtml(k.avancement || 'À faire')}" },

  // ─── LA PRESENTATION A L INSCRIPTION (Alex, 29/09) ───────────────────────
  { nom: '🔴 le compteur compte de nouveau les espaces',
    fichier: 'app/signup/page.js', de: '  const presentationLongueur = form.description.trim().length', vers: '  const presentationLongueur = form.description.length' },
  { nom: '⚠️ le compteur ne passe plus au rouge',
    fichier: 'app/signup/page.js', de: "color: presentationManque > 0 ? '#B91C1C' : '#047857'", vers: "color: '#6B7280'" },
  { nom: '⚠️ l aide du bas redevient generique',
    fichier: 'app/signup/page.js', de: '            : presentationManque > 0', vers: '            : false' },
  { nom: '⚠️ le score d inscription reprend son propre seuil',
    fichier: 'lib/score-onboarding.js', de: "      atteint: (commercant.description || '').trim().length >= MIN_PRESENTATION,", vers: "      atteint: (commercant.description || '').trim().length >= 20," },
  { nom: '🔴 le bloc renvoie de nouveau vers une fiche publique inexistante',
    fichier: SECTION, de: '              <button onClick={() => voir(f)} disabled={occupe}', vers: '              <a href={`/commander/${f.slug}`} onClick={() => voir(f)} disabled={occupe}' },

  { nom: '🔴 le titre de la landing promet de nouveau la page en ligne',
    fichier: LANDING, de: '                Cinq étapes, et ton espace s&rsquo;ouvre.', vers: '                Cinq étapes, et ta page part en ligne.' },
  { nom: '⚠️ l avertissement des papiers disparait de l inscription',
    fichier: 'app/signup/page.js', de: '          Avant de commencer, garde ceci sous la main', vers: '          Bon à savoir' },

  // ─── CHAQUE IMAGE DANS LE DOSSIER DE SON COMMERCE (29/09) ────────────────
  { nom: '🔴 les images retombent a la racine du bucket',
    fichier: 'lib/stockage-images.js', de: '  return `${cid}/${n}`', vers: '  return n' },
  { nom: '⚠️ une image sans commerce se range quand meme',
    fichier: 'lib/stockage-images.js', de: "  if (!cid) throw new Error('image sans commerce : impossible de la ranger')", vers: '  if (false) throw new Error()' },
  { nom: '🔴 un envoi du tableau de bord echappe a la regle',
    fichier: 'app/dashboard/ConfigDashboard.js', de: 'const fileName = cheminImage(commercantId, `cover-${commercantId}-${Date.now()}.jpg`)', vers: 'const fileName = `cover-${commercantId}-${Date.now()}.jpg`' },
  { nom: '⚠️ une suppression vise de nouveau le dernier segment',
    fichier: 'app/dashboard/ConfigDashboard.js', de: '      const objectName = objetDepuisUrl(photo.url)', vers: "      const objectName = (photo.url || '').split('/').pop()" },
  { nom: '⚠️ le chemin relu garde le parametre de l adresse',
    fichier: 'lib/stockage-images.js', de: "  const brut = s.slice(i + marque.length).split('?')[0].split('#')[0]", vers: '  const brut = s.slice(i + marque.length)' },

  // 🔴 LA LANDING PROMETTRAIT DE NOUVEAU UNE MISE EN LIGNE A LA VALIDATION.
  { nom: '🔴 la landing promet encore la mise en ligne des la validation', banc: 'verif:lancement',
    fichier: LANDING, de: 'Ta commune est déjà ouverte et ta page part en ligne dès qu&rsquo;elle est complète.', vers: 'Ta commune est déjà ouverte et ta page part en ligne dès sa validation.' },

  // ─── PAS D ESPACE OUVERT NI DE FICHE EN LIGNE SANS KYB (06/10) ──────────
  { nom: '🔴 la regle laisse passer un KYB en attente',
    fichier: 'lib/statut-commercant.js', de: '  if (commercant?.[COLONNE_KYB] === KYB_VALIDE) return null', vers: "  if (commercant?.[COLONNE_KYB] !== 'rejete') return null" },
  { nom: '🔴 Valider ouvre sans lire le KYB',
    fichier: VALIDER, de: '    const refusIdentite = refusKyb(existant)', vers: '    const refusIdentite = null' },
  { nom: '🔴 Publier met en ligne sans lire le KYB',
    fichier: PUBLIER, de: '    const refusIdentite = refusKyb(identite)', vers: '    const refusIdentite = null' },
  { nom: '🔴 Publier prend une lecture ratee pour un feu vert',
    fichier: PUBLIER, de: "    if (errKyb) return NextResponse.json({ ok: false, error: `vérification du KYB impossible : ${errKyb.message}` }, { status: 500 })", vers: '' },
  { nom: '🔴 la fenetre Modifier publie de nouveau',
    fichier: 'app/admin/ModalEditCommercant.js', de: '    if (form.statut_publication === PUBLICATION_OUVERTE && commercant.statut_publication !== PUBLICATION_OUVERTE) {', vers: '    if (false) {' },
  { nom: '🔴 la base laisse publier sans KYB',
    fichier: 'migrations/MIGRATION_KYB_AVANT_PUBLICATION.sql', de: "    IF NEW.statut_publication = 'publie'", vers: "    IF NEW.statut_publication = 'jamais'" },
]

const lancer = (banc = BANC) => {
  try {
    const sortie = execSync(`npm run ${banc}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    const plante = !/vérifications/.test(sortie)
    return { rouge: true, plante, extrait: sortie.slice(-400) }
  }
}

const BANCS = [...new Set(MUTATIONS.map((m) => m.banc || BANC))]
for (const banc of BANCS) {
  const depart = lancer(banc)
  if (depart.rouge) {
    console.log(`🔴 ${banc} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
    console.log(depart.extrait)
    process.exit(1)
  }
}
console.log(`Bancs verts au départ : ${BANCS.join(', ')}.\n`)

let attrapees = 0
const manquees = []
for (const m of MUTATIONS) {
  const f = chemin(m.fichier)
  const original = readFileSync(f, 'utf8')
  if (!original.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  ecrireSur(f, original.replace(m.de, m.vers))
  const res = lancer(m.banc)
  ecrireSur(f, original)
  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier}. On s'arrête.`)
    process.exit(2)
  }
  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach((x) => console.log('   • ' + x)) }
const finalRouge = BANCS.some((banc) => lancer(banc).rouge)
if (finalRouge) console.log(`🔴 UN BANC EST ROUGE APRÈS RESTAURATION (${BANCS.join(', ')}).`)
else console.log('\nBancs verts après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
