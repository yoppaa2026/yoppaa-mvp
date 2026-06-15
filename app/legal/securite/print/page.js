'use client'
// ════════════════════════════════════════════════════════════════════
// /legal/securite/print
//
// Version imprimable A4 portrait de la note "Sécurité & Hébergement".
// Optimisée pour impression ou export PDF (Cmd+P → PDF).
// 3 pages A4 environ.
// ════════════════════════════════════════════════════════════════════

const T = {
  ink:    '#1A0840',
  deep:   '#2D0F6B',
  main:   '#6B35C4',
  mid:    '#9660E0',
  light:  '#C4A0F4',
  pale:   '#EDE0FF',
  bg:     '#F8F6FF',
  muted:  '#6B7280',
}

const A4 = {
  width:  '210mm',
  height: '297mm',
  margin: '0 auto',
  background: '#fff',
  boxSizing: 'border-box',
  padding: '18mm 16mm 16mm',
  fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif',
  color: T.ink,
  fontSize: 10,
  lineHeight: 1.5,
  printColorAdjust: 'exact',
}

function H1({ children }) {
  return <h1 style={{ fontSize: 18, fontWeight: 900, color: T.deep, letterSpacing: '-0.5px', margin: '0 0 4px' }}>{children}</h1>
}
function H2({ children }) {
  return <h2 style={{ fontSize: 13, fontWeight: 900, color: T.deep, letterSpacing: '-0.3px', margin: '14px 0 6px', paddingBottom: 3, borderBottom: `2px solid ${T.pale}` }}>{children}</h2>
}
function H3({ children }) {
  return <h3 style={{ fontSize: 10.5, fontWeight: 800, color: T.ink, margin: '9px 0 3px' }}>{children}</h3>
}
function P({ children, sub = false }) {
  return <p style={{ fontSize: sub ? 9 : 9.5, color: sub ? T.muted : '#374151', lineHeight: 1.5, margin: '0 0 5px' }}>{children}</p>
}
function Ul({ items, small = false }) {
  return (
    <ul style={{ margin: '0 0 5px', paddingLeft: 14 }}>
      {items.map((it, i) => (
        <li key={i} style={{ fontSize: small ? 9 : 9.5, color: '#374151', lineHeight: 1.5, marginBottom: 1.5 }}>{it}</li>
      ))}
    </ul>
  )
}
function Box({ children, tone = 'info' }) {
  const bg = tone === 'success' ? '#ECFDF5' : T.pale
  const border = tone === 'success' ? '#10B981' : T.main
  const color = tone === 'success' ? '#065F46' : T.deep
  return (
    <div style={{ background: bg, borderLeft: `3px solid ${border}`, borderRadius: '0 4px 4px 0', padding: '6px 9px', margin: '5px 0' }}>
      <p style={{ fontSize: 9, color, lineHeight: 1.5, margin: 0 }}>{children}</p>
    </div>
  )
}
function Table({ headers, rows }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 8.5, marginBottom: 6, border: `1px solid ${T.pale}` }}>
      <thead>
        <tr style={{ background: T.pale }}>
          {headers.map((h, i) => (
            <th key={i} style={{ padding: '4px 6px', textAlign: 'left', fontWeight: 800, color: T.deep, fontSize: 7.5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ borderTop: `1px solid ${T.pale}` }}>
            {row.map((cell, j) => (
              <td key={j} style={{ padding: '4px 6px', color: '#374151', lineHeight: 1.4, verticalAlign: 'top' }}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Footer({ n, total = 3 }) {
  return (
    <div style={{ position: 'absolute', bottom: 8, left: 16, right: 16, display: 'flex', justifyContent: 'space-between', fontSize: 8, color: T.muted, fontWeight: 600 }}>
      <span>Yoppaa · Sécurité & Hébergement · v.15-06-2026</span>
      <span>{n} / {total}</span>
    </div>
  )
}

export default function NoteSecuritePrint() {
  return (
    <div style={{ background: '#E5E7EB', minHeight: '100vh', padding: '20px 0' }}>
      <style>{`
        @media print {
          html, body { width: 210mm; margin: 0 !important; padding: 0 !important; background: #fff !important; }
          .a4-container { padding: 0 !important; gap: 0 !important; display: block !important; background: #fff !important; }
          .a4-page {
            width: 210mm !important; height: 297mm !important;
            page-break-after: always; break-after: page;
            page-break-inside: avoid; break-inside: avoid;
            overflow: hidden; box-shadow: none !important; margin: 0 !important;
          }
          .a4-page:last-child { page-break-after: auto; break-after: auto; }
          .no-print { display: none !important; }
        }
        @page { size: A4; margin: 0; }
      `}</style>

      <div className="no-print" style={{ maxWidth: 210*3.78, margin: '0 auto 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px', fontFamily: 'system-ui, sans-serif' }}>
        <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>Aperçu · 3 pages A4 portrait</p>
        <button onClick={() => window.print()} style={{ padding: '8px 16px', background: T.main, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 6px rgba(107,53,196,0.3)' }}>
          🖨️ Imprimer / Exporter en PDF
        </button>
      </div>

      <div className="a4-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>

        {/* ───────── PAGE 1 ───────── */}
        <div className="a4-page" style={{ ...A4, position: 'relative', boxShadow: '0 4px 18px rgba(0,0,0,0.12)' }}>

          <div style={{ background: `linear-gradient(135deg, ${T.deep}, ${T.main})`, margin: '-18mm -16mm 12mm', padding: '14mm 16mm 10mm', color: '#fff', textAlign: 'center' }}>
            <p style={{ margin: 0, fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: 30, letterSpacing: '-0.05em', lineHeight: 1 }}>
              <span style={{ color: '#fff' }}>yo</span>
              <span style={{ color: T.light }}>pp</span>
              <span style={{ color: T.mid }}>aa</span>
            </p>
            <div style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 4, height: 10, marginTop: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }}/>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: T.light, marginTop: 3 }}/>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.light, marginTop: 3 }}/>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: T.mid, marginTop: 3 }}/>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.mid }}/>
            </div>
            <p style={{ margin: '10px 0 2px', fontSize: 14, fontWeight: 700, color: T.light, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Sécurité & Hébergement</p>
            <p style={{ margin: 0, fontSize: 9, color: 'rgba(196,160,244,0.85)' }}>Document public · Version du 15 juin 2026</p>
          </div>

          <p style={{ fontSize: 8.5, color: T.muted, margin: '0 0 10px', textAlign: 'center' }}>
            Avcotech SRL · BCE 0731.637.148 · TVA BE0731.637.148 · Rue de Prée 9G, 5640 Mettet, Belgique
          </p>

          <H2>1 · Préambule</H2>
          <P>Yoppaa est un service numérique de proximité édité par <strong>Avcotech SRL</strong>, société de droit belge. Yoppaa connecte les habitants d&rsquo;une commune avec ses commerçants et ses services publics, dans une logique de proximité, de transparence et de souveraineté des données.</P>
          <P>Le présent document décrit l&rsquo;ensemble des mesures techniques et organisationnelles mises en œuvre pour assurer la sécurité, la confidentialité et l&rsquo;intégrité des données traitées par Yoppaa, conformément au Règlement Général sur la Protection des Données (Règlement UE 2016/679, ci-après « RGPD ») et au droit belge.</P>
          <Box tone="success"><strong>Position de Yoppaa</strong> : 100 % des données sensibles sont hébergées <strong>dans l&rsquo;Union européenne</strong>. Aucune donnée personnelle de citoyen ou de commerçant n&rsquo;est transférée hors UE pour son traitement principal.</Box>

          <H2>2 · Hébergement & infrastructure</H2>
          <P>Yoppaa s&rsquo;appuie sur des prestataires de classe mondiale, sélectionnés pour leur conformité RGPD, leur certification ISO 27001 et leur capacité à héberger les données en Union européenne.</P>
          <Table
            headers={['Composant', 'Prestataire', 'Localisation', 'Conformité']}
            rows={[
              ['Application web (frontend + serverless)', 'Vercel (Pro)', 'Edge mondial, fonctions UE', 'ISO 27001 · SOC 2 · DPA'],
              ['Base de données', 'Supabase', 'Frankfurt (eu-central-1, DE)', 'ISO 27001 · SOC 2 · DPA'],
              ['Emails transactionnels', 'Resend', 'Dublin (eu-west-1, IE)', 'ISO 27001 · DPA'],
              ['Boîtes mail Yoppaa', 'Proton Mail', 'Suisse', 'Chiffrement bout en bout · LPD'],
              ['Paiements', 'Stripe Payments / Connect', 'Dublin (IE)', 'PCI DSS Niveau 1 · DPA'],
              ['Protection anti-bot', 'Cloudflare Turnstile', 'Edge UE', 'DPA'],
              ['Nom de domaine & DNS', 'Hostinger', 'UE', 'DPA'],
              ['Code source', 'GitHub (dépôt privé)', 'UE / US (chiffré)', 'SOC 2 · DPA'],
            ]}
          />
          <P>Toutes les communications réseau entre l&rsquo;utilisateur et Yoppaa transitent en <strong>HTTPS / TLS 1.3 obligatoire</strong>. Le certificat SSL est renouvelé automatiquement. Les communications entre serveurs internes sont également chiffrées en transit.</P>

          <Footer n={1}/>
        </div>

        {/* ───────── PAGE 2 ───────── */}
        <div className="a4-page" style={{ ...A4, position: 'relative', boxShadow: '0 4px 18px rgba(0,0,0,0.12)' }}>

          <H2>3 · Données traitées</H2>
          <P>Yoppaa traite trois catégories de données, en fonction du profil de l&rsquo;utilisateur. Chaque traitement repose sur une base légale identifiée et une finalité limitée.</P>

          <H3>3.1 · Citoyens (« Yoppers »)</H3>
          <Ul items={[
            'Identifiants : prénom, nom, e-mail, mot de passe haché (bcrypt)',
            'Contact : numéro de téléphone, code postal',
            'Préférences : commerces favoris, historique de commandes et de rendez-vous',
            'Données de service : créneaux choisis, paniers, notes laissées sur les commerces',
          ]} small/>
          <P sub><strong>Base légale</strong> : exécution du contrat de service (art. 6.1.b RGPD). <strong>Durée</strong> : durée d&rsquo;utilisation + 3 ans à compter du dernier login.</P>

          <H3>3.2 · Commerçants</H3>
          <Ul items={[
            'Identification entreprise : raison sociale, BCE, TVA, adresse',
            'Contact : e-mail, téléphone, IBAN (paiements Stripe)',
            'Données opérationnelles : catalogue, créneaux, statistiques internes',
            'Pas de stockage de données bancaires (gérées par Stripe, PCI DSS)',
          ]} small/>
          <P sub><strong>Base légale</strong> : contrat de service + obligation légale (comptabilité). <strong>Durée</strong> : durée du contrat + 10 ans (obligation comptable belge).</P>

          <H3>3.3 · Services publics (commune, CPAS, école, etc.)</H3>
          <Ul items={[
            'Données strictement publiques : nom, adresse, horaires, contacts officiels, codes postaux desservis',
            'Contenu éditorial : actualités, alertes, informations pratiques',
            'Aucune donnée personnelle de citoyen n\'est collectée par le canal « service public »',
          ]} small/>
          <P sub><strong>Base légale</strong> : exécution d&rsquo;une mission d&rsquo;intérêt public (art. 6.1.e RGPD). La commune partenaire reste responsable du traitement de ses propres publications.</P>

          <H2>4 · Sécurité technique</H2>

          <H3>4.1 · Chiffrement</H3>
          <Ul items={[
            'En transit : TLS 1.3 obligatoire (HTTPS uniquement)',
            'Au repos : AES-256 sur les données et sauvegardes (Supabase)',
            'Mots de passe : hachage bcrypt (jamais stockés en clair)',
            'Tokens d\'authentification : signés JWT avec rotation régulière',
          ]} small/>

          <H3>4.2 · Contrôle d&rsquo;accès</H3>
          <Ul items={[
            'Row-Level Security (RLS) sur l\'ensemble des tables : un utilisateur n\'accède qu\'aux lignes le concernant',
            'Authentification par Magic Link à usage unique ou mot de passe',
            'Séparation stricte des rôles : citoyen, commerçant, administrateur communal, équipe Yoppaa',
            'Politique 1 personne = 1 compte d\'administration (pas de mot de passe partagé)',
          ]} small/>

          <H3>4.3 · Protection contre les abus</H3>
          <Ul items={[
            'Cloudflare Turnstile sur les formulaires sensibles (anti-bot)',
            'Rate limiting sur les routes sensibles',
            'Audit régulier des dépendances (mises à jour de sécurité automatiques)',
            'Vérification BCE des commerçants à l\'inscription (registre belge)',
          ]} small/>

          <H3>4.4 · Code & déploiement</H3>
          <Ul items={[
            'Code source en dépôt privé GitHub avec contrôle d\'accès',
            'Déploiements continus Vercel : chaque version tracée, réversible',
            'Pas de secret en clair (variables d\'environnement chiffrées)',
            'Environnement de prévisualisation isolé pour chaque évolution',
          ]} small/>

          <Footer n={2}/>
        </div>

        {/* ───────── PAGE 3 ───────── */}
        <div className="a4-page" style={{ ...A4, position: 'relative', boxShadow: '0 4px 18px rgba(0,0,0,0.12)' }}>

          <H2>5 · Conformité RGPD</H2>
          <P>Yoppaa traite les données personnelles dans le strict respect du RGPD et de la loi belge du 30 juillet 2018.</P>

          <H3>5.1 · Droits des personnes concernées</H3>
          <P sub>Droit d&rsquo;accès, de rectification, à l&rsquo;effacement (« droit à l&rsquo;oubli »), à la limitation, à la portabilité, d&rsquo;opposition et de retrait du consentement. Exercice gratuit à <strong>legal@yoppaa.app</strong>. Réponse sous un mois maximum.</P>

          <H3>5.2 · Sous-traitants (DPA)</H3>
          <P sub>Tous les prestataires listés en section 2 ont conclu un accord de traitement (Data Processing Agreement) avec Avcotech SRL, conforme à l&rsquo;article 28 RGPD. Liste et DPA disponibles sur demande.</P>

          <H3>5.3 · Transferts hors UE</H3>
          <Box tone="success">Les données personnelles principales sont <strong>exclusivement hébergées en Union européenne</strong> (Allemagne et Irlande). Aucun transfert structurel hors UE.</Box>
          <P sub>Pour les services techniques d&rsquo;infrastructure (réseau Edge mondial), des Clauses Contractuelles Types (CCT) de la Commission européenne sont en place avec les prestataires concernés.</P>

          <H3>5.4 · Registre des traitements</H3>
          <P sub>Avcotech SRL tient à jour un registre des activités de traitement (art. 30 RGPD), disponible sur demande de l&rsquo;Autorité de protection des données (APD).</P>

          <H3>5.5 · Cookies & traceurs</H3>
          <P sub>Yoppaa n&rsquo;utilise pas de cookies de pistage publicitaire. Seuls les cookies strictement nécessaires (session, authentification, préférences) sont déposés, sans consentement préalable requis.</P>

          <H2>6 · Gouvernance & contact</H2>

          <H3>6.1 · Responsable du traitement</H3>
          <P><strong>Avcotech SRL</strong> · BCE 0731.637.148 · TVA BE0731.637.148 · Rue de Prée 9G, 5640 Mettet, Belgique</P>

          <H3>6.2 · Délégué à la Protection des Données (DPO)</H3>
          <P><strong>Alexandre Verstappen</strong>, gérant d&rsquo;Avcotech SRL · Contact : <strong>legal@yoppaa.app</strong></P>

          <H3>6.3 · Notification des violations de données</H3>
          <Ul items={[
            'Notification à l\'APD dans les 72 heures (art. 33 RGPD)',
            'Information des personnes concernées sans délai si risque élevé (art. 34 RGPD)',
            'Documentation systématique de toute violation et des mesures correctives',
          ]} small/>

          <H3>6.4 · Autorité de contrôle</H3>
          <P sub>Autorité de protection des données (APD) · Rue de la Presse 35, 1000 Bruxelles · autoriteprotectiondonnees.be</P>

          <H2>7 · Continuité & sauvegarde</H2>
          <Ul items={[
            'Sauvegardes automatiques quotidiennes (rétention 7 jours, point-in-time recovery)',
            'Réplication géographique au sein de l\'UE',
            'Monitoring continu (Vercel Analytics + alertes anomalies)',
            'Plan de reprise d\'activité (PRA) : RTO < 4h, RPO < 24h',
            'Procédure documentée d\'escalade et de communication',
          ]} small/>

          <H2>8 · Notre engagement</H2>
          <Box>Yoppaa est un service local, autofinancé, conçu et opéré en Belgique. Nous nous engageons à : <strong>(1)</strong> maintenir 100 % des données principales en Union européenne ; <strong>(2)</strong> ne jamais revendre ni louer les données de nos utilisateurs à des tiers ; <strong>(3)</strong> tenir ce document à jour à chaque évolution significative ; <strong>(4)</strong> répondre rapidement à toute demande de transparence sur nos pratiques.</Box>
          <P sub style={{ marginTop: 12, fontStyle: 'italic' }}>Document mis à jour le 15 juin 2026. Pour toute question : legal@yoppaa.app · www.yoppaa.app/legal/securite</P>

          <Footer n={3}/>
        </div>

      </div>
    </div>
  )
}
