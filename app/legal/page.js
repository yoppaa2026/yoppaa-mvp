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
        <h1 style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '2rem', color: '#fff', letterSpacing: '-0.05em', marginBottom: 6, lineHeight: 1 }}>yoppaa</h1>
        <p style={{ fontSize: '0.85rem', color: T.light, fontWeight: 600 }}>Mentions légales & Conditions d'utilisation</p>
        <p style={{ fontSize: '0.75rem', color: 'rgba(196,160,244,0.6)', marginTop: 6 }}>Avcotech SRL · BCE 0731.637.148 · Rue de Prée 9G, 5640 Mettet</p>
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
              Numéro d'entreprise (BCE) : 0731.637.148 · Numéro de TVA : BE0731.637.148{'\n'}
              Siège social : Rue de Prée 9G, 5640 Mettet, Belgique{'\n'}
              Email : hello@yoppaa.app · Support : support@yoppaa.app
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
            <P>Les présentes CGU régissent l'utilisation de la plateforme Yoppaa par les clients (ci-après « Yoppers »). En accédant à la plateforme, en passant une commande ou en réservant un rendez-vous, le Client accepte sans réserve les présentes CGU.</P>
            <P>Yoppaa est une plateforme belge qui met en relation les habitants et les commerces de leur quartier : commande en ligne avec retrait en magasin (Click &amp; Collect), livraison locale, expédition pour les boutiques, prise de rendez-vous chez les commerçants de services, deals et actualités des commerces.</P>

            <H3>1. Accès à la plateforme</H3>
            <P>L'accès à la plateforme Yoppaa est gratuit pour les clients. La commande est possible sans créer de compte ; la création d'un compte (facultative) permet de suivre ses commandes et rendez-vous. Yoppaa se réserve le droit de suspendre ou supprimer tout compte en cas d'utilisation frauduleuse ou contraire aux présentes CGU.</P>

            <H3>2. Processus de commande</H3>
            <Ul items={[
              'Le Client sélectionne un commerçant partenaire sur la plateforme.',
              'Il compose sa commande parmi les articles disponibles (avec, le cas échéant, les variantes proposées : taille, couleur, etc.).',
              'Il choisit le mode de réception proposé par le commerçant : retrait en magasin sur créneau horaire, livraison locale ou expédition (boutiques).',
              'Il renseigne ses coordonnées et procède au paiement en ligne sécurisé ou, si le commerçant l’autorise, opte pour le paiement sur place au retrait.',
              'La commande est confirmée par email, puis le Client est prévenu lorsqu’elle est prête, en livraison ou expédiée.',
            ]}/>

            <H3>3. Rendez-vous en ligne</H3>
            <P>Pour les commerçants de services, le Client peut réserver une prestation en ligne (choix de la prestation, du praticien le cas échéant, de la date et de l'heure). Certains commerçants demandent un acompte payé en ligne au moment de la réservation : son montant et les conditions d'annulation sont affichés avant la confirmation. Des rappels automatiques peuvent être envoyés avant le rendez-vous.</P>

            <H3>4. Prix et paiement</H3>
            <P>Les prix affichés sont fixés par les commerçants partenaires, exprimés en euros TTC. Le paiement en ligne est effectué via Stripe, prestataire de paiement sécurisé (cartes de paiement, Bancontact). Les données bancaires du Client ne sont jamais accessibles à Yoppaa ni aux commerçants.</P>

            <H3>5. Droit de rétractation</H3>
            <P><strong>Produits alimentaires et périssables :</strong> conformément à l'article VI.53 du Code de droit économique belge, les commandes de denrées périssables ne peuvent pas faire l'objet d'une rétractation après validation. En cas d'indisponibilité d'un article, le remboursement est effectué dans un délai de 5 à 10 jours ouvrables.</P>
            <P><strong>Produits non alimentaires commandés à distance (boutiques, expédition) :</strong> le Client dispose d'un droit de rétractation de 14 jours à compter de la réception, sauf exceptions légales (biens confectionnés sur mesure ou personnalisés, biens scellés descellés après livraison, etc.). Les frais de renvoi sont à charge du Client. Pour l'exercer : contacter le commerçant ou support@yoppaa.app.</P>

            <H3>6. Cartes de fidélité</H3>
            <P>Certains commerçants proposent un programme de fidélité. La carte est identifiée par le numéro de téléphone que le Client communique au commerçant, ou qu&rsquo;il a renseigné lors d&rsquo;une commande ou d&rsquo;un rendez-vous : aucune inscription n&rsquo;est nécessaire. Elle se remplit à chaque passage, selon les règles affichées par le commerçant (nombre de passages ou cagnotte).</P>
            <P>Le Client peut recevoir deux SMS de service : l&rsquo;ouverture de sa carte, avec le lien permettant de la consulter, et le déblocage d&rsquo;une récompense. La récompense est due par le commerçant, jamais par Yoppaa, et s&rsquo;obtient chez lui. Les points n&rsquo;ont aucune valeur monétaire, ne sont ni échangeables contre de l&rsquo;argent ni transférables d&rsquo;un commerce à un autre. Pour faire supprimer une carte, il suffit d&rsquo;en faire la demande au commerçant ou à support@yoppaa.app.</P>

            <H3>7. Bons cadeaux</H3>
            <P>Les bons cadeaux sont émis par le commerçant chez qui ils sont achetés : le paiement lui est directement versé, et c&rsquo;est lui qui doit la contrepartie. Le montant est libre et la durée de validité, fixée par le commerçant, est indiquée au moment de l&rsquo;achat ainsi que sur le bon.</P>
            <P>Un bon s&rsquo;utilise chez ce commerçant uniquement, en une ou plusieurs fois, en ligne ou sur place, jusqu&rsquo;à épuisement de son solde. Conformément au droit belge, il n&rsquo;est pas remboursable en espèces. Passée la date de validité, le solde restant est perdu. En cas de difficulté pour utiliser un bon, contacter le commerçant ou support@yoppaa.app.</P>

            <H3>8. Avis</H3>
            <P>Seuls les clients ayant effectivement retiré ou reçu une commande, ou honoré un rendez-vous, peuvent déposer un avis sur le commerçant concerné. Yoppaa se réserve le droit de retirer tout avis contraire à la loi ou manifestement abusif.</P>

            <H3>9. Responsabilité</H3>
            <P>Yoppaa agit en qualité d'intermédiaire technique. Les commerçants partenaires sont seuls responsables de la qualité, de la conformité et de la disponibilité des produits et prestations proposés, ainsi que des récompenses de fidélité et des bons cadeaux qu&rsquo;ils émettent.</P>

            <H3>10. Modification des CGU</H3>
            <P>Avcotech SRL se réserve le droit de modifier les présentes CGU à tout moment. L'utilisation de la plateforme après modification vaut acceptation des nouvelles CGU.</P>
          </Section>

          {/* 3. CGU COMMERÇANT */}
          <Section id="cgu-commercant" title="3. Conditions Générales d'Utilisation — Commerçants">
            <H3>Préambule</H3>
            <P>Les présentes CGU régissent l'utilisation de la plateforme Yoppaa par les commerçants partenaires. En créant un compte et en activant leur page sur Yoppaa, les Commerçants acceptent sans réserve les présentes CGU.</P>

            <H3>1. Formules et tarification</H3>
            <Ul items={[
              'Exister : gratuit, pour toujours — page professionnelle (horaires, photos, itinéraire, contact), visibilité dans l’app et référencement, présence hebdomadaire dans le Good Morning Yoppers, signaux des habitants.',
              'Communiquer : 19,90€ HTVA/mois — tout Exister, plus deals du jour et actualités, place quotidienne dans le Good Morning Yoppers, notifications push vers les habitants de la commune, assistant IA de rédaction.',
              'Vendre : 49,90€ HTVA/mois — tout Communiquer, plus Click & Collect avec paiement en ligne, rendez-vous en ligne, boutique en ligne avec expédition, livraison locale, programme de fidélité, assistant IA complet. Zéro commission sur les ventes.',
            ]}/>
            <P>Les formules sont mensuelles, sans engagement de durée. Les formules payantes bénéficient d'un essai gratuit de 30 jours, sans carte de paiement. Pour les comptes créés avant le 1er septembre 2026 (lancement public de l'application), l'essai démarre le 1er septembre 2026.</P>
            <P>Les Commerçants bénéficiant de conditions préférentielles individuelles (offres de lancement) se réfèrent aux conditions définies dans leur contrat, sans engagement de durée au-delà de ce qui y est précisé.</P>

            <H3>2. Facturation et paiement</H3>
            <P>La facturation est effectuée automatiquement via Stripe Billing pour les formules payantes. Le Commerçant renseigne son moyen de paiement (carte de paiement ou domiciliation) à la fin de l&rsquo;essai. En cas d&rsquo;échec de paiement, Stripe effectue 3 tentatives automatiques avant suspension des fonctionnalités payantes (retour à la formule Exister, données conservées).</P>

            <H3>3. Indexation tarifaire</H3>
            <P>Les tarifs sont révisables annuellement au 1er janvier, sur base de l&rsquo;IPC du mois d&rsquo;octobre publié par Statbel. Le Commerçant est notifié au plus tard le 1er décembre précédant la révision. Les tarifs préférentiels individuels ne sont pas soumis à indexation pendant leur durée garantie.</P>

            <H3>4. Paiements en ligne et frais Stripe (formule Vendre)</H3>
            <P>Les paiements en ligne (acomptes RDV pour les vitrines, commandes Click &amp; Collect pour l&rsquo;alimentaire) sont traités via Stripe Connect Express en Direct Charge. L&rsquo;argent est versé directement sur le compte bancaire du Commerçant (sous 7 jours ouvrés). Les frais Stripe (environ 1,4% + 0,25€ par transaction pour les cartes européennes) sont supportés par le Commerçant et prélevés à la source par Stripe. Yoppaa ne prélève aucune commission sur les transactions.</P>
            <P>Le Commerçant garantit Yoppaa contre tout chargeback, remboursement, contestation de paiement ou solde négatif lié à son activité sur la plateforme. En cas de solde négatif persistant sur son compte Stripe Connect, le Commerçant s&rsquo;engage à régler Yoppaa du montant correspondant sous 30 jours à compter de la notification écrite.</P>

            <H3>5. Programme de fidélité et SMS</H3>
            <P>Le programme de fidélité est disponible à partir de la formule Communiquer (pointage au comptoir) et de façon automatique avec la formule Vendre (chaque commande ou rendez-vous abouti crédite la carte). Le Commerçant définit librement la mécanique (nombre de passages ou cagnotte), le seuil et la récompense. Il est seul responsable de l&rsquo;honorer auprès de ses clients, y compris s&rsquo;il désactive ensuite son programme : les cartes et les points acquis sont conservés.</P>
            <P>La carte est identifiée par le numéro de téléphone du Client. Le Commerçant s&rsquo;engage à ne créer une carte qu&rsquo;avec l&rsquo;accord de la personne concernée et à ne pas utiliser ces numéros à d&rsquo;autres fins.</P>
            <P>Deux SMS de service peuvent être envoyés au Client : l&rsquo;ouverture de sa carte (avec le lien pour la consulter) et le déblocage d&rsquo;une récompense. Ces SMS sont décomptés d&rsquo;un solde de crédits prépayés, vendus par packs (100 SMS : 12,90€ HTVA ; 500 SMS : 59,90€ HTVA). Les crédits n&rsquo;expirent pas, ne sont ni remboursables ni transférables entre commerces, et 25 SMS sont offerts à la première activation du programme. Lorsque le solde est épuisé, le programme continue de fonctionner sans envoi de SMS.</P>

            <H3>6. Bons cadeaux (formule Vendre)</H3>
            <P>Le Commerçant peut proposer des bons cadeaux digitaux d&rsquo;un montant libre. Le paiement est encaissé directement sur son compte Stripe : le bon constitue donc une créance du porteur envers le Commerçant, et non envers Yoppaa. Le Commerçant s&rsquo;engage à honorer tout bon valide présenté, en ligne comme au comptoir.</P>
            <P>La durée de validité est fixée par le Commerçant (12 mois par défaut, minimum 3 mois) et affichée au moment de l&rsquo;achat ainsi que sur le bon. Le solde est utilisable en plusieurs fois. Conformément au droit belge, un bon cadeau n&rsquo;est pas remboursable en espèces. En cas de cessation d&rsquo;activité, le Commerçant reste tenu d&rsquo;honorer ou de rembourser les bons en circulation.</P>

            <H3>7. Obligations du Commerçant</H3>
            <Ul items={[
              'Proposer des produits et prestations conformes aux descriptions publiées.',
              'Assurer la disponibilité des produits commandés dans les créneaux définis et honorer les rendez-vous réservés.',
              'Respecter la législation applicable à son activité (notamment la vente de produits alimentaires).',
              'Honorer les récompenses de fidélité et les bons cadeaux qu’il a émis.',
              'Ne pas utiliser les données des Clients à des fins non autorisées.',
            ]}/>

            <H3>8. Résiliation</H3>
            <P>Le Commerçant peut résilier sa formule payante ou revenir à la formule gratuite Exister moyennant un préavis d&rsquo;un mois calendrier, prenant effet le 1er jour du mois suivant. Pour que le préavis prenne effet le 1er du mois M+1, il doit être notifié au plus tard le 17e jour du mois M (14 jours avant). En cas de retour à Exister, les données du Commerçant sont conservées mais les fonctionnalités payantes (paiement en ligne, rendez-vous ou Click &amp; Collect, boutique, livraison, deals, etc.) sont désactivées.</P>
            <P>Le préavis doit être notifié par courrier recommandé à Avcotech SRL (Rue de Prée 9G, 5640 Mettet) ou par email à facturation@yoppaa.app.</P>
            <InfoBox>
              Exemple : préavis notifié le 10 mars → effet le 1er avril ✓{'\n'}
              Préavis notifié le 20 mars → effet le 1er mai (hors délai)
            </InfoBox>
          </Section>

          {/* 4. CONFIDENTIALITÉ */}
          <Section id="confidentialite" title="4. Politique de confidentialité et cookies">
            <H3>Responsable du traitement</H3>
            <P>Avcotech SRL · BCE 0731.637.148 · dpo@yoppaa.app</P>

            <H3>Données collectées</H3>
            <P><strong>Clients :</strong> prénom, nom, email, téléphone, adresse de livraison (si livraison ou expédition), historique des commandes et rendez-vous, consentements RGPD, identifiant de notifications push (si activées), données de localisation (si autorisées).</P>
            <P><strong>Commerçants :</strong> données d'identification, coordonnées, BCE, données de facturation, données d'activité.</P>
            <P><strong>Préinscrits (site de lancement) :</strong> email, code postal, type d'utilisateur (curieux ou commerçant), nom de commerce éventuel, message facultatif, consentement marketing (opt-in facultatif, jamais pré-coché).</P>

            <H3>Finalités du traitement</H3>
            <Ul items={[
              'Exécution des commandes, rendez-vous et gestion des créneaux',
              'Authentification et gestion des comptes',
              'Facturation et traitement des paiements (via Stripe)',
              'Communications relatives aux commandes et rendez-vous (confirmations, rappels)',
              'Gestion des cartes de fidélité des commerçants (identifiées par le numéro de téléphone) et SMS de service associés (ouverture de la carte, récompense débloquée)',
              'Émission et suivi des bons cadeaux (email de l’acheteur et du bénéficiaire)',
              'Notification du lancement et de l’ouverture de la commune (préinscription : exécution de la demande)',
              'Envoi d’actualités Yoppaa (uniquement avec consentement explicite, retirable à tout moment via le lien de désinscription)',
              'Notifications push (uniquement si activées par l’utilisateur, désactivables à tout moment)',
              'Prévention des abus sur les formulaires (Cloudflare Turnstile)',
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
            <P>Yoppaa utilise uniquement des cookies et stockages techniques indispensables au fonctionnement (session, authentification, préférences locales), ainsi que la protection anti-abus Cloudflare Turnstile sur les formulaires. Aucun cookie publicitaire ou de suivi tiers n'est utilisé. Les notifications push (OneSignal) ne sont activées qu'à votre demande explicite et sont désactivables à tout moment.</P>

            <H3>Partage des données</H3>
            <P>Yoppaa ne vend jamais les données personnelles. Les données peuvent être partagées avec : les commerçants partenaires (exécution de commande ou rendez-vous uniquement), Stripe (paiements), Supabase (hébergement, Europe), Vercel (infrastructure), Resend (emails transactionnels), Brevo (emails d'actualités, uniquement avec consentement marketing), OneSignal (notifications push, si activées), Cloudflare (protection anti-abus) et Anthropic (assistant de rédaction IA des commerçants : seuls les textes fournis par le commerçant lui sont transmis, jamais les données des Clients).</P>
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
              'Resend Inc. — envoi des emails transactionnels',
              'Brevo (Sendinblue SAS, France) — envoi des emails d’actualités (avec consentement) et des SMS de fidélité',
              'OneSignal Inc. — notifications push (si activées par l’utilisateur)',
              'Cloudflare Inc. — protection anti-abus des formulaires (Turnstile)',
              'Anthropic PBC — assistant de rédaction IA des commerçants (textes du commerçant uniquement)',
            ]}/>
            <P>Les transferts vers les sous-traitants établis hors de l'Union Européenne sont encadrés par les Clauses Contractuelles Types (CCT) de la Commission Européenne.</P>
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
                Dernière mise à jour : 30 juillet 2026
              </p>
              <p style={{ fontSize: '0.75rem', color: T.muted }}>
                Avcotech SRL · BCE 0731.637.148 · TVA BE0731.637.148 · Rue de Prée 9G, 5640 Mettet
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