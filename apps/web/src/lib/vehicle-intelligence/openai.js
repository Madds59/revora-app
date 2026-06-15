function openAiConfig() {
  return {
    apiKey: process.env.OPENAI_API_KEY ?? null,
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  };
}

export async function callOpenAiJson({
  systemPrompt,
  userPrompt,
}) {
  const { apiKey, model } = openAiConfig();
  if (!apiKey) return { ok: false, error: "OpenAI is not configured." };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      return { ok: false, error: `OpenAI request failed with ${response.status}.` };
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      return { ok: false, error: "OpenAI returned empty content." };
    }

    const parsed = JSON.parse(content);
    return { ok: true, data: parsed, model };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "OpenAI request failed.",
    };
  }
}
