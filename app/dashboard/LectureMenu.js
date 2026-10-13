'use client'
// « LIRE MON MENU » (13/10, chantier « menu lu par l'IA », session 2).
//
// Le commerçant (ou l'admin, en mode admin) envoie les pages de son menu ;
// Claude les lit (`/api/ia/menu`), puis le commerçant RELIT tout avant que
// quoi que ce soit soit créé. Rien n'est créé ici : `onCreer` reçoit la
// relecture terminée.
//
// ⚠️ LES PHOTOS SONT RÉDUITES DANS LE NAVIGATEUR (1 800 px, JPEG) : un menu
// reste lisible, et quatre pages passent sous la limite du serveur. Aucune
// page n'est gardée, ni ici ni au serveur (décision d'Alex).

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { postPro } from '@/lib/fetch-pro'
import DotsAttente from '@/app/components/DotsAttente'
import { MENU_MAX, TAILLE_MAX_BASE64 } from '@/lib/menu-lu'
import {
  COTE_MAX_PHOTO, QUALITE_JPEG, pagesAcceptees, etatRelecture, categoriesDeRelecture,
  articleDeQuestion, resumeGroupe, bilanRelecture, phraseDuBilan, prixDeSaisie, OU_REGLER_INFO,
  contexteDeCorrection, appliquerCorrection, phraseDeCorrection,
} from '@/lib/menu-relecture'
import { REMARQUE_MAX, CORRECTIONS_PAR_LECTURE } from '@/lib/menu-lu'
import { demandeLeStock, reglagesCommuns, planCreation, ecrireCreation, phraseDeCreation } from '@/lib/menu-creation'
import { optionsTaux } from '@/lib/tva-aide'

const T = {
  bg: '#F8F6FF', ink: '#1A0840', deep: '#2D0F6B', main: '#6B35C4', mid: '#9660E0',
  pale: '#EDE0FF', muted: '#5B6170', hairline: '#E4DCF2', ok: '#047857', alerte: '#B45309', alertePale: '#FEF3C7', erreur: '#B91C1C',
}
const champ = {
  width: '100%', padding: '8px 10px', borderRadius: 10, border: `1.5px solid ${T.hairline}`,
  fontSize: 14, color: T.ink, fontFamily: 'inherit', outline: 'none', background: '#fff', boxSizing: 'border-box',
}
const titre = { fontSize: 13, fontWeight: 800, color: T.deep, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.4px' }

// ─── LA PRÉPARATION DES PAGES ───────────────────────────────────────────────
function lireEnBase64(fichier) {
  return new Promise((resoudre, rejeter) => {
    const r = new FileReader()
    r.onload = () => resoudre(String(r.result || '').split(',')[1] || '')
    r.onerror = () => rejeter(new Error('lecture du fichier impossible'))
    r.readAsDataURL(fichier)
  })
}

function chargerImage(fichier) {
  return new Promise((resoudre, rejeter) => {
    const url = URL.createObjectURL(fichier)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resoudre(img) }
    img.onerror = () => { URL.revokeObjectURL(url); rejeter(new Error('image illisible')) }
    img.src = url
  })
}

/** Une page prête à envoyer : { type, data } (base64 sans en-tête). */
async function pagePourEnvoi(fichier) {
  if (fichier.type === 'application/pdf') return { type: 'application/pdf', data: await lireEnBase64(fichier) }
  const img = await chargerImage(fichier)
  const echelle = Math.min(1, COTE_MAX_PHOTO / Math.max(img.naturalWidth || 1, img.naturalHeight || 1))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.naturalWidth * echelle))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * echelle))
  const ctx = canvas.getContext('2d')
  // Un PNG transparent deviendrait noir en JPEG : fond blanc d'abord.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return { type: 'image/jpeg', data: canvas.toDataURL('image/jpeg', QUALITE_JPEG).split(',')[1] || '' }
}

export default function LectureMenu({ commercantId, commercant, articlesExistants = [], categoriesExistantes = [], tvaRefs = [], onFerme, onCree, toast }) {
  const [etape, setEtape] = useState('envoi')   // 'envoi' | 'relecture'
  const [pages, setPages] = useState([])         // [{ fichier, nom, apercu }]
  const [lecture, setLecture] = useState(false)
  const [creation, setCreation] = useState(false)
  const [progression, setProgression] = useState(null)
  const [erreur, setErreur] = useState('')
  const [etat, setEtat] = useState(null)
  const [resume, setResume] = useState(null)
  const [restant, setRestant] = useState(null)
  // ✅ ALEX (13/10) : le stock « par jour » et la TVA, UNE question chacun pour
  // tous les articles, expliquée, modifiable ensuite. La TVA part du taux par
  // défaut du commerce, comme un nouvel article ; sinon elle reste à choisir.
  const [reglages, setReglages] = useState(() => ({
    stock: '', quantite: '',
    tva: commercant?.tva_taux_defaut === null || commercant?.tva_taux_defaut === undefined ? '' : String(commercant.tva_taux_defaut),
    tvaSurPlace: '',
  }))
  const nomsExistants = useMemo(() => articlesExistants.map(a => a.nom), [articlesExistants])
  // LA CORRECTION (13/10) : les pages déjà préparées et l'identifiant de la
  // lecture restent en mémoire LE TEMPS DE LA FENÊTRE, pour que l'IA relise
  // les mêmes pages. Rien n'est gardé ailleurs.
  const documentsRef = useRef(null)
  const lectureIdRef = useRef(null)
  const [remarque, setRemarque] = useState({ cle: null, texte: '' })   // cle : un article, '__menu__', ou null
  const [correctionEnvoi, setCorrectionEnvoi] = useState(false)
  const [correctionErreur, setCorrectionErreur] = useState('')
  const [restantCorrections, setRestantCorrections] = useState(CORRECTIONS_PAR_LECTURE)
  const avecStock = demandeLeStock(commercant)
  const alimentaire = !['detail', 'vitrine'].includes(commercant?.categorie)

  // Les aperçus sont des adresses locales : on les libère en partant.
  // ⚠️ AU DÉMONTAGE SEULEMENT, par une référence : un nettoyage lié à `pages`
  // tournerait à chaque ajout et effacerait les vignettes encore affichées.
  const pagesRef = useRef(pages)
  pagesRef.current = pages
  useEffect(() => () => pagesRef.current.forEach(p => p.apercu && URL.revokeObjectURL(p.apercu)), [])

  const occupe = lecture || creation || correctionEnvoi

  function ajouterFichiers(liste) {
    setErreur('')
    const { pages: ok, refus } = pagesAcceptees(liste, pages.length)
    if (refus.length) setErreur(refus.join(' '))
    setPages(p => [...p, ...ok.map(f => ({ fichier: f, nom: f.name, apercu: f.type.startsWith('image/') ? URL.createObjectURL(f) : null }))])
  }

  function retirerPage(i) {
    setPages(p => {
      const reste = [...p]
      const [partie] = reste.splice(i, 1)
      if (partie?.apercu) URL.revokeObjectURL(partie.apercu)
      return reste
    })
  }

  async function lire() {
    if (occupe || pages.length === 0) return
    setLecture(true)
    setErreur('')
    try {
      let documents
      try {
        documents = await Promise.all(pages.map(p => pagePourEnvoi(p.fichier)))
      } catch {
        setErreur('Une des photos n’a pas pu être ouverte. Reprends-la en JPEG, ou fais une capture d’écran.')
        return
      }
      // ⚠️ LE SERVEUR REFUSERAIT DE TOUTE FAÇON : on le dit avant d'envoyer.
      if (documents.reduce((n, d) => n + d.data.length, 0) > TAILLE_MAX_BASE64) {
        setErreur('Fichiers trop lourds : envoie moins de pages, ou un PDF plus léger.')
        return
      }
      const res = await postPro('/api/ia/menu', { commercant_id: commercantId, documents })
      if (typeof res?.json !== 'function') {
        setErreur(res?.sansSession ? 'Session expirée, reconnecte-toi.' : 'Connexion perdue, réessaie.')
        return
      }
      const j = await res.json().catch(() => ({}))
      if (Number.isInteger(j?.restant)) setRestant(j.restant)
      if (!res.ok || !j?.ok) {
        // Le serveur écrit une phrase complète pour le quota et l'illisible.
        setErreur(j?.message || j?.error || 'La lecture a échoué, réessaie.')
        return
      }
      setEtat(etatRelecture(j.proposition, nomsExistants))
      setResume(j.proposition.resume)
      documentsRef.current = documents
      lectureIdRef.current = j.lecture_id || null
      setRestantCorrections(CORRECTIONS_PAR_LECTURE)
      setRemarque({ cle: null, texte: '' })
      setEtape('relecture')
    } finally {
      setLecture(false)
    }
  }

  // ─── LA RELECTURE ─────────────────────────────────────────────────────────
  const bilan = useMemo(() => (etat ? bilanRelecture(etat) : null), [etat])
  const categories = useMemo(() => (etat ? categoriesDeRelecture(etat) : []), [etat])

  const majArticle = (cle, champs) => setEtat(e => ({ ...e, articles: e.articles.map(a => a.cle === cle ? { ...a, ...champs } : a) }))
  const majGroupe = (cleArticle, cleGroupe, champs) => setEtat(e => ({
    ...e,
    articles: e.articles.map(a => a.cle !== cleArticle ? a : { ...a, groupes: a.groupes.map(g => g.cle === cleGroupe ? { ...g, ...champs } : g) }),
  }))
  const majSupplement = (cle, champs) => setEtat(e => ({ ...e, supplements: e.supplements.map(s => s.cle === cle ? { ...s, ...champs } : s) }))
  const majQuestion = (cle, champs) => setEtat(e => ({ ...e, questions: e.questions.map(q => q.cle === cle ? { ...q, ...champs } : q) }))

  function ouvrirRemarque(cle) {
    setCorrectionErreur('')
    setRemarque(r => (r.cle === cle ? { cle: null, texte: '' } : { cle, texte: '' }))
  }

  async function corriger() {
    const cle = remarque.cle
    if (!cle || occupe || !documentsRef.current || !lectureIdRef.current) return
    const texte = remarque.texte.trim()
    if (texte.length < 3) { setCorrectionErreur('Écris ce qu’il faut corriger.'); return }
    setCorrectionEnvoi(true)
    setCorrectionErreur('')
    try {
      const cleCible = cle === '__menu__' ? null : cle
      const res = await postPro('/api/ia/menu/corriger', {
        commercant_id: commercantId,
        lecture_id: lectureIdRef.current,
        documents: documentsRef.current,
        remarque: texte,
        contexte: contexteDeCorrection(etat, cleCible),
      })
      if (typeof res?.json !== 'function') {
        setCorrectionErreur(res?.sansSession ? 'Session expirée, reconnecte-toi.' : 'Connexion perdue, réessaie.')
        return
      }
      const j = await res.json().catch(() => ({}))
      if (Number.isInteger(j?.restant)) setRestantCorrections(j.restant)
      if (!res.ok || !j?.ok) {
        setCorrectionErreur(j?.message || j?.error || 'La correction a échoué, réessaie.')
        return
      }
      // ⚠️ SUR L'ÉTAT DU MOMENT, PAS CELUI DE L'ENVOI : la relecture reste
      // modifiable pendant la minute de correction, et ces gestes-là ne doivent
      // pas disparaître. Le premier calcul ne sert qu'au message.
      const r = appliquerCorrection(etat, j.correction, { cleCible, nomsExistants })
      setEtat(e => appliquerCorrection(e, j.correction, { cleCible, nomsExistants }).etat)
      setRemarque({ cle: null, texte: '' })
      toast?.(phraseDeCorrection(r), 'success')
    } finally {
      setCorrectionEnvoi(false)
    }
  }

  // Le champ de remarque, le même pour un article et pour tout le menu.
  const champRemarque = (exemple) => (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <textarea value={remarque.texte} onChange={e => setRemarque(r => ({ ...r, texte: e.target.value.slice(0, REMARQUE_MAX) }))}
        rows={2} placeholder={exemple} aria-label="Ta remarque pour l’IA" disabled={correctionEnvoi}
        style={{ ...champ, resize: 'vertical', lineHeight: 1.45 }}/>
      {correctionErreur && <p role="alert" style={{ fontSize: 12.5, fontWeight: 700, color: T.erreur, margin: 0, lineHeight: 1.45 }}>{correctionErreur}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={corriger} disabled={occupe || remarque.texte.trim().length < 3 || restantCorrections <= 0}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 100, border: 'none', background: T.main, color: '#fff', fontWeight: 800, fontSize: 13, cursor: correctionEnvoi ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: remarque.texte.trim().length < 3 ? 0.5 : 1 }}>
          {correctionEnvoi ? <><DotsAttente couleur="#fff" taille={3} label="Correction"/> L’IA relit</> : 'Envoyer à l’IA'}
        </button>
        <button type="button" onClick={() => setRemarque({ cle: null, texte: '' })} disabled={correctionEnvoi}
          style={{ fontSize: 13, fontWeight: 700, color: T.muted, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
        <span style={{ fontSize: 12, color: T.muted }}>
          {correctionEnvoi ? 'Elle relit tes pages, environ une minute.' : `${restantCorrections} correction${restantCorrections > 1 ? 's' : ''} restante${restantCorrections > 1 ? 's' : ''} pour cette lecture`}
        </span>
      </div>
    </div>
  )

  function voirArticle(cle) {
    document.getElementById(`menu-lu-${cle}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const verdictReglages = useMemo(() => reglagesCommuns(commercant, reglages), [commercant, reglages])
  const pret = !!bilan?.pret && verdictReglages.ok

  async function creer() {
    if (!pret || occupe) return
    setErreur('')
    const plan = planCreation({ etat, commercant, commercantId, categoriesExistantes, articlesExistants, reglages })
    if (!plan.ok) { setErreur(plan.error); return }
    setCreation(true)
    try {
      const res = await ecrireCreation(supabase, plan, { commercantId, surProgression: (n, total) => setProgression({ n, total }) })
      const phrase = phraseDeCreation(res)
      const suite = [...plan.avertissements, res.categories].filter(Boolean)
      // ⚠️ CE QUI EST CRÉÉ SE DÉCOCHE ET SE MARQUE : un second clic ne le
      // recrée pas en double.
      const creees = new Set(res.crees.map(c => c.cle))
      if (creees.size > 0) setEtat(e => ({ ...e, articles: e.articles.map(a => creees.has(a.cle) ? { ...a, garder: false, deja: true } : a) }))
      onCree?.(res)
      if (res.echecs.length === 0 && res.partiels.length === 0) {
        toast?.(phrase, 'success')
        if (suite.length) toast?.(suite.join(' '), 'error')
        onFerme?.()
        return
      }
      setErreur([phrase, ...res.echecs.map(e => `${e.nom} : ${e.erreur}`), ...res.partiels.map(p => `${p.nom} : ${p.erreur}`), ...suite].join(' '))
    } finally {
      setCreation(false)
      setProgression(null)
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Lire mon menu" onClick={() => !occupe && onFerme?.()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(22,6,54,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '16px 12px', overflowY: 'auto', fontFamily: '"DM Sans", sans-serif' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 820, padding: 18, boxShadow: '0 24px 48px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: T.ink, margin: 0 }}>Lire mon menu</h2>
          <button type="button" onClick={onFerme} disabled={occupe} aria-label="Fermer"
            style={{ background: 'none', border: 'none', cursor: occupe ? 'wait' : 'pointer', padding: 6, color: T.muted }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>

        {etape === 'envoi' && (
          <section>
            <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.55, margin: '0 0 14px' }}>
              Envoie la photo ou le PDF de ton menu ({MENU_MAX.pages} pages au maximum). On en tire tes articles, leurs prix, les tailles et les suppléments.
              Tu relis tout avant que quoi que ce soit soit créé, et on ne garde aucune page.
            </p>

            <label style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '22px 14px', borderRadius: 14, border: `2px dashed ${T.mid}`, background: T.bg, cursor: occupe ? 'wait' : 'pointer', textAlign: 'center' }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="3.5"/></svg>
              <span style={{ fontSize: 15, fontWeight: 800, color: T.deep }}>Ajouter des pages</span>
              <span style={{ fontSize: 12, color: T.muted }}>Photo bien à plat, avec de la lumière, ou PDF</span>
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple disabled={occupe}
                onChange={e => { ajouterFichiers(e.target.files); e.target.value = '' }}
                style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}/>
            </label>

            {pages.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
                {pages.map((p, i) => (
                  <li key={`${p.nom}-${i}`} style={{ border: `1.5px solid ${T.hairline}`, borderRadius: 12, padding: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {p.apercu
                      ? <img decoding="async" loading="lazy" src={p.apercu} alt={`Page ${i + 1}`} style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 8 }}/>
                      : <div style={{ height: 110, borderRadius: 8, background: T.pale, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: T.deep }}>PDF</div>}
                    <span style={{ fontSize: 11, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</span>
                    <button type="button" onClick={() => retirerPage(i)} disabled={occupe}
                      style={{ fontSize: 12, fontWeight: 700, color: T.erreur, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'inherit' }}>Retirer</button>
                  </li>
                ))}
              </ul>
            )}

            {erreur && <p role="alert" style={{ fontSize: 13, fontWeight: 700, color: T.erreur, margin: '12px 0 0', lineHeight: 1.5 }}>{erreur}</p>}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
              <button type="button" onClick={lire} disabled={occupe || pages.length === 0}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 22px', borderRadius: 100, border: 'none', background: pages.length === 0 ? T.hairline : T.main, color: '#fff', fontWeight: 800, fontSize: 15, cursor: occupe ? 'wait' : pages.length === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {lecture ? <><DotsAttente couleur="#fff" taille={4} label="Lecture"/> Lecture en cours</> : 'Lire mon menu'}
              </button>
              {lecture && <span style={{ fontSize: 13, color: T.muted }}>Ça prend une minute environ, garde cette fenêtre ouverte.</span>}
              {!lecture && Number.isInteger(restant) && <span style={{ fontSize: 12, color: T.muted }}>{restant} lecture{restant > 1 ? 's' : ''} restante{restant > 1 ? 's' : ''} ce mois-ci</span>}
            </div>
          </section>
        )}

        {etape === 'relecture' && etat && (
          <section>
            <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.55, margin: '0 0 12px' }}>
              {resume?.articles} article{resume?.articles > 1 ? 's' : ''} lu{resume?.articles > 1 ? 's' : ''} dans {resume?.categories} catégorie{resume?.categories > 1 ? 's' : ''}.
              Corrige ce qui doit l’être, décoche ce que tu ne veux pas, puis crée. Tu pourras tout modifier ensuite dans ton catalogue.
              {resume?.tronque && <strong style={{ color: T.alerte }}> Le menu était très long : la lecture s’est arrêtée avant la fin.</strong>}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              {bilan.aVerifier > 0 && <span style={{ fontSize: 12, fontWeight: 800, color: T.alerte, background: T.alertePale, borderRadius: 100, padding: '4px 10px' }}>{bilan.aVerifier} à vérifier</span>}
              {bilan.deja > 0 && <span style={{ fontSize: 12, fontWeight: 800, color: T.deep, background: T.pale, borderRadius: 100, padding: '4px 10px' }}>{bilan.deja} déjà dans ton catalogue (décoché{bilan.deja > 1 ? 's' : ''})</span>}
            </div>

            {/* LES QUESTIONS DE LA LECTURE */}
            {etat.questions.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <p style={titre}>Questions sur ton menu</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {etat.questions.map(q => {
                    const cible = articleDeQuestion(q, etat.articles)
                    return (
                      <li key={q.cle} style={{ borderRadius: 12, padding: '10px 12px', background: q.reglee ? T.bg : T.alertePale, border: `1.5px solid ${q.reglee ? T.hairline : '#F5D08A'}` }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: T.ink, margin: 0, lineHeight: 1.45, textDecoration: q.reglee ? 'line-through' : 'none' }}>{q.question}</p>
                        {q.propositions.length > 0 && <p style={{ fontSize: 12, color: T.muted, margin: '4px 0 0' }}>Pistes : {q.propositions.join(' · ')}</p>}
                        <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                          {cible && <button type="button" onClick={() => voirArticle(cible.cle)} style={{ fontSize: 12, fontWeight: 800, color: T.main, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>Voir « {cible.nom} »</button>}
                          <button type="button" onClick={() => majQuestion(q.cle, { reglee: !q.reglee })} style={{ fontSize: 12, fontWeight: 800, color: T.deep, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>{q.reglee ? 'Rouvrir' : 'C’est réglé'}</button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {/* LES ARTICLES, PAR CATÉGORIE */}
            <datalist id="menu-lu-categories">{categories.map(c => <option key={c} value={c}/>)}</datalist>
            {categories.map(cat => (
              <div key={cat} style={{ marginBottom: 16 }}>
                <p style={titre}>{cat}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {etat.articles.filter(a => a.categorie === cat).map(a => {
                    const doute = a.doutes.length > 0 && !a.verifie
                    const prixOk = prixDeSaisie(a.prixTexte) !== null
                    return (
                      <div key={a.cle} id={`menu-lu-${a.cle}`}
                        style={{ borderRadius: 12, padding: 10, border: `1.5px solid ${a.garder && doute ? '#F5D08A' : T.hairline}`, background: !a.garder ? '#FAFAFC' : doute ? '#FFFBEB' : '#fff', opacity: a.garder ? 1 : 0.7 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <input type="checkbox" checked={a.garder} onChange={e => majArticle(a.cle, { garder: e.target.checked })}
                            aria-label={`Créer ${a.nom || 'cet article'}`} style={{ width: 18, height: 18, accentColor: T.main, cursor: 'pointer' }}/>
                          <input value={a.nom} onChange={e => majArticle(a.cle, { nom: e.target.value })} aria-label="Nom"
                            style={{ ...champ, flex: '1 1 180px', fontWeight: 700 }}/>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input value={a.prixTexte} onChange={e => majArticle(a.cle, { prixTexte: e.target.value })} inputMode="decimal" aria-label="Prix" placeholder="Prix"
                              style={{ ...champ, width: 86, textAlign: 'right', borderColor: a.garder && !prixOk ? T.erreur : T.hairline }}/>
                            <span style={{ fontSize: 14, color: T.muted, fontWeight: 700 }}>€</span>
                          </div>
                          {a.deja && <span style={{ fontSize: 11, fontWeight: 800, color: T.deep, background: T.pale, borderRadius: 100, padding: '3px 8px' }}>Déjà dans ton catalogue</span>}
                        </div>

                        {a.garder && (
                          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 8, marginTop: 8 }}>
                            <input value={a.description} onChange={e => majArticle(a.cle, { description: e.target.value })} aria-label="Description" placeholder="Description (facultatif)" style={champ}/>
                            <input value={a.categorie} list="menu-lu-categories" onChange={e => majArticle(a.cle, { categorie: e.target.value })} aria-label="Catégorie" style={champ}/>
                          </div>
                        )}

                        {a.garder && a.groupes.length > 0 && (
                          <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {a.groupes.map(g => (
                              <li key={g.cle} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12.5, color: g.garder ? T.ink : T.muted, lineHeight: 1.45 }}>
                                <span style={{ flex: 1, textDecoration: g.garder ? 'none' : 'line-through' }}>{resumeGroupe(g)}</span>
                                <button type="button" onClick={() => majGroupe(a.cle, g.cle, { garder: !g.garder })}
                                  style={{ fontSize: 12, fontWeight: 800, color: g.garder ? T.erreur : T.main, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>{g.garder ? 'Retirer' : 'Remettre'}</button>
                              </li>
                            ))}
                          </ul>
                        )}

                        {a.garder && a.doutes.length > 0 && (
                          <div style={{ marginTop: 8, borderRadius: 10, padding: '8px 10px', background: a.verifie ? T.bg : T.alertePale }}>
                            {a.doutes.map((d, i) => <p key={i} style={{ fontSize: 12.5, fontWeight: 700, color: a.verifie ? T.muted : T.alerte, margin: i ? '3px 0 0' : 0, lineHeight: 1.45 }}>{d}</p>)}
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12.5, fontWeight: 800, color: T.deep, cursor: 'pointer' }}>
                              <input type="checkbox" checked={a.verifie} onChange={e => majArticle(a.cle, { verifie: e.target.checked })} style={{ width: 16, height: 16, accentColor: T.ok }}/>
                              J’ai vérifié
                            </label>
                          </div>
                        )}

                        {a.retireParIA && !a.garder && (
                          <p style={{ fontSize: 12, fontWeight: 700, color: T.deep, margin: '8px 0 0' }}>L’IA propose de le retirer. Coche-le si tu veux le garder.</p>
                        )}

                        {/* CORRIGER AVEC L'IA (13/10, Alex) */}
                        {remarque.cle === a.cle
                          ? champRemarque('Ex. : les ingrédients au choix sont toutes les garnitures de la carte.')
                          : (
                            <button type="button" onClick={() => ouvrirRemarque(a.cle)} disabled={occupe || restantCorrections <= 0}
                              style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 800, color: T.main, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3z"/></svg>
                              Corriger avec l’IA
                            </button>
                          )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* LES SUPPLÉMENTS COMMUNS : JAMAIS D'OFFICE */}
            {etat.supplements.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <p style={titre}>Suppléments valables pour plusieurs articles</p>
                {etat.supplements.map(s => (
                  <div key={s.cle} style={{ borderRadius: 12, padding: 10, border: `1.5px solid ${T.hairline}`, marginBottom: 8 }}>
                    <p style={{ fontSize: 13, color: T.ink, margin: '0 0 8px', lineHeight: 1.45 }}>{resumeGroupe(s)}</p>
                    {/* Plusieurs catégories (« toutes les pizzas »), aucune d'office. */}
                    <p style={{ fontSize: 13, fontWeight: 700, color: T.deep, margin: '0 0 6px' }}>Ajouter aux articles de :</p>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {categories.map(c => {
                        const coche = s.appliquerA.includes(c)
                        return (
                          <button key={c} type="button" aria-pressed={coche}
                            onClick={() => majSupplement(s.cle, { appliquerA: coche ? s.appliquerA.filter(x => x !== c) : [...s.appliquerA, c] })}
                            style={{ padding: '5px 11px', borderRadius: 100, border: `1.5px solid ${coche ? T.main : T.hairline}`, background: coche ? T.pale : '#fff', color: T.deep, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {coche ? '✓ ' : ''}{c}
                          </button>
                        )
                      })}
                    </div>
                    {s.pour && s.appliquerA.length === 0 && <p style={{ fontSize: 12, color: T.muted, margin: '6px 0 0' }}>Le menu les indique pour « {s.pour} ». Rien n’est ajouté tant que tu ne coches pas.</p>}
                  </div>
                ))}
              </div>
            )}

            {/* TROUVÉ AUSSI SUR TON MENU : RIEN N'EST APPLIQUÉ SEUL */}
            {etat.infos.length > 0 && (
              <div style={{ marginBottom: 16, borderRadius: 12, padding: '10px 12px', background: T.bg }}>
                <p style={titre}>Trouvé aussi sur ton menu</p>
                {etat.infos.map((i, n) => (
                  <p key={n} style={{ fontSize: 13, color: T.ink, margin: n ? '6px 0 0' : 0, lineHeight: 1.45 }}>
                    {i.texte}{OU_REGLER_INFO[i.sujet] && <span style={{ color: T.muted }}> · à régler dans {OU_REGLER_INFO[i.sujet]}</span>}
                  </p>
                ))}
              </div>
            )}

            {/* UNE REMARQUE SUR TOUT LE MENU (13/10, Alex) */}
            <div style={{ marginBottom: 16, borderRadius: 12, padding: 12, background: T.bg }}>
              <p style={titre}>Une remarque sur tout le menu ?</p>
              {remarque.cle === '__menu__'
                ? champRemarque('Ex. : la rubrique Suppléments, ce sont des suppléments pour toutes les pizzas, pas des articles.')
                : (
                  <button type="button" onClick={() => ouvrirRemarque('__menu__')} disabled={occupe || restantCorrections <= 0}
                    style={{ fontSize: 13, fontWeight: 800, color: T.main, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', lineHeight: 1.45 }}>
                    Dis à l’IA ce qui ne va pas sur plusieurs articles : elle relit tes pages et corrige.
                  </button>
                )}
            </div>

            {/* POUR TOUS CES ARTICLES : LE STOCK ET LA TVA (Alex, 13/10) */}
            <div style={{ marginBottom: 16, borderRadius: 12, padding: 12, border: `1.5px solid ${T.hairline}` }}>
              <p style={titre}>Pour tous ces articles</p>

              {avecStock && (
                <fieldset style={{ border: 'none', padding: 0, margin: '0 0 14px' }}>
                  <legend style={{ fontSize: 14, fontWeight: 800, color: T.ink, marginBottom: 6, padding: 0 }}>Combien en prépares-tu par jour ?</legend>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: T.ink, marginBottom: 6, cursor: 'pointer', lineHeight: 1.45 }}>
                    <input type="radio" name="menu-lu-stock" checked={reglages.stock === 'illimite'} onChange={() => setReglages(r => ({ ...r, stock: 'illimite' }))} style={{ accentColor: T.main, marginTop: 3 }}/>
                    <span><strong>Sans limite</strong> : tu prépares à la commande, la fiche ne s’arrête jamais d’elle-même.</span>
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: T.ink, cursor: 'pointer', lineHeight: 1.45, flexWrap: 'wrap' }}>
                    <input type="radio" name="menu-lu-stock" checked={reglages.stock === 'jour'} onChange={() => setReglages(r => ({ ...r, stock: 'jour' }))} style={{ accentColor: T.main, marginTop: 3 }}/>
                    <span style={{ flex: '1 1 260px' }}><strong>Une quantité par jour</strong> : la fiche arrête de proposer l’article quand elle est vendue, et repart le lendemain.</span>
                    {reglages.stock === 'jour' && (
                      <input value={reglages.quantite} onChange={e => setReglages(r => ({ ...r, quantite: e.target.value }))} inputMode="numeric" aria-label="Quantité par jour" placeholder="Ex. 20"
                        style={{ ...champ, width: 90 }}/>
                    )}
                  </label>
                </fieldset>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14, fontWeight: 800, color: T.ink }}>
                  TVA{alimentaire ? ' à emporter' : ''}
                  <select value={reglages.tva} onChange={e => setReglages(r => ({ ...r, tva: e.target.value }))} style={{ ...champ, cursor: 'pointer', fontWeight: 400 }}>
                    <option value="">Choisis un taux</option>
                    {optionsTaux(tvaRefs, commercant?.categorie).map(t => <option key={t.taux} value={String(t.taux)}>{t.texte}</option>)}
                    <option value="plus_tard">Je le règle plus tard</option>
                  </select>
                </label>
                {alimentaire && (
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14, fontWeight: 800, color: T.ink }}>
                    TVA sur place (si consommation en salle)
                    <select value={reglages.tvaSurPlace} onChange={e => setReglages(r => ({ ...r, tvaSurPlace: e.target.value }))} style={{ ...champ, cursor: 'pointer', fontWeight: 400 }}>
                      <option value="">Même taux qu’à emporter</option>
                      {optionsTaux(tvaRefs, commercant?.categorie).map(t => <option key={t.taux} value={String(t.taux)}>{t.texte}</option>)}
                    </select>
                  </label>
                )}
              </div>
              <p style={{ fontSize: 12, color: T.muted, margin: '8px 0 0', lineHeight: 1.5 }}>
                Le prix lu est le prix payé par le client, TVA comprise. En cas de doute sur le taux, consulte ton comptable ou le SPF Finances.
                {avecStock ? ' Le stock et la TVA' : ' La TVA'} se changent ensuite pour plusieurs articles d’un coup (actions groupées du catalogue) ou article par article.
              </p>
            </div>

            {erreur && <p role="alert" style={{ fontSize: 13, fontWeight: 700, color: T.erreur, margin: '0 0 12px', lineHeight: 1.5 }}>{erreur}</p>}

            <div style={{ position: 'sticky', bottom: -18, background: '#fff', borderTop: `1px solid ${T.hairline}`, margin: '0 -18px -18px', padding: '12px 18px', borderRadius: '0 0 18px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: pret ? T.ok : T.alerte, minWidth: 180 }}>
                {creation && progression ? `Création ${progression.n} sur ${progression.total}…`
                  : pret ? `${bilan.aCreer} article${bilan.aCreer > 1 ? 's' : ''} prêt${bilan.aCreer > 1 ? 's' : ''} à créer.`
                  : phraseDuBilan(bilan) || verdictReglages.error}
              </span>
              <button type="button" onClick={() => { setEtape('envoi'); setEtat(null); setErreur(''); documentsRef.current = null; lectureIdRef.current = null }} disabled={occupe}
                style={{ padding: '10px 16px', borderRadius: 100, border: `1.5px solid ${T.hairline}`, background: '#fff', color: T.deep, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Relire un autre menu</button>
              <button type="button" onClick={creer} disabled={!pret || occupe}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 100, border: 'none', background: pret ? T.main : T.hairline, color: '#fff', fontWeight: 800, fontSize: 14, cursor: creation ? 'wait' : pret ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                {creation ? <><DotsAttente couleur="#fff" taille={4} label="Création"/> Création</> : `Créer ${bilan.aCreer} article${bilan.aCreer > 1 ? 's' : ''}`}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
