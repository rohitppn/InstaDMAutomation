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

const nowIso = () => new Date().toISOString();

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
    diabetic: session.memory.diabetic,
    diabetesType: session.memory.diabetesType,
    diabetesYears: session.memory.diabetesYears,
    onInsulin: session.memory.onInsulin,
    patientGoal: session.memory.patientGoal,
    guidance: session.memory.wantsGuidance,
    willBook: session.memory.willBook,
    timeDate: session.linkSentAt || "",
    followups: session.followups || "",
    others: session.memory.others,
    ...overrides,
  });
};

const scheduleStudentFollowups = (session, userId) => {
  if (session.followUpScheduled) return;
  session.followUpScheduled = true;

  const follow1 =
    "Hi 🙂 Bas follow‑up kar rahi hoon. Webinar me jo clarity milegi, woh practice grow karne me help karegi. Jab ready ho, link se register kar sakte ho.";
  const follow2 =
    "Ek chhota sa question 🙂 Is training se aapka main focus kya hai—results improve karna, practice grow karna, ya certification?";
  const follow3 =
    "Hi 👋 Ye last follow‑up hai. Jab bhi ready ho, webinar join karna helpful rahega. Take care 🙂";

  setTimeout(async () => {
    try {
      await sendMessage({ recipientId: userId, text: follow1 });
      session.followups = appendFollowup(session.followups, follow1);
      await syncStudent(session, userId, { followups: session.followups });
    } catch (err) {
      console.error("❌ Student follow-up error:", err.message);
    }
  }, 12 * 60 * 60 * 1000);

  setTimeout(async () => {
    try {
      await sendMessage({ recipientId: userId, text: follow2 });
      session.followups = appendFollowup(session.followups, follow2);
      await syncStudent(session, userId, { followups: session.followups });
    } catch (err) {
      console.error("❌ Student follow-up error:", err.message);
    }
  }, 24 * 60 * 60 * 1000);

  setTimeout(async () => {
    try {
      await sendMessage({ recipientId: userId, text: follow3 });
      session.followups = appendFollowup(session.followups, follow3);
      await syncStudent(session, userId, { followups: session.followups });
    } catch (err) {
      console.error("❌ Student follow-up error:", err.message);
    }
  }, 48 * 60 * 60 * 1000);
};

const schedulePatientFollowups = (session, userId) => {
  if (session.followUpScheduled) return;
  session.followUpScheduled = true;

  const follow1 =
    "Hi 🙂 Bas follow‑up kar rahi hoon. Diabetes har body mein different behave karta hai. Bina details dekhe generic advice dena ethically sahi nahi lagta. Assessment se clarity milti hai.";
  const follow2 =
    "Ek chhota sa question 🙂 Aapka main concern kya hai? 1️⃣ Fasting sugar 2️⃣ Post‑meal spikes 3️⃣ HbA1c 4️⃣ Weight/tiredness 5️⃣ Medicines badh rahi hain";
  const follow3 =
    "Hi 👋 Ye last message hai. Jitni jaldi clarity mile, utni unnecessary medicines aur frustration avoid hoti hai. Jab ready ho, message kar dena. Take care 🙂";

  setTimeout(async () => {
    try {
      await sendMessage({ recipientId: userId, text: follow1 });
      session.followups = appendFollowup(session.followups, follow1);
      await syncPatient(session, userId, { followups: session.followups });
    } catch (err) {
      console.error("❌ Patient follow-up error:", err.message);
    }
  }, 12 * 60 * 60 * 1000);

  setTimeout(async () => {
    try {
      await sendMessage({ recipientId: userId, text: follow2 });
      session.followups = appendFollowup(session.followups, follow2);
      await syncPatient(session, userId, { followups: session.followups });
    } catch (err) {
      console.error("❌ Patient follow-up error:", err.message);
    }
  }, 24 * 60 * 60 * 1000);

  setTimeout(async () => {
    try {
      await sendMessage({ recipientId: userId, text: follow3 });
      session.followups = appendFollowup(session.followups, follow3);
      await syncPatient(session, userId, { followups: session.followups });
    } catch (err) {
      console.error("❌ Patient follow-up error:", err.message);
    }
  }, 48 * 60 * 60 * 1000);
};

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
      diabetic: row[6] || null,
      diabetesType: row[7] || null,
      diabetesYears: row[8] || null,
      onInsulin: row[9] || null,
      patientGoal: row[10] || null,
      wantsGuidance: row[11] || null,
      willBook: row[12] || null,
      others: row[15] || null,
    };
    session.linkSentAt = row[13] || null;
    session.followups = row[14] || "";
    session.patientTrack = row[15] ? "other" : "diabetes";
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
  }

  // Flow choice first
  if (!session.flow) {
    if (session.lastQuestion !== "flow_choice") {
      session.lastQuestion = "flow_choice";
      return (
        "Hello 👋\n" +
        "Welcome to Dr. Ruchita Mehta  - Clinic & Academy\n" +
        "We are glad you connected 💙\n" +
        "Please let us know how we can support you:\n" +
        "1. Diabetes care\n" +
        "2. Other health concerns like thyroid, obesity, pcos etc\n" +
        "3. Professional certification (Diabetes Coach Program)\n\n" +
        "Reply with your choice 🙂"
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
      return "Please reply 1, 2, or 3.";
    }
  }

  if (!session.flow) {
    return "Please reply 1, 2, or 3.";
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
        return (
          `Thanks! Please confirm:\n` +
          `Name: ${session.memory.name}\n` +
          `Email: ${session.memory.email}\n` +
          `WhatsApp: ${session.memory.whatsapp}\n` +
          `Age: ${session.memory.age}\n` +
          `Is this correct? (Yes/No)`
        );
      }
    }

    // Save student row after confirmation
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
    return (
      "Great 👍\n" +
      "Which best describes you?\n" +
      "A) Beginner – No diabetes coaching experience\n" +
      "B) Some experience but not confident\n" +
      "C) Already seeing diabetes clients\n" +
      "D) Just exploring"
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
    return (
      "What is your main goal from this training?\n" +
      "A) Become Diabetes Educator\n" +
      "B) Start own practice\n" +
      "C) Increase income\n" +
      "D) Help more patients\n" +
      "E) All of the above"
    );
  }
    if (!session.webinarAsked) {
      session.webinarAsked = true;
      session.lastQuestion = "webinar_intent";
      return (
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
        session.lastQuestion = "contact_details_patient";
        return (
          "Thank you for reaching out 💙\n\n" +
          "We help patients manage & reverse Diabetes naturally using:\n\n" +
          "✔ Personalized Nutrition\n" +
          "✔ Lifestyle correction\n" +
          "✔ Root-cause analysis\n" +
          "✔ Medicine reduction support (if applicable)\n\n" +
          "To understand your case, please share:\n\n" +
          "•⁠  ⁠Name\n" +
          "•⁠  ⁠Age\n" +
          "•⁠  ⁠Email\n" +
          "•⁠  ⁠WhatsApp Number\n\n" +
          "Our team will review and guide you for the best consultation plan 🩺"
        );
      }

      session.lastQuestion = "confirm_contact_patient";
      return (
        `Thanks! Please confirm:\n` +
        `Name: ${session.memory.name}\n` +
        `Email: ${session.memory.email}\n` +
        `WhatsApp: ${session.memory.whatsapp}\n` +
        `Age: ${session.memory.age}\n` +
        `Is this correct? (Yes/No)`
      );
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
      diabetic: session.memory.diabetic,
      diabetesType: session.memory.diabetesType,
      diabetesYears: session.memory.diabetesYears,
      onInsulin: session.memory.onInsulin,
      patientGoal: session.memory.patientGoal,
      guidance: session.memory.wantsGuidance,
      willBook: session.memory.willBook,
      timeDate: session.linkSentAt || "",
      followups: session.followups || "",
      others: session.memory.others,
    });
    session.sheetRow = row;
    session.savedToSheet = true;
  }

  if (session.patientTrack === "other") {
    if (session.lastQuestion === "other_problem") {
      session.memory.others = message.trim();
      await syncPatient(session, userId, { others: session.memory.others });
    }

    if (!session.memory.others) {
      session.lastQuestion = "other_problem";
      return "Please briefly describe your health concern.";
    }
  }

  if (session.lastQuestion === "diabetic") {
    if (isYes(message)) {
      session.memory.diabetic = "Yes";
    } else if (isNo(message)) {
      session.memory.diabetic = "No";
    } else {
      return "Please reply Yes or No.";
    }
    await syncPatient(session, userId, { diabetic: session.memory.diabetic });
  }

  if (session.patientTrack !== "other" && !session.memory.diabetic) {
    session.lastQuestion = "diabetic";
    return "Are you diabetic?";
  }

  if (session.lastQuestion === "diabetes_type") {
    session.memory.diabetesType = message;
    await syncPatient(session, userId, { diabetesType: session.memory.diabetesType });
  }

  if (session.patientTrack !== "other" && session.memory.diabetic === "Yes" && !session.memory.diabetesType) {
    session.lastQuestion = "diabetes_type";
    return "Which type of Diabetes? (Type 1 / Type 2 / Prediabetes / Gestational)";
  }

  if (session.lastQuestion === "diabetes_years") {
    session.memory.diabetesYears = message;
    await syncPatient(session, userId, { diabetesYears: session.memory.diabetesYears });
  }

  if (session.patientTrack !== "other" && session.memory.diabetic === "Yes" && !session.memory.diabetesYears) {
    session.lastQuestion = "diabetes_years";
    return "Since how many years?";
  }

  if (session.lastQuestion === "sugar_values") {
    session.memory.sugarValues = message;
    // Store sugar values inside diabetic column for now
    const diabeticField = `${session.memory.diabetic}; Sugar: ${session.memory.sugarValues}`;
    await syncPatient(session, userId, { diabetic: diabeticField });
  }

  if (session.patientTrack !== "other" && session.memory.diabetic === "Yes" && !session.memory.sugarValues) {
    session.lastQuestion = "sugar_values";
    return "Latest Fasting & PP sugar values (if available)";
  }

  if (session.lastQuestion === "on_insulin") {
    if (isYes(message)) session.memory.onInsulin = "Yes";
    else if (isNo(message)) session.memory.onInsulin = "No";
    else return "Please reply Yes or No.";
    await syncPatient(session, userId, { onInsulin: session.memory.onInsulin });
  }

  if (session.patientTrack !== "other" && session.memory.diabetic === "Yes" && !session.memory.onInsulin) {
    session.lastQuestion = "on_insulin";
    return "Are you on insulin or tablets? (Yes/No)";
  }

  if (session.patientTrack === "other" && !session.memory.patientGoal) {
    session.memory.patientGoal = "Other health concern";
    await syncPatient(session, userId, { patientGoal: session.memory.patientGoal });
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

  if (!session.memory.patientGoal && session.patientTrack !== "other") {
    session.lastQuestion = "patient_goal";
    return (
      "What is your main goal right now?\n" +
      "A) Reduce medicines\n" +
      "B) Better sugar control\n" +
      "C) Weight loss\n" +
      "D) Complication prevention\n" +
      "E) All of the above"
    );
  }
  if (session.lastQuestion === "guidance") {
    if (isYes(message)) {
      session.memory.wantsGuidance = "Yes";
      session.memory.willBook = "Yes";
      session.linkSentAt = nowIso();
      await syncPatient(session, userId, {
        guidance: "Yes",
        willBook: "Yes",
        timeDate: session.linkSentAt,
      });
      schedulePatientFollowups(session, userId);
      return `You can book 1:1 Call With Dr Ruchita Mehta: ${getPatientLink()}`;
    }
    if (isNo(message)) {
      session.memory.wantsGuidance = "No";
      session.memory.willBook = "No";
      await syncPatient(session, userId, { guidance: "No", willBook: "No" });
      schedulePatientFollowups(session, userId);
      return "No problem. If you need help later, just message me.";
    }
  }

  if (!session.memory.wantsGuidance) {
    session.lastQuestion = "guidance";
    return (
      "Based on your details, I’ll personally review your case and suggest the best plan 👩‍⚕️\n\n" +
      "Choose an option below 👇\n\n" +
      "🔹 Book 1:1 Call with Dr. Ruchita Mehta\n" +
      "https://drruchitamehta.exlyapp.com/checkout/f92410b4-99bf-4da7-8d97-965cff79f1ea\n\n" +
      "OR\n\n" +
      "🔹 Join FREE Diabetes Management Webinar\n" +
      "https://drruchitamehta.exlyapp.com/checkout/8392be04-0a17-4c40-92a4-9dfc6f418140"
    );
  }

  return "Thanks for sharing. Anything else you’d like to know?";
};
