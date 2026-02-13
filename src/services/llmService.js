const axios = require("axios");
const intentPrompt = require("../prompts/intentPrompt");

const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

exports.detectIntent = async ({ message, memory }) => {
  const systemPrompt = intentPrompt(memory);

  try {
    const response = await axios.post(
      MISTRAL_URL,
      {
        model: "mistral-small-latest",
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    const content = response.data?.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Empty LLM response");
    }

    let parsed;
    try {
      const cleaned = content
        .replace(/```json/gi, "```")
        .replace(/```/g, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch (err) {
      console.error("❌ Invalid JSON from LLM:", content);
      throw new Error("Invalid LLM JSON");
    }

    return {
      intent: parsed.intent || "unknown",
      entities: parsed.entities || {},
      next_action: parsed.next_action || "fallback",
      confidence: parsed.confidence || 0,
    };
  } catch (err) {
    console.error("❌ Mistral API error:", err.response?.data || err.message);

    return {
      intent: "fallback",
      entities: {},
      next_action: "fallback",
      confidence: 0,
    };
  }
};

const truncateWords = (text, maxWords) => {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  return words.slice(0, maxWords).join(" ");
};

exports.answerShortQuestion = async ({ question, context }) => {
  const systemPrompt = `
You are a professional, friendly clinic assistant.
Answer the user's question using the clinic context.
Keep the answer under 20 words.
If unsure, say you will share details during the consultation.
No markdown, no lists, no emojis.`;

  try {
    const response = await axios.post(
      MISTRAL_URL,
      {
        model: "mistral-small-latest",
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Context:\n${context}\n\nQuestion:\n${question}` },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 12000,
      },
    );

    const content = response.data?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return "We can share details during the consultation.";
    }

    return truncateWords(content.replace(/\s+/g, " "), 20);
  } catch (err) {
    console.error("❌ Mistral API error:", err.response?.data || err.message);
    return "We can share details during the consultation.";
  }
};

exports.summarizeProblem = async ({ text }) => {
  const systemPrompt = `
Summarize the patient's issue in 6 to 12 words.
No medical advice. No markdown. No emojis.`;

  try {
    const response = await axios.post(
      MISTRAL_URL,
      {
        model: "mistral-small-latest",
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 12000,
      },
    );

    const content = response.data?.choices?.[0]?.message?.content?.trim();
    if (!content) return text.slice(0, 80);
    return content.replace(/\s+/g, " ");
  } catch (err) {
    console.error("❌ Mistral API error:", err.response?.data || err.message);
    return text.slice(0, 80);
  }
};
