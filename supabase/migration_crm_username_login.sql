-- ============================================================
-- Migration : login par nom d'utilisateur (en plus de l'email)
-- Supabase Auth exige un email → on résout username → email AVANT le login.
-- La page login n'est pas authentifiée (rôle anon) et la RLS de profiles
-- bloque anon → on expose une fonction SECURITY DEFINER dédiée (ne renvoie
-- QUE l'email pour un username donné). Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION mw_email_for_username(p_username TEXT)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT email FROM profiles
  WHERE username IS NOT NULL AND lower(username) = lower(btrim(p_username))
  LIMIT 1;
$$;

-- Accessible avant connexion (anon) ET une fois connecté (authenticated).
GRANT EXECUTE ON FUNCTION mw_email_for_username(TEXT) TO anon, authenticated;

-- Backfill : donne un username (= partie locale de l'email) aux profils qui n'en
-- ont pas, sans créer de collision avec l'index unique profiles_username_key.
UPDATE profiles p
SET username = split_part(email, '@', 1)
WHERE username IS NULL
  AND email IS NOT NULL
  AND email <> ''
  AND NOT EXISTS (
    SELECT 1 FROM profiles q
    WHERE lower(q.username) = lower(split_part(p.email, '@', 1))
  );

-- ============================================================
-- FIN
-- ============================================================
