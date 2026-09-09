-- A mobile number, so an SMS has somewhere to go.
--
-- Nullable and staying that way: most people here will never want a text
-- message, and a required field would make them invent one. Stored in the
-- single national spelling `05XXXXXXXX` — normalised on the way in, because
-- the same number typed three ways is three people to anything that matches
-- on the string.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" text;
