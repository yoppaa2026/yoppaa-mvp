'use client'
import { useState } from 'react'

const T = {
  main: '#6B35C4',
  mid: '#9660E0',
  light: '#C4A0F4',
  pale: '#EDE0FF',
  ink: '#1A0840',
  deep: '#2D0F6B',
  muted: '#6B7280',
  bg: '#F8F6FF',
}

const sections = [
  { id: 'mentions', label: '1. Mentions légales' },
  { id: 'cgu-client', label: '2. CGU Clients' },
  { id: 'cgu-commercant', label: '3. CGU Commerçants' },
  { id: 'confidentialite', label: '4. Confidentialité & Cookies' },
  { id: 'dpa', label: '5. DPA' },
  { id: 'mediation', label: '6. Médiation' },
]

function Section({ id, title, children }) {
  return (
    <section id={id} style={{ marginBottom: '3rem', scrollMarginTop: '80px' }}>
      <h2 style={{ fontWeight: 900, fontSize: '1.4rem', color: T.deep, letterSpacing: '-0.5px', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: `3px solid ${T.pale}` }}>{title}</h2>
      {children}
    </section>
  )
}

function H3({ children }) {
  return <h3 style={{ fontWeight: 800, fontSize: '1rem', color: T.ink, marginTop: '1.5rem', marginBottom: '0.5rem' }}>{children}</h3>
}

function P({ children }) {
  return <p style={{ fontSize: '0.9rem', color: '#374151', lineHeight: 1.7, marginBottom: '0.75rem' }}>{children}</p>
}

function Ul({ items }) {
  return (
    <ul style={{ paddingLeft: '1.25rem', marginBottom: '0.75rem' }}>
      {items.map((item, i) => (
        <li key={i} style={{ fontSize: '0.9rem', color: '#374151', lineHeight: 1.7, marginBottom: '0.25rem' }}>{item}</li>
      ))}
    </ul>
  )
}

function InfoBox({ children }) {
  return (
    <div style={{ background: T.pale, borderLeft: `4px solid ${T.main}`, borderRadius: '0 8px 8px 0', padding: '0.875rem 1rem', marginBottom: '1rem' }}>
      <p style={{ fontSize: '0.875rem', color: T.deep, lineHeight: 1.6, margin: 0 }}>{children}</p>
    </div>
  )
}

export default function LegalPage() {
  const [activeSection, setActiveSection] = useState('mentions')

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>

      {/* Header */}
      <div style={{ background: `linear-gradient(160deg, ${T.deep} 0%, ${T.main} 100%)`, padding: '2rem 1.5rem', textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
          {[{c:'#fff',s:9,o:0.4},{c:'#C4A0F4',s:12,o:1},{c:'#9660E0',s:9,o:1}].map((d,i) => (
            <div key={i} style={{ width: d.s, height: d.s, borderRadius: '50%', background: d.c, opacity: d.o }}/>
          ))}
        </div>
        <h1 style={{ fontWeight: 900, fontSize: '2rem', color: '#fff', letterSpacing: '-1px', marginBottom: 6 }}>yoppaa</h1>
        <p style={{ fontSize: '0.85rem', color: T.light, fontWeight: 600 }}>Mentions légales & Conditions d'utilisation</p>
        <p style={{ fontSize: '0.75rem', color: 'rgba(196,160,244,0.6)', marginTop: 6 }}>Avcotech SRL · BCE 0731.637.418 · Rue de Prée 9G, 5640 Mettet</p>
      </div>

      <style>{`
        @media (max-width: 700px) {
          .legal-layout { grid-template-columns: 1fr !important; }
          .legal-nav { position: static !important; display: flex !important; flex-wrap: wrap !important; gap: 6px !important; padding: 0.75rem !important; }
          .legal-nav a { padding: 0.35rem 0.75rem !important; border-radius: 100px !important; border: 1.5px solid #EDE0FF; font-size: 0.72rem !important; }
        }
      `}</style>

      <div className="legal-layout" style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem', display: 'grid', gridTemplateColumns: '220px 1fr', gap: '2rem', alignItems: 'start' }}>

        {/* Navigation sticky */}
        <nav className="legal-nav" style={{ position: 'sticky', top: '1.5rem', background: '#fff', borderRadius: 16, border: `1.5px solid ${T.pale}`, padding: '1rem', boxShadow: '0 2px 12px rgba(107,53,196,0.07)' }}>
          <p style={{ fontSize: '0.7rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.75rem' }}>Sommaire</p>
          {sections.map(s => (
            <a key={s.id} href={`#${s.id}`} onClick={() => setActiveSection(s.id)}
              style={{ display: 'block', padding: '0.5rem 0.75rem', borderRadius: 8, fontSize: '0.82rem', fontWeight: activeSection === s.id ? 700 : 500, color: activeSection === s.id ? T.main : T.ink, background: activeSection === s.id ? T.pale : 'transparent', textDecoration: 'none', marginBottom: 2, transition: 'all 0.15s' }}>
              {s.label}
            </a>
          ))}
        </nav>

        {/* Contenu */}
        <main style={{ background: '#fff', borderRadius: 16, border: `1.5px solid ${T.pale}`, padding: '2rem', boxShadow: '0 2px 12px rgba(107,53,196,0.07)' }}>

          {/* 1. MENTIONS LÉGALES */}
          <Section id="mentions" title="1. Mentions légales">
            <H3>Éditeur de la plateforme</H3>
            <P>La plateforme Yoppaa (accessible via yoppaa.app) est éditée par :</P>
            <InfoBox>
              Avcotech SRL · Forme juridique : Société à Responsabilité Limitée (SRL) de droit belge{'\n'}
              Numéro d'entreprise (BCE) : 0731.637.418 · Numéro de TVA : BE0731.637.418{'\n'}
              Siège social : Rue de Prée 9G, 5640 Mettet, Belgique{'\n'}
              Email : bonjour@yoppaa.app · Support : support@yoppaa.app
            </InfoBox>
            <P>Yoppaa est un produit et une marque commerciale d'Avcotech SRL.</P>

            <H3>Hébergement</H3>
            <Ul items={[
              'Vercel Inc. — 340 Pine Street, Suite 701, San Francisco, CA 94104 (hébergement application)',
              'Supabase Inc. — base de données et authentification (serveurs Europe)',
              'Hostinger — domaine yoppaa.app',
            ]}/>

            <H3>Responsable de la publication</H3>
            <P>Alexandre Verstappen — alexandre@avcotech.be</P>

            <H3>Propriété intellectuelle</H3>
            <P>L'ensemble des contenus présents sur la plateforme Yoppaa (textes, graphismes, logos, icônes, images, logiciels) sont la propriété exclusive d'Avcotech SRL ou font l'objet d'une autorisation d'utilisation. Toute reproduction, représentation, modification, publication ou adaptation, totale ou partielle, est interdite sans l'accord préalable écrit d'Avcotech SRL.</P>
          </Section>

          {/* 2. CGU CLIENT */}
          <Section id="cgu-client" title="2. Conditions Générales d'Utilisation — Clients (Yoppers)">
            <H3>Préambule</H3>
            <P>Les présentes CGU régissent l'utilisation de la plateforme Yoppaa par les clients (ci-après « Yoppers »). En accédant à la plateforme et en passant une commande, le Client accepte sans réserve les présentes CGU.</P>
            <P>Yoppaa est une plateforme de commande en ligne de type click & collect permettant aux clients de commander auprès de commerçants partenaires et de retirer leur commande en magasin selon un créneau horaire choisi, sans attente.</P>

            <H3>1. Accès à la plateforme</H3>
            <P>L'accès à la plateforme Yoppaa est gratuit pour les clients. Yoppaa se réserve le droit de suspendre ou supprimer tout compte en cas d'utilisation frauduleuse ou contraire aux présentes CGU.</P>

            <H3>2. Processus de commande</H3>
            <Ul items={[
              'Le Client sélectionne un commerçant partenaire sur la plateforme.',
              'Il compose sa commande parmi les articles disponibles.',
              'Il choisit un créneau horaire de retrait.',
              'Il renseigne ses coordonnées et procède au paiement en ligne sécurisé.',
              'La commande est confirmée par email dès validation du paiement.',
              'Le Client se présente en magasin au créneau choisi et retire sa commande.',
            ]}/>

            <H3>3. Prix et paiement</H3>
            <P>Les prix affichés sont fixés par les commerçants partenaires, exprimés en euros TTC. Le paiement est effectué via Stripe, prestataire de paiement sécurisé. Les données bancaires du Client ne sont jamais accessibles à Yoppaa ni aux commerçants.</P>

            <H3>4. Droit de rétractation</H3>
            <P>Conformément à l'article VI.53, 4° du Code de droit économique belge, les commandes de produits alimentaires ne peuvent pas faire l'objet d'un remboursement après validation. En cas de non-disponibilité d'un article, le remboursement est effectué dans un délai de 5 à 10 jours ouvrables.</P>

            <H3>5. Responsabilité</H3>
            <P>Yoppaa agit en qualité d'intermédiaire technique. Les commerçants partenaires sont seuls responsables de la qualité et de la disponibilité des produits proposés.</P>

            <H3>6. Modification des CGU</H3>
            <P>Avcotech SRL se réserve le droit de modifier les présentes CGU à tout moment. L'utilisation de la plateforme après modification vaut acceptation des nouvelles CGU.</P>
          </Section>

          {/* 3. CGU COMMERÇANT */}
          <Section id="cgu-commercant" title="3. Conditions Générales d'Utilisation — Commerçants">
            <H3>Préambule</H3>
            <P>Les présentes CGU régissent l'utilisation de la plateforme Yoppaa par les commerçants partenaires. En créant un compte et en activant leur page sur Yoppaa, les Commerçants acceptent sans réserve les présentes CGU.</P>

            <H3>1. Abonnement et tarification</H3>
            <Ul items={[
              'Plan ON : gratuit à vie, présence basique (page Yoppaa + horaires + avis), sans engagement',
              'Plan FULL alimentaire : 59,90€ HTVA/mois (ou 599€ HTVA/an, soit 49,92€/mois) — Click & Collect, livraison, fidélité, deals, Good Morning Yoppers, dashboard commandes, kit hardware optionnel',
              'Plan FULL vitrine : 39,90€ HTVA/mois (ou 399€ HTVA/an, soit 33,25€/mois) — Module RDV natif (prestations, créneaux, agenda, multi-praticiens), fidélité automatique, deals, Good Morning Yoppers. Zéro commission sur les acomptes RDV.',
              'Plan PUBLIC (services & administrations) : gratuit à vie — actus + alertes officielles uniquement',
            ]}/>
            <P>Les Commerçants Ambassadeurs Fondateurs bénéficient de conditions préférentielles définies dans leur contrat individuel d&rsquo;ambassadeur, sans engagement de durée au-delà de ce qui y est précisé.</P>

            <H3>2. Facturation et paiement</H3>
            <P>La facturation est effectuée automatiquement via Stripe Billing pour les plans FULL. Le Commerçant renseigne son moyen de paiement (carte ou IBAN) lors de l&rsquo;activation. En cas d&rsquo;échec de paiement, Stripe effectue 3 tentatives automatiques avant suspension du compte (downgrade vers ON, données conservées).</P>

            <H3>2bis. Indexation tarifaire</H3>
            <P>Les tarifs sont révisables annuellement au 1er janvier, sur base de l&rsquo;IPC du mois d&rsquo;octobre publié par Statbel. Le Commerçant est notifié au plus tard le 1er décembre précédant la révision. Les tarifs préférentiels Ambassadeurs Fondateurs ne sont pas soumis à indexation pendant leur durée garantie.</P>

            <H3>2ter. Paiements en ligne et frais Stripe (plan FULL uniquement)</H3>
            <P>Les paiements en ligne (acomptes RDV pour les vitrines, commandes Click &amp; Collect pour l&rsquo;alimentaire) sont traités via Stripe Connect Express en Direct Charge. L&rsquo;argent est versé directement sur le compte bancaire du Commerçant (sous 7 jours ouvrés). Les frais Stripe (environ 1,4% + 0,25€ par transaction pour les cartes européennes) sont supportés par le Commerçant et prélevés à la source par Stripe. Yoppaa ne prélève aucune commission sur les transactions.</P>
            <P>Le Commerçant garantit Yoppaa contre tout chargeback, remboursement, contestation de paiement ou solde négatif lié à son activité sur la plateforme. En cas de solde négatif persistant sur son compte Stripe Connect, le Commerçant s&rsquo;engage à régler Yoppaa du montant correspondant sous 30 jours à compter de la notification écrite.</P>

            <H3>4. Obligations du Commerçant</H3>
            <Ul items={[
              'Proposer des produits conformes aux descriptions publiées.',
              'Assurer la disponibilité des produits commandés dans les créneaux définis.',
              'Respecter la législation relative à la vente de produits alimentaires.',
              'Ne pas utiliser les données des Clients à des fins non autorisées.',
            ]}/>

            <H3>5. Résiliation</H3>
            <P>Le Commerçant peut résilier son abonnement FULL ou effectuer un downgrade vers le plan ON gratuit moyennant un préavis d&rsquo;un mois calendrier, prenant effet le 1er jour du mois suivant. Pour que le préavis prenne effet le 1er du mois M+1, il doit être notifié au plus tard le 17e jour du mois M (14 jours avant). En cas de downgrade vers ON, les données du Commerçant sont conservées mais les fonctionnalités FULL (paiement en ligne, RDV ou Click &amp; Collect, livraison, fidélité, etc.) sont désactivées.</P>
            <P>Le préavis doit être notifié par courrier recommandé à Avcotech SRL (Rue de Prée 9G, 5640 Mettet) ou par email à facturation@yoppaa.app.</P>
            <InfoBox>
              Exemple : préavis notifié le 10 mars → effet le 1er avril ✓{'\n'}
              Préavis notifié le 20 mars → effet le 1er mai (hors délai)
            </InfoBox>
          </Section>

          {/* 4. CONFIDENTIALITÉ */}
          <Section id="confidentialite" title="4. Politique de confidentialité et cookies">
            <H3>Responsable du traitement</H3>
            <P>Avcotech SRL · BCE 0731.637.418 · dpo@yoppaa.app</P>

            <H3>Données collectées</H3>
            <P><strong>Clients :</strong> prénom, nom, email, téléphone, historique des commandes, consentements RGPD, données de localisation (si autorisées).</P>
            <P><strong>Commerçants :</strong> données d'identification, coordonnées, BCE, données de facturation, données d'activité.</P>

            <H3>Finalités du traitement</H3>
            <Ul items={[
              'Exécution des commandes et gestion des créneaux',
              'Authentification et gestion des comptes',
              'Facturation et traitement des paiements (via Stripe)',
              'Communications relatives aux commandes',
              'Amélioration de la plateforme et statistiques',
              'Communications marketing du commerçant (uniquement avec consentement explicite du Client)',
            ]}/>

            <H3>Durée de conservation</H3>
            <Ul items={[
              'Données de commande : 5 ans (obligations fiscales)',
              'Données de compte : durée de vie du compte + 1 an',
              'Données de consentement : 3 ans',
              'Logs techniques : 12 mois maximum',
            ]}/>

            <H3>Droits des utilisateurs</H3>
            <P>Conformément au RGPD, vous disposez des droits d'accès, rectification, effacement, limitation, portabilité et opposition. Pour exercer ces droits : support@yoppaa.app</P>
            <P>En cas de litige non résolu, vous pouvez saisir l'Autorité de Protection des Données (APD) belge : www.autoriteprotectiondonnees.be</P>

            <H3>Cookies</H3>
            <P>Yoppaa utilise uniquement des cookies techniques indispensables au fonctionnement (session, authentification). Aucun cookie publicitaire ou de suivi tiers n'est utilisé.</P>

            <H3>Partage des données</H3>
            <P>Yoppaa ne vend jamais les données personnelles. Les données peuvent être partagées avec les commerçants partenaires (exécution de commande uniquement), Stripe (paiements), Supabase (hébergement Europe) et Vercel (infrastructure).</P>
          </Section>

          {/* 5. DPA */}
          <Section id="dpa" title="5. Data Processing Agreement (DPA)">
            <H3>Préambule</H3>
            <P>Le présent DPA est conclu entre Avcotech SRL (Yoppaa, sous-traitant) et le Commerçant partenaire (responsable du traitement pour ses clients), conformément à l'article 28 du RGPD.</P>

            <H3>Obligations du Commerçant</H3>
            <Ul items={[
              "N'utiliser les données des Clients que pour les finalités consenties.",
              'Ne pas transmettre les données à des tiers sans autorisation.',
              'Assurer la sécurité et la confidentialité des données.',
              'Informer Yoppaa de toute violation de données dans les 24 heures.',
            ]}/>

            <H3>Obligations de Yoppaa</H3>
            <Ul items={[
              'Traiter les données uniquement sur instruction du Commerçant.',
              'Assurer la sécurité technique et organisationnelle.',
              'Notifier le Commerçant de toute violation de données.',
              'Supprimer les données à la fin de la relation contractuelle.',
            ]}/>

            <H3>Sous-traitants</H3>
            <Ul items={[
              'Supabase Inc. — base de données (serveurs Europe)',
              'Vercel Inc. — hébergement application',
              'Stripe Inc. — traitement des paiements',
            ]}/>
            <P>Les transferts vers Vercel et Stripe sont encadrés par les Clauses Contractuelles Types (CCT) de la Commission Européenne.</P>
          </Section>

          {/* 6. MÉDIATION */}
          <Section id="mediation" title="6. Médiation de consommation">
            <H3>Obligation légale</H3>
            <P>Conformément à la législation belge (Loi du 4 avril 2014) et au Code de droit économique (Livre XVI), Avcotech SRL informe les consommateurs de l'existence d'un service de médiation compétent.</P>

            <H3>Procédure</H3>
            <P>En cas de litige, contactez Yoppaa en premier lieu à support@yoppaa.app. Yoppaa s'engage à répondre dans un délai de 5 jours ouvrables. Si aucune solution n'est trouvée dans les 30 jours, vous pouvez saisir le service de médiation.</P>

            <H3>Service de médiation compétent</H3>
            <InfoBox>
              Consumer Mediation Service{'\n'}
              Boulevard du Roi Albert II, 8 bte 1 — 1000 Bruxelles{'\n'}
              www.mediationconsommateur.be · contact@mediationconsommateur.be
            </InfoBox>
            <P>Plateforme européenne RLL : https://ec.europa.eu/consumers/odr</P>

            <H3>Mentions Stripe</H3>
            <P>Les paiements sont traités par Stripe Payments Europe, Ltd. (1 Grand Canal Street Lower, Dublin 2), agréé par la Banque Centrale d'Irlande. Litiges paiement : stripe.com/contact</P>

            {/* Footer */}
            <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: `1px solid ${T.pale}`, textAlign: 'center' }}>
              <p style={{ fontSize: '0.75rem', color: T.muted, marginBottom: 4 }}>
                Document établi le {new Date().toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <p style={{ fontSize: '0.75rem', color: T.muted }}>
                Avcotech SRL · BCE 0731.637.418 · TVA BE0731.637.418 · Rue de Prée 9G, 5640 Mettet
              </p>
              <p style={{ fontSize: '0.72rem', color: '#9CA3AF', marginTop: 8, fontStyle: 'italic' }}>
                Ces textes constituent une base légale sérieuse mais ne remplacent pas l'avis d'un juriste qualifié.
              </p>
            </div>
          </Section>

        </main>
      </div>
    </div>
  )
}