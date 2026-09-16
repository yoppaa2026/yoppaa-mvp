'use client'
// Section admin : LES INSCRIPTIONS COMMENCÉES ET JAMAIS TERMINÉES.
//
// 🔴 POURQUOI ELLE EXISTE (16/09, demandé par Alex). « La Table du Stock » est
// arrivée dans la liste des commerçants sans prévenir personne et sans le
// moindre contexte : ni date, ni avancement, ni raison. Alex a cru l'avoir
// suspendue lui-même.
//
// La cause n'était pas un bug d'affichage, c'était structurel :
// `/api/notify-yoppaa` n'est appelée qu'au DERNIER clic de l'inscription. Tout
// ce qui s'arrête avant tombe donc en `brouillon`, se range au milieu des vrais
// commerçants, et personne n'en sait rien.
//
// ⚠️ CE N'EST PAS UNE LISTE D'ANOMALIES, C'EST UNE LISTE DE RAPPELS. Celui du
// 13/09 avait rempli son adresse, son téléphone et jusqu'à la description de sa
// salle de réception. Il ne s'est pas découragé, il a été interrompu. D'où les
// coordonnées cliquables : le geste attendu ici est un coup de fil.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { ClipboardList, Phone, Mail, RefreshCw } from 'lucide-react'
import { attenteDepuis } from '@/lib/statut-commercant'

const T = {
  main: '#6B35C4', pale: '#EDE0FF', ink: '#1A0840', deep: '#2D0F6B',
  muted: '#6B7280', hairline: '#EEE9F5', bleu: '#1D4ED8', bleuPale: '#EFF6FF',
}

// ⚠️ LA COLONNE EST DÉCLARÉE PAR LA RÈGLE, pas recopiée : `statut_publication`
// absente du select et le filtre ne trouverait plus personne, en silence.
const ETAT_NON_TERMINEE = 'brouillon'

export default function SectionInscriptionsEnCours() {
  const [lignes, setLignes] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  const charger = useCallback(async () => {
    setLoading(true); setErr(null)
    // ⚠️ LES NOMS DE COLONNES VIENNENT DE LA REQUÊTE VOISINE, celle de l'écran
    // de validation, et pas de ma mémoire : une colonne inventée fait échouer
    // TOUTE la requête, pas seulement sa propre valeur.
    const { data, error } = await supabase
      .from('commercants')
      .select(`
        id, nom, type, categorie, telephone, email, adresse, created_at, statut_publication,
        onboarding_commercants ( id, statut, validation_auto_score, completed_at )
      `)
      .eq('statut_publication', ETAT_NON_TERMINEE)
      .order('created_at', { ascending: false })
    // 🔴 ON LIT L'ERREUR. Un tableau vide et une requête en échec se
    // ressemblent à l'écran, et le second se lirait « personne n'attend ».
    if (error) { setErr(error.message); setLoading(false); return }
    setLignes(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { charger() }, [charger])

  if (loading) {
    return <p style={{ fontSize: 13, color: T.muted, margin: '0 0 16px' }}>Lecture des inscriptions en cours…</p>
  }

  return (
    <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${T.hairline}`, padding: '18px 20px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
        <ClipboardList size={18} strokeWidth={2.2} color={T.bleu}/>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: T.ink, letterSpacing: '-0.3px' }}>
          Inscriptions commencées, jamais terminées
        </h2>
        <span style={{ background: T.bleuPale, color: T.bleu, fontSize: 12, fontWeight: 800, padding: '3px 10px', borderRadius: 999 }}>
          {lignes.length}
        </span>
        <button onClick={charger} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: `1.5px solid ${T.hairline}`, borderRadius: 10, padding: '5px 10px', fontSize: 12, fontWeight: 700, color: T.muted, cursor: 'pointer' }}>
          <RefreshCw size={13} strokeWidth={2.2}/> Actualiser
        </button>
      </div>

      <p style={{ fontSize: 13, color: T.muted, margin: '0 0 14px', lineHeight: 1.6 }}>
        Ces commerçants ont rempli une partie de leur inscription puis se sont
        arrêtés. <strong style={{ color: T.deep }}>Aucune notification n&apos;est partie</strong>, ni
        vers toi ni vers eux : elle n&apos;est envoyée qu&apos;au dernier clic. Rien ne les
        publie et rien ne les valide tant qu&apos;ils sont ici.
      </p>

      {err && (
        <p style={{ fontSize: 13, color: '#B91C1C', margin: '0 0 12px', fontWeight: 700 }}>
          Lecture impossible : {err}. Rien ne dit qu&apos;il n&apos;y a personne, seulement qu&apos;on n&apos;a pas pu regarder.
        </p>
      )}

      {!err && lignes.length === 0 && (
        <p style={{ fontSize: 13, color: T.muted, margin: 0 }}>
          Personne en ce moment : toutes les inscriptions commencées ont été menées au bout.
        </p>
      )}

      {lignes.map((c) => {
        const ob = Array.isArray(c.onboarding_commercants) ? c.onboarding_commercants[0] : c.onboarding_commercants
        const avance = ob?.validation_auto_score
        const depuis = attenteDepuis(c.created_at)
        return (
          <div key={c.id} style={{ borderTop: `1px solid ${T.hairline}`, padding: '12px 0', display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <p style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 800, color: T.ink }}>{c.nom || 'Sans nom'}</p>
              <p style={{ margin: '0 0 6px', fontSize: 12.5, color: T.muted }}>
                {c.type || 'type non renseigné'}
                {c.adresse ? ` · ${c.adresse}` : ''}
              </p>
              {/* ⚠️ L'ATTENTE, PAS LA DATE : « il y a 3 jours » se lit sans
                  calcul, « le 13 septembre » demande un effort à chaque coup
                  d'œil. */}
              <p style={{ margin: 0, fontSize: 12.5, color: T.deep, fontWeight: 700 }}>
                Commencée {depuis.texte}
                {Number.isFinite(avance) ? ` · dossier rempli à ${avance} %` : ' · avancement inconnu'}
              </p>
            </div>
            {/* Le geste attendu : le rappeler. Les coordonnées sont donc des
                liens, pas du texte à recopier. */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {c.telephone && (
                <a href={`tel:${c.telephone}`} style={{ display: 'flex', alignItems: 'center', gap: 6, background: T.pale, color: T.main, textDecoration: 'none', fontSize: 12.5, fontWeight: 800, padding: '7px 12px', borderRadius: 10 }}>
                  <Phone size={13} strokeWidth={2.4}/> {c.telephone}
                </a>
              )}
              {c.email && (
                <a href={`mailto:${c.email}`} style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1.5px solid ${T.hairline}`, color: T.deep, textDecoration: 'none', fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 10 }}>
                  <Mail size={13} strokeWidth={2.4}/> {c.email}
                </a>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
