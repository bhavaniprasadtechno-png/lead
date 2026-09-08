-- gemma-4-31b-it has three verified reliability problems in production:
-- rejects reasoning_effort (400), its <thought> reasoning consumes the
-- entire max_tokens budget, and it hits a hard 16,000-token free-tier
-- input quota that a single ICP search (long prompt + 20 search results)
-- can exceed outright. gemini-2.5-flash-lite (tried next) is deprecated
-- (404, Google's own error recommends gemini-3.5-flash-lite). This is the
-- new default; existing rows keep whatever model they already have.
ALTER TABLE "agents" ALTER COLUMN "model" SET DEFAULT 'gemini-3.5-flash-lite';
