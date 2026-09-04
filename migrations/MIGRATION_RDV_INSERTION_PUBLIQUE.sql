-- L'AGENDA N'EST PLUS OUVERT À TOUT LE MONDE
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 CE QU'ON CORRIGE, ET COMMENT ON L'A TROUVÉ.
--
-- `rdv_reservations_insertion_publique`, PERMISSIVE, ouverte à `anon` :
--
--   WITH CHECK (acompte_paye IS NOT TRUE AND acompte_paye_en_ligne IS NOT TRUE
--               AND stripe_payment_intent_id IS NULL
--               AND stripe_refund_id IS NULL AND statut = 'confirme')
--
-- Elle ne vérifie QUE des champs d'argent. Elle ne regarde JAMAIS qui écrit.
-- N'importe quel visiteur, sans compte, pouvait donc insérer un rendez-vous
-- CONFIRMÉ dans l'agenda de n'importe quel commerçant, à n'importe quelle
-- date, sous n'importe quel nom et n'importe quel téléphone.
--
-- ⚠️ ET « CONFIRMÉ » EST PRÉCISÉMENT LE STATUT QUI OCCUPE LE CRÉNEAU. La ligne
-- forgée déclenche la contrainte d'exclusion contre les vraies réservations :
-- un client légitime s'entend dire que l'heure est prise, et le commerçant
-- attend quelqu'un qui n'existe pas. Ce n'est pas une fuite de données, c'est
-- un commerçant qui se déplace pour rien.
--
-- Trouvée en écrivant un contrôle de droits sur une migration SANS RAPPORT
-- (le délai par article). C'est la deuxième fois qu'un audit de sécurité de ce
-- projet sort d'un contrôle posé pour autre chose.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 ON REMPLACE, ON NE SUPPRIME PAS, et c'est le diagnostic qui l'a imposé.
--
-- Les policies de `rdv_reservations` ont été lues une par une. Le commerçant a
-- un chemin pour LIRE, un pour MODIFIER, un pour SUPPRIMER ses rendez-vous.
-- Il n'en a AUCUN pour en CRÉER : son tableau de bord (`ModalNouveauRdv`)
-- passait par la policy publique. La retirer sèchement l'aurait coupé de son
-- propre agenda, en production, sans que rien ne le prévienne.
--
-- ⚠️ ET `zz_commerce_ouvert` NE PEUT PAS PRENDRE LE RELAIS : elle est
-- RESTRICTIVE. Une policy restrictive ne DONNE aucun droit, elle retranche.
-- Vérifié en lisant sa colonne `permissive`, pas en la déduisant du fichier
-- qui l'a créée : ce projet s'est déjà fait avoir par une policy qu'on croyait
-- restrictive et qui ouvrait.
--
-- ⚠️ AUCUN CHEMIN CLIENT NE DISPARAÎT. Depuis le 30/08 le rendez-vous ne se
-- crée plus depuis le navigateur : il passe par `/api/rdv/reserver`, qui
-- construit son client avec `SUPABASE_SERVICE_ROLE_KEY` et ignore donc la RLS
-- de bout en bout. Vérifié dans le code, pas supposé. Le seul `insert`
-- navigateur restant est celui du commerçant.

-- ─── 1. LE COMMERÇANT PEUT CRÉER DANS SON AGENDA ────────────────────────────
--
-- ⚠️ ON POSE LE NOUVEAU CHEMIN AVANT DE RETIRER L'ANCIEN. L'ordre inverse
-- laisserait un instant sans aucune policy d'insertion. La transaction les
-- rend simultanés de toute façon, mais l'ordre écrit est celui qu'on relira.
--
-- L'idiome est celui de tout le reste du dépôt : le rendez-vous doit appartenir
-- à un commerce dont le compte connecté est le propriétaire.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'rdv_reservations'
      and policyname = 'Commercant cree dans son agenda'
  ) then
    create policy "Commercant cree dans son agenda"
      on rdv_reservations for insert to authenticated
      with check (exists (
        select 1 from commercants c
        where c.id = rdv_reservations.commercant_id
          and c.auth_user_id = auth.uid()
      ));
  end if;
end $$;

-- ─── 2. LA PORTE OUVERTE SE FERME ───────────────────────────────────────────
drop policy if exists rdv_reservations_insertion_publique on rdv_reservations;

-- ─── CONTRÔLE ───────────────────────────────────────────────────────────────
select controle, valeur, attendu from (
  select 1 as ordre, 'la policy publique a disparu' as controle,
    (select count(*) from pg_policies where schemaname='public'
      and tablename='rdv_reservations'
      and policyname='rdv_reservations_insertion_publique')::text as valeur,
    '0' as attendu

  union all select 2, 'le commercant a un chemin pour CREER',
    (select count(*) from pg_policies where schemaname='public'
      and tablename='rdv_reservations'
      and policyname='Commercant cree dans son agenda')::text, '1'

  union all select 3, 'et ce chemin DONNE le droit (permissive)',
    coalesce((select permissive from pg_policies where schemaname='public'
      and tablename='rdv_reservations'
      and policyname='Commercant cree dans son agenda'), 'ABSENTE'), 'PERMISSIVE'

  union all select 4, 'il ne vise que les comptes connectes',
    coalesce((select array_to_string(roles, '+') from pg_policies where schemaname='public'
      and tablename='rdv_reservations'
      and policyname='Commercant cree dans son agenda'), 'ABSENTE'), 'authenticated'

  -- 🔴 LA LIGNE QUI DIT SI LE TROU EST BOUCHE.
  union all select 5, 'policies d ECRITURE encore ouvertes a anon sur l agenda',
    (select count(*) from pg_policies where schemaname='public'
      and tablename='rdv_reservations' and cmd in ('INSERT','UPDATE','DELETE','ALL')
      and 'anon' = any(roles))::text, '0'

  -- ⚠️ ET AUCUNE POLICY D ECRITURE NE DOIT PLUS IGNORER L IDENTITE.
  union all select 6, 'policies d ecriture de l agenda qui ne consultent personne',
    (select count(*) from pg_policies where schemaname='public'
      and tablename='rdv_reservations' and cmd in ('INSERT','UPDATE','DELETE','ALL')
      and roles && array['anon','public']::name[]
      and coalesce(qual,'') !~ 'auth\.|is_admin|is_yoppaa_admin|mes_commerces_bloques'
      and coalesce(with_check,'') !~ 'auth\.|is_admin|is_yoppaa_admin|mes_commerces_bloques')::text, '0'

  -- ─── A-T-ON DES TRACES ? ────────────────────────────────────────────────
  --
  -- ⚠️ ON NE PEUT PAS RECONNAITRE UNE LIGNE FORGEE A COUP SUR : une vraie
  -- reservation gratuite lui ressemble. Mais la route serveur pose TOUJOURS
  -- `place_no` et `capacite_creneau`, qu un attaquant n aurait aucune raison
  -- de connaitre. Une ligne recente sans ces deux champs est donc suspecte.
  --
  -- ⚠️ ON SE LIMITE AUX RENDEZ-VOUS DEPUIS LE 30/08, date a laquelle la route
  -- serveur est devenue le seul chemin. Avant, ces colonnes pouvaient
  -- legitimement manquer, et compter les anciennes ferait sonner l alarme pour
  -- rien. Une alarme qui sonne tout le temps ne protege plus rien.
  --
  -- ⚠️ AUCUNE DONNEE PERSONNELLE N EST LUE ICI, seulement un COMPTE.
  union all select 7, 'rdv suspects depuis le 30/08 (sans place_no ni capacite)',
    (select count(*) from rdv_reservations
      where date_rdv >= '2026-08-30'
        and statut = 'confirme'
        and (place_no is null or capacite_creneau is null))::text, '0'
) t order by ordre;
