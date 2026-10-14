'use client'
// LandingReveal : la landing publique (mode 'reveal' de lib/landing-mode.js).
//
// 🔥 V2 DU 14/10. Alex : « trop lourde. Je voudrais quelque chose de plus
// léger, percutant, piquant, provocateur vers les autres plateformes,
// accrocheur et recruteur. Je ne suis pas là pour me faire aimer des autres
// acteurs, je viens pour déranger. ODOO MIND. » Brief : BRIEF_LANDING_V2.md.
//
// Ce qui a été tranché au tableau, et que cette page applique :
//   • le commerçant d'abord, l'habitant ensuite, et chaque idée UNE seule fois ;
//   • on pique le MODÈLE, jamais une marque : aucune plateforme n'est nommée,
//     mais chaque secteur prend sa pique (alimentaire, rendez-vous, détail,
//     table). La loi belge sur la publicité comparative exige des taux exacts
//     et à jour, et le commerçant qu'on recrute est souvent leur client ;
//   • le titre dit ce qui nous différencie : les autres prennent des
//     commandes, Yoppaa amène des clients, et pour tout le monde ;
//   • 100 jours d'essai EN PERMANENCE, comptés dès l'inscription : la page
//     n'affiche plus aucune date d'offre (`ESSAI_JOURS_MINIMUM`) ;
//   • « abonnement » fait penser à « engagement » : la page dit que rien
//     n'enferme, et que la page reste quand on part. « Yopper un jour, Yopper
//     toujours. »
//
// L'ancienne page (douze blocs, sept maquettes dessinées, deux séries de
// captures, un compte à rebours, la fenêtre « tribu ») est partie. Les gardes
// qui la mesuraient sont REPOINTÉES LE 14/10 sur ce qui reste, une par une, et
// celles qui portaient une règle encore vraie la tiennent toujours.

import { useState, useEffect, useRef } from 'react'
import Script from 'next/script'
import Link from 'next/link'
import { Lock } from 'lucide-react'
import YoppaaLogo from '@/app/components/YoppaaLogo'
import BandeDefilante from '@/app/components/BandeDefilante'
import {
  libelleLancement, ESSAI_JOURS_MINIMUM,
  progressionVersLancement, joursAvantLancement,
  // L'ouverture à confirmer (Alex, 30/09 au soir) : sans date décidée, ni date
  // ni compte à rebours, seulement « dès l'ouverture ».
  ouvertureDatee,
} from '@/lib/lancement'
import { RESEAUX } from '@/lib/reseaux'
import { getPrixPlan, canDo, PLANS } from '@/lib/plans'
import { LIBELLE_COMMERCANT, LIBELLE_HABITANT } from '@/lib/libelles-audience'
import { CAPTURES_COMMERCANT, CAPTURES_YOPPER, captureSrc } from '@/lib/captures-landing'
import { APP_STORE_URL, GOOGLE_PLAY_URL, BADGE_APP_STORE, BADGE_GOOGLE_PLAY, appPubliee } from '@/lib/stores'
import { lienWhatsApp, TELEPHONE_AFFICHE, ENCODAGE_OFFERT, motifsActifs } from '@/lib/contact'
import PartageMobilisation from './PartageMobilisation'

// ─── Les captures ───────────────────────────────────────────────────────────
//
// 🔴 UN `find` QUI NE TROUVE RIEN NE CASSE RIEN, IL EFFACE. Si une clé change,
// la capture disparaît de la page sans qu'une ligne ne bronche : c'est le banc
// qui doit le dire, et il le dit (`verif:vitrine`, section 3).
//
// ⚠️ SIX AU PLUS (brief du 14/10), une par geste : le tableau du commerçant,
// puis ce que l'habitant fait chez lui. `dashboard_essai` n'y est plus : sa
// capture affiche l'ancienne fin d'essai au 8 janvier, devenue fausse pour qui
// s'inscrit aujourd'hui.
const CLE_DASHBOARD = 'dashboard_commandes'
const CAPTURE_DASHBOARD = CAPTURES_COMMERCANT.find(c => c.cle === CLE_DASHBOARD)
const CLES_CARROUSEL = ['yopper_options', 'yopper_creneaux', 'yopper_variantes', 'yopper_invendus', 'yopper_fidelite']
const CAPTURES_CARROUSEL = [CAPTURE_DASHBOARD, ...CLES_CARROUSEL.map(cle => CAPTURES_YOPPER.find(c => c.cle === cle))].filter(Boolean)
// L'écran du téléphone, en haut de page : la liste du village.
const CAPTURE_HERO = CAPTURES_YOPPER.find(c => c.cle === 'yopper_liste')

const T = {
  ink:     '#1A0840',
  panel:   '#160636',
  deep:    '#2D0F6B',
  main:    '#6B35C4',
  mid:     '#9660E0',
  light:   '#C4A0F4',
  pale:    '#EDE0FF',
  bg:      '#F8F6FF',
  muted:   '#6B7280',
}

// ─── Les métiers qui défilent dans le haut de page ──────────────────────────
// « Tu tiens une friterie ? » : la question qu'un commerçant se pose sur
// lui-même, avant toute promesse. L'article fait partie du mot, sinon « un »
// ou « une » tomberait faux une fois sur deux.
//
// ✅ 14/10, Alex : « Les autres prennent tes commandes OU TES RENDEZ-VOUS ? »
// En titre fixe, la phrase s'allonge et perd son contraste. Le mot suit donc
// le métier : la friterie lit « commandes », le salon « rendez-vous », le
// restaurant « réservations ». Le premier est celui que Google lit.
const METIERS = [
  { metier: 'une friterie', objet: 'commandes' },
  { metier: 'un salon de coiffure', objet: 'rendez-vous' },
  { metier: 'un restaurant', objet: 'réservations' },
  { metier: 'une boutique', objet: 'commandes' },
  { metier: 'un institut de beauté', objet: 'rendez-vous' },
  { metier: 'une boulangerie', objet: 'commandes' },
  { metier: 'un garage', objet: 'rendez-vous' },
  { metier: 'un food truck', objet: 'commandes' },
  { metier: 'une boucherie', objet: 'commandes' },
  // ✅ Alex : on « tient » un barbershop, pas un barbier.
  { metier: 'un barbershop', objet: 'rendez-vous' },
  { metier: 'une sandwicherie', objet: 'commandes' },
  { metier: 'un magasin de fleurs', objet: 'commandes' },
]

// ─── Les piques, une par secteur ────────────────────────────────────────────
// ⚠️ ON VISE LE MODÈLE, JAMAIS UN NOM. Chaque commerçant reconnaît sa facture,
// personne n'est désigné. Et AUCUN CHIFFRE : un seul nombre vit sur cette page
// hors calculateur et prix, et c'est cent.
const PIQUES = [
  { secteur: 'Alimentaire', t: 'Ta pizza, ce n’est pas à nous d’en manger une part.' },
  { secteur: 'Rendez-vous', t: 'Ton agenda est plein ? Tant mieux. Ça ne nous rapporte pas un centime de plus.' },
  { secteur: 'Détail', t: 'Ta vitrine, ton stock, ton prix. Pas de commission Yoppaa planquée sous chaque pull.' },
  { secteur: 'Table', t: 'Chez nous, un couvert réservé ne se paie pas au couvert.' },
  { secteur: 'Tout le monde', t: 'Le commerce local n’a pas besoin d’un péage.' },
]

// ─── Tout le monde a sa place ───────────────────────────────────────────────
const FAMILLES = [
  'Friteries', 'Boulangeries', 'Boucheries', 'Snacks', 'Restaurants', 'Food trucks',
  'Coiffeurs', 'Barbiers', 'Instituts de beauté', 'Bien-être', 'Garages',
  'Boutiques de mode', 'Fleuristes', 'Librairies', 'Décoration', 'Maraîchers',
  'Apiculteurs', 'L’artisan qui n’ouvre que le samedi',
]

// ─── Petites briques visuelles ───────────────────────────────────────────────

// Drapeau belge SVG (l'emoji 🇧🇪 s'affiche « BE » sous Windows)
function DrapeauBelge({ size = 20 }) {
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 30 20" aria-label="Belgique"
      style={{ display: 'inline-block', verticalAlign: '-0.15em', margin: '0 5px 0 4px', borderRadius: 2, boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
      <rect width="10" height="20" fill="#000000"/>
      <rect x="10" width="10" height="20" fill="#FAE042"/>
      <rect x="20" width="10" height="20" fill="#ED2939"/>
    </svg>
  )
}

// Icônes SVG inline (charte : jamais d'emoji décoratif)
function Icone({ d, size = 20, sw = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.map((p, i) => <path key={i} d={p}/>)}
    </svg>
  )
}
const I = {
  check:  ['M5 12.5l4.5 4.5L19 7.5'],
  pin:    ['M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z', 'M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  sac:    ['M5 8h14l-1.2 12H6.2z', 'M9 8V6.5a3 3 0 0 1 6 0V8'],
  boucle: ['M17 2l3 3-3 3', 'M4 11V9a4 4 0 0 1 4-4h12', 'M7 22l-3-3 3-3', 'M20 13v2a4 4 0 0 1-4 4H4'],
  feuille:['M5 19c0-8 5-13 14-14-1 9-6 14-14 14z', 'M5 19l7-7'],
  agenda: ['M4 6.5h16V20H4z', 'M4 10.5h16', 'M8.5 3.5v4', 'M15.5 3.5v4'],
  table:  ['M4 9h16', 'M7 9v10', 'M17 9v10', 'M9 5h6'],
  etoile: ['M12 3.5l2.6 5.3 5.9.8-4.3 4.1 1 5.8L12 16.8 6.8 19.5l1-5.8L3.5 9.6l5.9-.8z'],
  fleche: ['M5 12h14', 'M13 6l6 6-6 6'],
  tel:    ['M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z'],
}

// ─── Le téléphone du haut de page ───────────────────────────────────────────
//
// ⚠️ UNE VRAIE CAPTURE DANS LE CADRE, PAS UN DESSIN : c'est la liste du
// village telle que l'habitant l'ouvre. Les bulles autour sont des EXEMPLES de
// ce qui arrive au commerçant, écrits en toutes lettres (aucun chiffre).
// ⚠️ `loading="eager"` ici seulement : c'est la seule image du premier écran.
function TelephoneHero() {
  if (!CAPTURE_HERO) return null
  const bulles = [
    { icone: I.sac,    titre: 'Nouvelle commande', texte: 'Deux frites, sauce andalouse' },
    { icone: I.agenda, titre: 'Rendez-vous demain', texte: 'Coupe et brushing, en matinée' },
    { icone: I.table,  titre: 'Table réservée ce soir', texte: 'Quatre personnes, en terrasse' },
    { icone: I.etoile, titre: 'Nouvelle cliente', texte: 'Elle a découvert ton commerce dans l’app' },
  ]
  return (
    <div className="lp-tel">
      <div className="lp-tel-cadre">
        <div className="lp-tel-ecran">
          <img src={captureSrc(CAPTURE_HERO)} alt={CAPTURE_HERO.alt}
            width={CAPTURE_HERO.largeur} height={CAPTURE_HERO.hauteur} loading="eager" decoding="async"/>
        </div>
      </div>
      {bulles.map((b, i) => (
        <div key={b.titre} className={`lp-bulle lp-bulle-${i + 1}`} aria-hidden="true">
          <i><Icone d={b.icone} size={16}/></i>
          <span><strong>{b.titre}</strong>{b.texte}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Ce que la commission coûte ─────────────────────────────────────────────
//
// Idée d'Alex (13/09) : le visiteur entre SON chiffre, et l'écart apparaît.
//
// ⚠️ ON NE NOMME AUCUNE PLATEFORME, ET C'EST PLUS FORT AINSI. La publicité
// comparative belge exige des taux exacts, vérifiables et à jour : un taux qui
// change et la page devient trompeuse. Surtout, le restaurateur qu'on recrute
// est souvent DÉJÀ client de ces plateformes : lui dire qu'elles sont mauvaises
// revient à lui dire qu'il s'est fait avoir. Un montant qu'il a saisi lui-même
// est indiscutable, et ne juge personne.
//
// 🔴 ET LE CALCULATEUR DIT LA VÉRITÉ QUAND ELLE NOUS DESSERT. À petit volume,
// une commission coûte moins cher qu'un abonnement : la page l'affiche au lieu
// de le cacher, et renvoie vers Exister.
//
// ✅ 14/10 (Alex) : beaucoup prennent un pourcentage ET un montant par
// commande. Les deux s'additionnent maintenant dans le même onglet. Les champs
// sont VIDES, avec un exemple en gris : c'est le chiffre du commerçant, jamais
// le nôtre (le 14 % prérempli était l'erreur n° 7 du brief). Et le résultat se
// lit aussi PAR JOUR, contre le prix fixe de Yoppaa.

// ⚠️ LA FORMULE D'UN POSTE EST LUE DANS LA MATRICE, JAMAIS RECOPIÉE. Le jour où
// une capacité change de palier, le calculateur suit tout seul.
function formuleMinimale(capacite) {
  return PLANS.find(p => canDo(p, capacite)) || 'vendre'
}

// Des POSTES, pas des marques : rien à sourcer, rien à maintenir quand un
// concurrent change son offre, et le commerçant reconnaît quand même sa facture.
// Les montants sont des exemples, que le visiteur remplace par les siens, et
// aucun poste n'est coché d'avance.
const POSTES_CALCUL = [
  { cle: 'pub',    capacite: 'morning',             nom: 'Visibilité locale, toutes-boîtes',  prix: 45 },
  { cle: 'site',   capacite: 'vitrine',             nom: 'Site ou page vitrine',              prix: 20 },
  { cle: 'fid',    capacite: 'fidelite',            nom: 'Carte de fidélité au comptoir',     prix: 50 },
  { cle: 'deals',  capacite: 'deals',               nom: 'Promos, deals et mise en avant',    prix: 19 },
  // ⚠️ `push_cibles_favoris` ET NON `newsletter_ciblee` : la newsletter n'est
  // pas ouverte (le consentement explicite manque), et le signup le dit. Ce
  // calculateur ne vend que ce qui existe.
  { cle: 'push',   capacite: 'push_cibles_favoris', nom: 'Notifications à tes clients',       prix: 25 },
  { cle: 'rdv',    capacite: 'rdv',                 nom: 'Agenda et rendez-vous en ligne',    prix: 39 },
  { cle: 'cmd',    capacite: 'commande',            nom: 'Commande ou click and collect',     prix: 29 },
  { cle: 'liv',    capacite: 'livraison',           nom: 'Livraison à domicile',              prix: 29 },
  { cle: 'table',  capacite: 'reservation_table',   nom: 'Réservation de table',              prix: 25 },
  { cle: 'gaspi',  capacite: 'anti_gaspi',          nom: 'Invendus de fin de journée',        prix: 19 },
  { cle: 'bons',   capacite: 'bons_cadeaux',        nom: 'Bons cadeaux',                      prix: 15 },
  { cle: 'seance', capacite: 'rdv',                 nom: 'Abonnements et cartes de séances',  prix: 35 },
]

const euro = (n, dec) => n.toLocaleString('fr-BE', {
  minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: dec ? 2 : 0,
}) + ' €'

// « 0,50 » se tape avec une virgule en Belgique : `Number('0,50')` vaut NaN.
function lireNombre(s) {
  const n = Number(String(s ?? '').replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : 0
}

function Champ({ id, label, valeur, onChange, unite, exemple }) {
  return (
    <div className="lp-champ">
      <label htmlFor={id}>{label}</label>
      <div className="lp-champ-saisie">
        <input id={id} type="text" inputMode="decimal" autoComplete="off" placeholder={exemple}
          value={valeur} onChange={e => onChange(e.target.value.replace(/[^\d,.\s]/g, '').slice(0, 9))}/>
        <span>{unite}</span>
      </div>
    </div>
  )
}

function CalculateurCommission() {
  const [mode, setMode] = useState('pct')
  const [ventes, setVentes] = useState('')
  const [commandes, setCommandes] = useState('')
  const [taux, setTaux] = useState('')
  const [parCommande, setParCommande] = useState('')
  const [abos, setAbos] = useState(() =>
    Object.fromEntries(POSTES_CALCUL.map(p => [p.cle, { actif: false, prix: p.prix }])))

  const actifs = POSTES_CALCUL.filter(p => abos[p.cle].actif)
  const nb = actifs.length
  const v = lireNombre(ventes)
  const n = lireNombre(commandes)
  const p = lireNombre(taux)
  const f = lireNombre(parCommande)

  let paye, titreEux, formule
  let manque = null
  if (mode === 'abo') {
    paye = actifs.reduce((s, q) => s + (Number(abos[q.cle].prix) || 0), 0)
    formule = actifs.reduce((max, q) => {
      const fq = formuleMinimale(q.capacite)
      return PLANS.indexOf(fq) > PLANS.indexOf(max) ? fq : max
    }, PLANS[0])
    titreEux = nb === 1 ? 'Avec ton abonnement' : `Avec tes ${nb} abonnements`
  } else {
    paye = v * p / 100 + n * f
    formule = 'vendre'
    const morceaux = []
    if (p > 0) morceaux.push(`${p.toLocaleString('fr-BE', { maximumFractionDigits: 2 })} %`)
    if (f > 0) morceaux.push(`${euro(f, f % 1 !== 0)} par commande`)
    titreEux = morceaux.length ? `Avec ${morceaux.join(' et ')}` : 'Avec ce qu’on te prend'
    if (p > 0 && v === 0) manque = 'Mets aussi ce que tu vends en ligne par mois.'
    else if (f > 0 && n === 0) manque = 'Mets aussi ton nombre de commandes par mois.'
  }
  const vide = mode === 'abo' ? nb === 0 : paye <= 0

  const prixFormule = getPrixPlan(formule)?.mensuel ?? 0
  const nomFormule = formule.charAt(0).toUpperCase() + formule.slice(1)
  const ecart = (paye - prixFormule) * 12
  // Par JOUR, sur l'année entière : un mois n'a pas toujours trente jours.
  const jourEux = paye * 12 / 365
  const jourNous = prixFormule * 12 / 365
  const echelle = Math.max(jourEux, jourNous, 0.01)
  // Le point de bascule n'a de sens que pour UNE mécanique à la fois.
  const seuil = mode === 'pct' && p > 0 && f === 0 ? { valeur: prixFormule * 100 / p, de: 'ventes' }
    : mode === 'pct' && f > 0 && p === 0 ? { valeur: prixFormule / f, de: 'commandes' }
    : null
  // ✅ LE TICKET QU'ILS NE T'IMPRIMENT JAMAIS (Alex, 14/10). Une commande
  // moyenne, calculée sur SES chiffres (ses ventes divisées par ses commandes),
  // et ce qu'il en reste. Il n'existe que si les deux sont saisis : sans eux,
  // un panier inventé serait notre chiffre, pas le sien.
  const panier = mode === 'pct' && v > 0 && n > 0 ? v / n : 0
  const partPanier = panier * p / 100
  const prisParCommande = partPanier + f

  return (
    <div className="lp-calcul">
      <div className="lp-onglets" role="group" aria-label="Ce que tu paies aujourd’hui">
        {[['pct', 'On me prend une part de chaque commande'], ['abo', 'Je paie déjà des abonnements']].map(([m, l]) => (
          <button key={m} type="button" className="lp-onglet" onClick={() => setMode(m)} aria-pressed={mode === m}>{l}</button>
        ))}
      </div>

      {mode === 'pct' ? (
        <>
          <div className="lp-champs">
            {/* ✅ Alex, 14/10 : « Un montant par commande », pas « Et en plus ».
                Les libellés tiennent sur une ligne, sinon le champ d'à côté
                se décale. */}
            <Champ id="calc-ventes" label="Mes ventes en ligne par mois" unite="€" exemple="6 000" valeur={ventes} onChange={setVentes}/>
            <Champ id="calc-taux" label="Le pourcentage qu’on me prend" unite="%" exemple="14" valeur={taux} onChange={setTaux}/>
            <Champ id="calc-commandes" label="Mes commandes par mois" unite="cmd" exemple="400" valeur={commandes} onChange={setCommandes}/>
            <Champ id="calc-fixe" label="Un montant par commande" unite="€" exemple="0,50" valeur={parCommande} onChange={setParCommande}/>
          </div>
          <p className="lp-calcul-aide">
            Remplis ce qui te concerne : un pourcentage, un montant par commande, ou les deux.
            {manque && <strong> {manque}</strong>}
          </p>
        </>
      ) : (
        <div className="lp-postes">
          <p className="lp-calcul-aide">Coche ce que tu paies aujourd’hui, et mets tes vrais montants mensuels.</p>
          {POSTES_CALCUL.map(q => {
            const on = abos[q.cle].actif
            const fq = formuleMinimale(q.capacite)
            return (
              <div key={q.cle} className="lp-poste" data-actif={on ? 'oui' : 'non'}>
                <input type="checkbox" id={`poste-${q.cle}`} checked={on}
                  onChange={e => setAbos(a => ({ ...a, [q.cle]: { ...a[q.cle], actif: e.target.checked } }))}/>
                <label htmlFor={`poste-${q.cle}`}>
                  {q.nom} <span className={`lp-palier lp-palier-${fq}`}>{fq}</span>
                </label>
                <span className="lp-poste-prix">
                  <input type="number" min="0" max="500" step="1" value={abos[q.cle].prix} disabled={!on}
                    aria-label={`Prix mensuel : ${q.nom}`}
                    onChange={e => setAbos(a => ({ ...a, [q.cle]: { ...a[q.cle], prix: Math.max(0, Number(e.target.value) || 0) } }))}/>
                  <span>€ / mois</span>
                </span>
              </div>
            )
          })}
        </div>
      )}

      {!vide && (
        <>
          <div className="lp-duel">
            <div className="lp-duel-eux">
              <h3>{titreEux}</h3>
              <p className="lp-duel-montant">{euro(paye, paye > 0 && paye < 100)}</p>
              <p className="lp-duel-unite">par mois · {euro(paye * 12, false)} par an</p>
            </div>
            <div className="lp-duel-nous">
              <h3>Avec Yoppaa, formule {nomFormule}</h3>
              <p className="lp-duel-montant">{prixFormule === 0 ? 'Gratuit' : euro(prixFormule, true)}</p>
              <p className="lp-duel-unite">{prixFormule === 0 ? 'pour toujours' : `par mois, HTVA · ${euro(prixFormule * 12, true)} par an`}</p>
            </div>
          </div>

          <div className="lp-jour">
            <p className="lp-jour-titre">Un jour moyen</p>
            <div className="lp-jour-ligne">
              <span>{titreEux} : <strong>{euro(jourEux, true)}</strong> par jour</span>
              <div className="lp-barre"><i className="lp-barre-eux" style={{ width: `${Math.max(2, jourEux / echelle * 100)}%` }}/></div>
            </div>
            <div className="lp-jour-ligne">
              <span>
                Yoppaa {nomFormule} : <strong>{prixFormule === 0 ? 'rien' : `${euro(jourNous, true)} par jour`}</strong>
                {prixFormule > 0 && <>, que tu serves trois clients ou trois cents</>}
              </span>
              <div className="lp-barre"><i className="lp-barre-nous" style={{ width: `${Math.max(2, jourNous / echelle * 100)}%` }}/></div>
            </div>
          </div>

          {panier > 0 && prisParCommande > 0 && (
            <div className="lp-tickets">
              <div className="lp-ticket lp-ticket-eux">
                <p className="lp-ticket-tete">Le ticket qu&rsquo;on ne t&rsquo;imprime jamais</p>
                <p className="lp-ticket-ligne"><span>Commande moyenne</span><span>{euro(panier, true)}</span></p>
                {p > 0 && <p className="lp-ticket-ligne lp-ticket-moins"><span>Commission {p.toLocaleString('fr-BE', { maximumFractionDigits: 2 })}&nbsp;%</span><span>−{euro(partPanier, true)}</span></p>}
                {f > 0 && <p className="lp-ticket-ligne lp-ticket-moins"><span>Par commande</span><span>−{euro(f, true)}</span></p>}
                <p className="lp-ticket-total"><span>Il te reste</span><span>{euro(Math.max(0, panier - prisParCommande), true)}</span></p>
              </div>
              <div className="lp-ticket lp-ticket-nous">
                <p className="lp-ticket-tete">Le ticket Yoppaa</p>
                <p className="lp-ticket-ligne"><span>Commande moyenne</span><span>{euro(panier, true)}</span></p>
                <p className="lp-ticket-ligne"><span>Commission Yoppaa</span><span>{euro(0, true)}</span></p>
                <p className="lp-ticket-total"><span>Il te reste</span><span>{euro(panier, true)}</span></p>
              </div>
              <p className="lp-ticket-note">
                Tes chiffres, pas les nôtres. Les frais de paiement en ligne existent des deux côtés et ne sont
                comptés ni ici, ni là. Chez Yoppaa, la formule au mois se paie à part, une fois par mois, quel que
                soit le nombre de commandes.
              </p>
            </div>
          )}
        </>
      )}

      <div className="lp-verdict">
        <ResultatCalcul mode={mode} vide={vide} ecart={ecart} nb={nb} formule={formule} nomFormule={nomFormule} seuil={seuil}/>
        <Link href="/signup" className="lp-btn lp-btn-blanc">J&rsquo;inscris mon commerce</Link>
        {/* ⚠️ « LA COMMISSION YOPPAA », JAMAIS « AUCUNE COMMISSION » TOUT
            SEUL : Stripe prélève ses frais, et une promesse sans sujet se
            retourne au premier versement. */}
        <p className="lp-calcul-note">
          {mode === 'abo'
            ? <>Yoppaa ne remplace pas tout : si ton logiciel tient aussi <strong>ta caisse, ton stock ou les plannings de ton équipe</strong>, garde-le. Ce calcul ne compte que les postes que Yoppaa couvre vraiment.</>
            : <>Les frais de ta banque et du paiement en ligne existent des deux côtés : ils ne sont comptés ni ici, ni là. Ce qui change, c&rsquo;est <strong>la commission Yoppaa sur tes ventes : il n&rsquo;y en a pas</strong>.</>}
        </p>
      </div>
    </div>
  )
}

// Le verdict, séparé parce qu'il a quatre formes, et que la troisième nous
// donne tort.
function ResultatCalcul({ mode, vide, ecart, nb, formule, nomFormule, seuil }) {
  if (vide) {
    return (
      <>
        <p className="lp-verdict-sur">À toi de jouer</p>
        <p className="lp-verdict-titre">{mode === 'abo' ? 'Coche ce que tu paies aujourd’hui.' : 'Mets ton chiffre. Le nôtre, tu le connais déjà.'}</p>
        <p className="lp-verdict-phrase">Et si tu ne paies rien pour l&rsquo;instant, commence par <strong>Exister</strong> : c&rsquo;est gratuit, pour toujours.</p>
      </>
    )
  }

  // 🔴 L'ÉCART PEUT ÊTRE NÉGATIF, ET ON NE LE CACHE PAS.
  if (ecart <= 0) {
    return (
      <>
        <p className="lp-verdict-sur">Et on te le dit quand même</p>
        <p className="lp-verdict-titre">
          {mode === 'abo' ? `À ce niveau, tu paies moins que la formule ${nomFormule}.` : 'À ce volume, tu paies moins avec la commission.'}
        </p>
        <p className="lp-verdict-phrase">
          Commence par <strong>Exister</strong>, qui est gratuit à vie : ta page, tes horaires,
          tes infos. Tu monteras de formule le jour où ça vaudra le coup, pas avant.
        </p>
      </>
    )
  }

  return (
    <>
      <p className="lp-verdict-sur">Ce que tu gardes sur un an</p>
      <p className="lp-verdict-montant">{euro(ecart, false)}</p>
      <p className="lp-verdict-phrase">
        {mode === 'abo' ? (
          formule === 'exister'
            ? <>Et tout ce que tu as coché tient dans <strong>Exister</strong>, qui est gratuit pour toujours. Tu ne nous dois rien.</>
            : formule === 'communiquer'
              ? <>Et tout ce que tu as coché tient dans <strong>Communiquer</strong>. Vendre ne te servira que le jour où tu voudras encaisser en ligne.</>
              : <>Et surtout : <strong>{nb} abonnement{nb > 1 ? 's' : ''}, {nb} facture{nb > 1 ? 's' : ''}</strong>, et rien qui se parle. Chez nous, ta page, tes rendez-vous et ta fidélité se connaissent.</>
        ) : seuil?.de === 'ventes' ? (
          <>Le point de bascule est à <strong>{euro(seuil.valeur, false)} de ventes par mois</strong>. Au-dessus, tout ce que tu vends en plus ne te coûte rien de plus chez nous.</>
        ) : seuil?.de === 'commandes' ? (
          <>Le point de bascule est à <strong>{Math.ceil(seuil.valeur)} commandes par mois</strong>. Au-dessus, chaque commande en plus ne te coûte rien de plus chez nous.</>
        ) : (
          <>Et chaque commande en plus te coûte deux fois : une part du prix, et le montant fixe. Chez nous, rien ne bouge.</>
        )}
      </p>
    </>
  )
}

// ─── Le compteur qui monte jusqu'à cent ─────────────────────────────────────
// ⚠️ AU REPOS, IL AFFICHE LE BON NOMBRE. L'animation ne part que si la section
// entre à l'écran ; sans observateur, sans mouvement autorisé, ou sur une
// capture d'aperçu, on lit directement le nombre, jamais un zéro.
function CompteurJours({ cible }) {
  const [valeur, setValeur] = useState(cible)
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let cadre = 0
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      obs.disconnect()
      const debut = performance.now()
      const pas = (t) => {
        const k = Math.min(1, (t - debut) / 1100)
        setValeur(Math.round(cible * (1 - Math.pow(1 - k, 3))))
        if (k < 1) cadre = requestAnimationFrame(pas)
      }
      cadre = requestAnimationFrame(pas)
    }, { threshold: 0.5 })
    obs.observe(el)
    return () => { obs.disconnect(); cancelAnimationFrame(cadre) }
  }, [cible])
  return <span ref={ref} className="lp-cent">{valeur}</span>
}

// ─── Une section qui se marque « vue » ──────────────────────────────────────
// Sert aux barres du bloc « pas pour toi » : le texte est lisible AVANT, la
// rature arrive par-dessus quand on y arrive.
function useVu() {
  const ref = useRef(null)
  const [vu, setVu] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVu(true); obs.disconnect() } }, { threshold: 0.35 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return [ref, vu]
}

// ─── Les badges des stores ──────────────────────────────────────────────────
// ⚠️ Tant que l'app n'est pas publiée (`lib/stores.js`), les badges restent
// visibles mais ne mènent nulle part : un lien vers une fiche non publiée
// ouvre une page « introuvable ».
function BadgesStores() {
  const badges = [
    { url: APP_STORE_URL, b: BADGE_APP_STORE, hauteur: 46 },
    { url: GOOGLE_PLAY_URL, b: BADGE_GOOGLE_PLAY, hauteur: 68 },
  ]
  return (
    <div className="lp-stores">
      <div className="lp-stores-badges">
        {badges.map(({ url, b, hauteur }) => {
          const img = <img src={b.src} alt={b.alt} width={Math.round(b.largeur * hauteur / b.hauteur)} height={hauteur} loading="lazy" decoding="async"/>
          return url
            ? <a key={b.src} href={url} target="_blank" rel="noopener noreferrer">{img}</a>
            : <span key={b.src} className="lp-store-bientot">{img}</span>
        })}
      </div>
      {!appPubliee() && <p className="lp-stores-note">Bientôt disponible sur l&rsquo;App Store et Google Play.</p>}
    </div>
  )
}

// Incitant mobilisation
// La Wallonie est ouverte : cette jauge ne conditionne plus rien. Ce qui reste
// vrai et utile, c'est la commune : on ne rejoint pas une place vide.
function IncitantMobilisation({ communeStats, globalStats }) {
  const boxSt = { margin: '0 0 14px', padding: '12px 14px', borderRadius: 12, background: 'rgba(150,96,224,0.14)', border: '1px solid rgba(196,160,244,0.35)' }
  const ligneSt = { margin: 0, fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1.45 }
  const sousSt = { margin: 0, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.92)' }

  // La barre montre le chemin parcouru entre l'annonce publique et
  // l'ouverture : du temps réel, que n'importe qui peut recompter.
  const pct = progressionVersLancement()
  const restant = joursAvantLancement()
  // ⚠️ SANS DATE DÉCIDÉE, NI BARRE NI « J-N » (30/09) : un compte à rebours
  // vers une date que personne n'a fixée serait une promesse inventée.
  const barreLancement = restant > 0 && ouvertureDatee() ? (
    <>
      <div style={{ height: 7, borderRadius: 100, background: 'rgba(255,255,255,0.12)', overflow: 'hidden', margin: '8px 0 6px' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 100, background: 'linear-gradient(90deg, #9660E0, #C4A0F4)', transition: 'width 0.4s' }}/>
      </div>
      <p style={sousSt}>
        Ouverture officielle le {libelleLancement()} · <strong>J-{restant}</strong>
      </p>
    </>
  ) : null

  if (communeStats?.horsZone) {
    return (
      <div style={boxSt}>
        <p style={ligneSt}>Yoppaa démarre en Wallonie 🟣</p>
        <p style={{ ...sousSt, marginTop: 6 }}>Laisse ton email : on te prévient dès que Yoppaa arrive chez toi.</p>
      </div>
    )
  }
  if (communeStats) {
    return (
      <div style={boxSt}>
        <p style={ligneSt}>Yoppaa est ouvert à <strong>{communeStats.nom}</strong> 🟣</p>
        {barreLancement || <p style={{ ...sousSt, marginTop: 6 }}>Tes commerçants peuvent déjà y ouvrir leur page.</p>}
      </div>
    )
  }
  if (globalStats) {
    return (
      <div style={boxSt}>
        <p style={ligneSt}>Yoppaa est ouvert dans toute la Wallonie 🟣</p>
        {barreLancement || <p style={{ ...sousSt, marginTop: 6 }}>Entre ton code postal : ta commune est déjà ouverte.</p>}
      </div>
    )
  }
  return null
}

// ─── « ON T'APPELLE » (Alex, 14/10) ─────────────────────────────────────────
//
// « Est-ce qu'on ne devrait pas ajouter un contact s'ils ont des questions ?
// Tu veux une démo ? » Un commerçant qui hésite ne s'inscrit pas : il pose une
// question, ou il veut voir. Deux chemins, « toujours très punchy » : un
// formulaire qui part chez Yoppaa (`/api/contact-pro`, rien n'est stocké) et
// WhatsApp, direct.
//
// ⚠️ SON PROPRE WIDGET TURNSTILE. Celui des habitants passe par des rappels
// globaux (`window.onTurnstileSuccess`) : les partager mélangerait les jetons
// des deux formulaires, et l'un consommerait celui de l'autre.
function OnTeRappelle({ siteKey }) {
  const [champs, setChamps] = useState({ commerce: '', prenom: '', gsm: '', motif: 'demo', message: '' })
  const [etat, setEtat] = useState({ envoi: 'idle', message: null })
  const [jeton, setJeton] = useState(null)
  const refWidget = useRef(null)
  const rendu = useRef(false)
  const motifs = motifsActifs()

  const lancer = () => {
    if (rendu.current || typeof window === 'undefined' || !siteKey) return
    let essais = 0
    const rendre = () => {
      if (rendu.current) return
      if (window.turnstile && refWidget.current) {
        rendu.current = true
        try {
          window.turnstile.render(refWidget.current, {
            sitekey: siteKey, size: 'invisible',
            callback: (t) => setJeton(t),
            'expired-callback': () => setJeton(null),
            'error-callback': () => setJeton(null),
          })
        } catch (e) { /* ignore */ }
      } else if (essais++ < 25) {
        setTimeout(rendre, 150)
      }
    }
    rendre()
  }

  const valide = champs.commerce.trim() && champs.gsm.replace(/\D/g, '').length >= 8 && champs.motif

  async function envoyer(e) {
    e.preventDefault()
    if (etat.envoi === 'envoi' || !valide) return
    setEtat({ envoi: 'envoi', message: null })
    try {
      const r = await fetch('/api/contact-pro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...champs, turnstile_token: jeton }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) {
        setEtat({ envoi: 'ko', message: j.error || 'Une erreur est survenue, réessaie.' })
        return
      }
      setEtat({ envoi: 'ok', message: null })
    } catch {
      setEtat({ envoi: 'ko', message: 'Erreur réseau, réessaie ou écris-nous sur WhatsApp.' })
    }
  }

  const maj = (cle) => (e) => setChamps(c => ({ ...c, [cle]: e.target.value }))

  return (
    <section id="rappel" className="lp-rappel">
      <div className="lp-wrap lp-rappel-grille">
        <div>
          <p className="lp-sur lp-sur-clair">Tu hésites encore&nbsp;?</p>
          <h2 className="lp-h2 lp-h2-clair">Une question&nbsp;? Envie de voir&nbsp;? On t&rsquo;appelle.</h2>
          <p className="lp-texte lp-texte-clair">
            Pas de robot, pas de centre d&rsquo;appel. Une vraie personne de chez Yoppaa te rappelle, te montre
            l&rsquo;app sur ton commerce à toi, et répond à tout. Même aux questions qui fâchent.
          </p>
          {ENCODAGE_OFFERT && (
            <p className="lp-rappel-offre">
              <strong>En ce moment&nbsp;:</strong> on encode ta carte, ton menu ou ton catalogue pour toi. Gratuitement.
            </p>
          )}
          <a href={lienWhatsApp()} target="_blank" rel="noopener noreferrer" className="lp-btn lp-btn-whatsapp">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/>
            </svg>
            Écris-nous sur WhatsApp
          </a>
          <p className="lp-rappel-tel">ou appelle le <a href={`tel:${TELEPHONE_AFFICHE.replace(/\s/g, '')}`}>{TELEPHONE_AFFICHE}</a></p>
        </div>

        <div className="lp-rappel-carte">
          {etat.envoi === 'ok' ? (
            <div className="lp-rappel-merci">
              <p className="lp-rappel-merci-titre">C&rsquo;est noté 🟣</p>
              <p>On te rappelle très vite au numéro que tu nous as donné. Pendant ce temps, rien ne t&rsquo;empêche d&rsquo;ouvrir ta page&nbsp;: c&rsquo;est gratuit.</p>
              <Link href="/signup" className="lp-btn lp-btn-main">J&rsquo;essaie {ESSAI_JOURS_MINIMUM}&nbsp;jours, c&rsquo;est gratuit</Link>
            </div>
          ) : (
            <form onSubmit={envoyer}>
              <p className="lp-rappel-quoi">Tu veux…</p>
              <div className="lp-rappel-motifs" role="radiogroup" aria-label="Ce que tu veux">
                {motifs.map(m => (
                  <button key={m.cle} type="button" role="radio" aria-checked={champs.motif === m.cle}
                    className="lp-rappel-motif" onClick={() => setChamps(c => ({ ...c, motif: m.cle }))}>
                    {m.libelle}
                  </button>
                ))}
              </div>
              <input type="text" required maxLength={120} placeholder="Le nom de ton commerce" onFocus={lancer}
                value={champs.commerce} onChange={maj('commerce')} style={inputStyle} autoComplete="organization"/>
              <div className="lp-rappel-duo">
                <input type="text" maxLength={60} placeholder="Ton prénom" onFocus={lancer}
                  value={champs.prenom} onChange={maj('prenom')} style={inputStyle} autoComplete="given-name"/>
                <input type="tel" required inputMode="tel" maxLength={20} placeholder="Ton GSM" onFocus={lancer}
                  value={champs.gsm} onChange={maj('gsm')} style={inputStyle} autoComplete="tel"/>
              </div>
              <textarea rows={2} maxLength={600} placeholder="Ta question, ou le meilleur moment pour t’appeler (optionnel)"
                value={champs.message} onChange={maj('message')} style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }}/>
              {siteKey && <div ref={refWidget}/>}
              <button type="submit" className="lp-form-envoi" disabled={!valide || etat.envoi === 'envoi'}>
                {etat.envoi === 'envoi' ? 'Envoi…' : 'Rappelez-moi'}
              </button>
              {etat.envoi === 'ko' && etat.message && <p className="lp-rappel-erreur">⚠ {etat.message}</p>}
              <p className="lp-rappel-rgpd">
                Ton numéro ne sert qu&rsquo;à te rappeler. Il n&rsquo;est ni stocké, ni partagé.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}

// ─── La barre du pouce, sur GSM (Alex, 14/10) ───────────────────────────────
// Sous le haut de page, le commerçant défile un écran entier sans un bouton à
// portée de pouce. Elle apparaît quand le haut de page est passé, et se retire
// devant les deux formulaires (on ne cache pas ce qu'on est en train de
// remplir). Sur ordinateur, elle n'existe pas (CSS).
function BarrePouce({ visible }) {
  return (
    <div className={`lp-pouce${visible ? ' lp-pouce-on' : ''}`} aria-hidden={!visible}>
      <Link href="/signup" className="lp-pouce-principal" tabIndex={visible ? 0 : -1}>
        J&rsquo;essaie {ESSAI_JOURS_MINIMUM}&nbsp;jours
      </Link>
      <a href="#rappel" className="lp-pouce-secondaire" tabIndex={visible ? 0 : -1}>On m&rsquo;appelle</a>
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  border: '1.5px solid rgba(255,255,255,0.18)',
  background: 'rgba(255,255,255,0.08)',
  color: '#fff',
  fontSize: 14,
  fontFamily: '"DM Sans", sans-serif',
  marginBottom: 12,
  outline: 'none',
  boxSizing: 'border-box',
}

// ─── Données des 3 formules (section tarifs) ────────────────────────────────
// ⚠️ LES PRIX NE SONT PLUS ÉCRITS ICI : ils viennent de `getPrixPlan`. La
// grille écrivait « 19,90€ » à la main, collé à son symbole (coquille du
// brief), et aurait continué de l'annoncer le jour d'un changement de tarif.
const FORMULES = [
  {
    nom: 'Exister',
    plan: 'exister',
    badge: 'Gratuit à vie',
    accroche: 'Ton commerce existe en ligne, sans rien débourser.',
    points: [
      'Ta page professionnelle : horaires, photos, itinéraire, contact',
      'Visible dans l’app et référencée sur Google',
      'Une place chaque semaine dans le Good Morning Yoppers',
      'Les envies du quartier : les habitants te disent ce qu’ils aimeraient trouver chez toi',
    ],
  },
  {
    nom: 'Communiquer',
    plan: 'communiquer',
    badge: 'Pour être vu chaque jour',
    accroche: 'Ta commune entend parler de toi chaque matin.',
    points: [
      'Tout Exister, plus :',
      'Deals du jour et actualités illimités',
      'Ta place quotidienne dans le Good Morning Yoppers',
      'Notifications push envoyées aux habitants de ta commune',
      'Carte de fidélité digitale : le numéro de GSM de ton client suffit, plus aucune carte perdue',
      'Assistant IA qui rédige tes deals et tes actus en quelques secondes',
    ],
  },
  {
    nom: 'Vendre',
    plan: 'vendre',
    badge: 'La totale · recommandée',
    // 🔴 14/10 : « tu gardes chaque euro de tes ventes » était l'erreur n° 2
    // du brief, la variante interdite de « 100 % te revient ». Les frais de
    // paiement existent. La phrase dit ce qui est vrai : aucune part pour nous.
    accroche: 'Tu vends en ligne, et Yoppaa ne prend aucune part de tes ventes.',
    vedette: true,
    points: [
      'Tout Communiquer, plus :',
      'Click & Collect avec paiement en ligne',
      'Rendez-vous en ligne, réservables 24h/24',
      // ⚠️ UN MODULE QU'ON NE MONTRE PAS N'EXISTE PAS, même s'il est fini.
      'Abonnements et cartes de séances : ton élève achète, réserve ses cours lui-même, et son solde se décompte tout seul',
      // ⚠️ C'est sa salle qui attribue la table, jamais le client.
      'Réservation de table : le client dit combien ils sont, ta salle attribue la table',
      // ⚠️ L'EMPREINTE SEULE, ET CE QU'ELLE FAIT VRAIMENT : avec un
      // `SetupIntent`, rien n'est retenu sur le compte du client.
      'Empreinte bancaire sur les grandes tables : la carte est enregistrée, rien n’est débité si le client vient',
      // ⚠️ LE BESOIN, PAS NOTRE MÉCANIQUE (décision d'Alex du 27/08).
      'Livraison à domicile : ta tournée en alimentaire, l\'expédition pour une boutique',
      'Boutique en ligne : tes articles, avec leurs tailles et leurs couleurs',
      'Fidélité automatique : chaque commande et chaque rendez-vous remplit la carte, sans rien faire',
      'Bons cadeaux à offrir : tes clients font découvrir ton commerce à leurs proches',
      'Avant la fermeture : ce qu\'il te reste ce soir repart à prix réduit, au lieu d\'être jeté',
      'Assistant IA complet : rédaction avancée pour tes articles, tes deals et tes actus, avec un usage étendu',
      '0% de commission Yoppaa sur tes ventes',
    ],
  },
]
// Au-delà, la liste se replie : une carte de vingt lignes ne se lit pas.
const POINTS_VISIBLES = 6

function affichagePrix(plan) {
  const m = getPrixPlan(plan)?.mensuel ?? 0
  return m === 0 ? { prix: 'Gratuit', sous: 'pour toujours' } : { prix: euro(m, true), sous: 'HTVA par mois' }
}

// ─── Composant principal ────────────────────────────────────────────────────
export default function LandingReveal({ referent = null }) {
  const [form, setForm] = useState({
    // RGPD : opt-in marketing RÉEL, jamais pré-coché. L'inscription (être
    // prévenu du lancement = la finalité demandée) n'en dépend pas.
    email: '', code_postal: '', type_utilisateur: 'yopper', commercant_nom: '', message: '', consentement_marketing: false,
  })
  const [statut, setStatut] = useState({ envoi: 'idle', message: null })
  const [kitSlug, setKitSlug] = useState(null)
  const [turnstileToken, setTurnstileToken] = useState(null)
  const [communeStats, setCommuneStats] = useState(null)
  const [globalStats, setGlobalStats] = useState(null)
  const [iMetier, setIMetier] = useState(0)
  const turnstileRef = useRef(null)
  const attributionRef = useRef({ ref_commercant: null, utm_source: null, utm_medium: null, utm_campaign: null })
  const [refBarres, barresVues] = useVu()
  // La barre du pouce : visible quand le haut de page est passé, retirée
  // devant les deux formulaires.
  const [vus, setVus] = useState({ commercants: true, rappel: false, preinscription: false })
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(entrees => setVus(v => {
      const n = { ...v }
      for (const e of entrees) n[e.target.id] = e.isIntersecting
      return n
    }), { threshold: 0.05 })
    for (const id of ['commercants', 'rappel', 'preinscription']) {
      const el = document.getElementById(id)
      if (el) obs.observe(el)
    }
    return () => obs.disconnect()
  }, [])
  const barrePouce = !vus.commercants && !vus.rappel && !vus.preinscription

  // Les métiers qui tournent. ⚠️ À L'ARRÊT quand l'onglet est caché (règle du
  // dépôt pour tout intervalle rapide), et jamais pour qui a demandé moins de
  // mouvement : le premier métier reste alors affiché.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => {
      if (!document.hidden) setIMetier(i => (i + 1) % METIERS.length)
    }, 2400)
    return () => clearInterval(t)
  }, [])

  // Totaux globaux de mobilisation
  useEffect(() => {
    let vivant = true
    fetch('/api/communes/stats')
      .then(r => r.json())
      .then(j => { if (vivant && j?.ok && j?.global) setGlobalStats(j) })
      .catch(() => {})
    return () => { vivant = false }
  }, [])

  // Attribution ?ref= + utm (une fois au montage)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const p = new URLSearchParams(window.location.search)
    attributionRef.current = {
      ref_commercant: p.get('ref') || null,
      utm_source: p.get('utm_source') || null,
      utm_medium: p.get('utm_medium') || null,
      utm_campaign: p.get('utm_campaign') || null,
    }
  }, [])

  // Stats de la commune dès que le CP est complet (débounce)
  useEffect(() => {
    const cp = form.code_postal.trim()
    let vivant = true
    const t = setTimeout(() => {
      if (!/^\d{4}$/.test(cp)) { if (vivant) setCommuneStats(null); return }
      fetch(`/api/communes/stats?cp=${cp}`)
        .then(r => r.json())
        .then(j => { if (vivant) setCommuneStats(j?.ok ? (j.found ? j : { horsZone: true }) : null) })
        .catch(() => { if (vivant) setCommuneStats(null) })
    }, 400)
    return () => { vivant = false; clearTimeout(t) }
  }, [form.code_postal])

  // Turnstile invisible : callbacks globaux
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.onTurnstileSuccess = (token) => setTurnstileToken(token)
    window.onTurnstileExpired = () => setTurnstileToken(null)
    window.onTurnstileError   = () => setTurnstileToken(null)
  }, [])

  async function soumettre(e) {
    e.preventDefault()
    if (statut.envoi === 'envoi') return
    setStatut({ envoi: 'envoi', message: null })
    try {
      const res = await fetch('/api/pre-inscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          code_postal: form.code_postal,
          type_utilisateur: form.type_utilisateur,
          commercant_nom: form.commercant_nom,
          message: form.message,
          consentement_marketing: form.consentement_marketing,
          turnstile_token: turnstileToken,
          ...attributionRef.current,
        }),
      })
      const j = await res.json()
      if (!j.ok) {
        setStatut({ envoi: 'ko', message: j.error || 'Une erreur est survenue, réessaie' })
        return
      }
      setStatut({ envoi: 'ok', message: ouvertureDatee() ? `Bien reçu 🟣 Rendez-vous le ${libelleLancement()}. À très vite !` : 'Bien reçu 🟣 On te prévient dès l’ouverture. À très vite !' })
      if (j.slug_kit) setKitSlug(j.slug_kit)
      if (typeof window !== 'undefined' && window.turnstile && turnstileRef.current) {
        try { window.turnstile.reset(turnstileRef.current) } catch (_) {}
      }
    } catch (err) {
      setStatut({ envoi: 'ko', message: 'Erreur réseau, réessaie' })
    }
  }

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  // Consentement OBLIGATOIRE (décision Alex 31/07 soir) : la case décrit la
  // finalité même du formulaire, jamais pré-cochée, mais requise.
  const formValide = form.email.trim() && /^\d{4}$/.test(form.code_postal.trim())
    && (form.type_utilisateur !== 'commercant' || !!form.commercant_nom.trim())
    && form.consentement_marketing

  // Rendu Turnstile explicite au 1er focus (perf, cf. LandingTeasing)
  const tsRendered = useRef(false)
  const lancerChallenge = () => {
    if (tsRendered.current || typeof window === 'undefined' || !siteKey) return
    let tries = 0
    const rendre = () => {
      if (tsRendered.current) return
      if (window.turnstile && turnstileRef.current) {
        tsRendered.current = true
        try {
          window.turnstile.render(turnstileRef.current, {
            sitekey: siteKey, size: 'invisible',
            callback: (t) => window.onTurnstileSuccess?.(t),
            'expired-callback': () => window.onTurnstileExpired?.(),
            'error-callback': () => window.onTurnstileError?.(),
          })
        } catch (e) { /* ignore */ }
      } else if (tries++ < 25) {
        setTimeout(rendre, 150)
      }
    }
    rendre()
  }

  // 🔴 L'INSCRIPTION, PAS LA LISTE D'ATTENTE (Alex, 26/08). Tout bouton qui
  // parle au commerçant est un vrai lien vers /signup. Le seul qui fait défiler
  // est celui de l'habitant, vers SON formulaire.
  const allerAuForm = (typeUtilisateur) => {
    // ⚠️ LE FORMULAIRE EST CELUI DES HABITANTS, ET LUI SEUL.
    if (typeUtilisateur === 'yopper') setForm(p => ({ ...p, type_utilisateur: 'yopper' }))
    if (typeof document !== 'undefined') {
      document.getElementById('preinscription')?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const piqueListe = (cache) => (
    <div className={`lp-bande-piste-moitie${cache ? ' lp-bande-double' : ''}`} aria-hidden={cache || undefined}>
      {PIQUES.map(q => (
        <span key={q.secteur} className="lp-pique"><em>{q.secteur}</em>{q.t}</span>
      ))}
    </div>
  )

  return (
    // Pas d'overflowX hidden ici : avec overflow-y visible, il transformait ce
    // main en zone de scroll imbriquée (scroll qui « accroche » sur PC).
    <main className="lp">
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" async defer/>

      {/* Données structurées : sans elles Google n'a aucun moyen de relier le
          nom « Yoppaa » à une organisation. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Organization',
              '@id': 'https://www.yoppaa.app/#organization',
              name: 'Yoppaa',
              legalName: 'AVCOTECH SRL',
              url: 'https://www.yoppaa.app',
              logo: 'https://www.yoppaa.app/icon-192.png',
              slogan: 'Ton quartier dans ta poche',
              vatID: 'BE0731.637.148',
              address: {
                '@type': 'PostalAddress',
                streetAddress: 'Rue de Prée 9 G',
                postalCode: '5640',
                addressLocality: 'Mettet',
                addressCountry: 'BE',
              },
              areaServed: { '@type': 'AdministrativeArea', name: 'Wallonie, Belgique' },
            },
            {
              '@type': 'WebSite',
              '@id': 'https://www.yoppaa.app/#website',
              url: 'https://www.yoppaa.app',
              name: 'Yoppaa',
              inLanguage: 'fr-BE',
              publisher: { '@id': 'https://www.yoppaa.app/#organization' },
              description: "L'app belge qui réunit les commerces de quartier : commande à l'avance, rendez-vous en ligne, fidélité et bons cadeaux, sans commission Yoppaa pour les commerçants.",
            },
          ],
        }) }}
      />

      {/* ═══ 1. HAUT DE PAGE (commerçant) ═══ */}
      {/* ⚠️ `id="commercants"` : le QR des A4 laissés en boutique vise
          `/?via=kit#commercants`. La page s'ouvre maintenant sur le commerçant,
          l'ancre tombe donc en haut, et elle doit rester. */}
      <section id="commercants" style={{ background: `linear-gradient(135deg, ${T.panel} 0%, ${T.ink} 100%)`, color: '#fff', scrollMarginTop: 12 }} className="lp-hero">
        <div className="lp-wrap lp-hero-grille">
          <div className="lp-hero-texte">
            {referent && (
              <p className="lp-referent"><strong>{referent}</strong> t&rsquo;invite à rejoindre Yoppaa 🟣</p>
            )}
            <YoppaaLogo size={46} mode="dark"/>
            <p className="lp-sur lp-sur-clair lp-hero-sur">Pour les commerçants · Tous les commerces de ta commune, dans une seule app</p>
            <p className="lp-kicker" aria-live="off">
              Tu tiens <span key={iMetier} className="lp-mot">{METIERS[iMetier].metier}</span>&nbsp;?
            </p>
            {/* ✅ Le titre validé par Alex le 14/10 : « en gros ils prennent
                des commandes ». Blanc uni, comme tout titre sur fond sombre :
                le mot qui change bouge, il ne change pas de couleur. */}
            <h1 className="lp-h1">Les autres prennent tes <span key={iMetier} className="lp-objet">{METIERS[iMetier].objet}.</span> Yoppaa t&rsquo;amène des clients.</h1>
            {/* ⚠️ « Yoppaa ne prend » ET PAS « aucune commission » tout court :
                sans sujet, la phrase se lit « aucun frais du tout ». */}
            <p className="lp-lead">
              Resto, salon, boutique, artisan&nbsp;: tout le monde a sa place, sans exception. Les habitants
              ouvrent l&rsquo;app de leur commune et tombent sur ceux qu&rsquo;ils ne connaissaient pas
              encore. Et <strong>Yoppaa ne prend aucune commission sur tes ventes</strong>.
            </p>
            {/* ✅ Alex, 14/10 : l'encodage offert, affiché comme OFFRE DU
                MOMENT. Un seul drapeau le retire (`ENCODAGE_OFFERT`). */}
            {ENCODAGE_OFFERT && (
              <p className="lp-hero-offre">
                <span>En ce moment</span>
                On encode ta carte, ton menu ou ton catalogue pour toi. Gratuitement.
              </p>
            )}
            <div className="lp-ctas">
              <Link href="/signup" className="lp-btn lp-btn-main">
                J&rsquo;essaie {ESSAI_JOURS_MINIMUM} jours, c&rsquo;est gratuit <Icone d={I.fleche} size={18} sw={2.4}/>
              </Link>
              <button type="button" onClick={() => allerAuForm('yopper')} className="lp-btn lp-btn-fantome">
                {LIBELLE_HABITANT}
              </button>
            </div>
            <p className="lp-micro">Sans carte de paiement · Sans engagement · Ta page reste gratuite à vie</p>
          </div>
          <TelephoneHero/>
        </div>
      </section>

      {/* ═══ 2. LA BANDE QUI PIQUE ═══ */}
      {/* Une animation, pas une piste qu'on fait défiler au doigt : rien n'y est
          caché, la même liste repasse. La seconde copie est muette pour les
          lecteurs d'écran. */}
      <div className="lp-bande" aria-label="Ce que Yoppaa ne te prend pas">
        <div className="lp-bande-piste">
          {piqueListe(false)}
          {piqueListe(true)}
        </div>
      </div>

      {/* ═══ 3. LE CALCUL ═══ */}
      <section className="lp-calc" id="calcul">
        <div className="lp-wrap">
          <p className="lp-sur lp-sur-clair">Le calcul que personne ne te propose</p>
          {/* ✅ Alex, 14/10 : « provoc et percutant, faut arrêter de prendre
              les commerçants pour des imbéciles ». Ils appellent leurs
              commerçants des partenaires : chacun le sait, personne n'est
              nommé. */}
          <h2 className="lp-h2 lp-h2-clair">Ils t&rsquo;appellent «&nbsp;partenaire&nbsp;». Ils se paient comme un associé.</h2>
          <p className="lp-sous-titre">Une commission, c&rsquo;est un associé qui n&rsquo;ouvre jamais le magasin.</p>
          <p className="lp-texte lp-texte-clair">
            «&nbsp;Pas d&rsquo;abonnement&nbsp;!&nbsp;» Tu l&rsquo;as déjà lu. Alors qui paie&nbsp;? Toi, à chaque commande,
            et plus tu vends, plus tu paies. Mets tes chiffres ici, pas les nôtres&nbsp;: c&rsquo;est ta calculette.
          </p>
          <CalculateurCommission/>
          <p className="lp-chute">Ton chiffre d&rsquo;affaires ne nous regarde pas.</p>
        </div>
      </section>

      {/* ═══ 4. CE QUE ÇA CHANGE ═══ */}
      <section className="lp-section">
        <div className="lp-wrap">
          <p className="lp-sur lp-sur-encre">Ce que Yoppaa change</p>
          <h2 className="lp-h2 lp-h2-encre">Une caisse enregistre les clients déjà entrés. Yoppaa les fait entrer.</h2>
          <div className="lp-atouts">
            {[
              { icone: I.pin, titre: 'Ils te trouvent.', texte: 'Sur leur app, tu es un resto parmi mille. Sur Yoppaa, tu es celui d’à côté. Ton prochain client habite à deux pas, et il ne te connaît pas encore. Ta page vit dans l’app de ta commune et sur Google, et ta place t’attend dans le Good Morning Yoppers, la gazette du matin : chaque semaine en Exister, chaque matin en Communiquer.' },
              { icone: I.sac, titre: 'Ils commandent sans t’appeler.', texte: 'Click & Collect, rendez-vous, réservation de table avec empreinte bancaire, livraison. La commande arrive écrite, avec l’heure. Fini le téléphone coincé contre l’épaule : un appel en plein coup de feu, c’est une frite qui brûle.' },
              { icone: I.boucle, titre: 'Ils reviennent.', texte: 'Fidélité liée au numéro de GSM, notifications, bons cadeaux. Entre deux visites, tu restes dans leur poche.' },
              { icone: I.feuille, titre: 'Rien ne se perd.', texte: 'À la fermeture, ce qu’il te reste repart à prix réduit au lieu d’être jeté. Une recette de plus, et souvent un client qui pousse ta porte pour la première fois.' },
            ].map(a => (
              <div key={a.titre} className="lp-atout">
                <span className="lp-atout-icone"><Icone d={a.icone} size={22}/></span>
                <h3>{a.titre}</h3>
                <p>{a.texte.replace(/ ([:;?!])/g, ' $1')}</p>
              </div>
            ))}
          </div>

          <div className="lp-tous">
            <h3 className="lp-h3">Tout le monde a sa place. Sans exception.</h3>
            <div className="lp-metiers">
              {FAMILLES.map(m => <span key={m}>{m}</span>)}
            </div>
            {/* Le corollaire du zéro prélèvement Yoppaa : un modèle qui ne vit
                pas des ventes n'a aucune raison d'exclure les tout petits. */}
            <p className="lp-texte">
              Personne n&rsquo;est trop petit pour Yoppaa&nbsp;: la formule Exister est gratuite, pour toujours,
              que tu travailles seul ou en équipe, tous les jours ou juste le samedi.
            </p>
          </div>

          {/* ✅ PENSÉ POUR LE COMMERÇANT (Alex, 14/10) : « Yoppaa permet
              d'ajouter les rendez-vous qui arrivent par téléphone, ce que les
              autres ne peuvent pas faire vu qu'ils n'y gagnent rien ». Vérifié :
              « Encoder une commande » (`ModalNouvelleCommande`) et « Nouveau
              rendez-vous » (`ModalNouveauRdv`, qui pose aussi les tables).
              ⚠️ ON N'AFFIRME RIEN SUR UN CONCURRENT PRÉCIS : on énonce la
              logique du modèle (ce qui ne passe pas chez eux ne leur rapporte
              rien), que chaque commerçant vérifie lui-même. Une pizzeria a quitté
              son système pour ça (project_commande_encodee_main). */}
          <div className="lp-telephone">
            <span className="lp-telephone-icone"><Icone d={I.tel} size={26}/></span>
            <div>
              <p className="lp-sur lp-sur-encre">Pensé pour le commerçant, pas pour la plateforme</p>
              <h3 className="lp-h3">Le téléphone sonne encore&nbsp;? Tant mieux.</h3>
              <p className="lp-texte">
                Une commande, un rendez-vous ou une table pris au téléphone&nbsp;: tu l&rsquo;ajoutes dans Yoppaa en
                quelques gestes, et tout est au même endroit, avec le reste. Ceux qui se paient à la commission
                n&rsquo;y gagnent rien, alors ils s&rsquo;en moquent&nbsp;: ce qui ne passe pas chez eux ne leur rapporte rien.
                <strong> Chez nous, ça ne change rien, alors on te laisse faire.</strong>
              </p>
            </div>
          </div>

          <p className="lp-citation">Le client qui commande chez toi reste ton client. Personne ne te le reloue.</p>
        </div>
      </section>

      {/* ═══ 5. LA PREUVE EN CAPTURES ═══ */}
      {/* ⚠️ CE NE SONT PAS DES MAQUETTES, ET C'EST TOUT L'INTÉRÊT (Alex, 26/08 :
          « on montre la réalité »). Les commerces affichés servent de
          démonstration, et la page le dit (erreur n° 4 du brief). */}
      <section className="lp-section lp-section-captures">
        <div className="lp-wrap">
          <h2 className="lp-h2 lp-h2-encre">Ce n&rsquo;est pas dessiné.</h2>
          {CAPTURES_CARROUSEL.length > 0 && (
            <p className="lp-texte">
              Ce sont des captures de l&rsquo;application, prises telles quelles. Les commerces affichés
              servent de démonstration.
            </p>
          )}
        </div>
        {CAPTURES_CARROUSEL.length > 0 && (
          <BandeDefilante libelle="les captures" className="lp-captures">
            {CAPTURES_CARROUSEL.map(c => (
              <figure key={c.cle}>
                <img src={captureSrc(c)} alt={c.alt} width={c.largeur} height={c.hauteur} loading="lazy" decoding="async"/>
                <figcaption>{c.titre}</figcaption>
              </figure>
            ))}
          </BandeDefilante>
        )}
      </section>

      {/* ═══ 6. LE BLOC QUI PIQUE ═══ */}
      <section className={`lp-noir${barresVues ? ' lp-vu' : ''}`} ref={refBarres}>
        <div className="lp-wrap">
          {/* 🔴 14/10, ALEX SUR LA PREMIÈRE VERSION : « tu as barré, c'est
              normal ? Quel message doit passer ? » Des phrases « Si tu aimes… »
              rayées sans rien à côté ne disaient pas QUI on raye ni POURQUOI.
              La rature a maintenant un sens : on raye l'ANCIENNE FAÇON DE
              FAIRE, et notre réponse s'écrit à côté. On raye un modèle, jamais
              un nom.
              ⚠️ PAS DE « payer pour être vu » : avec Communiquer, les actus
              remontent dans la liste. On ne pique pas les autres sur ce qu'on
              fait nous-mêmes. */}
          <p className="lp-sur lp-sur-clair">Le commerce en ligne, version quartier</p>
          <h2 className="lp-h2 lp-h2-clair">On a rayé ce qui te coûte.</h2>
          <ul className="lp-ratures">
            {[
              ['Une part de chaque vente.', 'Un prix fixe, même pour ton meilleur samedi.'],
              ['Un contrat dont on ne sort pas.', 'Tu pars quand tu veux, et ta page reste.'],
              ['Des clients qui appartiennent à la plateforme.', 'Tes clients restent les tiens.'],
              ['Un service client qui ne connaît pas ton commerce.', 'Une vraie personne qui connaît ton dossier.'],
              ['Un logiciel de plus à apprendre.', 'Ton téléphone suffit.'],
            ].map(([avant, ici]) => (
              <li key={avant}>
                <s>{avant}</s>
                <span><Icone d={I.check} size={18} sw={3}/>{ici}</span>
              </li>
            ))}
          </ul>
          <p className="lp-pour-autres">
            Tu n&rsquo;as pas ouvert ton commerce pour bosser pour quelqu&rsquo;un d&rsquo;autre.
          </p>
          <p className="lp-convaincre">
            Et pour t&rsquo;en convaincre&nbsp;: {ESSAI_JOURS_MINIMUM}&nbsp;jours pour tout essayer, sans carte. Ta page, elle, reste gratuite à vie.
          </p>
        </div>
      </section>

      {/* ═══ 7. L'OFFRE ET LES FORMULES ═══ */}
      <section className="lp-section" id="formules">
        <div className="lp-wrap">
          <div className="lp-offre">
            <div className="lp-offre-nombre">
              <CompteurJours cible={ESSAI_JOURS_MINIMUM}/>
              <span className="lp-points" aria-hidden="true"><i/><i/><i/></span>
            </div>
            <div>
              {/* ✅ 14/10, Alex : les 100 jours EN PERMANENCE, la marque de
                  fabrique. Le nombre vient de `lib/lancement.js`, comme la
                  facture : ils ne peuvent pas diverger. */}
              <h2 className="lp-h2 lp-h2-encre">jours offerts, dès ton inscription. Pour tout le monde. Tout le temps.</h2>
              <p className="lp-texte">
                Tu viens parce que c&rsquo;est gratuit et sans contrainte. Tu restes parce que c&rsquo;est utile.
                Pendant ces jours-là, tu essaies tout, les trois formules, sans carte de paiement&nbsp;: rien ne se
                déclenche dans ton dos.
              </p>
            </div>
          </div>

          <div className="lp-formules">
            {FORMULES.map(fo => {
              const { prix, sous } = affichagePrix(fo.plan)
              const visibles = fo.points.slice(0, POINTS_VISIBLES)
              const reste = fo.points.slice(POINTS_VISIBLES)
              const ligne = pt => (
                <li key={pt} className={pt.startsWith('Tout ') ? 'lp-tout' : undefined}>
                  {/* L'espace avant « : ? ! » devient insécable à l'affichage :
                      le texte reste celui que les bancs lisent, et la
                      ponctuation ne commence jamais une ligne. */}
                  <Icone d={I.check} size={14} sw={3}/><span>{pt.replace(/ ([:;?!])/g, ' $1')}</span>
                </li>
              )
              return (
                <div key={fo.nom} className={`lp-formule${fo.vedette ? ' lp-formule-vedette' : ''}`}>
                  <span className="lp-formule-badge">{fo.badge}</span>
                  <p className="lp-formule-nom">{fo.nom}</p>
                  <p className="lp-formule-prix">{prix} <span>{sous}</span></p>
                  <p className="lp-formule-accroche">{fo.accroche}</p>
                  <ul>{visibles.map(ligne)}</ul>
                  {reste.length > 0 && (
                    <details className="lp-formule-plus">
                      {/* ✅ Alex, 14/10 : « doit donner envie qu'on y clique ».
                          Un vrai bouton, le nombre en avant, et ce qu'on gagne
                          à ouvrir : la suite de l'arsenal. */}
                      <summary>
                        <span className="lp-plus-nb">+{reste.length}</span>
                        <span>Et ce n&rsquo;est pas tout&nbsp;: voir ce que {fo.nom} fait encore</span>
                        <Icone d={['M6 9l6 6 6-6']} size={16} sw={2.6}/>
                      </summary>
                      <ul>{reste.map(ligne)}</ul>
                    </details>
                  )}
                  {/* ⚠️ Chaque carte INSCRIT : le commerçant vient de choisir
                      son prix, on ne l'envoie pas dans un formulaire d'email. */}
                  <Link href="/signup" className={`lp-btn ${fo.vedette ? 'lp-btn-violet' : 'lp-btn-contour'} lp-formule-cta`}>
                    Je m&rsquo;inscris
                  </Link>
                </div>
              )
            })}
          </div>
          <p className="lp-sous-formules">
            Yoppaa ne prend aucune commission sur tes ventes&nbsp;: la formule au mois est notre seul revenu.
            Paiement par Bancontact ou carte, aucune augmentation en cours d&rsquo;année.
          </p>

          {/* ✅ 14/10, Alex : « quand on dit abonnement, les gens pensent à
              engagement. Je veux qu'on sache qu'ici rien n'est bloquant : tu
              aimes, tu restes ; ce n'est plus utile, tu pars, mais on te garde
              ta page pour que tu restes visible. Finalement on reste toujours
              un peu un Yopper. » Vérifié dans le code : une résiliation
              (`customer.subscription.deleted`) repasse le commerce en Exister,
              sa page reste en ligne. */}
          <div className="lp-liberte">
            <p className="lp-sur lp-sur-clair">Et si tu arrêtes&nbsp;?</p>
            <h3 className="lp-liberte-titre">Ici, l&rsquo;abonnement n&rsquo;enferme personne.</h3>
            <p>
              Tu aimes, tu restes. Ça ne te sert plus, tu arrêtes quand tu veux, sans préavis. Et ta page
              reste en ligne, gratuitement&nbsp;: tes clients te trouvent toujours. On ne sort personne du quartier.
            </p>
            <p className="lp-signature">Yopper un jour, Yopper toujours.</p>
            <Link href="/signup" className="lp-btn lp-btn-main lp-liberte-cta">
              J&rsquo;essaie {ESSAI_JOURS_MINIMUM} jours, c&rsquo;est gratuit <Icone d={I.fleche} size={18} sw={2.4}/>
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ 8. CE QUE ÇA T'ENGAGE, ET LES QUESTIONS ═══ */}
      <section className="lp-section lp-section-blanche">
        <div className="lp-wrap lp-engage-grille">
          <div>
            <p className="lp-sur lp-sur-encre">Ce que ça t&rsquo;engage</p>
            <h2 className="lp-h2 lp-h2-encre">Rien.</h2>
            <ul className="lp-engage">
              <li><Icone d={I.check} size={16} sw={3}/><span>Tu ne donnes aucune carte de paiement pour t&rsquo;inscrire.</span></li>
              <li><Icone d={I.check} size={16} sw={3}/><span>Tu ne remplaces rien&nbsp;: garde ta caisse, ton logiciel, tes habitudes.</span></li>
              <li><Icone d={I.check} size={16} sw={3}/><span>Tu pars quand tu veux, sans préavis.</span></li>
              <li><Icone d={I.check} size={16} sw={3}/><span>Si tu n&rsquo;en fais rien, ta page reste en ligne. Gratuitement. À vie.</span></li>
            </ul>
            <div className="lp-humains">
              <p><strong>Et si tu préfères, on passe.</strong> On vient chez toi, on installe ton catalogue et on te forme. Jamais une obligation.</p>
              <p><strong>Un humain au bout du fil.</strong> Par email, en visio ou au téléphone, une vraie personne qui connaît ton dossier.</p>
            </div>
          </div>
          <div className="lp-faq">
            <p className="lp-sur lp-sur-encre">Les questions qu&rsquo;on nous pose</p>
            <details>
              <summary>Je suis déjà sur une plateforme de commande.</summary>
              <p>Garde-la si tu veux&nbsp;: Yoppaa ne demande aucune exclusivité. Ouvre ta page à côté, et regarde d&rsquo;où viennent tes nouveaux clients.</p>
            </details>
            <details>
              <summary>Je n&rsquo;ai pas le temps.</summary>
              <p>
                Ton inscription prend quelques minutes, puis une liste te guide point par point. Tu tiens un
                resto ou un snack&nbsp;? Prends ta carte en photo&nbsp;: l&rsquo;IA la lit et prépare tes articles, tu
                n&rsquo;as plus qu&rsquo;à relire.
                {ENCODAGE_OFFERT && <> Et en ce moment, on encode même ta carte, ton menu ou ton catalogue pour toi, gratuitement&nbsp;: <a href="#rappel">demande-le ici</a>.</>}
                {' '}Et si tu préfères, on passe le faire avec toi.
              </p>
            </details>
            <details>
              <summary>Il me faut du matériel&nbsp;?</summary>
              <p>Non. Ton téléphone, ta tablette ou ton ordinateur suffisent. Pas de caisse imposée, pas de terminal à louer.</p>
            </details>
            <details>
              <summary>Que faut-il pour s&rsquo;inscrire&nbsp;?</summary>
              {/* 🔴 29/09 : la page part quand elle est complète, pas à la
                  validation (lib/fiche-complete.js). */}
              <p>
                Trois étapes, et ton espace s&rsquo;ouvre.
              </p>
              <ol className="lp-etapes">
          {['Compte', 'L’essentiel', 'Vérification'].map((e, i) => (
                  <li key={e}><span>{i + 1}</span>{e}</li>
                ))}
              </ol>
              {/* ⚠️ 09/10 : plus de carte d'identité, le dire rassure ceux
                  qu'elle faisait fuir. */}
              <p>
                Avant de commencer, garde sous la main ton numéro d&rsquo;entreprise (BCE, qui est aussi ton
                numéro de TVA). Aucune pièce d&rsquo;identité, aucune carte de paiement. Une vraie personne
                relit ton dossier et te répond sous deux jours ouvrables.
              </p>
            </details>
            <details>
              <summary>Où ça marche&nbsp;?</summary>
              <p>
                Toute la Wallonie, dès aujourd&rsquo;hui. Pas de liste d&rsquo;attente, pas de seuil à atteindre.
                Ta commune est déjà ouverte et ta page part en ligne dès qu&rsquo;elle est complète. Et plus vous
                êtes nombreux dans une commune, plus ses habitants ont de raisons d&rsquo;ouvrir l&rsquo;app
                chaque matin.
              </p>
            </details>
          </div>
        </div>
      </section>

      {/* ═══ 8 bis. ON T'APPELLE ═══ */}
      <OnTeRappelle siteKey={siteKey}/>

      {/* ═══ 9. POUR LES HABITANTS ═══ */}
      <section id="preinscription" className="lp-habitants" style={{ background: `linear-gradient(135deg, ${T.ink} 0%, ${T.deep} 60%, ${T.panel} 100%)` }}>
        <div className="lp-wrap lp-habitants-grille">
          <div>
            <p className="lp-sur lp-sur-clair">{LIBELLE_HABITANT}</p>
            <h2 className="lp-h2 lp-h2-clair">Tes commerces préférés, dans ta poche.</h2>
            <p className="lp-texte lp-texte-clair">
              Fini la file du samedi matin et le répondeur du coiffeur. Tu commandes à l&rsquo;avance, tu
              réserves quand ça t&rsquo;arrange, ta fidélité se remplit toute seule, et chaque matin les
              bons plans de ta commune arrivent tout seuls. Gratuit, pour toujours.
            </p>
            <div className="lp-pastilles">
              {[
                'Click & Collect', 'Rendez-vous en ligne', 'Réserver une table', 'Good Morning Yoppers',
                // ⚠️ « ET SÉANCES », PAS « ABONNEMENTS » TOUT SEUL : sur cette
                // page, le mot désigne déjà nos formules.
                'Abonnements et séances',
                'Deals du jour', 'Cartes de fidélité', 'Bons cadeaux', 'Livraison locale',
                'Boutiques de détail', 'Rien ne se perd',
              ].map(b => (
                <span key={b}><Icone d={I.check} size={12} sw={3}/> {b}</span>
              ))}
            </div>
            {/* ✅ 14/10, Alex : « ajoute les logos App Store et Play Store, en
                plus d'une inscription si tu penses qu'elle est encore
                nécessaire ». Elle l'est : tant que l'app n'est pas publiée
                (`lib/stores.js`), l'email est le seul moyen de prévenir
                l'habitant. */}
            <BadgesStores/>
          </div>

          <div className="lp-habitants-form">
            {/* ⚠️ ALEX, 26/08 : « simple et clair ». Deux raisons concrètes de
                s'inscrire : les commerces qui ouvrent, et l'app qui sort. */}
            <p className="lp-habitants-phrase">
              {appPubliee()
                ? <>L&rsquo;app est là. Laisse ton email et on te prévient quand tes commerçants y arrivent.</>
                : <>Inscris-toi&nbsp;: on te prévient dès que ça démarre, pour que tu puisses télécharger l&rsquo;app et enfin voir, commander et réserver chez tes commerçants préférés.</>}
            </p>

            {statut.envoi === 'ok' ? (
              <div>
                <div style={{ background: 'rgba(16,185,129,0.15)', border: '1.5px solid #10B98166', borderRadius: 18, padding: '24px 22px' }}>
                  <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#A7F3D0' }}>
                    ✓ {statut.message}
                  </p>
                </div>
                {kitSlug && (
                  <div style={{ marginTop: 16, padding: '18px 16px', borderRadius: 16, background: 'rgba(150,96,224,0.16)', border: '1px solid rgba(196,160,244,0.4)', textAlign: 'center' }}>
                    <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: '#fff' }}>Ton kit de partage est prêt 🟣</p>
                    <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.9)', lineHeight: 1.5 }}>
                      Un lien perso et un QR code à partager. Chaque inscription via ton lien t&rsquo;est attribuée.
                    </p>
                    <Link href={`/kit/${kitSlug}`} className="lp-btn lp-btn-main" style={{ padding: '12px 26px', fontSize: 13.5 }}>
                      Ouvrir mon kit de partage
                    </Link>
                  </div>
                )}
                <div style={{ marginTop: 16, textAlign: 'left' }}>
                  <IncitantMobilisation communeStats={communeStats} globalStats={globalStats}/>
                </div>
                <PartageMobilisation/>
              </div>
            ) : (
              <form onSubmit={soumettre} className="lp-form">
                <input type="email" required placeholder="Ton email" onFocus={lancerChallenge}
                  value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  style={inputStyle}/>
                <input type="text" required inputMode="numeric" pattern="\d{4}" maxLength={4} placeholder="Ton code postal (4 chiffres)" onFocus={lancerChallenge}
                  value={form.code_postal} onChange={e => setForm(p => ({ ...p, code_postal: e.target.value.replace(/\D/g, '').slice(0,4) }))}
                  style={inputStyle}/>

                <IncitantMobilisation communeStats={communeStats} globalStats={globalStats}/>

                {/* ⚠️ LE SÉLECTEUR « habitant / commerçant » A ÉTÉ RETIRÉ le
                    26/08 : il ouvrait au commerçant un chemin qui ne
                    l'inscrivait pas. Le sien est un vrai lien vers /signup. */}
                <input type="text"
                  maxLength={160}
                  placeholder="Un commerce que tu aimerais voir ? (optionnel)"
                  value={form.commercant_nom}
                  onChange={e => setForm(p => ({ ...p, commercant_nom: e.target.value }))}
                  style={inputStyle}/>

                {/* Consentement RGPD : case visible, jamais pré-cochée,
                    OBLIGATOIRE (elle décrit la finalité même de l'inscription) */}
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 14, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.consentement_marketing}
                    onChange={e => setForm(p => ({ ...p, consentement_marketing: e.target.checked }))}
                    style={{ marginTop: 2, width: 15, height: 15, accentColor: '#9660E0', flexShrink: 0, cursor: 'pointer' }}/>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5, fontWeight: 600 }}>
                    J&rsquo;accepte de recevoir l&rsquo;annonce du lancement et les actualités de Yoppaa. <span style={{ color: '#C4A0F4' }}>*</span>
                  </span>
                </label>

                {siteKey && <div ref={turnstileRef} />}

                <button type="submit" disabled={statut.envoi === 'envoi' || !formValide} className="lp-form-envoi">
                  {statut.envoi === 'envoi' ? 'Envoi…' : 'Me prévenir du lancement'}
                </button>

                {statut.envoi === 'ko' && statut.message && (
                  <p style={{ margin: '12px 0 0', fontSize: 12, color: '#FCA5A5', fontWeight: 700, textAlign: 'center' }}>
                    ⚠ {statut.message}
                  </p>
                )}

                <p style={{ margin: '14px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.75)', textAlign: 'center', lineHeight: 1.5 }}>
                  <Lock size={11} strokeWidth={1.8} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }}/> Aucun spam.{' '}
                  <Link href="/legal" style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px solid rgba(255,255,255,0.35)' }}>Données protégées</Link>.
                </p>
              </form>
            )}
          </div>
        </div>

        {/* ═══ 10. FIN DE PAGE ═══ */}
        <div className="lp-wrap lp-fin">
          <p className="lp-sur lp-sur-clair">Un projet belge indépendant <DrapeauBelge/></p>
          <p className="lp-fin-texte">
            Yoppaa n&rsquo;appartient à aucun grand groupe. Construit en Wallonie, sans levée de fonds, avec une
            conviction : le digital doit servir les commerces de quartier, pas se servir sur leur dos. Pas de
            revente de données, pas d&rsquo;annonces sponsorisées devant tes commerçants.
          </p>
          <div className="lp-fin-cta">
            <p className="lp-sur lp-sur-clair">{LIBELLE_COMMERCANT}</p>
            {/* ✅ Alex, 14/10 : le dernier mot de la page. « Reprends tes
                clients » ne l'accrochait pas (« pas certain qu'elle interpelle
                les commerçants ») : la promesse et la pique en une phrase. */}
            <p className="lp-reprends">Remplis ton commerce, pas leurs poches.</p>
            <Link href="/signup" className="lp-btn lp-btn-main">J&rsquo;inscris mon commerce</Link>
          </div>
          {/* ⚠️ La liste vient de `lib/reseaux`, jamais nommée ici. */}
          <div className="lp-reseaux">
            {RESEAUX.map(r => (
              <a key={r.nom} href={r.url} target="_blank" rel="noopener noreferrer">Suis-nous sur {r.nom}</a>
            ))}
          </div>

          <footer className="lp-pied">
            <YoppaaLogo size={26} mode="dark"/>
            <p>
              Yoppaa est un produit et une marque d&rsquo;Avcotech SRL · BCE 0731.637.148 · Rue de Prée 9 G, 5640 Mettet
            </p>
            <p>
              <a href="mailto:hello@yoppaa.app">hello@yoppaa.app</a>
              {' · '}
              {RESEAUX.map(r => (
                <span key={r.nom}>
                  <a href={r.url} target="_blank" rel="noopener noreferrer">{r.nom}</a>
                  {' · '}
                </span>
              ))}
              <Link href="/legal">Mentions légales, CGU et confidentialité</Link>
            </p>
          </footer>
        </div>
      </section>

      <BarrePouce visible={barrePouce}/>

      <style>{CSS_LANDING}</style>
    </main>
  )
}

// ─── La feuille de style de la page ─────────────────────────────────────────
// 🔴 AUCUN COMMENTAIRE DANS CE CSS : un accent grave dans un commentaire CSS a
// déjà cassé le build (reference_vide_sous_la_page). Les explications vivent
// ici, au-dessus.
// ⚠️ Aucun `filter` ni `backdrop-filter` (gel du défilement sur iPhone), aucune
// hauteur en `vh`. Les animations ne touchent que `transform` et `opacity`, et
// toutes s'éteignent avec `prefers-reduced-motion`.
const CSS_LANDING = `
.lp { background: ${T.bg}; color: ${T.ink}; font-family: "DM Sans", system-ui, sans-serif; }
.lp *, .lp *::before, .lp *::after { box-sizing: border-box; }
.lp-wrap { max-width: 1120px; margin: 0 auto; padding: 0 20px; }
.lp-h1, .lp-h2, .lp-h3, .lp-chute, .lp-citation, .lp-cent, .lp-pour-autres, .lp-signature, .lp-liberte-titre, .lp-verdict-montant, .lp-formule-nom {
  font-family: var(--font-jakarta), "Plus Jakarta Sans", "DM Sans", system-ui, sans-serif;
  word-spacing: .08em;
}
.lp-sur { margin: 0 0 14px; font-size: 12px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
.lp-sur-clair { color: ${T.light}; }
.lp-sur-encre { color: ${T.main}; }
.lp-h2 { margin: 0 0 16px; font-size: clamp(1.9rem, 5vw, 3.1rem); font-weight: 800; letter-spacing: -0.03em; line-height: 1.06; text-wrap: balance; max-width: 22em; }
.lp-h2-clair { color: #fff; }
.lp-h2-encre { color: ${T.ink}; }
.lp-h3 { margin: 0 0 14px; font-size: clamp(1.3rem, 3vw, 1.7rem); font-weight: 800; letter-spacing: -0.02em; color: ${T.ink}; }
.lp-texte { margin: 0; max-width: 40em; font-size: 1.03rem; line-height: 1.7; font-weight: 500; color: ${T.deep}; }
.lp-texte-clair { color: rgba(255,255,255,0.88); }
.lp-section { padding: clamp(64px, 9vw, 104px) 0; }
.lp-section-blanche { background: #fff; }

.lp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 16px 28px; border-radius: 100px; border: 0; font-family: inherit; font-size: 15px; font-weight: 900; letter-spacing: .01em; text-decoration: none; cursor: pointer; text-align: center; transition: transform .16s ease, box-shadow .16s ease; }
.lp-btn:hover { transform: translateY(-2px); }
.lp-btn:focus-visible, .lp-onglet:focus-visible, .lp summary:focus-visible { outline: 3px solid ${T.light}; outline-offset: 3px; }
.lp-btn-main { background: linear-gradient(135deg, ${T.light}, ${T.mid}); color: ${T.ink}; box-shadow: 0 10px 30px rgba(150,96,224,0.45); animation: lp-pouls 2.8s ease-in-out infinite; }
.lp-btn-fantome { background: transparent; color: #fff; box-shadow: inset 0 0 0 1.5px rgba(255,255,255,0.45); }
.lp-btn-blanc { background: #fff; color: ${T.deep}; box-shadow: 0 8px 22px rgba(0,0,0,0.28); }
.lp-btn-violet { background: linear-gradient(135deg, ${T.main}, ${T.mid}); color: #fff; box-shadow: 0 8px 22px rgba(107,53,196,0.3); }
.lp-btn-contour { background: #fff; color: ${T.main}; box-shadow: inset 0 0 0 1.5px ${T.main}; }
@keyframes lp-pouls { 0%, 100% { box-shadow: 0 10px 30px rgba(150,96,224,0.45); } 50% { box-shadow: 0 10px 46px rgba(196,160,244,0.8); } }

.lp-hero { position: relative; overflow: hidden; }
.lp-hero::before { content: ""; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(circle at 78% 35%, rgba(150,96,224,0.35), transparent 40%), radial-gradient(circle at 5% 100%, rgba(107,53,196,0.35), transparent 38%); }
.lp-hero-grille { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); gap: 48px; align-items: center; padding-top: 48px; padding-bottom: 72px; }
.lp-referent { display: inline-block; margin: 0 0 22px; padding: 10px 18px; border-radius: 100px; background: rgba(196,160,244,0.16); border: 1px solid rgba(196,160,244,0.4); font-size: 13.5px; font-weight: 700; line-height: 1.45; }
.lp-referent strong { color: ${T.light}; }
.lp-hero-sur { margin-top: 26px; }
.lp-kicker { margin: 0 0 14px; font-size: clamp(1.2rem, 3.4vw, 1.7rem); font-weight: 800; color: rgba(255,255,255,0.92); line-height: 1.5; }
.lp-mot { display: inline-block; padding: 1px 12px 3px; border-radius: 12px; background: #fff; color: ${T.ink}; animation: lp-mot .55s cubic-bezier(.2,.9,.3,1.25) both; }
@keyframes lp-mot { from { opacity: 0; transform: translateY(55%) rotate(-4deg); } to { opacity: 1; transform: none; } }
.lp-objet { display: inline-block; animation: lp-objet .5s cubic-bezier(.2,.9,.3,1.2) both; }
@keyframes lp-objet { from { opacity: 0; transform: translateY(30%); } to { opacity: 1; transform: none; } }
.lp-h1 { margin: 0 0 22px; font-size: clamp(2.2rem, 6.2vw, 4.2rem); font-weight: 800; letter-spacing: -0.03em; line-height: 1.04; color: #fff; text-wrap: balance; }
.lp-lead { margin: 0 0 30px; max-width: 34em; font-size: clamp(1.02rem, 2.3vw, 1.18rem); line-height: 1.65; font-weight: 500; color: rgba(255,255,255,0.9); }
.lp-lead strong { color: #fff; }
.lp-ctas { display: flex; flex-wrap: wrap; gap: 12px; }
.lp-micro { margin: 18px 0 0; font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.75); }

.lp-tel { position: relative; width: min(290px, 72vw); margin: 0 auto; }
@media (min-width: 900px) { .lp-tel { width: 320px; } }
.lp-tel-cadre { padding: 10px; border-radius: 42px; background: #0B0318; border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 30px 60px rgba(0,0,0,0.45); }
.lp-tel-ecran { overflow: hidden; border-radius: 32px; background: #fff; padding-bottom: 14px; }
.lp-tel-ecran img { display: block; width: 100%; height: auto; }
.lp-bulle { position: absolute; display: flex; align-items: center; gap: 10px; max-width: 230px; padding: 10px 14px; border-radius: 16px; background: #fff; color: ${T.ink}; box-shadow: 0 14px 30px rgba(10,2,30,0.35); font-size: 12.5px; line-height: 1.3; font-weight: 600; animation: lp-bulle 12s ease-in-out infinite both; }
.lp-bulle i { flex-shrink: 0; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; background: ${T.pale}; color: ${T.main}; }
.lp-bulle strong { display: block; font-size: 13px; font-weight: 900; }
.lp-bulle-1 { top: 20%; left: -20%; }
.lp-bulle-2 { top: 38%; right: -20%; animation-delay: 3s; }
.lp-bulle-3 { top: 56%; left: -20%; animation-delay: 6s; }
.lp-bulle-4 { top: 74%; right: -20%; animation-delay: 9s; }
@keyframes lp-bulle { 0% { opacity: 0; transform: translateY(14px) scale(.9); } 4%, 30% { opacity: 1; transform: none; } 36%, 100% { opacity: 0; transform: translateY(-8px) scale(.96); } }

.lp-bande { overflow: hidden; padding: 17px 0; background: ${T.main}; color: #fff;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent); mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent); }
.lp-bande-piste { display: flex; width: max-content; animation: lp-defile 70s linear infinite; }
.lp-bande:hover .lp-bande-piste { animation-play-state: paused; }
.lp-bande-piste-moitie { display: flex; }
.lp-pique { display: inline-flex; align-items: center; gap: 12px; padding: 0 30px; white-space: nowrap; font-size: 15.5px; font-weight: 800; }
.lp-pique em { font-style: normal; padding: 4px 10px; border-radius: 100px; background: rgba(255,255,255,0.18); font-size: 11px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; }
.lp-pique::after { content: ""; width: 8px; height: 8px; margin-left: 30px; border-radius: 50%; background: ${T.light}; }
@keyframes lp-defile { to { transform: translateX(-50%); } }

.lp-calc { padding: clamp(64px, 9vw, 104px) 0; background: linear-gradient(160deg, ${T.ink} 0%, ${T.deep} 100%); color: #fff; }
.lp-calcul { margin-top: 34px; padding: clamp(22px, 4vw, 38px); border-radius: 26px; background: rgba(255,255,255,0.06); border: 1px solid rgba(196,160,244,0.25); }
.lp-onglets { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
.lp-onglet { padding: 11px 18px; border-radius: 100px; border: 1.5px solid rgba(196,160,244,0.4); background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.92); font-family: inherit; font-size: 13.5px; font-weight: 800; cursor: pointer; }
.lp-onglet[aria-pressed="true"] { background: #fff; border-color: #fff; color: ${T.deep}; }
.lp-champs { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; align-items: end; }
.lp-champ label { display: block; margin-bottom: 8px; font-size: 12px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; color: ${T.light}; }
.lp-champ-saisie { display: flex; align-items: center; gap: 8px; padding: 0 16px; border-radius: 14px; background: rgba(0,0,0,0.25); border: 1.5px solid rgba(255,255,255,0.22); }
.lp-champ-saisie:focus-within { border-color: ${T.light}; }
.lp-champ input { flex: 1; min-width: 0; padding: 14px 0; border: 0; outline: 0; background: transparent; color: #fff; font-family: inherit; font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; }
.lp-champ input::placeholder { color: rgba(255,255,255,0.3); }
.lp-champ-saisie span { color: rgba(255,255,255,0.6); font-size: 14px; font-weight: 800; }
.lp-calcul-aide { margin: 14px 0 0; font-size: 13.5px; font-weight: 600; color: rgba(255,255,255,0.65); }
.lp-calcul-aide strong { color: #FCD34D; }
.lp-postes { display: grid; gap: 8px; }
.lp-postes .lp-calcul-aide { margin: 0 0 6px; }
.lp-poste { display: flex; align-items: center; gap: 12px; padding: 11px 14px; border-radius: 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); }
.lp-poste[data-actif="oui"] { background: rgba(196,160,244,0.14); border-color: rgba(196,160,244,0.45); }
.lp-poste > input { width: 19px; height: 19px; flex-shrink: 0; accent-color: ${T.light}; cursor: pointer; }
.lp-poste label { flex: 1; min-width: 0; font-size: 14px; font-weight: 700; color: rgba(255,255,255,0.92); cursor: pointer; }
.lp-palier { display: inline-block; margin-left: 8px; padding: 2px 8px; border-radius: 100px; background: rgba(255,255,255,0.16); color: #fff; font-size: 10px; font-weight: 900; letter-spacing: .06em; text-transform: uppercase; vertical-align: middle; }
.lp-palier-vendre { background: rgba(110,231,183,0.22); color: #6EE7B7; }
.lp-palier-communiquer { background: rgba(196,160,244,0.3); }
.lp-poste-prix { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.lp-poste-prix input { width: 74px; padding: 7px 9px; border-radius: 9px; border: 1px solid rgba(255,255,255,0.25); background: rgba(0,0,0,0.25); color: #fff; font-family: inherit; font-size: 14px; font-weight: 800; text-align: right; }
.lp-poste-prix input:disabled { opacity: .35; }
.lp-poste-prix span { font-size: 12.5px; font-weight: 700; color: rgba(255,255,255,0.6); white-space: nowrap; }
.lp-duel { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; margin-top: 28px; }
.lp-duel > div { padding: 22px 20px; border-radius: 18px; text-align: center; }
.lp-duel-eux { background: rgba(248,113,113,0.1); border: 1.5px solid rgba(248,113,113,0.4); }
.lp-duel-nous { background: rgba(110,231,183,0.1); border: 1.5px solid rgba(110,231,183,0.45); }
.lp-duel h3 { margin: 0 0 12px; font-size: 13px; font-weight: 900; line-height: 1.4; color: rgba(255,255,255,0.92); }
.lp-duel-montant { margin: 0; font-size: clamp(2rem, 5.6vw, 2.8rem); font-weight: 900; letter-spacing: -0.04em; line-height: 1; font-variant-numeric: tabular-nums; }
.lp-duel-eux .lp-duel-montant { color: #F87171; }
.lp-duel-nous .lp-duel-montant { color: #6EE7B7; }
.lp-duel-unite { margin: 8px 0 0; font-size: 12.5px; font-weight: 700; color: rgba(255,255,255,0.62); }
.lp-jour { display: grid; gap: 14px; margin-top: 22px; padding: 20px; border-radius: 18px; background: rgba(0,0,0,0.18); }
.lp-jour-titre { margin: 0; font-size: 12px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; color: ${T.light}; }
.lp-jour-ligne { display: grid; gap: 7px; font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.88); }
.lp-jour-ligne strong { color: #fff; font-variant-numeric: tabular-nums; }
.lp-barre { height: 14px; overflow: hidden; border-radius: 100px; background: rgba(255,255,255,0.1); }
.lp-barre i { display: block; height: 100%; border-radius: inherit; transition: width .5s cubic-bezier(.2,.8,.2,1); }
.lp-barre-eux { background: linear-gradient(90deg, #FCA5A5, #F87171); }
.lp-barre-nous { background: linear-gradient(90deg, #A7F3D0, #6EE7B7); }
.lp-tickets { display: grid; grid-template-columns: minmax(0, 1fr); gap: 22px 28px; max-width: 760px; margin: 26px auto 0; }
@media (min-width: 640px) { .lp-tickets { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.lp-ticket { padding: 18px 20px 20px; border-radius: 16px; background: #FFFDF6; border-top: 5px solid #F87171; color: ${T.ink}; font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, "Courier New", monospace; font-size: 13.5px; line-height: 1.4; box-shadow: 0 12px 26px rgba(0,0,0,0.25); }
.lp-ticket-nous { background: #F1FFF7; border-top-color: #6EE7B7; }
.lp-ticket p { margin: 0; }
.lp-ticket-tete { margin-bottom: 12px !important; padding-bottom: 10px; border-bottom: 1.5px dashed rgba(26,8,64,0.35); text-align: center; font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.lp-ticket-ligne, .lp-ticket-total { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; font-variant-numeric: tabular-nums; }
.lp-ticket-moins span:last-child { color: #DC2626; font-weight: 800; }
.lp-ticket-total { margin-top: 10px; padding-top: 10px; border-top: 1.5px dashed rgba(26,8,64,0.35); font-size: 15px; font-weight: 800; }
.lp-ticket-eux .lp-ticket-total span:last-child { color: #DC2626; }
.lp-ticket-nous .lp-ticket-total span:last-child { color: #047857; }
.lp-ticket-note { grid-column: 1 / -1; margin: 0; text-align: center; font-size: 12.5px; line-height: 1.6; color: rgba(255,255,255,0.62); }
.lp-sous-titre { margin: 0 0 16px; font-family: var(--font-jakarta), "Plus Jakarta Sans", "DM Sans", system-ui, sans-serif; font-size: clamp(1.15rem, 3vw, 1.55rem); font-weight: 800; letter-spacing: -0.015em; word-spacing: .06em; line-height: 1.25; color: ${T.light}; text-wrap: balance; }
.lp-convaincre { max-width: 36em; margin: 22px 0 0; font-size: clamp(1.05rem, 2.6vw, 1.3rem); font-weight: 700; line-height: 1.5; color: rgba(255,255,255,0.85); }
.lp-reprends { margin: 0 0 24px; font-family: var(--font-jakarta), "Plus Jakarta Sans", "DM Sans", system-ui, sans-serif; font-size: clamp(2.3rem, 7.5vw, 4.2rem); font-weight: 800; letter-spacing: -0.03em; word-spacing: .08em; line-height: 1; color: #fff; }
.lp-verdict { margin-top: 30px; padding-top: 28px; border-top: 1px solid rgba(255,255,255,0.16); text-align: center; }
.lp-verdict-sur { margin: 0 0 6px; font-size: 12.5px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: ${T.light}; }
.lp-verdict-titre { margin: 0; font-size: clamp(1.2rem, 3.4vw, 1.7rem); font-weight: 900; letter-spacing: -0.02em; color: #fff; text-wrap: balance; }
.lp-verdict-montant { margin: 0; font-size: clamp(2.8rem, 10vw, 5rem); font-weight: 800; letter-spacing: -0.05em; line-height: 1; color: #fff; font-variant-numeric: tabular-nums; }
.lp-verdict-phrase { margin: 16px auto 22px; max-width: 36em; font-size: 15px; font-weight: 600; line-height: 1.6; color: rgba(255,255,255,0.9); }
.lp-verdict-phrase strong { color: #fff; }
.lp-calcul-note { margin: 16px auto 0; max-width: 40em; font-size: 12.5px; line-height: 1.6; color: rgba(255,255,255,0.62); }
.lp-calcul-note strong { color: rgba(255,255,255,0.92); }
.lp-chute { margin: 56px 0 0; font-size: clamp(1.8rem, 5.4vw, 3.2rem); font-weight: 800; letter-spacing: -0.035em; line-height: 1.05; text-align: center; color: #fff; text-wrap: balance; }

.lp-atouts { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; margin-top: 36px; }
.lp-atout { padding: 26px 24px; border-radius: 22px; background: #fff; border: 1px solid ${T.pale}; transition: transform .2s ease, box-shadow .2s ease; }
.lp-atout:hover { transform: translateY(-3px); box-shadow: 0 16px 34px rgba(22,6,54,0.1); }
.lp-atout-icone { display: grid; place-items: center; width: 46px; height: 46px; border-radius: 14px; background: linear-gradient(135deg, ${T.main}, ${T.mid}); color: #fff; }
.lp-atout h3 { margin: 16px 0 8px; font-family: var(--font-jakarta), "Plus Jakarta Sans", "DM Sans", system-ui, sans-serif; font-size: 1.4rem; font-weight: 800; letter-spacing: -0.02em; color: ${T.ink}; }
.lp-atout p { margin: 0; font-size: .98rem; line-height: 1.65; font-weight: 500; color: ${T.deep}; }
.lp-tous { margin-top: 56px; }
.lp-metiers { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
.lp-metiers span { padding: 8px 14px; border-radius: 100px; background: #fff; border: 1.5px solid ${T.pale}; font-size: 13.5px; font-weight: 800; color: ${T.deep}; }
.lp-telephone { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 18px; align-items: start; margin-top: 40px; padding: clamp(22px, 4vw, 34px); border-radius: 24px; background: #fff; border: 2px solid ${T.main}; box-shadow: 0 18px 40px rgba(107,53,196,0.14); }
.lp-telephone .lp-sur { margin-bottom: 8px; }
.lp-telephone .lp-h3 { margin-bottom: 10px; }
.lp-telephone strong { color: ${T.ink}; }
.lp-telephone-icone { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 16px; background: linear-gradient(135deg, ${T.main}, ${T.mid}); color: #fff; }
@media (max-width: 560px) { .lp-telephone { grid-template-columns: minmax(0, 1fr); } }
.lp-citation { max-width: 22em; margin: 64px auto 0; font-size: clamp(1.5rem, 4.2vw, 2.4rem); font-weight: 800; letter-spacing: -0.03em; line-height: 1.15; text-align: center; color: ${T.ink}; text-wrap: balance; }

.lp-section-captures { padding-bottom: clamp(40px, 6vw, 72px); }
.lp-captures { display: flex; gap: 22px; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; padding: 32px 20px 24px; }
.lp-captures::-webkit-scrollbar { display: none; }
.lp-captures > :first-child { margin-left: auto; }
.lp-captures > :last-child { margin-right: auto; }
.lp-captures figure { flex: 0 0 auto; width: min(236px, 64vw); margin: 0; scroll-snap-align: center; }
.lp-captures img { display: block; width: 100%; height: auto; border-radius: 18px; background: #fff; border: 1px solid ${T.pale}; box-shadow: 0 14px 30px rgba(22,6,54,0.14); }
.lp-captures figcaption { margin-top: 12px; font-size: 14px; font-weight: 800; line-height: 1.35; color: ${T.ink}; }

.lp-noir { padding: clamp(64px, 9vw, 104px) 0; background: ${T.ink}; color: #fff; }
.lp-ratures { display: grid; gap: 0; margin: 34px 0 0; padding: 0; list-style: none; border-top: 1px solid rgba(255,255,255,0.12); }
.lp-ratures li { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; padding: 18px 0; border-bottom: 1px solid rgba(255,255,255,0.12); }
.lp-ratures s { justify-self: start; font-size: clamp(1rem, 2.6vw, 1.25rem); font-weight: 700; line-height: 1.35; color: rgba(255,255,255,0.5);
  text-decoration-line: line-through; text-decoration-thickness: 3px; text-decoration-color: rgba(248,113,113,0.35); transition: text-decoration-color .45s ease; }
.lp-ratures span { display: flex; align-items: flex-start; gap: 10px; font-family: var(--font-jakarta), "Plus Jakarta Sans", "DM Sans", system-ui, sans-serif; font-size: clamp(1.25rem, 3.4vw, 1.75rem); font-weight: 800; letter-spacing: -0.02em; word-spacing: .06em; line-height: 1.25; color: #fff; }
.lp-ratures span svg { flex-shrink: 0; margin-top: .25em; color: #6EE7B7; }
.lp-vu .lp-ratures s { text-decoration-color: #F87171; }
.lp-vu .lp-ratures li:nth-child(2) s { transition-delay: .2s; }
.lp-vu .lp-ratures li:nth-child(3) s { transition-delay: .4s; }
.lp-vu .lp-ratures li:nth-child(4) s { transition-delay: .6s; }
.lp-vu .lp-ratures li:nth-child(5) s { transition-delay: .8s; }
.lp-pour-autres { max-width: 20em; margin: 44px 0 0; font-size: clamp(1.7rem, 5vw, 2.9rem); font-weight: 800; letter-spacing: -0.03em; line-height: 1.1; color: #fff; text-wrap: balance; }

.lp-offre { display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px; align-items: center; }
.lp-offre-nombre { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.lp-cent { display: inline-block; padding: .06em .08em 0 .04em; font-size: clamp(7rem, 24vw, 14rem); font-weight: 800; letter-spacing: -0.05em; line-height: 1; font-variant-numeric: tabular-nums;
  background: linear-gradient(135deg, ${T.ink} 0%, ${T.main} 55%, ${T.mid} 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.lp-points { display: flex; gap: 10px; padding-left: 8px; }
.lp-points i { width: 14px; height: 14px; border-radius: 50%; animation: lp-saut 1.6s ease-in-out infinite; }
.lp-points i:nth-child(1) { background: ${T.ink}; }
.lp-points i:nth-child(2) { background: ${T.main}; animation-delay: .18s; }
.lp-points i:nth-child(3) { background: ${T.mid}; animation-delay: .36s; }
@keyframes lp-saut { 0%, 60%, 100% { transform: none; } 30% { transform: translateY(-10px); } }
.lp-formules { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; margin-top: 48px; align-items: start; }
.lp-formule { display: flex; flex-direction: column; gap: 8px; padding: 24px; border-radius: 22px; background: #fff; border: 1px solid ${T.pale}; }
.lp-formule-vedette { border: 2px solid ${T.main}; box-shadow: 0 18px 40px rgba(107,53,196,0.18); }
.lp-formule-badge { align-self: flex-start; padding: 4px 12px; border-radius: 100px; background: ${T.pale}; color: ${T.deep}; font-size: 10.5px; font-weight: 900; letter-spacing: .06em; text-transform: uppercase; }
.lp-formule-vedette .lp-formule-badge { background: linear-gradient(135deg, ${T.main}, ${T.mid}); color: #fff; }
.lp-formule-nom { margin: 6px 0 0; font-size: 1.5rem; font-weight: 800; letter-spacing: -0.02em; color: ${T.ink}; }
.lp-formule-prix { margin: 0; font-size: 1.9rem; font-weight: 900; letter-spacing: -0.03em; color: ${T.main}; font-variant-numeric: tabular-nums; }
.lp-formule-prix span { margin-left: 4px; font-size: 13px; font-weight: 700; letter-spacing: 0; color: ${T.muted}; }
.lp-formule-accroche { margin: 2px 0 6px; font-size: 14px; font-weight: 700; line-height: 1.5; color: ${T.deep}; }
.lp-formule ul { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.lp-formule li { display: flex; align-items: flex-start; gap: 8px; font-size: 13.5px; font-weight: 600; line-height: 1.5; color: ${T.ink}; }
.lp-formule li svg { flex-shrink: 0; margin-top: 3px; color: #10B981; }
.lp-formule li.lp-tout { color: ${T.main}; }
.lp-formule-plus summary { display: flex; align-items: center; gap: 10px; margin: 6px 0 10px; padding: 10px 12px; border-radius: 14px; background: ${T.pale}; color: ${T.deep}; font-size: 13.5px; font-weight: 800; line-height: 1.35; cursor: pointer; list-style: none; transition: background .16s ease, transform .16s ease; }
.lp-formule-plus summary::-webkit-details-marker { display: none; }
.lp-formule-plus summary:hover { background: #E2D2FF; transform: translateY(-1px); }
.lp-formule-plus summary > span:nth-child(2) { flex: 1; }
.lp-formule-plus summary svg { flex-shrink: 0; color: ${T.main}; transition: transform .2s ease; }
.lp-formule-plus[open] summary svg { transform: rotate(180deg); }
.lp-plus-nb { flex-shrink: 0; display: grid; place-items: center; min-width: 38px; height: 30px; padding: 0 8px; border-radius: 100px; background: linear-gradient(135deg, ${T.main}, ${T.mid}); color: #fff; font-size: 13px; font-weight: 900; }
.lp-formule-cta { margin-top: 14px; padding: 13px; font-size: 13.5px; text-transform: uppercase; letter-spacing: .04em; }
.lp-sous-formules { max-width: 44em; margin: 24px auto 0; text-align: center; font-size: 13.5px; font-weight: 700; line-height: 1.6; color: ${T.muted}; }
.lp-liberte { display: grid; gap: 14px; margin-top: 56px; padding: clamp(28px, 5vw, 52px); border-radius: 28px; background: linear-gradient(135deg, ${T.deep} 0%, ${T.main} 100%); color: #fff; }
.lp-liberte .lp-sur { margin: 0; }
.lp-liberte-titre { margin: 0; font-size: clamp(1.6rem, 4.4vw, 2.5rem); font-weight: 800; letter-spacing: -0.03em; line-height: 1.1; color: #fff; }
.lp-liberte p { margin: 0; max-width: 40em; font-size: 1.03rem; line-height: 1.7; font-weight: 500; color: rgba(255,255,255,0.92); }
.lp-liberte .lp-signature { margin-top: 10px; font-size: clamp(2rem, 6.4vw, 3.6rem); font-weight: 800; letter-spacing: -0.02em; word-spacing: .18em; line-height: 1.05; color: #fff; }
.lp-liberte-cta { justify-self: start; margin-top: 10px; }

.lp-engage-grille { display: grid; grid-template-columns: minmax(0, 1fr); gap: 56px; }
.lp-engage { display: grid; gap: 12px; margin: 22px 0 0; padding: 0; list-style: none; }
.lp-engage li { display: flex; align-items: flex-start; gap: 10px; font-size: 1.02rem; font-weight: 700; line-height: 1.5; color: ${T.ink}; }
.lp-engage li svg { flex-shrink: 0; margin-top: 4px; color: #10B981; }
.lp-humains { display: grid; gap: 12px; margin-top: 28px; }
.lp-humains p { margin: 0; padding: 16px 18px; border-radius: 16px; background: ${T.bg}; font-size: .97rem; line-height: 1.6; color: ${T.deep}; }
.lp-humains strong { color: ${T.ink}; }
.lp-faq details { padding: 18px 0; border-bottom: 1px solid ${T.pale}; }
.lp-faq summary { display: flex; justify-content: space-between; gap: 16px; font-size: 1.06rem; font-weight: 900; color: ${T.ink}; cursor: pointer; list-style: none; }
.lp-faq summary::-webkit-details-marker { display: none; }
.lp-faq summary::after { content: "+"; flex-shrink: 0; font-size: 1.5rem; line-height: 1; color: ${T.main}; transition: transform .2s ease; }
.lp-faq details[open] summary::after { transform: rotate(45deg); }
.lp-faq details p { margin: 10px 0 0; font-size: .98rem; line-height: 1.7; font-weight: 500; color: ${T.deep}; }
.lp-etapes { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 0; padding: 0; list-style: none; }
.lp-etapes li { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px 6px 6px; border-radius: 100px; background: ${T.pale}; font-size: 13.5px; font-weight: 800; color: ${T.deep}; }
.lp-etapes span { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: ${T.main}; color: #fff; font-size: 12px; }

.lp-habitants { color: #fff; padding: clamp(64px, 9vw, 104px) 0 0; }
.lp-habitants-grille { display: grid; grid-template-columns: minmax(0, 1fr); gap: 40px; align-items: start; }
.lp-pastilles { display: flex; flex-wrap: wrap; gap: 8px; margin: 24px 0 0; }
.lp-pastilles span { display: inline-flex; align-items: center; gap: 6px; padding: 7px 13px; border-radius: 100px; background: rgba(255,255,255,0.08); border: 1px solid rgba(196,160,244,0.3); font-size: 12.5px; font-weight: 800; color: #fff; }
.lp-pastilles svg { color: #6EE7B7; }
.lp-stores { margin-top: 28px; }
.lp-stores-badges { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; }
.lp-stores-badges img { display: block; height: auto; }
.lp-stores-badges a { display: inline-block; transition: transform .16s ease; }
.lp-stores-badges a:hover { transform: translateY(-2px); }
.lp-store-bientot { display: inline-block; opacity: .55; }
.lp-stores-note { margin: 8px 0 0; font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.75); }
.lp-habitants-form { padding: 26px 22px; border-radius: 22px; background: rgba(255,255,255,0.06); border: 1.5px solid rgba(255,255,255,0.12); }
.lp-habitants-phrase { margin: 0 0 18px; font-size: 15px; font-weight: 600; line-height: 1.6; color: rgba(255,255,255,0.92); }
.lp-form { margin: 0; }
.lp-form-envoi { width: 100%; margin-top: 4px; padding: 14px; border: 0; border-radius: 100px; background: linear-gradient(135deg, ${T.light}, ${T.mid}); color: ${T.ink}; font-family: inherit; font-size: 14px; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; cursor: pointer; transition: opacity .15s ease; }
.lp-form-envoi:disabled { background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.5); cursor: not-allowed; }
.lp-fin { padding-top: clamp(64px, 9vw, 96px); padding-bottom: 40px; text-align: center; }
.lp-fin-texte { max-width: 40em; margin: 0 auto; font-size: 1.03rem; line-height: 1.7; font-weight: 500; color: rgba(255,255,255,0.88); }
.lp-fin-cta { margin: 40px 0 0; }
.lp-reseaux { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 30px; }
.lp-reseaux a { padding: 11px 20px; border-radius: 100px; background: rgba(255,255,255,0.1); border: 1.5px solid rgba(196,160,244,0.5); color: #fff; font-size: 13.5px; font-weight: 800; text-decoration: none; }
.lp-pied { margin-top: 52px; font-size: 11.5px; line-height: 1.7; color: rgba(255,255,255,0.62); }
.lp-pied p { margin: 8px 0 0; }
.lp-pied a { color: inherit; text-decoration: none; border-bottom: 1px solid rgba(255,255,255,0.25); }

.lp-hero-offre { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; max-width: 34em; margin: -12px 0 26px; padding: 10px 14px; border-radius: 14px; background: rgba(110,231,183,0.12); border: 1px solid rgba(110,231,183,0.4); font-size: 14px; font-weight: 700; line-height: 1.45; color: #fff; }
.lp-hero-offre span { padding: 3px 9px; border-radius: 100px; background: #6EE7B7; color: #064E3B; font-size: 10.5px; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; }

.lp-rappel { padding: clamp(64px, 9vw, 104px) 0; background: linear-gradient(135deg, ${T.deep} 0%, ${T.main} 70%, ${T.mid} 100%); color: #fff; }
.lp-rappel-grille { display: grid; grid-template-columns: minmax(0, 1fr); gap: 40px; align-items: center; }
.lp-rappel-offre { max-width: 34em; margin: 22px 0 0; padding: 12px 16px; border-radius: 14px; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.25); font-size: .98rem; font-weight: 600; line-height: 1.5; }
.lp-rappel-offre strong { color: #6EE7B7; }
.lp-btn-whatsapp { margin-top: 26px; background: #25D366; color: #063B1F; box-shadow: 0 10px 26px rgba(37,211,102,0.35); }
.lp-rappel-tel { margin: 12px 0 0; font-size: 14px; font-weight: 700; color: rgba(255,255,255,0.8); }
.lp-rappel-tel a { color: #fff; text-decoration: none; border-bottom: 1px solid rgba(255,255,255,0.4); }
.lp-rappel-carte { padding: 26px 22px; border-radius: 24px; background: rgba(22,6,54,0.55); border: 1.5px solid rgba(255,255,255,0.18); }
.lp-rappel-carte form { margin: 0; }
.lp-rappel-quoi { margin: 0 0 10px; font-size: 12px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; color: ${T.light}; }
.lp-rappel-motifs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.lp-rappel-motif { padding: 10px 14px; border-radius: 100px; border: 1.5px solid rgba(196,160,244,0.5); background: rgba(255,255,255,0.06); color: #fff; font-family: inherit; font-size: 13.5px; font-weight: 800; cursor: pointer; transition: background .15s ease; }
.lp-rappel-motif[aria-checked="true"] { background: #fff; border-color: #fff; color: ${T.deep}; }
.lp-rappel-motif:focus-visible { outline: 3px solid ${T.light}; outline-offset: 2px; }
.lp-rappel-duo { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 10px; }
.lp-rappel-erreur { margin: 12px 0 0; text-align: center; font-size: 12.5px; font-weight: 700; color: #FCA5A5; }
.lp-rappel-rgpd { margin: 12px 0 0; text-align: center; font-size: 11.5px; color: rgba(255,255,255,0.7); }
.lp-rappel-merci { display: grid; gap: 14px; text-align: center; }
.lp-rappel-merci p { margin: 0; color: rgba(255,255,255,0.9); line-height: 1.6; }
.lp-rappel-merci .lp-rappel-merci-titre { font-family: var(--font-jakarta), "Plus Jakarta Sans", "DM Sans", system-ui, sans-serif; font-size: 1.7rem; font-weight: 800; color: #fff; }

.lp-pouce { display: none; }

@media (max-width: 1180px) {
  .lp-bulle-1, .lp-bulle-3 { left: -12%; }
  .lp-bulle-2, .lp-bulle-4 { right: -12%; }
}
@media (max-width: 560px) {
  .lp-bulle { max-width: 190px; padding: 8px 11px; font-size: 11.5px; }
  .lp-bulle i { width: 28px; height: 28px; }
  .lp-bulle-1, .lp-bulle-3 { left: -10%; }
  .lp-bulle-2, .lp-bulle-4 { right: -10%; }
  .lp-btn { width: 100%; padding: 15px 18px; font-size: 14.5px; }
  .lp-liberte-cta { justify-self: stretch; }
  .lp-onglets { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .lp-onglet { padding: 10px 12px; font-size: 12.5px; line-height: 1.3; }
  .lp-champs { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .lp-champ, .lp-champ-saisie { min-width: 0; }
  .lp-champ input { width: 100%; }
  .lp-champ label { font-size: 10.5px; letter-spacing: .05em; }
  .lp-champ-saisie { padding: 0 12px; }
  .lp-champ input { padding: 12px 0; font-size: 19px; }
  .lp-champ-saisie span { font-size: 12.5px; }
  .lp-calcul { padding: 18px 16px; }
  .lp-atout { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 14px; align-items: center; padding: 20px 18px; }
  .lp-atout-icone { width: 40px; height: 40px; border-radius: 12px; }
  .lp-atout h3 { margin: 0; font-size: 1.22rem; }
  .lp-atout p { grid-column: 1 / -1; margin-top: 10px; }
  .lp-metiers span { padding: 6px 11px; font-size: 12.5px; }
  .lp-pour-autres { font-size: 1.6rem; }
  .lp-ratures li { padding: 14px 0; }
}
@media (max-width: 760px) {
  .lp-pouce { position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; display: flex; gap: 8px; padding: 10px 12px calc(10px + env(safe-area-inset-bottom)); background: rgba(22,6,54,0.96); border-top: 1px solid rgba(196,160,244,0.3); box-shadow: 0 -10px 24px rgba(10,2,30,0.35); transform: translateY(110%); transition: transform .3s ease; }
  .lp-pouce-on { transform: none; }
  .lp-pouce a { display: flex; flex: 1; align-items: center; justify-content: center; padding: 13px 10px; border-radius: 100px; font-size: 14px; font-weight: 900; text-align: center; text-decoration: none; }
  .lp-pouce .lp-pouce-principal { flex: 1.35; background: linear-gradient(135deg, ${T.light}, ${T.mid}); color: ${T.ink}; }
  .lp-pouce .lp-pouce-secondaire { color: #fff; box-shadow: inset 0 0 0 1.5px rgba(255,255,255,0.45); }
  .lp-fin { padding-bottom: 110px; }
}
@media (min-width: 720px) {
  .lp-atouts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (min-width: 900px) {
  .lp-hero-grille { grid-template-columns: minmax(0, 1.2fr) minmax(0, .8fr); padding-top: 72px; padding-bottom: 96px; }
  .lp-formules { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .lp-offre { grid-template-columns: auto minmax(0, 1fr); gap: 40px; }
  .lp-engage-grille { grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); gap: 72px; }
  .lp-habitants-grille { grid-template-columns: minmax(0, 1.1fr) minmax(0, .9fr); gap: 64px; }
  .lp-ratures li { grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr); align-items: center; gap: 32px; }
  .lp-rappel-grille { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 64px; }
}
@media (prefers-reduced-motion: reduce) {
  .lp *, .lp *::before, .lp *::after { animation: none !important; transition: none !important; }
  .lp-bande-piste { flex-wrap: wrap; width: auto; justify-content: center; row-gap: 12px; }
  .lp-bande-piste-moitie { flex-wrap: wrap; justify-content: center; row-gap: 12px; }
  .lp-bande-double { display: none; }
  .lp-pique { white-space: normal; }
}
`
