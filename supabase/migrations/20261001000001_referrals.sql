-- Who invited whom. Not shown anywhere in the app yet; kept for later.
--
-- The invite code is the inviter's username. The share text from the Invite
-- Friends button carries it, and Register sends it in the signUp metadata as
-- invite_code, next to full_name and username. When the profile row is created
-- this trigger looks the code up and records the pair.
--
-- A separate table rather than a column on profiles, because every logged in
-- user can read profiles. RLS is on with no policy at all, so nobody reads or
-- writes it through the API; only the trigger below and the SQL editor do.
--
-- Report:
--   select p.username as inviter, count(*) as invited, string_agg(i.username, ', ' order by r.created_at) as who
--   from referrals r
--   join profiles p on p.id = r.referrer_id
--   join profiles i on i.id = r.referred_id
--   group by p.username order by invited desc;

CREATE TABLE IF NOT EXISTS public.referrals (
  referred_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  referrer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  invite_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON public.referrals (referrer_id);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referrals FROM anon, authenticated;

-- Never allowed to break a signup: a bad or unknown code is simply not
-- recorded, and any error is swallowed so the profile row still goes in.
CREATE OR REPLACE FUNCTION public.record_referral()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code text;
  inviter uuid;
BEGIN
  SELECT lower(ltrim(trim(raw_user_meta_data->>'invite_code'), '@'))
    INTO code
    FROM auth.users WHERE id = NEW.id;
  IF code IS NULL OR code = '' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO inviter FROM public.profiles
   WHERE lower(username) = code AND id <> NEW.id;
  IF inviter IS NOT NULL THEN
    INSERT INTO public.referrals (referred_id, referrer_id, invite_code)
    VALUES (NEW.id, inviter, code)
    ON CONFLICT (referred_id) DO NOTHING;
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_referral() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_record_referral ON public.profiles;
CREATE TRIGGER profiles_record_referral
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.record_referral();
