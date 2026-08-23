'use client'
// Kit de partage commerçant (Ch3) — partie interactive : copie du lien, partage
// natif, téléchargement du QR, 3 tons de message. Le lien ?ref attribue chaque
// inscription au commerçant (widget d'impact).

import { useState } from 'react'
import { avantLancement, libelleLancement } from '@/lib/lancement'
import { telechargerAffichePng, telechargerAffichePdf } from '@/lib/affiche-kit'
import YoppaaLogo from '@/app/components/YoppaaLogo'
import ConsigneGoogle from '@/app/components/ConsigneGoogle'

const T = {
  bgTop: '#160636', deep: '#2D0F6B', ink: '#1A0840',
  main: '#6B35C4', mid: '#9660E0', light: '#C4A0F4', green: '#10B981', greenLight: '#6EE7B7',
}

// Textes de partage, trois tons.
//
// ⚠️ ILS NE SE DÉCLINENT PLUS PAR PHASE. Il y en avait deux jeux, un avant
// l'ouverture et un après, et le premier portait la date. Un message part
// dans une conversation ou sur une page Facebook : il n'est pas rattrapable.
//
// ⚠️ TEXTES GÉNÉRIQUES, PLUS AUCUNE DATE (Alex, 22/08 : « il ne faut pas parler
// du 1er octobre, il faut des textes génériques pour inviter les autres
// commerçants et les Yoppers à rejoindre la tribu, rien de plus »).
//
// Un message collé sur une page Facebook y reste des mois. « Le 1er octobre,
// notre quartier tient dans ta poche » devenait faux le 2 octobre, et le
// commerçant n'allait pas repasser derrière ses publications pour les corriger.
//
// ⚠️ ET JAMAIS « AUCUNE COMMISSION » SANS SON SUJET : Yoppaa ne prend pas de
// commission sur les ventes, ce qui ne dit rien des frais du prestataire de
// paiement. La phrase doit nommer Yoppaa, sinon elle promet à sa place.
const TEXTES = [
  { cle: 'clients', label: 'Pour tes clients',
    texte: 'On est sur Yoppaa 🟣 Commande chez nous depuis l’app, c’est prêt quand tu arrives :' },
  { cle: 'commercant', label: 'Pour un autre commerçant',
    texte: 'On est sur Yoppaa, l’app de notre commune : Yoppaa ne prend aucune commission sur nos ventes. Jette un œil :' },
  { cle: 'court', label: 'Version courte',
    texte: 'Tous les commerces de ta commune dans une seule app. Retrouve-nous sur Yoppaa :' },
]

// ⚠️ LA PAGE N'AVAIT AUCUNE SORTIE (Alex, 22/08 : « quand tu ouvres le kit il
// n'y a pas de bouton pour quitter cette page »). Elle s'ouvre depuis le
// tableau de bord dans un onglet neuf, donc sans historique : le bouton
// « précédent » du navigateur était grisé, et sur une application installée il
// n'y a même pas de barre d'adresse. Le commerçant était enfermé.
//
// ⚠️ ELLE FERME L'ONGLET SI ELLE PEUT, sinon elle ramène au tableau de bord.
// `window.close()` n'aboutit que sur un onglet ouvert par script : ouvert à la
// main ou restauré au démarrage, il ne fait rien du tout, et un bouton qui ne
// fait rien est pire que pas de bouton.
function CroixSortie() {
  function sortir() {
    const ouvertParYoppaa = typeof window !== 'undefined' && window.opener
    if (ouvertParYoppaa) { window.close(); return }
    window.location.href = '/dashboard'
  }
  return (
    <button onClick={sortir} aria-label="Fermer le kit"
      style={{
        position: 'fixed', top: 'max(14px, env(safe-area-inset-top))', right: 14, zIndex: 20,
        width: 40, height: 40, borderRadius: '50%', border: `1px solid ${T.main}`,
        // ⚠️ AUCUN FLOU DE FOND, et c'est le banc qui me l'a rappelé. Sur iOS,
        // `backdrop-filter` sur un élément fixe fait recalculer le fond à chaque
        // image du défilement : c'est exactement ce qui gelait l'application, et
        // ce qui a été purgé le 22/08. Un aplat opaque fait le même travail.
        background: T.deep, color: '#fff', cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
      }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <path d="M6 6l12 12M18 6L6 18"/>
      </svg>
    </button>
  )
}

function IconShare() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>
    </svg>
  )
}
function IconCopy() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  )
}

export default function KitClient({ slug, kit, lien, qr, consigne = null }) {
  const [copie, setCopie] = useState(null)
  // Le blanc par défaut : c'est celui qu'un commerçant imprime lui-même sans
  // vider une cartouche par affiche.
  const [fondClair, setFondClair] = useState(true)
  const [enCours, setEnCours] = useState(null)
  const [erreurTelechargement, setErreurTelechargement] = useState(null)

  // ⚠️ UN ÉCHEC SE DIT. Le téléchargement compose un canvas et charge une
  // police : si quelque chose casse, un bouton qui ne fait rien laisse le
  // commerçant cliquer trois fois sans comprendre.
  async function telecharger(quoi) {
    if (enCours) return
    setEnCours(quoi); setErreurTelechargement(null)
    try {
      const commun = { qrDataUrl: qr, nomCommerce: kit?.nom || '', clair: fondClair, slug }
      const fait = quoi === 'png'
        ? await telechargerAffichePng(commun)
        : await telechargerAffichePdf({ ...commun, format: quoi })
      if (!fait) setErreurTelechargement('Le QR n’est pas prêt, recharge la page.')
    } catch (e) {
      console.error('[kit] téléchargement affiche', e)
      setErreurTelechargement('Téléchargement impossible, réessaie.')
    }
    setEnCours(null)
  }

  async function copier(texte, cle) {
    try { await navigator.clipboard.writeText(texte); setCopie(cle); setTimeout(() => setCopie(null), 2200) } catch { /* clipboard indispo */ }
  }
  async function partager(texte, cle) {
    const data = { title: 'Yoppaa', text: texte, url: lien }
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share(data) } catch { /* annulé */ }
    } else {
      copier(`${texte} ${lien}`, cle)
    }
  }

  const wrap = { minHeight: '100svh', background: `linear-gradient(160deg, ${T.bgTop} 0%, ${T.deep} 55%, ${T.ink} 100%)`, fontFamily: '"DM Sans", system-ui, sans-serif', padding: '2rem 1rem 3rem' }

  if (!kit) {
    return (
      <div style={{ ...wrap, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
        <div style={{ textAlign: 'center', color: '#fff', maxWidth: 420 }}>
          <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '2rem', letterSpacing: '-0.05em', marginBottom: 14 }}>yoppaa</p>
          <p style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 8 }}>Kit introuvable</p>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem' }}>Ce lien de kit n&apos;existe pas (ou plus). Vérifie l&apos;adresse.</p>
        </div>
      </div>
    )
  }

  const btnBase = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '9px 14px', borderRadius: 100, fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', border: 'none' }
  // La phase ne pilote plus les TEXTES, seulement ce que la page dit au
  // commerçant sur sa destination : les messages, eux, valent en tout temps.
  const preLancement = avantLancement()
  const ouverture = libelleLancement()

  return (
    <div style={wrap}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
      <CroixSortie/>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>

        {/* En-tête : logo canonique (wordmark + 5 dots V2-B + slogan) */}
        <div style={{ textAlign: 'center', marginBottom: '1.4rem' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
            <YoppaaLogo size={30} mode="dark" withSlogan/>
          </div>
          <p style={{ fontSize: '0.72rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '1.5px', margin: '0 0 6px' }}>Ton kit de partage</p>
          <h1 style={{ fontWeight: 900, fontSize: '1.5rem', color: '#fff', letterSpacing: '-0.5px', margin: 0 }}>{kit.nom}</h1>
          {kit.commune && <p style={{ margin: '4px 0 0', fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>{kit.commune}</p>}
        </div>

        {/* Impact : le compteur d'inscrits n'a de sens que pendant la phase de
            recrutement. Après le lancement, il devient un chiffre orphelin.

            ⚠️ ET UN ZÉRO N'EST PAS UN COMPTEUR, C'EST UN REPROCHE. « 0 personne
            inscrite grâce à toi » est la première chose que voit un commerçant
            qui ouvre son kit pour la toute première fois, c'est-à-dire AVANT
            d'avoir pu partager quoi que ce soit. Même raisonnement que sur la
            landing le 20/08, où les petits comptes ont cédé la place à quelque
            chose qui avance : on ne ment pas, on ne montre simplement pas un
            zéro là où il n'y a encore rien à compter. */}
        {preLancement && (
          <div style={{ textAlign: 'center', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, borderRadius: 18, padding: '18px', marginBottom: 16, boxShadow: `0 8px 26px ${T.main}55` }}>
            {kit.impact > 0 ? (
              <>
                <p style={{ margin: 0, fontSize: '2.6rem', fontWeight: 900, color: '#fff', letterSpacing: '-1.5px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{kit.impact}</p>
                <p style={{ margin: '6px 0 0', fontSize: '0.88rem', fontWeight: 700, color: 'rgba(255,255,255,0.95)' }}>
                  {kit.impact === 1 ? 'personne inscrite grâce à toi 🟣' : 'personnes inscrites grâce à toi 🟣'}
                </p>
              </>
            ) : (
              <>
                <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.4px', lineHeight: 1.3 }}>
                  Ton lien est prêt 🟣
                </p>
                {/* ⚠️ CETTE PHRASE PROMETTAIT UNE ATTRIBUTION QUI N'EXISTE PLUS.
                    Elle disait « chaque personne qui s'inscrit par ce lien
                    apparaîtra ici » : vrai tant que le lien menait à la page
                    d'inscription, faux depuis qu'il ouvre la fiche (23/08). Le
                    compteur au-dessus, lui, reste vrai — il totalise ce qui a
                    été attribué jusqu'ici, et il ne s'affiche qu'à partir de 1. */}
                <p style={{ margin: '6px 0 0', fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.9)', lineHeight: 1.5 }}>
                  Partage-le : il ouvre ta page, là où l&apos;on commande chez toi.
                </p>
              </>
            )}
          </div>
        )}

        {/* Lien tracké */}
        <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <p style={{ margin: '0 0 8px', fontSize: '0.8rem', fontWeight: 800, color: '#fff' }}>Ton lien personnel</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <code style={{ flex: '1 1 220px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: T.light, fontSize: '0.82rem', background: 'rgba(0,0,0,0.25)', padding: '9px 12px', borderRadius: 10 }}>{lien.replace('https://', '')}</code>
            <button onClick={() => copier(lien, 'lien')} style={{ ...btnBase, background: '#fff', color: T.main }}>
              <IconCopy/> {copie === 'lien' ? 'Copié !' : 'Copier'}
            </button>
          </div>
          {/* ⚠️ « Chaque inscription via ce lien t'est attribuée » n'est plus
              vrai : le lien ouvre la fiche, pas la page d'inscription. */}
          <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)' }}>Il ouvre ta page, là où l&apos;on commande chez toi.</p>
        </div>

        {/* ⚠️ 🔴 C'EST L'AFFICHE QUI SE TÉLÉCHARGE, PLUS LE QR NU (Alex, 23/08 :
            « il faut juste mettre le même visuel à télécharger dans le kit, pas
            le QR en solo comme maintenant »).

            Cette page ne proposait qu'un carré noir et blanc, sans logo, sans
            nom de commerce et sans accroche. Le commerçant le collait tel quel
            en vitrine : rien n'y disait ce qu'on scanne, ni chez qui.

            ⚠️ ET C'EST LE MÊME DESSIN QUE LE TABLEAU DE BORD, pas une copie :
            `lib/affiche-kit.js` le produit pour les deux. Deux visuels destinés
            au même mur auraient divergé au premier réglage. */}
        {qr && (
          <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 16, marginBottom: 16, textAlign: 'center' }}>
            <p style={{ margin: '0 0 12px', fontSize: '0.8rem', fontWeight: 800, color: '#fff' }}>Ton affiche de vitrine</p>

            {/* display block + marges auto : un reset global qui passe les
                images en block les collerait à gauche malgré le text-align. */}
            <img decoding="async" loading="lazy" src={qr} alt="QR code Yoppaa" style={{ width: 170, height: 170, borderRadius: 12, background: '#fff', padding: 8, display: 'block', margin: '0 auto' }}/>
            {/* ⚠️ PLUS DE PHRASE À DEUX VERSIONS : le scan fait la même chose
                aujourd'hui et dans six mois, et un QR imprimé ne se rattrape
                pas. Il disait « chaque scan inscrit un habitant » tant qu'on
                était avant le 1er octobre. */}
            <p style={{ margin: '10px 0 14px', fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
              Affiche-la en vitrine : un scan et le client arrive sur ta page, prêt à commander.
            </p>

            {/* Le fond, au choix : le blanc s'imprime chez soi sans vider une
                cartouche, le violet se remarque de loin. */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {[{ clair: true, label: 'Fond blanc' }, { clair: false, label: 'Fond violet' }].map(o => (
                <button key={o.label} onClick={() => setFondClair(o.clair)}
                  style={{ ...btnBase, flex: 1, background: fondClair === o.clair ? '#fff' : 'rgba(255,255,255,0.10)', color: fondClair === o.clair ? T.main : '#fff' }}>
                  {o.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => telecharger('png')} disabled={!!enCours}
                style={{ ...btnBase, flex: '1 1 100%', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff' }}>
                {enCours === 'png' ? 'Préparation…' : 'Télécharger en PNG'}
              </button>
              <button onClick={() => telecharger('A5')} disabled={!!enCours}
                style={{ ...btnBase, flex: 1, background: 'rgba(255,255,255,0.12)', color: '#fff' }}>
                {enCours === 'A5' ? '…' : 'PDF A5'}
              </button>
              <button onClick={() => telecharger('A4')} disabled={!!enCours}
                style={{ ...btnBase, flex: 1, background: 'rgba(255,255,255,0.12)', color: '#fff' }}>
                {enCours === 'A4' ? '…' : 'PDF A4'}
              </button>
            </div>
            {erreurTelechargement && (
              <p style={{ margin: '10px 0 0', fontSize: '0.72rem', color: '#FCA5A5', fontWeight: 600 }}>{erreurTelechargement}</p>
            )}
          </div>
        )}

        {/* ─── LA FICHE GOOGLE ────────────────────────────────────────────
            ⚠️ DEMANDE D'ALEX (24/08). L'affiche touche ceux qui passent devant
            la vitrine ; la fiche Google touche ceux qui CHERCHENT. Coller ce
            lien dans son profil Google lui donne un bouton de commande dans la
            Recherche et dans Maps, en deux minutes et sans nous. Le seul
            obstacle, c'etait que personne ne le lui avait dit. */}
        {consigne && (
          <div style={{ marginBottom: 16 }}>
            <ConsigneGoogle consigne={consigne} sombre/>
          </div>
        )}

        {/* Textes de partage */}
        <p style={{ margin: '0 0 10px', fontSize: '0.8rem', fontWeight: 800, color: '#fff' }}>Messages prêts à partager</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {TEXTES.map(t => (
            <div key={t.cle} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 14 }}>
              <p style={{ margin: '0 0 6px', fontSize: '0.68rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t.label}</p>
              <p style={{ margin: '0 0 12px', fontSize: '0.88rem', color: 'rgba(255,255,255,0.95)', lineHeight: 1.5 }}>{t.texte}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => partager(t.texte, t.cle)} style={{ ...btnBase, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', flex: 1 }}>
                  <IconShare/> Partager
                </button>
                <button onClick={() => copier(`${t.texte} ${lien}`, t.cle)} style={{ ...btnBase, background: 'rgba(255,255,255,0.10)', color: '#fff' }}>
                  <IconCopy/> {copie === t.cle ? 'Copié !' : 'Copier'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* ⚠️ CETTE PHRASE PROMETTAIT UN SEUIL QUI N'EXISTE PLUS. « Ta commune
            atteint son objectif et se lance » date du démarrage commune par
            commune, abandonné le 16/08 : les 260 communes wallonnes sont
            ouvertes, aucune n'a de palier à franchir. Voir
            project_wallonie_ouverte. */}
        <p style={{ margin: '1.6rem 0 0', textAlign: 'center', fontSize: '0.76rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
          {preLancement
            ? `Le ${ouverture}, tu ouvres avec une clientèle déjà prête. Tout ce que tu partages d’ici là compte. 🟣`
            : 'Une phrase au comptoir vaut dix publications. 🟣'}
        </p>
      </div>
    </div>
  )
}
