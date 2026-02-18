const axios = require("axios");

const GRAPH_API = process.env.IG_API_BASE || "https://graph.facebook.com/v24.0";
const ACCESS_TOKEN =
  process.env.INSTAGRAM_ACCESS_TOKEN || process.env.IG_PAGE_ACCESS_TOKEN;
const IG_BUSINESS_ID = process.env.IG_BUSINESS_ID;
const USE_INSTAGRAM_LOGIN = process.env.IG_USE_INSTAGRAM_LOGIN === "true";

exports.sendMessage = async ({ recipientId, text, quickReplies }) => {
  if (!ACCESS_TOKEN) {
    throw new Error("Missing Instagram access token");
  }

  if (!USE_INSTAGRAM_LOGIN && !IG_BUSINESS_ID) {
    throw new Error("Missing IG_BUSINESS_ID");
  }

  const url = USE_INSTAGRAM_LOGIN
    ? `${GRAPH_API}/me/messages`
    : `${GRAPH_API}/${IG_BUSINESS_ID}/messages`;

  const message = { text };
  if (Array.isArray(quickReplies) && quickReplies.length > 0) {
    message.quick_replies = quickReplies;
  }

  const payload = {
    recipient: { id: recipientId },
    message,
  };

  try {
    const res = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    return res.data;
  } catch (err) {
    console.error("❌ IG SEND ERROR:", err.response?.data || err.message);
    throw err;
  }
};
