// Le règlement du concours de lancement, publié à l'adresse annoncée sur
// Facebook (yoppaa.app/concours) et lié en premier commentaire.
//
// ⚠️ C'EST UN DOCUMENT CONTRACTUEL, PAS UNE PAGE DE COMMUNICATION. Le texte
// fait foi face aux participants : toute modification après le début du
// concours se date (article 13) et ne peut rien retirer à ceux déjà inscrits.
// Changer une date ici, c'est modifier le règlement.
//
// ⚠️ LES DATES VIVENT EN UN SEUL ENDROIT, juste en dessous. Elles apparaissent
// dans le résumé ET dans les articles 5, 6 et 7 : recopiées à la main, elles
// auraient fini par se contredire, et c'est la version la plus favorable au
// participant qu'un juge retiendrait.
//
// ⚠️ SEPT JOURS ENTRE LA FIN DES PARTICIPATIONS ET LE CONSTAT (décision
// d'Alex, 15/09). Le catalogue est public : sans cet écart, celui qui commente
// le dernier soir compte les fiches et connaît presque la réponse.
//
// ⚠️ PAGE INDEXABLE, comme /legal : le layout racine met tout le site en
// noindex avant le lancement, et un règlement doit rester consultable par
// tous, y compris par l'aperçu de lien de Facebook.

const DATES = {
  version: '16 septembre 2026',
  debut: 'mercredi 16 septembre 2026 à 20 h',
  finParticipations: 'samedi 24 octobre 2026 à 23 h 59',
  constat: 'samedi 31 octobre 2026 à 23 h 59',
  constatCourt: '31 octobre 2026 à 23 h 59',
}

// ⚠️ LA LISTE EST FIGÉE AU DÉBUT DU CONCOURS (article 6). Ajouter un commerce
// ici après le 16 septembre retirerait des fiches du décompte : l'organisateur
// pourrait déplacer le nombre final vers l'estimation de son choix.
// Relevée le 15/09 dans la vue publique (clé anon), noms EXACTS tels
// qu'affichés, et cochée par Alex : tout ce qui est publié sauf L'Arrosoir,
// seul vrai commerce publié à cette date.
// ⚠️ LES TESTS SUSPENDUS NE SONT PAS LISTÉS, ET C'EST L'ANNEXE QUI LES COUVRE :
// l'organisateur s'engage à n'en republier aucun. Une liste de noms tirés de
// mémoire aurait pu en oublier un, qui serait alors compté.
// 🔴 DEUX NOMS SONT AUSSI CEUX DE VRAIS COMMERCES (Alex, 15/09) : le vrai
// Kebabistro et le vrai Centre Respire rejoignent l'application. Un test ne se
// désigne donc ni par son nom, ni par son adresse (le vrai commerce pourra la
// reprendre une fois le test retiré), mais par ce qui les distingue pour de
// bon : créé par l'organisateur, et existant au début du concours.
const COMMERCES_DEMONSTRATION = [
  'Centre Respire - Yoga et Pilates',
  'Ciseaux et Soins',
  'Kebabistro',
  'La Boutique Témoin',
  'La mie de test',
  "La Table d'Essai",
  'Sushi Sushi',
]

export const metadata = {
  title: 'Règlement du concours de lancement · Yoppaa',
  description:
    "Règlement du concours de lancement Yoppaa sur Facebook : conditions de participation, question subsidiaire, dotation et attribution des bons.",
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://www.yoppaa.app/concours' },
}

const T = {
  main: '#6B35C4',
  light: '#C4A0F4',
  pale: '#EDE0FF',
  ink: '#1A0840',
  deep: '#2D0F6B',
  texte: '#374151',
  muted: '#6B7280',
  bg: '#F8F6FF',
}

const ARTICLES = [
  { id: 'organisateur', titre: 'Organisateur' },
  { id: 'meta', titre: 'Absence de lien avec Meta' },
  { id: 'conditions', titre: 'Conditions de participation' },
  { id: 'modalites', titre: 'Modalités de participation' },
  { id: 'duree', titre: 'Durée' },
  { id: 'question', titre: 'Question subsidiaire et désignation des gagnants' },
  { id: 'dotation', titre: 'Dotation et paliers' },
  { id: 'bons-yoppaa', titre: "Bons offerts par l'organisateur" },
  { id: 'bons-partenaires', titre: 'Bons offerts par les commerçants partenaires' },
  { id: 'attribution', titre: 'Attribution des lots' },
  { id: 'annonce', titre: 'Annonce des gagnants' },
  { id: 'donnees', titre: 'Données à caractère personnel' },
  { id: 'modification', titre: 'Responsabilité et modification' },
  { id: 'droit', titre: 'Droit applicable' },
]

function Article({ numero, children }) {
  const { id, titre } = ARTICLES[numero - 1]
  return (
    <section id={id} style={{ marginBottom: '2.25rem', scrollMarginTop: '1.5rem' }}>
      <h2 style={{ fontWeight: 800, fontSize: '1.08rem', color: T.deep, marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: `2px solid ${T.pale}`, textWrap: 'balance' }}>
        Article {numero}. {titre}
      </h2>
      {children}
    </section>
  )
}

function P({ children }) {
  return <p style={{ fontSize: '0.92rem', color: T.texte, lineHeight: 1.7, margin: '0 0 0.75rem' }}>{children}</p>
}

function Liste({ items }) {
  return (
    <ul style={{ paddingLeft: '1.25rem', margin: '0 0 0.75rem' }}>
      {items.map((item, i) => (
        <li key={i} style={{ fontSize: '0.92rem', color: T.texte, lineHeight: 1.7, marginBottom: '0.25rem' }}>{item}</li>
      ))}
    </ul>
  )
}

function Citation({ children }) {
  return (
    <p style={{ fontSize: '0.95rem', fontWeight: 700, color: T.deep, lineHeight: 1.6, margin: '0 0 0.9rem', padding: '0.8rem 1rem', background: T.pale, borderRadius: 10 }}>
      {children}
    </p>
  )
}

function Repere({ label, valeur }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.light }}>{label}</span>
      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{valeur}</span>
    </div>
  )
}

export default function ReglementConcours() {
  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />

      <header style={{ background: `linear-gradient(160deg, ${T.deep} 0%, ${T.main} 100%)`, backgroundColor: T.deep, padding: '2rem 1.25rem 1.75rem' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '1.5rem', color: '#fff', letterSpacing: '-0.05em', margin: '0 0 1rem', lineHeight: 1 }}>yoppaa</p>
          <h1 style={{ fontWeight: 800, fontSize: '1.6rem', color: '#fff', margin: '0 0 0.35rem', lineHeight: 1.2, textWrap: 'balance' }}>Concours de lancement : le règlement</h1>
          <p style={{ fontSize: '0.8rem', color: T.light, margin: '0 0 1.25rem' }}>Version du {DATES.version} · Avcotech SRL · BCE 0731.637.148</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.9rem', padding: '1rem', borderRadius: 12, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(196,160,244,0.3)' }}>
            <Repere label="Début" valeur={DATES.debut} />
            <Repere label="Dernier commentaire" valeur={DATES.finParticipations} />
            <Repere label="Constat du nombre" valeur={DATES.constat} />
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '1.5rem 1.25rem 3rem' }}>
        <nav aria-label="Sommaire" style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${T.pale}`, padding: '1rem 1.1rem', marginBottom: '1.5rem' }}>
          <p style={{ fontSize: '0.7rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.6rem' }}>Sommaire</p>
          <ol style={{ margin: 0, paddingLeft: '1.4rem', columns: '2 260px', columnGap: '1.5rem' }}>
            {ARTICLES.map(a => (
              <li key={a.id} style={{ fontSize: '0.84rem', lineHeight: 1.6, breakInside: 'avoid' }}>
                <a href={`#${a.id}`} style={{ color: T.main, textDecoration: 'none' }}>{a.titre}</a>
              </li>
            ))}
            <li style={{ fontSize: '0.84rem', lineHeight: 1.6, listStyle: 'none', marginLeft: '-1.4rem' }}>
              <a href="#annexe" style={{ color: T.main, textDecoration: 'none' }}>Annexe : commerces de démonstration</a>
            </li>
          </ol>
        </nav>

        <div style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${T.pale}`, padding: '1.75rem 1.4rem' }}>
          <Article numero={1}>
            <P>Le présent concours est organisé par Avcotech SRL, dont le siège social est établi Rue de Prée 9 G à 5640 Mettet, inscrite à la Banque-Carrefour des Entreprises sous le numéro 0731.637.148, éditrice de l'application Yoppaa, ci-après « l'organisateur ».</P>
          </Article>

          <Article numero={2}>
            <P>Ce concours n'est ni organisé, ni parrainé, ni administré par Meta Platforms, et n'est associé à Meta d'aucune manière. Chaque participant dégage Meta de toute responsabilité liée au concours et reconnaît communiquer ses informations à l'organisateur, et non à Meta.</P>
          </Article>

          <Article numero={3}>
            <P>La participation est gratuite et sans obligation d'achat. Elle est ouverte à toute personne physique âgée de dix-huit ans accomplis et résidant en Région wallonne, territoire actuellement couvert par Yoppaa.</P>
            <P>Le code postal renseigné par le participant fait foi pour apprécier la condition de résidence. Sont admis les codes postaux de 1300 à 1499 et de 4000 à 7999, qui correspondent à la Région wallonne. L'organisateur peut demander à un gagnant de justifier de son âge et de sa résidence ; à défaut, le lot est réattribué selon l'article 11.</P>
            <P>Sont exclus du concours :</P>
            <Liste items={[
              "l'organisateur, ses associés, ses gérants, son personnel et toute personne ayant pris part à l'organisation du concours ;",
              "toute personne disposant d'un accès à l'espace commerçant d'un commerce présent sur Yoppaa, ainsi que le personnel de ce commerce ;",
              'les membres de la famille des personnes ci-dessus vivant sous le même toit.',
            ]} />
            <P>Ces personnes peuvent agir sur le nombre visé à l'article 6, ce qui justifie leur exclusion.</P>
            <P>Une seule participation est retenue par personne : seul le premier commentaire valable d'un participant est pris en compte. Les commentaires suivants de la même personne sont ignorés, sans que sa participation initiale en soit affectée.</P>
            <P>Toute participation émanant d'un compte manifestement créé pour les besoins du concours, d'un compte automatisé, ou toute tentative de contourner la règle de participation unique, entraîne l'exclusion de l'ensemble des participations concernées. L'organisateur apprécie ces situations de bonne foi et conserve la trace de chaque exclusion.</P>
          </Article>

          <Article numero={4}>
            <P>Pour participer, le participant publie sous la publication officielle du concours un commentaire comportant trois éléments :</P>
            <Liste items={[
              'son code postal ;',
              "le nom d'un commerce qu'il aimerait voir sur Yoppaa ;",
              "sa réponse à la question subsidiaire de l'article 6, sous la forme d'un nombre entier.",
            ]} />
            <P>Le commerce cité est de préférence situé dans la commune du participant, sans que cela constitue une condition de validité.</P>
            <P>Une estimation modifiée après la publication du commentaire rend la participation non valable. Le participant qui souhaite corriger son estimation supprime son commentaire et en publie un nouveau, dont la date de publication fait alors foi.</P>
            <P>La publication officielle du concours est celle publiée par l'organisateur sur la page Facebook Yoppaa. Le concours ne se joue que sur ce réseau : les commentaires laissés sur toute autre plateforme, notamment Instagram, ne sont pas pris en compte. Un partage de la publication officielle constitue une publication distincte, hébergée sur le profil d'un tiers : les commentaires qui y sont laissés ne parviennent pas à l'organisateur et ne sont pas comptabilisés.</P>
            <P>Ni le partage de la publication ni l'abonnement à la page ne sont des conditions de participation, et ils ne donnent aucune chance supplémentaire de gagner.</P>
            <P>Le nombre d'abonnés de la page et le nombre de commerces présents sur Yoppaa déterminent, selon l'article 7, le nombre et la valeur des lots mis en jeu pour l'ensemble des participants. Cette mécanique est collective : elle ne modifie la position d'aucun participant dans le classement et ne récompense aucune action individuelle.</P>
          </Article>

          <Article numero={5}>
            <P>Le concours débute le {DATES.debut}. Les participations sont reçues jusqu'au {DATES.finParticipations}. Le concours se clôture le {DATES.constat}, moment où sont constatés les nombres visés aux articles 6 et 7. Les heures s'entendent en heure belge.</P>
            <P>Un commentaire publié après le {DATES.finParticipations} n'est pas valable. Sept jours séparent ainsi la dernière participation du constat : le nombre final n'est pas connu au moment de participer.</P>
            <P>L'organisateur annonce la fin des participations, puis la clôture, par une publication sur sa page Facebook.</P>
          </Article>

          <Article numero={6}>
            <P>Les gagnants ne sont pas désignés par tirage au sort. Ils le sont par la question subsidiaire suivante, à laquelle le participant répond dans son commentaire :</P>
            <Citation>« Combien de produits et prestations au total seront visibles sur Yoppaa le {DATES.constatCourt} ? »</Citation>
            <P>Le nombre retenu est celui des fiches visibles par le public sur les pages des commerces présents sur Yoppaa : les produits et plats de leur catalogue, et les prestations proposées à la réservation. Une fiche marquée comme épuisée ou temporairement indisponible, mais toujours affichée, est comptée.</P>
            <P>Ne sont pas comptés :</P>
            <Liste items={[
              "les fiches des commerces de démonstration de l'organisateur, dont la liste figure en annexe et ne peut plus être complétée après le début du concours ;",
              "les variantes d'une même fiche, notamment de taille ou de couleur : la fiche compte pour une seule unité ;",
              'les offres de fin de journée et les deals, qui renvoient à une fiche existante ;',
              "les bons cadeaux, les formules d'abonnement et les formats de table proposés par un restaurant.",
            ]} />
            <P>Les participants sont classés selon l'écart absolu entre leur estimation et ce nombre, du plus petit écart au plus grand. À égalité, le commentaire publié le plus tôt passe devant.</P>
            <P>Une participation dépourvue d'estimation chiffrée n'est pas valable et n'entre pas dans le classement.</P>
            <P>Le nombre est constaté par l'organisateur le {DATES.constatCourt}. Il est publié avec les résultats, accompagné du nombre de fiches retenues pour chaque commerce, afin que chaque commerçant puisse vérifier le sien.</P>
          </Article>

          <Article numero={7}>
            <P>Le concours est doté au minimum de deux bons d'une valeur de cinquante euros chacun, offerts par l'organisateur.</P>
            <P>Le nombre de bons de cinquante euros dépend du nombre d'abonnés de la page Facebook Yoppaa au {DATES.constatCourt} :</P>
            <Liste items={[
              'à partir de 1 000 abonnés : 3 bons de cinquante euros ;',
              'à partir de 2 000 abonnés : 4 bons de cinquante euros.',
            ]} />
            <P>Un bon supplémentaire est ajouté selon le nombre de commerces visibles sur Yoppaa au {DATES.constatCourt}, hors commerces de démonstration :</P>
            <Liste items={[
              'à partir de 50 commerces : un bon de cent euros ;',
              'à partir de 100 commerces : un bon de deux cents euros ;',
              'à partir de 150 commerces : un bon de trois cents euros.',
            ]} />
            <P>Dans chacune de ces deux grilles, seul le palier le plus élevé atteint est retenu : les paliers ne se cumulent pas. Ils déterminent uniquement le nombre et la valeur des lots, n'ont aucune incidence sur les chances individuelles de gagner et ne sont liés à aucune action de partage.</P>
            <P>La dotation offerte par l'organisateur, tous bons confondus, ne peut en aucun cas excéder cinq cents euros.</P>
            <P>Le nombre d'abonnés et le nombre de commerces sont constatés le {DATES.constatCourt} et attestés par une capture horodatée, publiée avec les résultats. Toute variation postérieure à ce constat, notamment une suppression de comptes par la plateforme, est sans effet sur la dotation.</P>
            <P>S'y ajoutent, le cas échéant, les bons offerts par des commerçants partenaires, dont les montants sont publiés sur la page Facebook Yoppaa au fur et à mesure.</P>
          </Article>

          <Article numero={8}>
            <P>Les bons offerts par l'organisateur sont des bons cadeaux dématérialisés, utilisables chez un commerçant présent sur Yoppaa.</P>
            <P>Le gagnant communique à l'organisateur le commerçant Yoppaa chez lequel il souhaite dépenser son bon, ainsi que l'adresse électronique à laquelle il souhaite le recevoir. Il dispose de trente jours calendrier à compter de l'annonce des résultats pour transmettre ce choix ; à défaut, l'organisateur retient un commerçant parmi les plus proches de son code postal.</P>
            <P>L'organisateur achète le bon cadeau auprès du commerçant désigné et le fait adresser au gagnant à cette adresse.</P>
            <P>Si le commerçant désigné ne propose pas encore de bons cadeaux, l'organisateur le contacte pour lui proposer de les activer. À défaut d'accord, le gagnant désigne un autre commerçant Yoppaa ou, s'il le préfère, l'organisateur lui rembourse un montant équivalent sur présentation d'un justificatif d'achat dans un commerce situé dans sa commune. Le gagnant ne peut en aucun cas se retrouver sans contrepartie.</P>
            <P>Si le commerce cité par le gagnant lors de sa participation rejoint Yoppaa avant que le gagnant ait transmis son choix, il peut le désigner.</P>
            <P>Un bon cadeau n'est utilisable que chez le commerçant qui l'a émis. Il est fractionnable en plusieurs utilisations, non échangeable et non convertible en espèces, et valable pendant la durée indiquée sur le bon.</P>
          </Article>

          <Article numero={9}>
            <P>Les bons offerts par un commerçant partenaire sont utilisables exclusivement auprès de ce commerçant, selon les conditions qu'il détermine et qui sont publiées avec l'annonce du lot.</P>
            <P>Ils sont attribués selon le classement établi à l'article 6, restreint aux participants dont le code postal couvre tout ou partie de la commune du commerçant concerné.</P>
            <P>Si aucun participant ne remplit cette condition, le bon est restitué au commerçant partenaire, libre d'en disposer auprès de sa propre clientèle.</P>
          </Article>

          <Article numero={10}>
            <P>L'ensemble des participants valables est réuni dans un classement unique, établi selon l'article 6.</P>
            <P>Les lots offerts par l'organisateur sont attribués dans l'ordre décroissant de leur valeur, en suivant ce classement. Le bon lié au nombre de commerces, s'il est acquis, revient au participant le mieux classé. Les bons de cinquante euros reviennent ensuite aux participants suivants, dans l'ordre.</P>
            <P>Un même participant ne peut remporter qu'un seul lot. Une fois désigné, il est écarté du classement pour l'attribution des lots suivants.</P>
            <P>Les bons offerts par des commerçants partenaires sont attribués en dernier, selon l'article 9.</P>
          </Article>

          <Article numero={11}>
            <P>Les gagnants sont désignés dans les sept jours suivant la clôture, selon les articles 6, 9 et 10.</P>
            <P>Ils sont annoncés par une publication sur la page Facebook Yoppaa, sous la forme de leur prénom suivi de l'initiale de leur nom, et de leur code postal. Aucune autre donnée n'est rendue publique sans leur accord exprès.</P>
            <P>Chaque gagnant se manifeste en envoyant un message privé à la page Facebook Yoppaa dans les quatorze jours calendrier suivant l'annonce. L'organisateur peut également tenter de le contacter, sans que cette démarche constitue une obligation.</P>
            <P>Passé ce délai, le lot est réattribué au participant suivant dans le classement, sans que le gagnant initial puisse prétendre à une quelconque indemnisation.</P>
          </Article>

          <Article numero={12}>
            <P>Les données communiquées sont traitées par Avcotech SRL aux seules fins de la gestion du concours et de la remise des lots, sur la base de l'exécution du présent règlement. Sont traités le nom du profil Facebook, le contenu et la date du commentaire et, pour les gagnants, l'adresse électronique et le commerçant choisi.</P>
            <P>Les commentaires sont publiés par les participants eux-mêmes sur Facebook, où ils restent soumis aux règles de Meta.</P>
            <P>Le nom du commerce cité par un participant peut être utilisé par l'organisateur pour prendre contact avec ce commerce ; cette mention ne constitue ni un engagement ni une recommandation de la part du participant.</P>
            <P>Les données sont conservées jusqu'à trois mois après la clôture, puis supprimées, sauf préinscription volontaire et distincte à Yoppaa. Font exception la trace des exclusions et les données nécessaires à la remise des lots, conservées jusqu'à un an après la clôture. Un bon cadeau émis relève ensuite de la politique de confidentialité de Yoppaa, consultable sur yoppaa.app/legal.</P>
            <P>Conformément au Règlement général sur la protection des données, chaque participant dispose d'un droit d'accès, de rectification, d'effacement, de limitation et d'opposition, qu'il exerce à l'adresse dpo@yoppaa.app. Une réclamation peut être introduite auprès de l'Autorité de protection des données.</P>
          </Article>

          <Article numero={13}>
            <P>L'organisateur ne peut être tenu responsable d'un dysfonctionnement du réseau, d'une perte de commentaire ou de tout événement indépendant de sa volonté affectant le déroulement du concours.</P>
            <P>Il se réserve le droit d'écourter, de prolonger, de modifier ou d'annuler le concours en cas de force majeure ou d'événement rendant son déroulement impossible, sans que sa responsabilité puisse être engagée.</P>
            <P>Aucune modification ne peut intervenir en défaveur des participants déjà inscrits : la dotation acquise au jour de la modification leur reste garantie, et les conditions de participation ne peuvent être durcies rétroactivement. Toute modification fait l'objet d'une publication sur la page Facebook Yoppaa et d'une mise à jour du présent règlement, avec mention de sa date.</P>
            <P>La participation implique l'acceptation pleine et entière du présent règlement, consultable gratuitement sur yoppaa.app/concours.</P>
          </Article>

          <Article numero={14}>
            <P>Le présent règlement est régi par le droit belge. Sans préjudice des règles impératives qui protègent le consommateur, tout litige relève de la compétence des cours et tribunaux de l'arrondissement judiciaire de Namur.</P>
          </Article>

          <section id="annexe" style={{ scrollMarginTop: '1.5rem' }}>
            <h2 style={{ fontWeight: 800, fontSize: '1.08rem', color: T.deep, marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: `2px solid ${T.pale}` }}>
              Annexe. Commerces de démonstration de l'organisateur
            </h2>
            <P>Les fiches ci-dessous ont été créées par l'organisateur pour présenter et tester l'application. Elles ne sont comptées ni dans le nombre de l'article 6, ni dans le nombre de commerces de l'article 7. Cette liste vise les fiches de test existant au {DATES.debut}, et elle est arrêtée à cette date.</P>
            <Liste items={COMMERCES_DEMONSTRATION} />
            <P>Certaines de ces fiches portent le nom d'un commerce réel. Lorsque ce commerce rejoint Yoppaa, sa fiche est une fiche distincte, créée par le commerçant lui-même : elle est comptée normalement, dans les deux nombres.</P>
            <P>Les fiches de test sont retirées de l'application au plus tard le 1er octobre 2026, et restent exclues des décomptes en toute hypothèse. Les commerces de test de l'organisateur qui ne sont pas publiés au début du concours ne sont pas publiés pendant sa durée.</P>
          </section>
        </div>
      </main>
    </div>
  )
}
