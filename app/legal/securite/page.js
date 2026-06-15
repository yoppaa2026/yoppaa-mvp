'use client'
// ════════════════════════════════════════════════════════════════════
// /legal/securite
//
// Note publique « Sécurité & Hébergement » de Yoppaa.
// Document de transparence destiné aux partenaires institutionnels,
// commerçants et citoyens. À jour 2026-06-15.
//
// Version imprimable A4 : /legal/securite/print
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

function Section({ id, title, children }) {
  return (
    <section id={id} style={{ marginBottom: '2.5rem', scrollMarginTop: '80px' }}>
      <h2 style={{ fontWeight: 900, fontSize: '1.35rem', color: T.deep, letterSpacing: '-0.5px', marginBottom: '1.1rem', paddingBottom: '0.65rem', borderBottom: `3px solid ${T.pale}` }}>{title}</h2>
      {children}
    </section>
  )
}

function H3({ children }) {
  return <h3 style={{ fontWeight: 800, fontSize: '1rem', color: T.ink, marginTop: '1.4rem', marginBottom: '0.5rem' }}>{children}</h3>
}

function P({ children }) {
  return <p style={{ fontSize: '0.92rem', color: '#374151', lineHeight: 1.7, marginBottom: '0.75rem' }}>{children}</p>
}

function Ul({ items }) {
  return (
    <ul style={{ paddingLeft: '1.25rem', marginBottom: '0.75rem' }}>
      {items.map((item, i) => (
        <li key={i} style={{ fontSize: '0.9rem', color: '#374151', lineHeight: 1.7, marginBottom: '0.3rem' }}>{item}</li>
      ))}
    </ul>
  )
}

function InfoBox({ children, tone = 'info' }) {
  const bg = tone === 'success' ? '#ECFDF5' : T.pale
  const border = tone === 'success' ? '#10B981' : T.main
  const color = tone === 'success' ? '#065F46' : T.deep
  return (
    <div style={{ background: bg, borderLeft: `4px solid ${border}`, borderRadius: '0 8px 8px 0', padding: '0.875rem 1rem', marginBottom: '1rem' }}>
      <p style={{ fontSize: '0.88rem', color, lineHeight: 1.6, margin: 0 }}>{children}</p>
    </div>
  )
}

function TableSimple({ headers, rows }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: '1rem', borderRadius: 8, border: `1px solid ${T.pale}` }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ background: T.pale }}>
            {headers.map((h, i) => (
              <th key={i} style={{ padding: '0.6rem 0.8rem', textAlign: 'left', fontWeight: 800, color: T.deep, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${T.pale}` }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '0.6rem 0.8rem', color: '#374151', lineHeight: 1.5, verticalAlign: 'top' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const sections = [
  { id: 'preambule',      label: '1. Préambule' },
  { id: 'hebergement',    label: '2. Hébergement & infrastructure' },
  { id: 'donnees',        label: '3. Données traitées' },
  { id: 'securite',       label: '4. Sécurité technique' },
  { id: 'rgpd',           label: '5. Conformité RGPD' },
  { id: 'gouvernance',    label: '6. Gouvernance & contact' },
  { id: 'continuite',     label: '7. Continuité & sauvegarde' },
  { id: 'engagement',     label: '8. Notre engagement' },
]

export default function NoteSecurite() {
  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif' }}>

      {/* HERO */}
      <div style={{ background: `linear-gradient(160deg, ${T.deep} 0%, ${T.main} 100%)`, padding: '2.5rem 1.5rem', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <p style={{ margin: 0, fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '2.2rem', letterSpacing: '-0.05em', lineHeight: 1 }}>
            <span style={{ color: '#fff' }}>yo</span>
            <span style={{ color: T.light }}>pp</span>
            <span style={{ color: T.mid }}>aa</span>
          </p>
          <div style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 6, height: 14 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#fff' }}/>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.light, marginTop: 4 }}/>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: T.light, marginTop: 4 }}/>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.mid, marginTop: 4 }}/>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: T.mid }}/>
          </div>
        </div>
        <p style={{ fontSize: '0.95rem', color: T.light, fontWeight: 600, margin: '20px 0 4px' }}>
          Sécurité & Hébergement
        </p>
        <p style={{ fontSize: '0.78rem', color: 'rgba(196,160,244,0.7)', margin: '4px 0 8px' }}>
          Avcotech SRL · BCE 0731.637.148 · TVA BE0731637148 · Rue de Prée 9G, 5640 Mettet
        </p>
        <p style={{ fontSize: '0.72rem', color: 'rgba(196,160,244,0.55)', margin: 0, letterSpacing: '0.3px' }}>
          Document public · Version du 15 juin 2026
        </p>
      </div>

      {/* BOUTON IMPRESSION */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${T.pale}`, padding: '0.75rem 1.5rem', textAlign: 'right' }}>
        <a href="/legal/securite/print" target="_blank" rel="noopener"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 700, color: T.main, textDecoration: 'none', padding: '6px 14px', border: `1.5px solid ${T.main}`, borderRadius: 100 }}>
          📄 Version imprimable (PDF A4)
        </a>
      </div>

      <style>{`
        @media (max-width: 800px) {
          .secu-layout { grid-template-columns: 1fr !important; }
          .secu-nav { position: relative !important; top: auto !important; }
        }
      `}</style>

      <div className="secu-layout" style={{ display: 'grid', gridTemplateColumns: '260px 1fr', maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem 4rem', gap: '2.5rem' }}>

        {/* NAV LATÉRALE */}
        <nav className="secu-nav" style={{ position: 'sticky', top: 24, alignSelf: 'start' }}>
          <p style={{ fontSize: '0.7rem', fontWeight: 800, color: T.muted, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 12 }}>Sommaire</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {sections.map(s => (
              <li key={s.id}>
                <a href={`#${s.id}`} style={{ display: 'block', padding: '7px 12px', fontSize: '0.85rem', color: T.deep, textDecoration: 'none', borderRadius: 6, fontWeight: 600, lineHeight: 1.4 }}>
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 24, paddingTop: 18, borderTop: `1px solid ${T.pale}` }}>
            <p style={{ fontSize: '0.72rem', color: T.muted, lineHeight: 1.5, marginBottom: 6 }}>Contact RGPD</p>
            <a href="mailto:legal@yoppaa.app" style={{ fontSize: '0.82rem', color: T.main, fontWeight: 700, textDecoration: 'none' }}>legal@yoppaa.app</a>
          </div>
        </nav>

        {/* CONTENU */}
        <main style={{ background: '#fff', borderRadius: 16, padding: '2.5rem 2.2rem', boxShadow: '0 4px 24px rgba(26,8,64,0.06)', minWidth: 0 }}>

          {/* 1. PRÉAMBULE */}
          <Section id="preambule" title="1. Préambule">
            <P>Yoppaa est un service numérique de proximité édité par <strong>Avcotech SRL</strong>, société de droit belge. Yoppaa connecte les habitants d&rsquo;une commune avec ses commerçants et ses services publics, dans une logique de proximité, de transparence et de souveraineté des données.</P>
            <P>Ce document décrit l&rsquo;ensemble des mesures techniques et organisationnelles mises en œuvre pour assurer la sécurité, la confidentialité et l&rsquo;intégrité des données traitées par Yoppaa, conformément au Règlement Général sur la Protection des Données (Règlement UE 2016/679, ci-après «&nbsp;RGPD&nbsp;») et au droit belge.</P>
            <InfoBox tone="success">
              <strong>Position de Yoppaa</strong> : 100&nbsp;% des données sensibles sont hébergées <strong>dans l&rsquo;Union européenne</strong>. Aucune donnée personnelle de citoyen ou de commerçant n&rsquo;est transférée hors UE pour son traitement principal.
            </InfoBox>
          </Section>

          {/* 2. HÉBERGEMENT */}
          <Section id="hebergement" title="2. Hébergement & infrastructure">
            <P>Yoppaa s&rsquo;appuie sur des prestataires de classe mondiale, sélectionnés pour leur conformité RGPD, leur certification ISO&nbsp;27001 et leur capacité à héberger les données en Union européenne.</P>
            <TableSimple
              headers={['Composant', 'Prestataire', 'Localisation', 'Conformité']}
              rows={[
                ['Application web (frontend + serverless)', 'Vercel (Pro)', 'Réseau Edge mondial, fonctions UE', 'ISO 27001 · SOC 2 · DPA RGPD'],
                ['Base de données', 'Supabase', 'Frankfurt (eu-central-1, Allemagne)', 'ISO 27001 · SOC 2 · DPA RGPD'],
                ['Emails transactionnels', 'Resend', 'Dublin (eu-west-1, Irlande)', 'ISO 27001 · DPA RGPD'],
                ['Boîtes mail Yoppaa', 'Proton Mail', 'Suisse', 'Chiffrement de bout en bout · LPD'],
                ['Paiements', 'Stripe Payments / Connect', 'Dublin (Irlande)', 'PCI DSS Niveau 1 · DPA RGPD'],
                ['Protection anti-bot', 'Cloudflare Turnstile', 'Réseau Edge UE', 'DPA RGPD'],
                ['Nom de domaine & DNS', 'Hostinger', 'UE', 'DPA RGPD'],
                ['Code source', 'GitHub (dépôt privé)', 'UE / US (chiffré)', 'SOC 2 · DPA RGPD'],
              ]}
            />
            <P>Toutes les communications réseau entre l&rsquo;utilisateur et Yoppaa transitent en <strong>HTTPS / TLS 1.3 obligatoire</strong>. Le certificat SSL est renouvelé automatiquement par Vercel. Les communications entre serveurs internes (frontend ↔ base de données) sont également chiffrées en transit.</P>
          </Section>

          {/* 3. DONNÉES TRAITÉES */}
          <Section id="donnees" title="3. Données traitées">
            <P>Yoppaa traite trois catégories de données, en fonction du profil de l&rsquo;utilisateur. Chaque traitement repose sur une base légale identifiée et une finalité limitée.</P>

            <H3>3.1. Citoyens (« Yoppers »)</H3>
            <Ul items={[
              'Identifiants : prénom, nom, adresse e-mail, mot de passe haché (bcrypt)',
              'Contact : numéro de téléphone, code postal',
              'Préférences : commerces favoris, historique de commandes et de rendez-vous',
              'Données de service : créneaux choisis, paniers, notes laissées sur les commerces',
            ]}/>
            <P style={{ marginBottom: '0.5rem' }}><strong>Base légale</strong> : exécution du contrat de service (art. 6.1.b RGPD).</P>
            <P><strong>Durée</strong> : conservation pendant la durée d&rsquo;utilisation du service + 3 ans à compter du dernier login. Suppression automatique au-delà.</P>

            <H3>3.2. Commerçants</H3>
            <Ul items={[
              'Identification d\'entreprise : raison sociale, BCE, numéro de TVA, adresse',
              'Contact : e-mail, téléphone, IBAN (pour les paiements Stripe)',
              'Données opérationnelles : catalogue d\'articles, créneaux, statistiques internes',
              'Pas de stockage de données bancaires (gérées par Stripe, certifié PCI DSS)',
            ]}/>
            <P style={{ marginBottom: '0.5rem' }}><strong>Base légale</strong> : exécution du contrat de service + obligation légale (facturation, comptabilité).</P>
            <P><strong>Durée</strong> : durée du contrat + 10 ans (obligation comptable belge).</P>

            <H3>3.3. Services publics (commune, CPAS, école, etc.)</H3>
            <Ul items={[
              'Données strictement publiques : nom, adresse, horaires, contacts officiels, codes postaux desservis',
              'Contenu éditorial : actualités, alertes, informations pratiques',
              'Aucune donnée personnelle de citoyen n\'est collectée par le canal « service public »',
            ]}/>
            <P><strong>Base légale</strong> : exécution d&rsquo;une mission d&rsquo;intérêt public (art. 6.1.e RGPD). La commune partenaire reste responsable du traitement de ses propres publications.</P>
          </Section>

          {/* 4. SÉCURITÉ */}
          <Section id="securite" title="4. Sécurité technique">
            <P>Yoppaa applique un ensemble de mesures techniques calibrées sur les standards de l&rsquo;industrie SaaS.</P>

            <H3>4.1. Chiffrement</H3>
            <Ul items={[
              'En transit : TLS 1.3 obligatoire sur toutes les requêtes (HTTPS uniquement)',
              'Au repos : chiffrement AES-256 des données et des sauvegardes côté Supabase',
              'Mots de passe : hachage bcrypt (jamais stockés en clair)',
              'Tokens d\'authentification : signés JWT avec rotation régulière',
            ]}/>

            <H3>4.2. Contrôle d&rsquo;accès</H3>
            <Ul items={[
              'Row-Level Security (RLS) activée sur l\'ensemble des tables de la base de données : un utilisateur ne peut techniquement accéder qu\'aux lignes le concernant',
              'Authentification par Magic Link (lien à usage unique envoyé par e-mail) ou mot de passe',
              'Séparation stricte des rôles : citoyen, commerçant, administrateur communal, équipe Yoppaa',
              'Aucun mot de passe d\'administration partagé ; politique 1 personne = 1 compte',
            ]}/>

            <H3>4.3. Protection contre les abus</H3>
            <Ul items={[
              'Cloudflare Turnstile sur les formulaires d\'inscription et de contact (protection bots)',
              'Limitation du nombre de requêtes par adresse IP (rate limiting) sur les routes sensibles',
              'Audit régulier des dépendances (Dependabot, mises à jour de sécurité automatiques)',
              'Vérification BCE des commerçants à l\'inscription (registre belge)',
            ]}/>

            <H3>4.4. Code & déploiement</H3>
            <Ul items={[
              'Code source en dépôt privé GitHub avec contrôle d\'accès',
              'Déploiements continus via Vercel : chaque version est tracée, réversible et signée',
              'Pas de secret en clair dans le code (variables d\'environnement chiffrées Vercel)',
              'Environnement de prévisualisation isolé pour chaque évolution avant mise en production',
            ]}/>
          </Section>

          {/* 5. RGPD */}
          <Section id="rgpd" title="5. Conformité RGPD">
            <P>Yoppaa traite les données personnelles dans le strict respect du RGPD et de la loi belge du 30 juillet 2018 relative à la protection des personnes physiques à l&rsquo;égard du traitement des données à caractère personnel.</P>

            <H3>5.1. Droits des personnes concernées</H3>
            <P>Toute personne dont les données sont traitées par Yoppaa peut exercer, à tout moment et gratuitement, les droits suivants&nbsp;:</P>
            <Ul items={[
              'Droit d\'accès aux données la concernant',
              'Droit de rectification des données inexactes ou incomplètes',
              'Droit à l\'effacement (« droit à l\'oubli »)',
              'Droit à la limitation du traitement',
              'Droit à la portabilité des données (format structuré, machine-lisible)',
              'Droit d\'opposition au traitement',
              'Droit de retirer son consentement à tout moment',
            ]}/>
            <P>Ces droits peuvent être exercés en écrivant à <a href="mailto:legal@yoppaa.app" style={{ color: T.main, fontWeight: 700, textDecoration: 'none' }}>legal@yoppaa.app</a>. Yoppaa s&rsquo;engage à répondre dans un délai maximum d&rsquo;<strong>un mois</strong>.</P>

            <H3>5.2. Sous-traitants (DPA)</H3>
            <P>Tous les prestataires listés en section 2 ont conclu un accord de traitement de données (Data Processing Agreement) avec Avcotech SRL, conforme aux exigences de l&rsquo;article 28 du RGPD. La liste des sous-traitants et les DPA sont disponibles sur simple demande.</P>

            <H3>5.3. Transferts hors UE</H3>
            <InfoBox tone="success">
              Les données personnelles principales (citoyens, commerçants) sont <strong>exclusivement hébergées en Union européenne</strong> (Allemagne et Irlande). Aucun transfert structurel hors UE n&rsquo;est effectué pour les données opérationnelles.
            </InfoBox>
            <P>Pour les services techniques d&rsquo;infrastructure (réseau Edge mondial Vercel), des Clauses Contractuelles Types (CCT) de la Commission européenne sont en place avec les prestataires concernés, conformément à l&rsquo;article 46 du RGPD.</P>

            <H3>5.4. Registre des traitements</H3>
            <P>Avcotech SRL tient à jour un registre des activités de traitement conformément à l&rsquo;article 30 du RGPD. Ce registre est disponible sur demande de l&rsquo;Autorité de protection des données (APD).</P>

            <H3>5.5. Cookies & traceurs</H3>
            <P>Yoppaa n&rsquo;utilise pas de cookies de pistage publicitaire. Seuls des cookies strictement nécessaires au fonctionnement du service (session, authentification, préférences) sont déposés. Aucun consentement préalable n&rsquo;est requis pour ces cookies essentiels.</P>
          </Section>

          {/* 6. GOUVERNANCE */}
          <Section id="gouvernance" title="6. Gouvernance & contact">
            <H3>6.1. Responsable du traitement</H3>
            <P><strong>Avcotech SRL</strong><br/>
            BCE 0731.637.148 · TVA BE0731.637.148<br/>
            Rue de Prée 9G, 5640 Mettet, Belgique</P>

            <H3>6.2. Délégué à la Protection des Données (DPO)</H3>
            <P>La fonction de DPO est assumée par <strong>Alexandre Verstappen</strong>, gérant d&rsquo;Avcotech SRL.<br/>
            Contact direct&nbsp;: <a href="mailto:legal@yoppaa.app" style={{ color: T.main, fontWeight: 700, textDecoration: 'none' }}>legal@yoppaa.app</a></P>

            <H3>6.3. Notification des violations de données</H3>
            <P>En cas de violation de données à caractère personnel susceptible d&rsquo;engendrer un risque pour les droits et libertés des personnes physiques, Avcotech SRL s&rsquo;engage à&nbsp;:</P>
            <Ul items={[
              'Notifier l\'Autorité de protection des données (APD) dans les 72 heures suivant la prise de connaissance de l\'incident, conformément à l\'article 33 du RGPD',
              'Informer sans délai les personnes concernées si le risque est élevé, conformément à l\'article 34 du RGPD',
              'Documenter toute violation, y compris ses effets et les mesures prises pour y remédier',
            ]}/>

            <H3>6.4. Autorité de contrôle</H3>
            <P>L&rsquo;autorité de contrôle compétente est l&rsquo;Autorité de protection des données (APD) belge&nbsp;:<br/>
            Rue de la Presse 35, 1000 Bruxelles · <a href="https://www.autoriteprotectiondonnees.be" target="_blank" rel="noopener noreferrer" style={{ color: T.main, fontWeight: 700, textDecoration: 'none' }}>autoriteprotectiondonnees.be</a></P>
          </Section>

          {/* 7. CONTINUITÉ */}
          <Section id="continuite" title="7. Continuité & sauvegarde">
            <P>Yoppaa met en œuvre un plan de continuité de service qui repose sur les éléments suivants&nbsp;:</P>
            <Ul items={[
              'Sauvegardes automatiques quotidiennes de la base de données (rétention 7 jours, point-in-time recovery)',
              'Réplication géographique des données par Supabase au sein de l\'UE',
              'Monitoring continu de l\'infrastructure (Vercel Analytics + alertes anomalies)',
              'Plan de reprise d\'activité (PRA) avec objectif de reprise (RTO) sous 4 heures et perte de données maximale (RPO) inférieure à 24 heures',
              'Procédure documentée d\'escalade et de communication en cas d\'incident majeur',
            ]}/>
          </Section>

          {/* 8. ENGAGEMENT */}
          <Section id="engagement" title="8. Notre engagement">
            <InfoBox>
              Yoppaa est un service local, autofinancé, conçu et opéré en Belgique. Nous nous engageons à&nbsp;:
              <ul style={{ margin: '0.6rem 0 0', paddingLeft: '1.2rem', lineHeight: 1.7 }}>
                <li>Maintenir <strong>100&nbsp;% des données principales en Union européenne</strong></li>
                <li>Ne jamais revendre ni louer les données de nos utilisateurs à des tiers</li>
                <li>Tenir ce document à jour à chaque évolution significative</li>
                <li>Répondre dans les meilleurs délais à toute demande de transparence sur nos pratiques</li>
              </ul>
            </InfoBox>
            <P style={{ marginTop: '1.5rem', fontSize: '0.82rem', color: T.muted, fontStyle: 'italic' }}>
              Document mis à jour le 15 juin 2026. Pour toute question, écrivez à <a href="mailto:legal@yoppaa.app" style={{ color: T.main, fontWeight: 700, textDecoration: 'none' }}>legal@yoppaa.app</a>.
            </P>
          </Section>

        </main>
      </div>

      {/* FOOTER */}
      <div style={{ background: T.ink, color: 'rgba(255,255,255,0.65)', padding: '1.5rem', textAlign: 'center', fontSize: '0.75rem' }}>
        Yoppaa · Avcotech SRL · BCE 0731.637.148 · Rue de Prée 9G, 5640 Mettet · <a href="mailto:legal@yoppaa.app" style={{ color: T.light, textDecoration: 'none', fontWeight: 600 }}>legal@yoppaa.app</a>
      </div>
    </div>
  )
}
