class ConversationState {
  constructor(userId) {
    this.userId = userId;

    // conversational memory
    this.memory = {
      id: userId,
      name: null,
      age: null,
      email: null,
      whatsapp: null,
      profession: null,
      currentMedication: null,
      diabetic: null,
      diabetesType: null,
      diabetesYears: null,
      sugarValues: null,
      onInsulin: null,
      patientGoal: null,
      wantsGuidance: null,
      willBook: null,
      others: null,
      otherSince: null,
      type1Years: null,
      type1SugarValues: null,
      type1HighLows: null,
      type1Symptoms: null,
      type1StepIntent: null,
      type1Flag: null,
      takeFollowups: "Yes",
      experienceLevel: null,
      goal: null,
      willingWebinar: null,
    };

    this.lastQuestion = null;
    this.savedToSheet = false;
    this.sheetRow = null;
    this.contactConfirmed = false;
    this.ageAsked = false;
    this.nonBookingTurns = 0;
    this.webinarLinkSent = false;
    this.linkSentAt = null;
    this.webinarConfirmed = false;
    this.webinarDeclined = false;
    this.followUpScheduled = false;
    this.experienceAsked = false;
    this.goalAsked = false;
    this.webinarAsked = false;
    this.patientDetailAsked = false;
    this.patientGoalAsked = false;
    this.guidanceAsked = false;
    this.followUpStage = 0;
    this.loadedFromSheet = false;
    this.loadedOnce = false;
    this.flow = null;
    this.patientTrack = null; // "diabetes" | "other"
    this.patientOfferSent = false;
    this.otherOfferSent = false;
    this.type1Complete = false;
    this.type1IntroSent = false;
    this.followups = "";
    this.isClosed = false;
  }

  /**
   * Safely update memory with new extracted entities
   */
  update(entities = {}) {
    const next = { ...this.memory };

    Object.entries(entities).forEach(([key, value]) => {
      if (value === null || value === undefined) return;
      if (typeof value === "string" && value.trim().length === 0) return;

      if (key === "whatsapp" && typeof value === "string") {
        const digits = value.replace(/\D/g, "");
        if (digits.length > 0) next.whatsapp = digits;
        return;
      }

      if (key === "email" && typeof value === "string") {
        next.email = value.trim().toLowerCase();
        return;
      }

      if (key === "name" && typeof value === "string") {
        next.name = value.trim();
        return;
      }

      next[key] = value;
    });

    this.memory = next;
  }
}

module.exports = ConversationState;
