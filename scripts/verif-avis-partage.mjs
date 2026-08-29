// BANC : BLOC E — les avis repliés, le partage d'un commerce, la bande commune.
//
// ⚠️ CE BANC EXISTE POUR UNE RAISON PRÉCISE, et elle date du 23/08 : mes gardes
// vérifiaient que la PIÈCE existe, jamais qu'elle est BRANCHÉE. Le filtre des
// créneaux était écrit, testé, vert — et son `setBlocagesCreneaux` n'était
// appelé nulle part. Ici, chaque règle est donc contrôlée DEUX FOIS : la
// fonction pure est EXÉCUTÉE, puis on vérifie qu'un écran l'appelle vraiment.
//
//   npm run verif:avis

import { readFileSync } from 'node:fs'
import { AVIS_MINIMUM_POUR_MOYENNE, resumeAvis, libelleBascule } from '../lib/avis-affichage.js'
import { actionCommerce, potentialActionJsonLd, consigneGoogle } from '../lib/action-google.js'
import { pointsLogo } from '../lib/logo.js'
import { sansProse } from './lire-code.mjs'

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')

// ⚠️ ON CHERCHE DANS LE CODE, JAMAIS DANS LA PROSE. Septième fois que je trouve
// le mot cherché dans mon propre commentaire : celui qui explique pourquoi une
// moyenne ne s'affiche plus contient forcément le mot « moyenne ».
// ⚠️ LE DÉPOUILLEUR EST PARTAGÉ (`scripts/lire-code.mjs`) : il vivait recopié
// dans huit bancs, et le défaut du 29/08 aurait dû être corrigé huit fois.
const lireCode = (chemin) => sansProse(lire(chemin))

// ⚠️ ET LA MÊME CHOSE POUR LE SQL, HUITIÈME OCCURRENCE DU MÊME PIÈGE. Mesuré à
// la mutation le 24/08 : ma garde cherchait `ON DELETE SET NULL` dans la
// migration et le trouvait dans le COMMENTAIRE qui explique pourquoi on l'a
// choisi. La clause pouvait devenir CASCADE, la garde restait verte.
const lireSql = (chemin) => lire(chemin).replace(/^\s*--.*$/gm, ' ')

let ok = 0
const echecs = []
const verifie = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}
const egal = (nom, obtenu, attendu) =>
  verifie(nom, obtenu === attendu, `« ${obtenu} » au lieu de « ${attendu} »`)

// ═══ 1) LA RÈGLE DES AVIS, EXÉCUTÉE ═══════════════════════════════════════
{
  verifie('le seuil de moyenne vaut 3', AVIS_MINIMUM_POUR_MOYENNE === 3, String(AVIS_MINIMUM_POUR_MOYENNE))

  // ⚠️ ZÉRO AVIS N'EST PAS UNE MAUVAISE NOTE. Une fiche neuve montrait cinq
  // étoiles vides à côté de « Pas encore d'avis » : ça se lit comme un zéro.
  const vide = resumeAvis({ moyenne: 0, count: 0 })
  verifie('sans avis, on n\'annonce pas d\'avis', vide.aDesAvis === false)
  verifie('sans avis, AUCUNE moyenne', vide.montreMoyenne === false && vide.moyenne === null)
  egal('sans avis, le libellé ne reproche rien', vide.libelleNombre, 'Pas encore d’avis')
  verifie('sans avis, aucun bouton à proposer', vide.libelleBouton === null)
  verifie('sans avis, la bascule reste muette', libelleBascule(vide, false) === null)

  // ⚠️ SOUS LE SEUIL : le nombre OUI, la moyenne NON. « 5,0 » sur un seul avis
  // se lit comme une réputation alors que c'est du bruit.
  const un = resumeAvis({ moyenne: 5, count: 1 })
  verifie('un seul avis existe bel et bien', un.aDesAvis === true)
  verifie('🔴 un seul avis ne fabrique PAS de moyenne', un.montreMoyenne === false && un.moyenne === null)
  egal('un avis se dit au singulier', un.libelleNombre, '1 avis')
  egal('et le bouton aussi', un.libelleBouton, 'Lire l’avis')

  const deux = resumeAvis({ moyenne: 4.5, count: 2 })
  verifie('🔴 deux avis non plus', deux.montreMoyenne === false && deux.moyenne === null)
  egal('deux avis se disent au pluriel', deux.libelleNombre, '2 avis')

  // ⚠️ LE SEUIL EST ATTEINT, PAS DÉPASSÉ : 3 suffit. Une inégalité stricte
  // aurait décalé la règle d'un cran sans que rien ne le dise.
  const trois = resumeAvis({ moyenne: 4.666, count: 3 })
  verifie('🔴 à TROIS avis, la moyenne apparaît', trois.montreMoyenne === true)
  egal('la moyenne a UNE décimale, à la virgule', trois.moyenne, '4,7')
  egal('le bouton compte les avis', trois.libelleBouton, 'Lire les 3 avis')

  const seize = resumeAvis({ moyenne: 4.83, count: 16 })
  egal('jamais deux décimales', seize.moyenne, '4,8')
  egal('seize avis se comptent', seize.libelleNombre, '16 avis')

  // ⚠️ LE BOUTON DIT LE GESTE, PAS L'ÉTAT.
  egal('replié, le bouton invite à lire', libelleBascule(seize, false), 'Lire les 16 avis')
  egal('déplié, il invite à masquer', libelleBascule(seize, true), 'Masquer les avis')

  // ⚠️ L'ABSENCE A DEUX FORMES, et `Number(null)` vaut 0 : la fonction doit
  // tenir sans argument du tout.
  const rien = resumeAvis()
  verifie('sans aucun argument, rien ne casse', rien.aDesAvis === false && rien.montreMoyenne === false)
  const nul = resumeAvis({ moyenne: null, count: null })
  verifie('avec des null, rien ne casse non plus', nul.aDesAvis === false)
}

// ═══ 2) LA RÈGLE EST-ELLE BRANCHÉE ? ══════════════════════════════════════
//
// ⚠️ LE CŒUR DE CE BANC. Une fonction juste que personne n'appelle ne corrige
// rien du tout, et c'est exactement le défaut du 23/08.
{
  const fiche = lireCode('app/commander/[slug]/page.js')
  const accueil = lireCode('app/commander/page.js')
  const layout = lireCode('app/commander/[slug]/layout.js')

  verifie('🔴 la FICHE importe la règle', /import \{[^}]*resumeAvis[^}]*\} from '@\/lib\/avis-affichage'/.test(fiche))
  verifie('🔴 la fiche l\'APPELLE vraiment', /resumeAvis\(notesInfo\)/.test(fiche))
  verifie('la fiche rend la moyenne par la règle', /resumeNotes\.moyenne/.test(fiche))
  verifie('🔴 la fiche ne rend PLUS la moyenne brute',
    !/notesInfo\.moyenne\.toFixed/.test(fiche))
  verifie('🔴 les avis sont derrière une bascule', /setAvisDeplies/.test(fiche))
  verifie('et la liste ne s\'affiche QUE dépliée',
    /avisDeplies &&[\s\S]{0,400}avisCommerce\.map/.test(fiche))
  verifie('le bouton porte son libellé calculé', /libelleBascule\(resumeNotes, avisDeplies\)/.test(fiche))
  verifie('les avis manquants sont annoncés AVEC leur nombre',
    /notesInfo\.count > avisCommerce\.length/.test(fiche))

  verifie('🔴 l\'ACCUEIL importe la règle', /import \{[^}]*resumeAvis[^}]*\} from '@\/lib\/avis-affichage'/.test(accueil))
  verifie('🔴 la carte d\'accueil l\'APPELLE', /resumeAvis\(noteInfo \|\| \{\}\)/.test(accueil))
  verifie('🔴 la carte ne dit plus « X avis » de sa poche',
    !/\$\{noteInfo\.count\} avis/.test(accueil))
  verifie('les étoiles de la carte suivent le seuil',
    /resumeNote\.montreMoyenne &&[\s\S]{0,200}<Etoiles/.test(accueil))

  // ⚠️ LE FRÈRE LE PLUS DANGEREUX : le balisage Google. L'écran disait « 1 avis,
  // pas de moyenne » pendant que le JSON-LD annonçait « 4,0 sur 5 » à Google.
  // Deux vérités pour le même commerce, et c'est celle de Google qui se voit.
  verifie('🔴 le BALISAGE importe le même seuil',
    /import \{ AVIS_MINIMUM_POUR_MOYENNE \} from '@\/lib\/avis-affichage'/.test(layout))
  verifie('🔴 et il le fait respecter',
    /data\.length < AVIS_MINIMUM_POUR_MOYENNE\) return null/.test(layout))
}

// ═══ 3) LE PARTAGE D'UN COMMERCE DEPUIS SA CARTE ══════════════════════════
{
  const accueil = lireCode('app/commander/page.js')

  verifie('🔴 la fonction de partage existe', /async function partagerCommerce\(/.test(accueil))
  verifie('🔴 et elle est BRANCHÉE sur les cartes',
    (accueil.match(/onPartager=\{partagerCommerce\}/g) || []).length === 2,
    `${(accueil.match(/onPartager=\{partagerCommerce\}/g) || []).length} branchement(s) au lieu de 2 (accueil + favoris)`)
  verifie('la carte reçoit bien la prop', /function CarteCommerce\(\{[^}]*onPartager[^}]*\}\)/.test(accueil))
  verifie('le bouton l\'appelle', /onPartager\?\.\(c, e\)/.test(accueil))

  // ⚠️ SANS stopPropagation, LE PARTAGE OUVRE LA FICHE : la carte entière est
  // cliquable. Le geste raté ressemblerait à une navigation voulue.
  verifie('🔴 le clic ne traverse pas jusqu\'à la carte', /e\?\.stopPropagation\?\.\(\)/.test(accueil))

  // ⚠️ UN LIEN PARTAGÉ ET UN LIEN IMPRIMÉ QUI DIVERGENT, c'est deux règles à
  // corriger le jour où la route change. Le QR du kit imprime EXACTEMENT
  // https://www.yoppaa.app/commander/<slug> : le partage fait pareil.
  const kit = lire('app/kit/[slug]/page.js')
  verifie('le kit imprime toujours la même forme de lien',
    /\$\{BASE\}\/commander\/\$\{encodeURIComponent\(slug\)\}/.test(kit))
  verifie('🔴 le partage emploie la MÊME forme',
    /https:\/\/www\.yoppaa\.app\/commander\/\$\{encodeURIComponent\(c\.slug\)\}/.test(accueil))
  verifie('🔴 le partage ne devine PAS la route RDV',
    !/partagerCommerce[\s\S]{0,600}commander\/rdv/.test(accueil))
  verifie('un commerce sans slug ne se partage pas', /if \(!c\?\.slug\) return/.test(accueil))
  verifie('un repli existe si le partage natif manque', /clipboard\.writeText/.test(accueil))
}

// ═══ 4) LA BANDE « TOUS LES COMMERCES AUTOUR DE TOI » ═════════════════════
{
  const bande = lire('app/components/BandeAutourDeToi.js')
  const bandeCode = lireCode('app/components/BandeAutourDeToi.js')
  const fiche = lireCode('app/commander/[slug]/page.js')
  const rdv = lireCode('app/commander/rdv/[slug]/page.js')

  verifie('la bande porte le titre demandé', /Tous les commerces autour de toi/.test(bandeCode))
  verifie('sans destination, elle ne s\'affiche pas', /typeof onVoir !== 'function'\) return null/.test(bandeCode))

  // ⚠️ ELLE N'EXPLIQUE PLUS, ELLE PROPOSE UN GESTE (Alex sur capture, 24/08 :
  // « le message est trop long, il est aussi vu par des Yoppers actifs tous les
  // jours »). Expliquer ce qu'est Yoppaa à quelqu'un qui l'ouvre chaque matin,
  // ce n'est pas de la pédagogie, c'est du bruit. UNE ligne, un chevron.
  const texteAffiche = (bandeCode.match(/>\s*\{?titre\}?\s*<|Tous les commerces autour de toi/g) || [])
  verifie('🔴 le titre est le SEUL texte de la bande', texteAffiche.length >= 1)
  verifie('🔴 plus aucun paragraphe explicatif',
    !/réunit les commerçants|dans la même application|Boulangerie, coiffeur/i.test(bandeCode))
  verifie('🔴 et toujours aucune promesse de « tous les commerces » en corps de texte',
    !/tous les commerces de/i.test(bandeCode))

  // ⚠️ LES POINTS VIENNENT DE LA SPEC, ILS NE SE REDESSINENT PAS. Alex,
  // 24/08 : « 3 dots visibles, le logo en a 5 ». Troisième fois que je peins un
  // logo à la main au lieu de le prendre où il est écrit (19/08 la maquette,
  // 23/08 l'aperçu du kit). La garde interdit maintenant le geste lui-même.
  verifie('🔴 la bande PREND les points de la spec', /import \{ pointsLogo, proportionsLogo \} from '@\/lib\/logo'/.test(bandeCode))
  verifie('🔴 et elle les parcourt vraiment', /pointsLogo\(CORPS\)/.test(bandeCode))
  verifie('🔴 aucune rangée de points écrite à la main',
    !/\[\{ c: |\{ c: T\.light/.test(bandeCode))
  // Le contrôle qui compte : la spec en rend CINQ, et trois d'entre eux sont
  // décalés. Si un jour la bande n'en dessine que trois, ceci rougit.
  verifie('🔴 la spec rend bien CINQ points', pointsLogo(24).length === 5)
  verifie('🔴 dont les rangs 2, 3 et 4 décalés',
    pointsLogo(24).filter(p => p.decalage > 0).map(p => p.rang).join(',') === '2,3,4')

  // ⚠️ LES DEUX FICHES, PAS UNE. Un coiffeur, un kiné, un club de yoga sont des
  // commerces VITRINE : leur fiche est celle du module RDV. Poser la bande d'un
  // seul côté aurait laissé la moitié des Yoppers sans le concept.
  verifie('🔴 la fiche BOUTIQUE monte la bande', /<BandeAutourDeToi onVoir=/.test(fiche))
  verifie('🔴 la fiche RDV aussi', /<BandeAutourDeToi onVoir=/.test(rdv))
  verifie('les deux l\'importent',
    /import BandeAutourDeToi from '@\/app\/components\/BandeAutourDeToi'/.test(fiche)
    && /import BandeAutourDeToi from '@\/app\/components\/BandeAutourDeToi'/.test(rdv))
  verifie('les deux mènent à l\'accueil',
    /<BandeAutourDeToi onVoir=\{\(\) => router\.push\('\/commander'\)\}/.test(fiche)
    && /<BandeAutourDeToi onVoir=\{\(\) => router\.push\('\/commander'\)\}/.test(rdv))

  // ⚠️ JAMAIS AU-DESSUS DU PANIER : une invitation à partir posée avant le
  // bouton d'achat, c'est une vente en moins. Sur la fiche boutique elle vient
  // après le récapitulatif ; sur la fiche RDV, seulement à l'étape 1.
  const iPanier = fiche.indexOf('<RecapPanier')
  const iBande = fiche.indexOf('<BandeAutourDeToi')
  verifie('🔴 sur la fiche, la bande vient APRÈS le panier',
    iPanier !== -1 && iBande > iPanier, `panier ${iPanier}, bande ${iBande}`)
  verifie('🔴 sur la fiche RDV, elle ne s\'affiche qu\'à l\'étape 1',
    /etape === 1 && <BandeAutourDeToi/.test(rdv))

  // ⚠️ AUCUN TEXTE VENU D'AILLEURS : la bande n'affiche que des mots écrits ici.
  verifie('la bande n\'interpole aucune donnée de commerçant',
    !/\{commercant|\{c\./.test(bande))

  // ⚠️ PAS DE FLOU : il gèle le défilement sur iPhone (leçon du 22/08).
  verifie('aucun backdrop-filter dans la bande', !/backdrop-?filter/i.test(bandeCode))
}

// ═══ 5) UNE ACTUALITÉ QUI DÉSIGNE UN ARTICLE ══════════════════════════════
{
  const fiche = lireCode('app/commander/[slug]/page.js')
  const bord = lireCode('app/dashboard/ConfigDashboard.js')
  const sql = lireSql('migrations/MIGRATION_ACTUALITE_ARTICLE.sql')

  // ⚠️ LE BOUTON NE S'AFFICHE QUE SI L'ARTICLE EST VRAIMENT LÀ. Le commerçant
  // a pu le désactiver depuis : un bouton qui ne mène à rien est pire que rien.
  verifie('🔴 l\'article visé est cherché dans le catalogue CHARGÉ',
    /\(articles \|\| \[\]\)\.find\(a => a\.id === actuDetailOuverte\.article_id\)/.test(fiche))
  verifie('🔴 sans article trouvé, aucun bouton', /if \(!cible\) return null/.test(fiche))
  verifie('le bouton ouvre la fiche article', /setActuDetailOuverte\(null\); setArticleDetail\(cible\)/.test(fiche))

  // ⚠️ LES DEUX FORMES DE L'ABSENCE : une chaîne vide n'est PAS null pour
  // Postgres, et sur une colonne uuid elle lève une erreur de syntaxe.
  // ⚠️ ANCRÉ SUR LA LIGNE D'AU-DESSUS, ET C'EST INDISPENSABLE : les DEALS ont
  // déjà leur `article_id: form.article_id || null`, à 500 lignes d'ici. Sans
  // ancre, la garde restait verte en ne voyant QUE celui des deals — mesuré à
  // la mutation le 24/08. Une garde qui confond deux formulaires ne garde rien.
  verifie('🔴 « aucun article » part en null, pas en chaîne vide',
    /inclus_gmy: !!form\.inclus_gmy,\s+article_id: form\.article_id \|\| null/.test(bord))
  verifie('le formulaire porte le champ', /article_id: a\.article_id \|\| ''/.test(bord))
  verifie('🔴 on ne propose QUE ses propres articles',
    /from\('articles'\)[\s\S]{0,200}\.eq\('commercant_id', commercantId\)/.test(bord))
  verifie('et seulement les actifs',
    /fetchArticlesLiables[\s\S]{0,400}\.eq\('actif', true\)/.test(bord))
  verifie('sans article, le champ ne s\'affiche pas', /articlesLiables\.length > 0 &&/.test(bord))

  // ⚠️ LA GARDE D'ÉCRAN N'EST JAMAIS UNE RÉPONSE : la base doit refuser d'elle
  // même l'article d'un autre commerçant, INSERT compris.
  verifie('🔴 la base a son propre déclencheur',
    /CREATE TRIGGER trg_actualite_article_meme_commercant/.test(sql))
  verifie('🔴 et il couvre INSERT ET UPDATE',
    /BEFORE INSERT OR UPDATE OF article_id, commercant_id ON public\.actualites/.test(sql))
  verifie('une actu SANS article passe (NULL n\'est ni égal ni différent)',
    /IF NEW\.article_id IS NULL THEN\s+RETURN NEW;/.test(sql))
  verifie('l\'article d\'un autre commerçant est refusé',
    /proprietaire IS DISTINCT FROM NEW\.commercant_id/.test(sql))
  verifie('supprimer l\'article ne détruit pas l\'actualité', /ON DELETE SET NULL/.test(sql))
  verifie('les droits sont explicites', /GRANT SELECT \(article_id\) ON public\.actualites TO anon, authenticated/.test(sql))
}

// ═══ 6) LE BOUTON « COMMANDER » DE GOOGLE ═════════════════════════════════
{
  // ⚠️ ON NE DÉCLARE QUE CE QUE LE COMMERÇANT PEUT HONORER. Annoncer « on
  // commande ici » pour un palier Exister enverrait le client sur une fiche
  // sans panier, et c'est Google qui répéterait la promesse.
  const exister = actionCommerce({ plan: 'exister', categorie: 'alimentaire', slug: 'la-mie' })
  verifie('🔴 palier Exister : AUCUNE action déclarée', exister === null)

  const alim = actionCommerce({ plan: 'vendre', categorie: 'alimentaire', slug: 'la-mie' })
  verifie('une boulangerie Vendre se commande', alim?.type === 'commander')
  egal('et le type schema.org est OrderAction', alim?.schemaType, 'OrderAction')
  egal('vers sa fiche de commande', alim?.url, 'https://www.yoppaa.app/commander/la-mie')

  // ⚠️ UN COMMERCE VITRINE NE SE COMMANDE PAS, IL SE RÉSERVE — et sa fiche vit
  // sur une AUTRE route. Se tromper, c'est envoyer le client de Google sur une
  // page qui le redirige aussitôt.
  const coiffeur = actionCommerce({ plan: 'vendre', categorie: 'vitrine', slug: 'ciseaux' })
  verifie('🔴 un coiffeur Vendre se RÉSERVE', coiffeur?.type === 'reserver')
  egal('et le type est ReserveAction', coiffeur?.schemaType, 'ReserveAction')
  egal('🔴 vers la route RDV', coiffeur?.url, 'https://www.yoppaa.app/commander/rdv/ciseaux')

  const boutique = actionCommerce({ plan: 'vendre', categorie: 'detail', slug: 'temoin' })
  verifie('une boutique de détail se commande aussi', boutique?.type === 'commander')

  verifie('sans slug, rien du tout', actionCommerce({ plan: 'vendre', categorie: 'detail' }) === null)
  verifie('sans rien du tout, rien non plus', actionCommerce() === null)

  // Le bloc JSON-LD lui-même
  const bloc = potentialActionJsonLd({ plan: 'vendre', categorie: 'alimentaire', slug: 'la-mie' })
  verifie('le balisage porte une EntryPoint', bloc?.potentialAction?.target?.['@type'] === 'EntryPoint')
  verifie('avec les trois plateformes', (bloc?.potentialAction?.target?.actionPlatform || []).length === 3)
  const vide = potentialActionJsonLd({ plan: 'exister', categorie: 'alimentaire', slug: 'la-mie' })
  verifie('🔴 rien à déclarer rend un objet VIDE, étalable', Object.keys(vide).length === 0)

  // ⚠️ ET C'EST BRANCHÉ ? (le défaut du 23/08, encore et toujours)
  const layout = lireCode('app/commander/[slug]/layout.js')
  verifie('🔴 le layout appelle le balisage', /\.\.\.potentialActionJsonLd\(c\)/.test(layout))
  verifie('🔴 et il rapatrie `plan`, sans quoi tout serait muet',
    /\.select\('id, nom, description, logo_url, adresse, slug, type, categorie, telephone, latitude, longitude, plan'\)/.test(layout))

  // La consigne du kit
  const consigne = consigneGoogle({ plan: 'vendre', categorie: 'vitrine', slug: 'ciseaux' })
  verifie('la consigne existe pour un commerce qui réserve', !!consigne)
  egal('elle nomme le champ Google', consigne?.champ, 'Prendre rendez-vous')
  verifie('elle donne trois étapes', consigne?.etapes?.length === 3)
  verifie('🔴 aucune consigne pour un palier Exister',
    consigneGoogle({ plan: 'exister', categorie: 'vitrine', slug: 'ciseaux' }) === null)

  const compo = lireCode('app/components/ConsigneGoogle.js')
  // ⚠️ ON NE PROMET PAS LE BOUTON : Google décide. Une promesse qu'on ne
  // maîtrise pas est une déception à retardement.
  verifie('🔴 le bloc dit que Google décide', /C&rsquo;est Google qui d(é|&eacute;)cide/.test(compo))
  verifie('sans consigne, le bloc ne s\'affiche pas', /if \(!consigne\) return null/.test(compo))

  const bord = lireCode('app/dashboard/ConfigDashboard.js')
  const kitClient = lireCode('app/kit/[slug]/KitClient.js')
  const kitPage = lireCode('app/kit/[slug]/page.js')
  verifie('🔴 le TABLEAU DE BORD monte la consigne', /<ConsigneGoogle consigne=\{consigneG\}\/>/.test(bord))
  verifie('🔴 la PAGE DE KIT aussi', /<ConsigneGoogle consigne=\{consigne\} sombre\/>/.test(kitClient))
  verifie('le tableau de bord rapatrie plan et catégorie',
    /\.select\('slug, nom, plan, categorie'\)/.test(bord))
  verifie('la page de kit aussi', /\.select\('nom, slug, plan, categorie'\)/.test(kitPage))

  // ⚠️ LE LIEN DONNÉ AU COMMERÇANT EST CELUI QUE LE QR IMPRIME. Trois formes
  // du même lien (QR, partage, Google), c'est trois règles à corriger le jour
  // où la route change.
  verifie('la consigne emploie la forme canonique',
    consigneGoogle({ plan: 'vendre', categorie: 'alimentaire', slug: 'la-mie' })?.url
      === 'https://www.yoppaa.app/commander/la-mie')
}

console.log(`\nAvis et partage : ${ok} vérifications`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
