const ConversationState = require("../models/ConversationState");
const llmService = require("./llmService");
const googleSheetsService = require("./googleSheetsService");
const clinicContext = require("../config/clinicContext");
const { sendMessage } = require("./instagramService");

const sessions = {}; // in-memory (replace with DB later)

const STUDENT_TAB = "Sheet1";
const PATIENT_TAB = "Sheet2";

const getWebinarLink = () =>
  process.env.WEBINAR_LINK ||
  "https://drruchitamehta.exlyapp.com/checkout/707b6532-7bbe-40fd-bd76-104c6dc459c4";

const getPatientLink = () =>
  process.env.PATIENT_LINK ||
  process.env["1:1_CONSULT_LINK"] ||
  "https://drruchitamehta.exlyapp.com/checkout/f92410b4-99bf-4da7-8d97-965cff79f1ea";

const getDiabetesWebinarLink = () =>
  process.env.DIABETES_WEBINAR_LINK ||
  "https://drruchitamehta.exlyapp.com/checkout/8392be04-0a17-4c40-92a4-9dfc6f418140";

const getType1Link = () =>
  process.env.TYPE1_LINK ||
  "https://drruchitamehta.exlyapp.com/checkout/d3b56137-7abc-4ecf-b8b6-5af21a31f3b7";

const getOtherLink = () => process.env.OTHER_LINK || getType1Link();

const nowIso = () => new Date().toISOString();

const replyWithQuickReplies = (text, options) => ({
  text,
  quickReplies: options.map((option) => ({
    content_type: "text",
    title: option,
    payload: option,
  })),
});

const replyYesNo = (text) => replyWithQuickReplies(text, ["Yes", "No"]);
const replyDiabetesTypes = (text) =>
  replyWithQuickReplies(text, ["Type 1", "Type 2", "Prediabetes", "Gestational"]);

const mapDiabetesType = (text) => {
  const normalized = text.trim().toLowerCase();
  if (normalized.includes("type 1") || normalized === "type1" || normalized === "1") return "Type 1";
  if (normalized.includes("type 2") || normalized === "type2" || normalized === "2") return "Type 2";
  if (normalized.includes("prediabetes") || normalized.includes("pre diabetes") || normalized === "pre") {
    return "Prediabetes";
  }
  if (normalized.includes("gestational")) return "Gestational";
  return null;
};

const extractEmail = (text) => {
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
};

const extractWhatsApp = (text) => {
  const matches = text.match(/\d{8,15}/g);
  if (!matches || matches.length === 0) return null;
  const last = matches[matches.length - 1];
  return last.length >= 8 ? last : null;
};

const extractAge = (text) => {
  const match = text.match(/\b(\d{1,3})\b/);
  if (!match) return null;
  const age = Number(match[1]);
  if (Number.isNaN(age)) return null;
  if (age < 1 || age > 120) return null;
  return age;
};

const extractProfession = (text) => {
  const normalized = text.toLowerCase();
  if (normalized.includes("patient")) return "Patient";
  if (normalized.includes("doctor")) return "Doctor";
  if (normalized.includes("nutrition")) return "Nutritionist";
  if (normalized.includes("student")) return "Student";
  if (normalized.includes("other")) return "Other";
  return null;
};

const extractName = (text) => {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const filtered = lines.filter((line) => {
    if (line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)) return false;
    if (line.match(/\d{8,15}/)) return false;
    if (line.match(/^\d{1,3}$/)) return false;
    const lower = line.toLowerCase();
    if (/(patient|student|doctor|nutrition|other)/.test(lower)) return false;
    if (/^(hi|hello|hey|hlo|hii|hiii)$/i.test(lower)) return false;
    return true;
  });

  if (filtered.length > 0) return filtered[0];

  // fallback: first two words if message starts with name-like text
  const words = text.trim().split(/\s+/);
  if (words.length >= 2) return `${words[0]} ${words[1]}`;
  if (words.length === 1) return words[0];
  return null;
};

const extractOtherConcern = (text) => {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)) continue;
    if (line.match(/\d{8,15}/)) continue;
    if (line.match(/^\d{1,3}$/)) continue;
    const lower = line.toLowerCase();
    if (/(patient|student|doctor|nutrition|other)/.test(lower)) continue;
    if (/^(hi|hello|hey|hlo|hii|hiii)$/i.test(lower)) continue;
    if (/(med|medicine|tablet|insulin)/.test(lower)) continue;
    return line;
  }
  return null;
};

const mapExperienceLevel = (text) => {
  const normalized = text.trim().toUpperCase();
  if (normalized.startsWith("A")) return "Beginner – No diabetes coaching experience";
  if (normalized.startsWith("B")) return "Some experience but not confident";
  if (normalized.startsWith("C")) return "Already seeing diabetes clients";
  if (normalized.startsWith("D")) return "Just exploring";
  const lower = text.toLowerCase();
  if (lower.includes("beginner")) return "Beginner – No diabetes coaching experience";
  if (lower.includes("not confident")) return "Some experience but not confident";
  if (lower.includes("already") || lower.includes("clients")) return "Already seeing diabetes clients";
  if (lower.includes("exploring")) return "Just exploring";
  return null;
};

const mapGoal = (text) => {
  const normalized = text.trim().toUpperCase();
  if (normalized.startsWith("A")) return "Become Diabetes Educator";
  if (normalized.startsWith("B")) return "Start own practice";
  if (normalized.startsWith("C")) return "Increase income";
  if (normalized.startsWith("D")) return "Help more patients";
  if (normalized.startsWith("E")) return "All of the above";
  const lower = text.toLowerCase();
  if (lower.includes("educator")) return "Become Diabetes Educator";
  if (lower.includes("practice")) return "Start own practice";
  if (lower.includes("income")) return "Increase income";
  if (lower.includes("patients")) return "Help more patients";
  if (lower.includes("all")) return "All of the above";
  return null;
};

const mapStudentProfession = (text) => {
  const lower = text.toLowerCase();
  if (lower.includes("nutrition")) return "Nutritionist";
  if (lower.includes("health coach") || lower.includes("coach"))
    return "Health Coach";
  if (lower.includes("doctor")) return "Doctor";
  if (lower.includes("fitness")) return "Fitness Trainer";
  if (lower.includes("student")) return "Student";
  return null;
};

const mapPatientGoal = (text) => {
  const normalized = text.trim().toUpperCase();
  if (normalized.startsWith("A")) return "Reduce medicines";
  if (normalized.startsWith("B")) return "Better sugar control";
  if (normalized.startsWith("C")) return "Weight loss";
  if (normalized.startsWith("D")) return "Complication prevention";
  if (normalized.startsWith("E")) return "All of the above";
  const lower = text.toLowerCase();
  if (lower.includes("reduce")) return "Reduce medicines";
  if (lower.includes("sugar")) return "Better sugar control";
  if (lower.includes("weight")) return "Weight loss";
  if (lower.includes("complication")) return "Complication prevention";
  if (lower.includes("all")) return "All of the above";
  return null;
};

const mapType1Goal = (text) => {
  const normalized = text.trim().toUpperCase();
  if (normalized.startsWith("A")) return "Better sugar control";
  if (normalized.startsWith("B")) return "Reduce fluctuations";
  if (normalized.startsWith("C")) return "Improve energy";
  if (normalized.startsWith("D")) return "Prevent complications";
  if (normalized.startsWith("E")) return "All of the above";
  const lower = text.toLowerCase();
  if (lower.includes("control")) return "Better sugar control";
  if (lower.includes("fluct")) return "Reduce fluctuations";
  if (lower.includes("energy")) return "Improve energy";
  if (lower.includes("complication")) return "Prevent complications";
  if (lower.includes("all")) return "All of the above";
  return null;
};

const isYes = (text) =>
  /(yes|yess|yep|yeah|yaa|ya|yup|ypp|haan|haa|ha|hmm|sure|correct)/i.test(text);
const isNo = (text) => /(no|nah|nope|nahi|galat|wrong|not yet|later|not now)/i.test(text);
const isAck = (text) =>
  /^(ok|okay|kk|fine|thanks|thank you|thx|hmm|hmmm|haan|ha|ji)$/i.test(
    text.trim(),
  );
const isQuestion = (text) => /[?]/.test(text);
const isWebinarLinkRequest = (text) =>
  /(webinar|link|register|registration|join)/i.test(text);

const extractMedication = (text) => {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)) continue;
    if (line.match(/\d{8,15}/)) continue;
    if (line.match(/^\d{1,3}$/)) continue;
    const lower = line.toLowerCase();
    if (/(patient|student|doctor|nutrition|other)/.test(lower)) continue;
    if (/^(hi|hello|hey|hlo|hii|hiii)$/i.test(lower)) continue;
    if (/(med|medicine|tablet|insulin|none|no|yes)/.test(lower)) return line;
  }
  return null;
};

const appendFollowup = (existing, message) => {
  if (!existing) return message;
  return `${existing}\n${message}`;
};

const syncStudent = async (session, userId, overrides = {}) => {
  if (!session.savedToSheet || !session.sheetRow) return;
  await googleSheetsService.updateStudent({
    row: session.sheetRow,
    id: userId,
    name: session.memory.name,
    age: session.memory.age,
    number: session.memory.whatsapp,
    email: session.memory.email,
    profession: session.memory.profession,
    experienceLevel: session.memory.experienceLevel,
    goal: session.memory.goal,
    willingWebinar: session.memory.willingWebinar,
    webinarLink: session.webinarLinkSent ? getWebinarLink() : "",
    timeDate: session.linkSentAt || "",
    followups: session.followups || "",
    takeFollowups: session.memory.takeFollowups || "Yes",
    ...overrides,
  });
};

const syncPatient = async (session, userId, overrides = {}) => {
  if (!session.savedToSheet || !session.sheetRow) return;
  await googleSheetsService.updatePatient({
    row: session.sheetRow,
    id: userId,
    name: session.memory.name,
    age: session.memory.age,
    number: session.memory.whatsapp,
    email: session.memory.email,
    profession: session.memory.profession,
    currentMedication: session.memory.currentMedication,
    diabetesType: session.memory.diabetesType,
    diabetesYears: session.memory.diabetesYears,
    sugarValues: session.memory.sugarValues,
    patientGoal: session.memory.patientGoal,
    timeDate: session.linkSentAt || "",
    followups: session.followups || "",
    others: session.memory.others,
    type1Flag: session.memory.type1Flag || (session.memory.diabetesType === "Type 1" ? "Yes" : ""),
    type1Years: session.memory.type1Years,
    type1SugarValues: session.memory.type1SugarValues,
    type1HighLows: session.memory.type1HighLows,
    type1Symptoms: session.memory.type1Symptoms,
    takeFollowups: session.memory.takeFollowups || "Yes",
    ...overrides,
  });
};

const shouldSendFollowups = (session) =>
  String(session.memory.takeFollowups || "Yes").toLowerCase() !== "no";

const scheduleFollowups = async ({
  session,
  userId,
  follow1,
  follow2,
  follow3,
  syncFn,
}) => {
  if (!shouldSendFollowups(session) || session.followUpScheduled) return;
  session.followUpScheduled = true;

  setTimeout(async () => {
    try {
      await sendMessage({ recipientId: userId, text: follow1 });
      session.followups = appendFollowup(session.followups, follow1);
      await syncFn(session, userId, { followups: session.followups });
    } catch (err) {
      console.error("❌ Follow-up error:", err.message);
    }
  }, 24 * 60 * 60 * 1000);

  setTimeout(async () => {
    try {
      await sendMessage({ recipientId: userId, text: follow2 });
      session.followups = appendFollowup(session.followups, follow2);
      await syncFn(session, userId, { followups: session.followups });
    } catch (err) {
      console.error("❌ Follow-up error:", err.message);
    }
  }, 48 * 60 * 60 * 1000);

  setTimeout(async () => {
    try {
      await sendMessage({ recipientId: userId, text: follow3 });
      session.followups = appendFollowup(session.followups, follow3);
      await syncFn(session, userId, { followups: session.followups });
    } catch (err) {
      console.error("❌ Follow-up error:", err.message);
    }
  }, 72 * 60 * 60 * 1000);
};

const scheduleStudentFollowups = (session, userId) =>
  scheduleFollowups({
    session,
    userId,
    syncFn: syncStudent,
    follow1:
      "Hello 👋\n\nYou had earlier shown interest in learning how to handle diabetes clients confidently.\n\nI’m conducting a free live training webinar where I’ll explain:\n\n✔ Why sugars don’t drop even with good diet\n✔ How to decode blood reports\n✔ How to become a Diabetes Coach\n\n🗓 Monday | 6:00 PM IST\n📍 Live on Zoom\nRegister here:\n👉 " +
      getWebinarLink(),
    follow2:
      "Hi 😊\n\nI noticed you showed interest in the FREE Diabetes Educator Webinar, but your seat isn’t confirmed yet.\n\nThis session is specifically designed for Nutritionists & Health Coaches who want better results in diabetes cases.\n\nYou’ll learn:\n🔥 Why most coaches struggle despite diet plans\n🔥 My proven 3D diabetes system\n🔥 Step-by-step patient protocol\n🔥 Real case examples from practice\n\nSeats are limited per Monday batch.\n\n👉 Here’s the registration link to confirm your seat:\n\n" +
      getWebinarLink() +
      "\n\n– Dr. Ruchita Mehta",
    follow3:
      "Hello 😊\n\nLooking forward to seeing you in the Live Webinar on Monday at 6 PM.\n\nMake sure your seat is confirmed here:\n🔗 " +
      getWebinarLink() +
      "\n\nSee you live.",
  });

const scheduleType2Followups = (session, userId) =>
  scheduleFollowups({
    session,
    userId,
    syncFn: syncPatient,
    follow1:
      "Hello 😊\n\nJust checking in, aapne Diabetes support ke liye enquiry ki thi but abhi tak next step nahi liya.\n\nAgar aap sugar levels naturally manage / reverse karna chahte ho, we have 2 ways to help you 👇\n\n🩺 1:1 Personal Consultation\nCustomized diet + lifestyle plan\n👉 Book here:\n" +
      getPatientLink() +
      "\n\n🎓 FREE Diabetes Webinar\nLearn how to control Diabetes naturally\n👉 Join free here:\n" +
      getDiabetesWebinarLink() +
      "\n\nReply CALL or WEBINAR — we’ll guide you 😊",
    follow2:
      "Hi 👋\n\nDiabetes ko manage karna confusing lag sakta hai — what to eat, what to avoid, medicines ka kya karein?\n\nIsliye we offer 2 support options 💙\n\n🔹 1:1 Consultation\nPersonal case analysis + diet plan + medicine reduction support\n\n🔹 FREE Webinar\nStep-by-step Diabetes management guidance\n\nChoose what suits you 👇\n\n👉 Book Consultation:\n" +
      getPatientLink() +
      "\n\n👉 Join Webinar:\n" +
      getDiabetesWebinarLink(),
    follow3:
      "Final reminder 😊\n\nAgar aap serious ho Diabetes control / reversal ko lekar — don’t delay your action ⏳\n\nStart with learning or go personal — choice is yours 👇\n\n🩺 Book 1:1 Consultation\nGet personalized plan & doctor guidance\n" +
      getPatientLink() +
      "\n\n🎓 Join FREE Webinar\nUnderstand root cause & natural management\n" +
      getDiabetesWebinarLink() +
      "\n\nReply START — team will assist you 👍",
  });

const scheduleType1Followups = (session, userId) =>
  scheduleFollowups({
    session,
    userId,
    syncFn: syncPatient,
    follow1:
      "Hi 🙂 Just checking in 💙\n\nI didn’t see your appointment booking yet, and I don’t want you to miss the chance to start stabilizing your sugars properly.\n\nType 1 management becomes much easier when you follow the right structure and timing plan 🙏\n\nIf better control and stable energy is your goal, let’s take the first step 👇\n🔗 " +
      getType1Link() +
      "\n\nLet me know if you need any help booking 🙂",
    follow2:
      "Hi again 💙\n\nJust a gentle reminder — fluctuating sugars for long periods can affect energy, mood, and long-term health.\n\nThe sooner we structure your nutrition and insulin timing correctly, the smoother your daily readings can become 🙂\n\nIf you’re serious about improving stability, you can secure your consultation here 👇\n🔗 " +
      getType1Link() +
      "\n\nReply “BOOKED” once done, and we’ll guide you with next steps 🙏",
    follow3:
      "Hi 💙\nI’ll close this support thread for now so we don’t keep disturbing you 🙏\n\nBut if managing Type 1 feels overwhelming or your sugars are still unstable, remember — you don’t have to figure it out alone.\n\nStructured guidance can truly change daily control and confidence.\nWhenever you’re ready, you can book here 👇\n🔗 " +
      getType1Link() +
      "\n\nWe’re here to support you 💙",
  });

const scheduleOtherFollowups = (session, userId) =>
  scheduleFollowups({
    session,
    userId,
    syncFn: syncPatient,
    follow1:
      "Hi 🙂\nJust checking in with you regarding your health concern 💙\n\nSometimes we get busy and delay prioritising our health — but early guidance can prevent things from getting more complicated later.\n\nA personalised 1:1 consultation will help us deeply analyse your case and create a clear, structured recovery plan ✨\nYou can book your session here 👇\n🔗 " +
      getOtherLink() +
      "\n\nLet me know if you have any questions before booking 🙂",
    follow2:
      "Hi again 🙂\nJust a gentle reminder 💙\n\nHealth concerns often need a root-cause approach — not just temporary symptom relief.\n\nIn your consultation, Dr. Ruchita will:\n✔️ Understand your complete health history\n✔️ Analyse reports (if available)\n✔️ Identify root triggers\n✔️ Create a practical diet & lifestyle roadmap\n\nYou can secure your slot here 👇\n🔗 " +
      getOtherLink() +
      "\n\nWe’ll guide you with next steps once booked ✨",
    follow3:
      "Hi 🙂\nWe don’t want to disturb you further, so we’ll pause the follow-ups for now 💙\n\nWhenever you feel ready to work on your health in a structured and guided way, we’re here to support you.\n\nYou can book your consultation anytime here 👇\n🔗 " +
      getOtherLink() +
      "\n\nWishing you good health and balance always 🌿",
  });

const loadExisting = async (session, userId) => {
  const student = await googleSheetsService.getStudentById({ id: userId });
  if (student) {
    const row = student.data;
    session.flow = "student";
    session.sheetRow = student.row;
    session.savedToSheet = true;
    session.memory = {
      ...session.memory,
      id: row[0] || userId,
      name: row[1] || null,
      age: row[2] ? Number(row[2]) : null,
      whatsapp: row[3] || null,
      email: row[4] || null,
      profession: row[5] || null,
      experienceLevel: row[6] || null,
      goal: row[7] || null,
      willingWebinar: row[8] || null,
      takeFollowups: row[12] || "Yes",
    };
    session.linkSentAt = row[10] || null;
    session.webinarLinkSent = Boolean(row[9]);
    session.followups = row[11] || "";
    session.contactConfirmed = true;
    return true;
  }

  const patient = await googleSheetsService.getPatientById({ id: userId });
  if (patient) {
    const row = patient.data;
    session.flow = "patient";
    session.sheetRow = patient.row;
    session.savedToSheet = true;
    session.memory = {
      ...session.memory,
      id: row[0] || userId,
      name: row[1] || null,
      age: row[2] ? Number(row[2]) : null,
      whatsapp: row[3] || null,
      email: row[4] || null,
      profession: row[5] || null,
      currentMedication: row[6] || null,
      diabetesType: row[7] || null,
      diabetesYears: row[8] || null,
      sugarValues: row[9] || null,
      patientGoal: row[10] || null,
      others: row[13] || null,
      type1Flag: row[14] || null,
      type1Years: row[15] || null,
      type1SugarValues: row[16] || null,
      type1HighLows: row[17] || null,
      type1Symptoms: row[18] || null,
      takeFollowups: row[19] || "Yes",
    };
    session.linkSentAt = row[11] || null;
    session.followups = row[12] || "";
    session.patientTrack = row[13] ? "other" : "diabetes";
    session.contactConfirmed = true;
    return true;
  }

  return false;
};

/**
 * Main entry for every incoming Instagram message
 */
exports.processMessage = async (userId, message) => {
  if (!sessions[userId]) {
    sessions[userId] = new ConversationState(userId);
  }

  const session = sessions[userId];
  if (!session.loadedOnce) {
    session.loadedOnce = true;
    try {
      await loadExisting(session, userId);
    } catch (err) {
      console.error("❌ Google Sheets lookup error:", err.message);
    }
  }

  // Use LLM for short answers when user asks random question
  if (isQuestion(message)) {
    const shortAnswer = await llmService.answerShortQuestion({
      question: message,
      context: clinicContext,
    });
    return shortAnswer;
  }

  // Fallback extraction for contact details only while collecting details
  if (
    session.lastQuestion === "contact_details_student" ||
    session.lastQuestion === "contact_details_patient"
  ) {
    if (!session.memory.email) {
      const extractedEmail = extractEmail(message);
      if (extractedEmail) session.update({ email: extractedEmail });
    }
    if (!session.memory.whatsapp) {
      const extractedWhatsApp = extractWhatsApp(message);
      if (extractedWhatsApp) session.update({ whatsapp: extractedWhatsApp });
    }
    if (!session.memory.age) {
      const extractedAge = extractAge(message);
      if (extractedAge) session.update({ age: extractedAge });
    }
    const extractedName = extractName(message);
    if (extractedName) session.update({ name: extractedName });

    if (session.flow === "patient" && !session.memory.currentMedication) {
      const extractedMedication = extractMedication(message);
      if (extractedMedication) session.update({ currentMedication: extractedMedication });
    }

    // For "other" concerns, collect problem details after confirmation only.
  }

  // Flow choice first
  if (!session.flow) {
    if (session.lastQuestion !== "flow_choice") {
      session.lastQuestion = "flow_choice";
      return replyWithQuickReplies(
        "Hello 👋\n\n" +
          "Welcome to Dr. Ruchita Mehta  - Clinic & Academy\n\n" +
          "We are glad you connected 💙\n\n" +
          "Please let us know how we can support you:\n\n" +
          "1. Diabetes care\n" +
          "2. Other health concerns like thyroid, obesity\n" +
          "3. Professional certification (Diabetes Coach Program)\n\n" +
          "Reply with your choice 🙂",
        ["1", "2", "3"],
      );
    }
  }

  // Decide flow after contact confirmation
  if (session.lastQuestion === "flow_choice") {
    const trimmed = message.trim();
    if (trimmed === "1") {
      session.flow = "patient";
      session.patientTrack = "diabetes";
      session.update({ profession: "Patient" });
      session.memory.diabetic = "Yes";
      session.contactConfirmed = false;
      session.memory.name = null;
      session.memory.email = null;
      session.memory.whatsapp = null;
      session.memory.age = null;
      session.memory.others = null;
    } else if (trimmed === "2") {
      session.flow = "patient";
      session.patientTrack = "other";
      session.update({ profession: "Patient" });
      session.contactConfirmed = false;
      session.memory.name = null;
      session.memory.email = null;
      session.memory.whatsapp = null;
      session.memory.age = null;
      session.memory.others = null;
      session.memory.diabetic = null;
      session.memory.diabetesType = null;
      session.memory.diabetesYears = null;
      session.memory.sugarValues = null;
      session.memory.onInsulin = null;
      session.memory.patientGoal = null;
    } else if (trimmed === "3") {
      session.flow = "student";
      session.update({ profession: "Student" });
      session.contactConfirmed = false;
      session.memory.name = null;
      session.memory.email = null;
      session.memory.whatsapp = null;
      session.memory.age = null;
    } else {
        return replyWithQuickReplies("Please reply 1, 2, or 3.", ["1", "2", "3"]);
    }
  }

  if (!session.flow) {
    return replyWithQuickReplies("Please reply 1, 2, or 3.", ["1", "2", "3"]);
  }

  if (session.flow === "student") {
    if (!session.contactConfirmed) {
      if (session.lastQuestion === "confirm_contact_student") {
        if (isYes(message)) {
          session.contactConfirmed = true;
        } else if (isNo(message)) {
          session.memory.name = null;
          session.memory.email = null;
          session.memory.whatsapp = null;
          session.memory.age = null;
        }
      }

      const missing = [
        !session.memory.name,
        !session.memory.email,
        !session.memory.whatsapp,
        !session.memory.age,
      ].some(Boolean);

      if (!session.contactConfirmed) {
        if (missing) {
          session.lastQuestion = "contact_details_student";
          return (
            "Amazing 🙌\n\n" +
            "Our Certified Diabetes Specialist Program is designed for:\n" +
            "•⁠  ⁠Nutritionists • Health Coaches • Doctors • Fitness Trainers • Students\n\n" +
            "Would you like to attend our upcoming FREE WEBINAR ✅\n\n" +
            "Share Your Details Below to get the details 🎓\n\n" +
            "•⁠  ⁠Name\n" +
            "•⁠  ⁠Age\n" +
            "•⁠  ⁠Email\n" +
            "•⁠  ⁠WhatsApp Number"
          );
        }

        session.lastQuestion = "confirm_contact_student";
        return replyYesNo(
          `Thanks! Please confirm:\n` +
            `Name: ${session.memory.name}\n` +
            `Email: ${session.memory.email}\n` +
            `WhatsApp: ${session.memory.whatsapp}\n` +
            `Age: ${session.memory.age}\n` +
            `Is this correct? (Yes/No)`,
        );
      }
    }

    if (session.lastQuestion === "student_profession") {
      const mapped = mapStudentProfession(message);
      if (mapped) {
        session.update({ profession: mapped });
        await syncStudent(session, userId, { profession: mapped });
      } else {
        return replyWithQuickReplies(
          "Please select your profession:",
          ["Nutritionist", "Health Coach", "Doctor", "Fitness Trainer", "Student"],
        );
      }
    }

    if (!session.memory.profession) {
      session.lastQuestion = "student_profession";
      return replyWithQuickReplies(
        "Please select your profession:",
        ["Nutritionist", "Health Coach", "Doctor", "Fitness Trainer", "Student"],
      );
    }

    // Save student row after confirmation + profession
    if (!session.savedToSheet) {
      const row = await googleSheetsService.appendStudent({
        id: userId,
        name: session.memory.name,
        age: session.memory.age,
        number: session.memory.whatsapp,
        email: session.memory.email,
        profession: session.memory.profession,
        experienceLevel: session.memory.experienceLevel,
        goal: session.memory.goal,
        willingWebinar: session.memory.willingWebinar,
        webinarLink: session.webinarLinkSent ? getWebinarLink() : "",
        timeDate: session.linkSentAt || "",
        followups: session.followups || "",
        takeFollowups: session.memory.takeFollowups || "Yes",
      });
      session.sheetRow = row;
      session.savedToSheet = true;
    }

  if (session.lastQuestion === "experience_level") {
    const mapped = mapExperienceLevel(message);
    if (mapped) {
      session.update({ experienceLevel: mapped });
      await syncStudent(session, userId, { experienceLevel: mapped });
    } else {
      return "Please reply with A, B, C, or D.";
    }
  }

  if (!session.memory.experienceLevel) {
    session.lastQuestion = "experience_level";
    return replyWithQuickReplies(
      "Great 👍\n" +
        "Which best describes you?\n" +
        "A) Beginner – No diabetes coaching experience\n" +
        "B) Some experience but not confident\n" +
        "C) Already seeing diabetes clients\n" +
        "D) Just exploring",
      ["A", "B", "C", "D"],
    );
  }

  if (session.lastQuestion === "goal") {
    const mapped = mapGoal(message);
    if (mapped) {
      session.update({ goal: mapped });
      await syncStudent(session, userId, { goal: mapped });
    } else {
      return "Please reply with A, B, C, D, or E.";
    }
  }

  if (!session.memory.goal) {
    session.lastQuestion = "goal";
    return replyWithQuickReplies(
      "What is your main goal from this training?\n" +
        "A) Become Diabetes Educator\n" +
        "B) Start own practice\n" +
        "C) Increase income\n" +
        "D) Help more patients\n" +
        "E) All of the above",
      ["A", "B", "C", "D", "E"],
    );
  }
    if (!session.webinarAsked) {
      session.webinarAsked = true;
      session.lastQuestion = "webinar_intent";
      return replyYesNo(
        "Amazing 🙌\n" +
          "I am hosting a Free Live Webinar where I will reveal:\n" +
          "✅ The 5 Biggest Gaps – Why you are not getting best results in diabetes cases\n" +
          "✅ The 3D Method I personally use for sugar control\n" +
          "✅ Why sugar is not dropping even after diet & medicines\n" +
          "✅ How to start getting consistent results in your diabetes clients\n" +
          "Would you like to attend this webinar?\n" +
          "Reply YES to get details."
      );
    }

    if (session.lastQuestion === "webinar_intent") {
      if (isYes(message)) {
        session.memory.willingWebinar = "Yes";
        session.webinarLinkSent = true;
        session.linkSentAt = nowIso();
        await syncStudent(session, userId, {
          willingWebinar: "Yes",
          webinarLink: getWebinarLink(),
          timeDate: session.linkSentAt,
        });
        scheduleStudentFollowups(session, userId);
        return `Here's your webinar link: ${getWebinarLink()}`;
      }
      if (isNo(message)) {
        session.memory.willingWebinar = "No";
        await syncStudent(session, userId, { willingWebinar: "No" });
        return "No worries. If you change your mind, I’m here.";
      }
    }

    if (session.webinarLinkSent && isWebinarLinkRequest(message)) {
      return `Here's your webinar link: ${getWebinarLink()}`;
    }

    if (session.loadedFromSheet && isAck(message)) {
      return "Welcome back. Want to continue your webinar registration or update your details?";
    }

    return "Thanks for sharing. Anything else you’d like to know?";
  }

  // Patient flow
  if (!session.contactConfirmed) {
    if (session.lastQuestion === "confirm_contact_patient") {
      if (isYes(message)) {
        session.contactConfirmed = true;
        if (session.patientTrack === "other") {
          session.memory.others = null;
          session.memory.otherSince = null;
        }
      } else if (isNo(message)) {
        session.memory.name = null;
        session.memory.email = null;
        session.memory.whatsapp = null;
        session.memory.age = null;
        session.memory.currentMedication = null;
        session.memory.others = null;
        session.memory.otherSince = null;
      }
    }

    const missing = [
      !session.memory.name,
      !session.memory.email,
      !session.memory.whatsapp,
      !session.memory.age,
    ].some(Boolean);

    if (!session.contactConfirmed) {
      if (missing) {
        session.lastQuestion = "contact_details_patient";
        if (session.patientTrack === "other") {
          return (
            "Hi 👋 Thank you for reaching out to Dr. Ruchita Mehta – Clinic & Academy 💙\n\n" +
            "Before we guide you further, could you please share:\n\n" +
            "•⁠  ⁠Name\n" +
            "•⁠  ⁠Age\n" +
            "•⁠  ⁠Email\n" +
            "•⁠  ⁠Current Medication (if any)\n" +
            "•⁠  ⁠Contact Number\n" +
            "•⁠  ⁠What health concern are you facing?\n" +
            "•⁠  ⁠Since how long?\n\n" +
            "This will help our team understand your case better and suggest the right support for you ✨"
          );
        }
        return session.patientTrack === "other"
          ? "Hi 👋 Thank you for reaching out to Dr. Ruchita Mehta – Clinic & Academy 💙\n\n" +
              "Before we guide you further, could you please share:\n\n" +
              "•⁠  ⁠Name\n" +
              "•⁠  ⁠Age\n" +
              "•⁠  ⁠Email\n" +
              "•⁠  ⁠Current Medication (if any)\n" +
              "•⁠  ⁠Contact Number\n" +
              "•⁠  ⁠What health concern are you facing?\n" +
              "•⁠  ⁠Since how long?\n\n" +
              "This will help our team understand your case better and suggest the right support for you ✨"
          : "Thank you for reaching out 💙\n\n" +
              "We help patients manage & reverse Diabetes naturally using:\n\n" +
              "✔ Personalized Nutrition\n" +
              "✔ Lifestyle correction\n" +
              "✔ Root-cause analysis\n" +
              "✔ Medicine reduction support (if applicable)\n\n" +
              "To understand your case, please share:\n\n" +
              "•⁠  ⁠Name\n" +
              "•⁠  ⁠Age\n" +
              "•⁠  ⁠Email\n" +
              "•⁠  ⁠Current Medication (if any)\n" +
              "•⁠  ⁠Contact Number\n\n" +
              "Our team will review and guide you for the best consultation plan 🩺";
      }

      session.lastQuestion = "confirm_contact_patient";
      return replyYesNo(
        `Thanks! Please confirm:\n` +
          `Name: ${session.memory.name}\n` +
          `Email: ${session.memory.email}\n` +
          `Current Medication: ${session.memory.currentMedication || "Not provided"}\n` +
          `Contact Number: ${session.memory.whatsapp}\n` +
          `Age: ${session.memory.age}\n` +
          `Is this correct? (Yes/No)`
      );
    }
  }

  if (session.patientTrack === "other" && session.contactConfirmed) {
    if (session.lastQuestion === "other_problem" && !session.memory.others) {
      session.memory.others = message.trim();
      await syncPatient(session, userId, { others: session.memory.others });
    }

    if (session.lastQuestion === "other_since" && !session.memory.otherSince) {
      session.memory.otherSince = message.trim();
      const combined = `${session.memory.others} | Since: ${session.memory.otherSince}`;
      session.memory.others = combined;
      await syncPatient(session, userId, { others: combined });
    }

    if (!session.memory.others) {
      session.lastQuestion = "other_problem";
      return "What health concern are you facing?";
    }

    if (!session.memory.otherSince) {
      session.lastQuestion = "other_since";
      return "Since how long?";
    }
  }

  if (!session.savedToSheet) {
    const row = await googleSheetsService.appendPatient({
      id: userId,
      name: session.memory.name,
      age: session.memory.age,
      number: session.memory.whatsapp,
      email: session.memory.email,
      profession: session.memory.profession,
      currentMedication: session.memory.currentMedication,
      diabetesType: session.memory.diabetesType,
      diabetesYears: session.memory.diabetesYears,
      sugarValues: session.memory.sugarValues,
      patientGoal: session.memory.patientGoal,
      timeDate: session.linkSentAt || "",
      followups: session.followups || "",
      others: session.memory.others,
      type1Flag: session.memory.diabetesType === "Type 1" ? "Yes" : "",
      type1Years: session.memory.type1Years,
      type1SugarValues: session.memory.type1SugarValues,
      type1HighLows: session.memory.type1HighLows,
      type1Symptoms: session.memory.type1Symptoms,
      takeFollowups: session.memory.takeFollowups || "Yes",
    });
    session.sheetRow = row;
    session.savedToSheet = true;
  }

  if (session.patientTrack === "other") {
    if (session.lastQuestion === "other_problem") {
      session.memory.others = message.trim();
      await syncPatient(session, userId, { others: session.memory.others });
    }

    if (session.lastQuestion === "other_since") {
      session.memory.otherSince = message.trim();
      const combined = `${session.memory.others} | Since: ${session.memory.otherSince}`;
      session.memory.others = combined;
      await syncPatient(session, userId, { others: combined });
    }

    if (!session.memory.others) {
      session.lastQuestion = "other_problem";
      return "What health concern are you facing?";
    }

    if (!session.memory.otherSince) {
      session.lastQuestion = "other_since";
      return "Since how long?";
    }

    if (!session.otherOfferSent) {
      session.otherOfferSent = true;
      session.linkSentAt = nowIso();
      await syncPatient(session, userId, { timeDate: session.linkSentAt });
      scheduleOtherFollowups(session, userId);
      return (
        "Thank you for sharing 🙏\n\n" +
        "For personalised guidance and a detailed plan, we recommend booking a 1:1 consultation with Dr. Ruchita Mehta 👩‍⚕️✨\n\n" +
        "In the session, you’ll receive:\n" +
        "✔️ Detailed health assessment\n" +
        "✔️ Diet & lifestyle strategy\n" +
        "✔️ Root-cause based plan\n" +
        "✔️ Report analysis\n\n" +
        "You can book your appointment here 👇\n" +
        `🔗 ${getOtherLink()}\n\n` +
        "Let us know once booked, we’ll guide you with the next steps 💙"
      );
    }

    return "Thanks for sharing. Anything else you’d like to know?";
  }

  if (session.lastQuestion === "diabetes_type") {
    const mapped = mapDiabetesType(message);
    session.memory.diabetesType = mapped || message.trim();
    session.memory.type1Flag =
      session.memory.diabetesType === "Type 1" ? "Yes" : "";
    await syncPatient(session, userId, { diabetesType: session.memory.diabetesType });
  }

  if (session.patientTrack !== "other" && !session.memory.diabetesType) {
    session.lastQuestion = "diabetes_type";
    return replyDiabetesTypes("Which type of Diabetes?");
  }

  const isType1 =
    session.memory.type1Flag === "Yes" ||
    (session.memory.diabetesType &&
      /type\\s*1/i.test(session.memory.diabetesType));

  if (isType1) {
    if (!session.type1IntroSent) {
      session.type1IntroSent = true;
      session.lastQuestion = "type1_years";
      return (
        "Hi 👋 \n\n" +
        "Thank you for reaching out to Dr Ruchita Mehta 🙂\n" +
        "I personally understand Type 1 closely, as I have been managing Type 1 cases since 2012 and have helped many clients achieve more stable sugars and better energy levels with the right nutrition and lifestyle support.\n\n" +
        "Managing sugars daily can feel overwhelming sometimes, but with the right guidance, stability is possible 🙂\n\n" +
        "To guide you properly, I need a few quick details 👇\n\n" +
        "1️⃣ Since how many years diagnosed?\n" +
        "2️⃣ Latest Fasting & PP sugar values\n" +
        "3️⃣ Do you experience frequent sugar highs or lows?\n" +
        "4️⃣ Any symptoms like fatigue, weakness, weight changes or mood swings?"
      );
    }

    if (session.lastQuestion === "type1_years") {
      session.memory.type1Years = message.trim();
      await syncPatient(session, userId, { type1Years: session.memory.type1Years });
    }
    if (!session.memory.type1Years) {
      session.lastQuestion = "type1_years";
      return "Since how many years diagnosed?";
    }

    if (session.lastQuestion === "type1_sugar_values") {
      session.memory.type1SugarValues = message.trim();
      await syncPatient(session, userId, {
        type1SugarValues: session.memory.type1SugarValues,
      });
    }
    if (!session.memory.type1SugarValues) {
      session.lastQuestion = "type1_sugar_values";
      return "Latest Fasting & PP sugar values";
    }

    if (session.lastQuestion === "type1_high_lows") {
      if (isYes(message)) session.memory.type1HighLows = "Yes";
      else if (isNo(message)) session.memory.type1HighLows = "No";
      else session.memory.type1HighLows = message.trim();
      await syncPatient(session, userId, { type1HighLows: session.memory.type1HighLows });
    }
    if (!session.memory.type1HighLows) {
      session.lastQuestion = "type1_high_lows";
      return replyYesNo("Do you experience frequent sugar highs or lows?");
    }

    if (session.lastQuestion === "type1_symptoms") {
      session.memory.type1Symptoms = message.trim();
      await syncPatient(session, userId, { type1Symptoms: session.memory.type1Symptoms });
    }
    if (!session.memory.type1Symptoms) {
      session.lastQuestion = "type1_symptoms";
      return "Any symptoms like fatigue, weakness, weight changes or mood swings?";
    }

    if (session.lastQuestion === "type1_step_intent") {
      if (isYes(message)) session.memory.type1StepIntent = "Yes";
      else if (isNo(message)) session.memory.type1StepIntent = "No";
      await syncPatient(session, userId, { type1StepIntent: session.memory.type1StepIntent });
    }
    if (!session.memory.type1StepIntent) {
      session.lastQuestion = "type1_step_intent";
      return replyYesNo(
        "Thank you for sharing 🙏\n" +
          "Based on your details, your sugars are currently not very stable, which is common in Type 1 when nutrition timing and lifestyle are not optimized.\n\n" +
          "My approach focuses on:\n" +
          "✔️ Reducing sugar spikes\n" +
          "✔️ Improving insulin response\n" +
          "✔️ Preventing complications\n" +
          "✔️ Improving daily energy\n\n" +
          "Would you like to know how we work step by step? 🙂\n" +
          "Type (Yes or No)"
      );
    }

    if (session.lastQuestion === "type1_goal") {
      const mapped = mapType1Goal(message);
      if (mapped) {
        session.memory.patientGoal = mapped;
        await syncPatient(session, userId, { patientGoal: mapped });
      } else {
        return "Please reply with A, B, C, D, or E.";
      }
    }

    if (!session.memory.patientGoal) {
      session.lastQuestion = "type1_goal";
      return replyWithQuickReplies(
        "Before I share details, I just want to understand your goal 🙂\n\n" +
          "What is your main focus right now?\n" +
          "A️⃣ Better sugar control\n" +
          "B️⃣ Reduce fluctuations\n" +
          "C️⃣ Improve energy\n" +
          "D️⃣ Prevent complications\n" +
          "E️⃣ All of the above",
        ["A", "B", "C", "D", "E"],
      );
    }

    if (!session.type1Complete) {
      session.type1Complete = true;
      session.linkSentAt = nowIso();
      await syncPatient(session, userId, { timeDate: session.linkSentAt });
      scheduleType1Followups(session, userId);
      return (
        "Based on your goal, I recommend a personalized consultation where we deeply analyse your case and create a structured plan.\n\n" +
        "You can book your appointment here 👇\n\n" +
        `🔗 ${getType1Link()}\n\n` +
        "Let us know once booked, we’ll guide you with the next steps 💙"
      );
    }

    return "Thanks for sharing. Anything else you’d like to know?";
  }

  if (session.lastQuestion === "diabetes_years") {
    session.memory.diabetesYears = message.trim();
    await syncPatient(session, userId, { diabetesYears: session.memory.diabetesYears });
  }

  if (!session.memory.diabetesYears) {
    session.lastQuestion = "diabetes_years";
    return "Since how many years?";
  }

  if (session.lastQuestion === "sugar_values") {
    session.memory.sugarValues = message.trim();
    await syncPatient(session, userId, { sugarValues: session.memory.sugarValues });
  }

  if (!session.memory.sugarValues) {
    session.lastQuestion = "sugar_values";
    return "Latest Fasting & PP sugar values (if available)";
  }

  if (session.lastQuestion === "patient_goal") {
    const mapped = mapPatientGoal(message);
    if (mapped) {
      session.memory.patientGoal = mapped;
      await syncPatient(session, userId, { patientGoal: mapped });
    } else {
      return "Please reply with A, B, C, D, or E.";
    }
  }

  if (!session.memory.patientGoal) {
    session.lastQuestion = "patient_goal";
    return replyWithQuickReplies(
      "What is your main goal right now?\n" +
        "A) Reduce medicines\n" +
        "B) Better sugar control\n" +
        "C) Weight loss\n" +
        "D) Complication prevention\n" +
        "E) All of the above",
      ["A", "B", "C", "D", "E"],
    );
  }

  if (!session.patientOfferSent) {
    session.patientOfferSent = true;
    session.linkSentAt = nowIso();
    await syncPatient(session, userId, { timeDate: session.linkSentAt });
    scheduleType2Followups(session, userId);
    return (
      "Based on your details, I’ll personally review your case and suggest the best plan 👩‍⚕️\n\n" +
      "Choose an option below 👇\n\n" +
      "🔹 Book 1:1 Call with Dr. Ruchita Mehta\n" +
      `${getPatientLink()}\n\n` +
      "OR\n\n" +
      "🔹 Join FREE Diabetes Management Webinar\n" +
      `${getDiabetesWebinarLink()}`
    );
  }

  return "Thanks for sharing. Anything else you’d like to know?";
};
