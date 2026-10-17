'use client'
// ─── « Dis-lui ce que tu voudrais », une seule fois, en bas de la fiche ──────
//
// 🔴 « LES SIGNAUX YOPPER DOIVENT TOUS ÊTRE DANS LE BAS DE LA PAGE DU
// COMMERÇANT, PHRASE SIMPLE, CLAIRE ET EFFICACE » (Alex, 26/08).
//
// ⚠️ CE QUE ÇA REMPLACE : jusqu'à QUATRE bandeaux sombres pleine largeur,
// dispersés du haut au bas de la fiche. Le premier arrivait sous les
// coordonnées, avant même le catalogue : l'habitant qui venait juste voir les
// horaires se faisait interpeller par un panneau noir qui lui demandait de
// réclamer une carte de fidélité. Trois autres l'attendaient plus bas.
//
// ⚠️ ET CHACUN RÉPÉTAIT LE MÊME TITRE. « Dis-lui ce que tu voudrais » trois
// fois sur une même page, ce n'est plus une invitation, c'est une insistance.
// Un seul bloc, une seule phrase, et les envies en boutons : l'habitant lit
// une fois, choisit ce qui le concerne, et s'en va.
//
// ⚠️ RIEN À DEMANDER → RIEN DU TOUT. Chez un commerce qui propose déjà tout,
// ce composant ne rend rien : pas de cadre vide, pas de titre orphelin.

import { useState } from 'react'
import { fetchAvecPreuveSiConnecte } from '@/lib/fetch-yopper'
import { nomPorteChez, chezLeCommerce } from '@/lib/nom-commerce'

const T = {
  bgPanel: '#160636',
  main:    '#6B35C4',
  light:   '#C4A0F4',
  deep:    '#2D0F6B',
}

// Le mot du BOUTON, à la première personne : un habitant ne pense pas
// « j'envoie une envie », il pense « je veux pouvoir commander ici ».
// ⚠️ Ce sont SES mots, jamais le vocabulaire du produit : pas de « formule »,
// pas de « débloquer », pas de nom de forfait.
// ⚠️ LES LIBELLÉS SONT CEUX D'ALEX (27/08), et ils nomment LE SERVICE, pas le
// geste. « Commander ici » disait ce que l'habitant ferait ; « Commande en
// ligne » dit ce qui manque au commerce. C'est la même liste que celle qu'un
// commerçant lit dans son tableau de bord : les deux côtés parlent enfin des
// mêmes choses.
//
// ⚠️ « Voir les prix » A DISPARU. Sa condition était `!canDo(plan,
// 'prix_affiches')`, or les TROIS forfaits affichent les prix : le bouton
// n'a jamais pu s'afficher chez personne. Le type `prix` reste dans
// `TYPES_ENVIE`, pour que d'anciens signaux gardent un nom.
const BOUTONS = {
  commande:  'Commande en ligne',
  livraison: 'Livraison',
  rdv:       'Prendre rendez-vous',
  fidelite:  'Carte de fidélité',
  deals:     'Bonnes affaires, deals et actus',
  // ⚠️ LE MOT DE L'HABITANT, PAS LE NÔTRE. Il ne réclame pas « l'anti-gaspi »,
  // qui est du vocabulaire de produit : il aimerait pouvoir passer en fin de
  // journée récupérer ce qui reste. Proposé aux seuls alimentaires.
  invendus:  'Invendus de fin de journée',
}

// ─── L'ÉTAT DES ENVIES, PARTAGÉ PAR LA LIGNE, LA BULLE ET LE BLOC ──────────
//
// ✅ 17/10 : la ligne en tête de carte envoie la même envie que le bloc d'en
// bas. Si chacun gardait sa propre trace, le Yopper qui a dit « oui » en haut
// retrouverait en bas le même bouton, intact, comme si rien n'était parti. La
// fiche tient donc UN état et le passe aux trois.
export function useEnviesYopper(commercant) {
  // ⚠️ UN ENVOI PAR TYPE, ET ON GARDE LA TRACE. Sans ça, cliquer sur « Être
  // livré » ferait passer les six boutons en « transmis » : le Yopper croirait
  // avoir demandé six choses qu'il n'a pas demandées.
  const [envoyes, setEnvoyes] = useState([])
  const [enCours, setEnCours] = useState(null)

  async function envoyer(type) {
    if (!commercant || enCours || envoyes.includes(type)) return
    setEnCours(type)
    try {
      // L'anti-spam d'une envie par semaine vit côté serveur : il était dans le
      // navigateur, donc contournable, et la table n'y est plus insérable.
      // ⚠️ AVEC LA PREUVE SI ELLE EXISTE (15/09) : le serveur n'attribue plus une
      // envie qu'à une identité prouvée. Sans session, elle part anonyme.
      await fetchAvecPreuveSiConnecte('/api/signaux', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'envie', feature: type, commercant_id: commercant.id }),
      })
    } catch (e) {
      // ⚠️ LE REMERCIEMENT S'AFFICHE QUAND MÊME, et c'est un choix. Le Yopper
      // n'a rien à faire d'une erreur réseau sur un geste sans conséquence
      // pour lui ; le refaire au prochain passage ne coûte rien.
    }
    setEnCours(null)
    setEnvoyes(prev => [...prev, type])
  }

  return { envoyes, enCours, envoyer }
}

// `eclaire` est un COMPTEUR : chaque passage par la ligne ou la bulle remonte
// le cadre (clé changée), et l'éclat rejoue même au deuxième appui.
export default function SignauxYopper({ types = [], commercant, etat, eclaire = 0 }) {
  const local = useEnviesYopper(commercant)
  const { envoyes, enCours, envoyer } = etat || local

  const proposables = (types || []).filter(t => BOUTONS[t])
  if (!commercant || proposables.length === 0) return null

  const tousEnvoyes = proposables.every(t => envoyes.includes(t))

  return (
    <div style={{ padding: '0 12px', marginTop: 24 }}>
      {/* ⚠️ LE BLOC S'ALLUME UN INSTANT quand la ligne ou la bulle y amène :
          arrivé au bas d'une longue fiche, l'œil doit savoir où se poser. */}
      <style>{`@keyframes enviesEclat { 0% { box-shadow: 0 0 0 0 ${T.main}00 } 30% { box-shadow: 0 0 0 6px ${T.light} } 100% { box-shadow: 0 0 0 0 ${T.main}00 } } @media (prefers-reduced-motion: reduce) { .envies-eclat { animation: none !important } }`}</style>
      <div key={eclaire} className={eclaire ? 'envies-eclat' : undefined} style={{ background: `linear-gradient(135deg, ${T.bgPanel} 0%, ${T.deep} 100%)`, borderRadius: 16, padding: '16px 18px', position: 'relative', overflow: 'hidden', fontFamily: '"DM Sans", sans-serif', animation: eclaire ? 'enviesEclat 1.4s ease-out 2' : undefined }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 90% 20%, ${T.main}44 0%, transparent 55%)`, pointerEvents: 'none' }}/>
        <div style={{ position: 'relative' }}>
          <p style={{ fontSize: '0.6rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 6px', opacity: 0.85 }}>
            Dis-lui ce que tu voudrais
          </p>
          {/* ⚠️ UNE PHRASE, SIMPLE, ET ELLE PART DE LUI. Mots d'Alex, 27/08.
              Pas « demande à ce commerçant d'activer », qui place l'habitant en
              pétitionnaire et parle le vocabulaire interne du produit : on
              nomme un SERVICE EN PLUS, et on dit que ça tient en un clic. */}
          {/* ⚠️ « chez Chez Momo », ENCORE (17/09, vu par Alex sur une capture).
              Ce cas-ci avait échappé au premier passage : le nom est enveloppé
              dans un `<strong>`, et le motif cherché était « chez » suivi
              directement de la variable, sans balise au milieu. On ne pose donc
              pas la locution toute faite de `chezLeCommerce`, qui rendrait du
              texte brut : on décide juste du PRÉFIXE, et le nom reste en gras.
              ⚠️ Et un commentaire JSX ne se glisse pas entre le `?` et le `:`
              d'un ternaire : c'est une erreur de syntaxe, elle vient d'arriver. */}
          <p style={{ fontSize: 14.5, fontWeight: 700, color: '#fff', lineHeight: 1.45, margin: '0 0 4px', letterSpacing: '-0.2px' }}>
            {tousEnvoyes
              ? <>C&rsquo;est transmis à <strong>{commercant.nom}</strong> 🟣</>
              : <>Tu aimerais un service en plus {nomPorteChez(commercant.nom) ? '' : 'chez '}<strong>{commercant.nom}</strong>&nbsp;?</>}
          </p>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: T.light, lineHeight: 1.5, margin: '0 0 12px', opacity: 0.9 }}>
            {tousEnvoyes
              ? 'Il verra combien d’habitants le demandent. Merci d’avoir pris trente secondes.'
              : 'Demande-le-lui en cliquant ci-dessous. On ne lui donne jamais ton nom.'}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {proposables.map(type => {
              const fait = envoyes.includes(type)
              const attend = enCours === type
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => envoyer(type)}
                  disabled={fait || !!enCours}
                  aria-label={fait ? `${BOUTONS[type]} : c'est transmis` : BOUTONS[type]}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px', borderRadius: 100,
                    background: fait ? 'rgba(255,255,255,0.12)' : '#fff',
                    color: fait ? '#fff' : T.main,
                    border: fait ? '1.5px solid rgba(255,255,255,0.35)' : 'none',
                    fontWeight: 800, fontSize: 12.5, fontFamily: '"DM Sans", sans-serif',
                    cursor: fait || enCours ? 'default' : 'pointer',
                    opacity: attend ? 0.6 : 1,
                    transition: 'all 0.15s',
                  }}>
                  {fait && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M5 12l5 5L20 7"/>
                    </svg>
                  )}
                  {attend ? 'Envoi…' : BOUTONS[type]}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── LA LIGNE EN TÊTE DE CARTE ──────────────────────────────────────────────
//
// ✅ ALEX, 17/10 (tableau) : là où l'envie naît, en lisant un menu qu'on ne
// peut pas commander. Une phrase, un bouton qui envoie l'envie en un clic, et
// « D'autres envies ? » (son mot) qui descend au bloc.
// ⚠️ CLAIRE, JAMAIS UN PANNEAU SOMBRE : le 26/08, Alex a retiré les bandeaux
// noirs du haut de la fiche. Celle-ci informe d'abord (pas de commande en
// ligne ici) et ne demande qu'ensuite.
const PHRASE_EN_TETE = {
  commande: 'Pas encore de commande en ligne',
  rdv:      'Pas encore de rendez-vous en ligne',
}

export function AppelEnvieCarte({ type, commercant, etat, onAutresEnvies }) {
  if (!commercant || !PHRASE_EN_TETE[type]) return null
  const { envoyes, enCours, envoyer } = etat
  const fait = envoyes.includes(type)
  const attend = enCours === type
  return (
    <div style={{ margin: '12px 12px 0', padding: '12px 14px', borderRadius: 14, background: '#F5EEFF', border: `1px solid ${T.main}26`, fontFamily: '"DM Sans", sans-serif' }}>
      <p style={{ margin: '0 0 10px', fontSize: 13.5, fontWeight: 700, color: T.bgPanel, lineHeight: 1.45 }}>
        {fait
          ? <>C&rsquo;est transmis à <strong>{commercant.nom}</strong> 🟣</>
          : <>{PHRASE_EN_TETE[type]} {chezLeCommerce(commercant.nom)}. Tu aimerais&nbsp;?</>}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        {!fait && (
          <button type="button" onClick={() => envoyer(type)} disabled={!!enCours}
            style={{ padding: '8px 16px', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.main}, #9660E0)`, color: '#fff', fontWeight: 800, fontSize: 12.5, fontFamily: '"DM Sans", sans-serif', cursor: enCours ? 'default' : 'pointer', opacity: attend ? 0.6 : 1 }}>
            {attend ? 'Envoi…' : 'Oui, dis-le-lui'}
          </button>
        )}
        <button type="button" onClick={onAutresEnvies}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 2px', border: 'none', background: 'none', color: T.main, fontWeight: 800, fontSize: 12.5, fontFamily: '"DM Sans", sans-serif', cursor: 'pointer' }}>
          D&rsquo;autres envies&nbsp;?
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>
        </button>
      </div>
    </div>
  )
}

// ─── LA BULLE FLOTTANTE ─────────────────────────────────────────────────────
//
// ✅ ALEX, 17/10 (tableau). Quand elle se montre, c'est `bulleEnviesVisible`
// qui le dit (lib/signaux.js) : jamais en même temps que la ligne, plus du tout
// une fois le bloc vu, refusée ou une envie partie.
export function BulleEnvies({ commercant, onOuvrir, onFermer }) {
  if (!commercant) return null
  return (
    <div role="complementary" aria-label="Tes envies pour ce commerce"
      style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(18px + env(safe-area-inset-bottom, 0px))', zIndex: 55, width: 'calc(100% - 32px)', maxWidth: 380, display: 'flex', alignItems: 'center', gap: 4, padding: 4, borderRadius: 100, background: `linear-gradient(135deg, ${T.bgPanel}, ${T.deep})`, boxShadow: `0 10px 30px ${T.bgPanel}66`, fontFamily: '"DM Sans", sans-serif', animation: 'bulleEnviesIn 0.25s ease-out' }}>
      <style>{`@keyframes bulleEnviesIn { from { opacity: 0; transform: translateX(-50%) translateY(14px) } to { opacity: 1; transform: translateX(-50%) translateY(0) } } @media (prefers-reduced-motion: reduce) { [aria-label="Tes envies pour ce commerce"] { animation: none !important } }`}</style>
      <button type="button" onClick={onOuvrir}
        style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px 8px 14px', border: 'none', background: 'none', color: '#fff', fontFamily: '"DM Sans", sans-serif', cursor: 'pointer', textAlign: 'left' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.light} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
          <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 20.5l1.6-4.4A8.4 8.4 0 0 1 3 11.5 8.5 8.5 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z"/>
        </svg>
        <span style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: 13.5, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Une envie pour {commercant.nom}&nbsp;?
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M12 5v14M6 13l6 6 6-6"/></svg>
      </button>
      <button type="button" onClick={onFermer} aria-label="Fermer"
        style={{ flexShrink: 0, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 100, border: 'none', background: 'rgba(255,255,255,0.1)', cursor: 'pointer' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>
  )
}

// ⚠️ EXPORTÉ POUR LE BANC, et pour que personne ne recopie ces libellés
// ailleurs. Deux listes qui se ressemblent finissent toujours par diverger.
export { BOUTONS as LIBELLES_BOUTONS_ENVIE }
