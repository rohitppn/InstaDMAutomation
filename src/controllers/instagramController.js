const conversationService = require("../services/conversationService");
const { sendMessage } = require("../services/instagramService");

/**
 * ✅ Webhook verification (GET)
 */
exports.verifyWebhook = (req, res) => {
  const VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN;

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("🔍 Webhook verification:", req.query);

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    return res.status(200).send(challenge);
  }

  console.log("❌ Webhook verification failed");
  return res.sendStatus(403);
};

/**
 * ✅ Incoming Instagram messages (POST)
 * ⚠️ MUST respond fast — Meta retries aggressively
 */
exports.handleMessage = async (req, res) => {
  // ✅ Respond immediately (CRITICAL)
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const messaging = entry?.messaging?.[0];

    if (!messaging || !messaging.message?.text) return;

    const userId = messaging.sender.id;
    const messageText = messaging.message.text;
    const isEcho = messaging.message?.is_echo;
    const selfIgId = process.env.IG_BUSINESS_ID;
    const selfAppScopedIds = (process.env.IG_APP_SCOPED_USER_IDS || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    // Ignore messages sent by our own Instagram account or echo events
    if (
      isEcho ||
      (selfIgId && userId === selfIgId) ||
      (selfAppScopedIds.length > 0 && selfAppScopedIds.includes(userId))
    ) {
      return;
    }

    console.log("📩 Incoming IG message:", userId, messageText);

    // 🧠 Process conversation
    const reply = await conversationService.processMessage(userId, messageText);

    const replyText = typeof reply === "string" ? reply : reply?.text;
    if (!replyText) return;
    console.log("🤖 Bot reply:", replyText);

    // 📤 Send reply back to Instagram
    await sendMessage({
      recipientId: userId,
      text: replyText,
      quickReplies: typeof reply === "string" ? undefined : reply?.quickReplies,
    });
  } catch (error) {
    console.error("🔥 Webhook handling error:", error);
  }
};
