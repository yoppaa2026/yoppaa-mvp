-- LES DEUX DERNIÈRES QUESTIONS DE L'AUDIT D'ÉCRITURE
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUE LE DIAGNOSTIC PRÉCÉDENT A ÉTABLI, LE 04/09.
--
-- ✅ Les onze policies « aveugles à l'identité » ne le sont pas. Neuf appellent
-- `is_admin()`, une `is_yoppaa_admin()`. Ma recherche visait `auth.`,
-- `current_setting`, `jwt` et `uid()` : elle ne pouvait pas voir une fonction
-- d'aide. L'hypothèse était bonne sur le fond, fausse sur le mécanisme.
--
-- ✅ `clients.yopper_insert_own_clients` est correctement écrite :
--    WITH CHECK ((auth_user_id IS NULL) OR (auth_user_id = auth.uid()))
--    Un visiteur ne peut PAS rattacher une fiche au compte de quelqu'un
--    d'autre. C'est exactement la garde qu'il fallait.
--
-- 🔴 `rdv_reservations.rdv_reservations_insertion_publique` NE CONSULTE
--    VRAIMENT PERSONNE :
--      WITH CHECK (acompte_paye IS NOT TRUE AND acompte_paye_en_ligne IS NOT
--                  TRUE AND stripe_payment_intent_id IS NULL AND
--                  stripe_refund_id IS NULL AND statut = 'confirme')
--    Elle ne vérifie QUE des champs d'argent. N'importe quel visiteur peut
--    donc insérer un rendez-vous CONFIRMÉ dans l'agenda de n'importe quel
--    commerçant, à n'importe quelle date, sous n'importe quel nom.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ AVANT DE PROPOSER DE LA SUPPRIMER, IL FAUT SAVOIR QUI S'APPUIE DESSUS.
-- Le tableau de bord crée des rendez-vous à la main (`ModalNouveauRdv`), en
-- tant qu'`authenticated`, et cette policy vise `anon+authenticated`. Si elle
-- est la SEULE à autoriser l'insertion, la retirer casserait le commerçant.
-- C'est la question 2.
--
-- ⚠️ ET LA QUESTION 1 DÉPLACE SIMPLEMENT LE PROBLÈME : tout repose maintenant
-- sur `is_admin()`. Une fonction qui rendrait `true` sans jeton ouvrirait DIX
-- tables d'un coup, dont `clients`. Deux fonctions d'admin au lieu d'une est
-- d'ailleurs déjà un défaut en soi : deux sources de vérité pour « qui est
-- administrateur ».

select controle, valeur, attendu from (

  -- ─── 1. CE QUE FONT VRAIMENT LES FONCTIONS D'ADMINISTRATION ─────────────
  select 1 as ordre,
    ('fonction ' || p.proname || ' — SECURITY DEFINER ? ' || p.prosecdef::text
      || ' — search_path ' || coalesce(array_to_string(p.proconfig, ','), 'NON FIXE')) as controle,
    left(pg_get_functiondef(p.oid), 700) as valeur,
    'doit lire le jeton et ne rien rendre sans lui' as attendu
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('is_admin', 'is_yoppaa_admin')

  -- ⚠️ DEUX FONCTIONS POUR UNE SEULE IDÉE. Laquelle fait foi ? Celle qu'on
  -- oublie de modifier le jour où l'adresse change est celle qui ouvre.
  union all select 2, 'nombre de fonctions d administration',
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('is_admin', 'is_yoppaa_admin'))::text,
    '2 aujourd hui, 1 souhaitable'

  -- ─── 2. QUI PEUT INSÉRER DANS L'AGENDA, ET SOUS QUELLE CONDITION ────────
  union all select 3, 'policies d INSERT sur rdv_reservations',
    (select count(*) from pg_policies where schemaname = 'public'
      and tablename = 'rdv_reservations' and cmd in ('INSERT', 'ALL'))::text,
    'au moins 2 pour pouvoir en retirer une'

) t
union all
select
  10 + row_number() over (order by policyname) as ordre,
  ('rdv_reservations.' || policyname || ' [' || cmd || '] pour ' || array_to_string(roles, '+')) as controle,
  left('USING ' || coalesce(qual, '(aucun)') || '   ///   WITH CHECK ' || coalesce(with_check, '(aucun)'), 700) as valeur,
  'le commercant doit garder un chemin' as attendu
from pg_policies
where schemaname = 'public' and tablename = 'rdv_reservations' and cmd in ('INSERT', 'ALL')

order by 1;
