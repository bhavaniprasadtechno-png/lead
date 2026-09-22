import { DEFAULT_AGENT_MODEL } from "@/lib/constants";

/**
 * Calls Google AI Studio's OpenAI-compatible endpoint directly from the app
 * (not via n8n) — used for latency-sensitive, user-facing generation like
 * the Ads AI preview, where routing through an async n8n webhook + callback
 * would mean the user waits on a page reload for what should feel instant.
 * Every other agent call in this app happens inside n8n; this is a
 * deliberate, narrow exception, not the app growing a second agent runtime.
 * Needs GOOGLE_AI_API_KEY set in the *app's* environment (Render dashboard)
 * — separate from the n8n Variable of the same name, even though it's the
 * same key value.
 */
export async function callGoogleAI(params: { systemPrompt: string; userContent: string; maxTokens?: number }): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY is not configured in the app's environment");
  }
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: DEFAULT_AGENT_MODEL,
      max_tokens: params.maxTokens ?? 512,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userContent },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM call failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("LLM returned no content");
  return text;
}

/** Same tolerant parse used by every n8n "Parse ... JSON" Code node in this app: strips <thought> blocks and ```json fences before parsing. */
export function parseStrictJson<T>(text: string): T {
  const withoutThoughts = text.replace(/<thought>[\s\S]*?<\/thought>/gi, "");
  const cleaned = withoutThoughts.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  return JSON.parse(cleaned) as T;
}
