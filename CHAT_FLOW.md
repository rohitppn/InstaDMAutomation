# Instagram DM Chat Flow

This document describes the current chat flow implemented in the bot.

## 1) Entry Message

The bot starts with:

- `Hello 👋`
- `Welcome to Dr. Ruchita Mehta  - Clinic & Academy`
- `We are glad you connected 💙`
- `Please let us know how we can support you:`
- `1. Diabetes care`
- `2. Other health concerns like thyroid, obesity`
- `3. Professional certification (Diabetes Coach Program)`
- `Reply with your choice 🙂`

Quick reply buttons:

- `1`
- `2`
- `3`

## 2) Branching Logic

- If user selects `1` -> `patient` flow (`patientTrack = diabetes`)
- If user selects `2` -> `patient` flow (`patientTrack = other`)
- If user selects `3` -> `student` flow

## 3) Shared Detail Collection

### Student detail collection

Bot asks for:

- Name
- Age
- Email
- WhatsApp Number

Then confirmation:

- Name
- Email
- WhatsApp
- Age
- `Is this correct? (Yes/No)` with quick replies (`Yes`, `No`)

### Patient detail collection (Diabetes path)

Bot asks for:

- Name
- Age
- Email
- Current Medication (if any)
- Contact Number

Then confirmation:

- Name
- Email
- Current Medication
- Contact Number
- Age
- `Is this correct? (Yes/No)` with quick replies (`Yes`, `No`)

### Patient detail collection (Other concerns path)

Bot asks for:

- Name
- Age
- Email
- Current Medication (if any)
- Contact Number
- What health concern are you facing?
- Since how long?

Then confirmation:

- Name
- Email
- Current Medication
- Contact Number
- Age
- `Is this correct? (Yes/No)` with quick replies (`Yes`, `No`)

After confirmation, it explicitly asks:

- `What health concern are you facing?`
- `Since how long?`

The two are combined and saved in `Others`:

- `<concern> | Since: <duration>`

## 4) Student Flow (Option 3)

After confirmation:

1. Profession selection (quick replies):
   - `Nutritionist`
   - `Health Coach`
   - `Doctor`
   - `Fitness Trainer`
   - `Student`
2. Experience level (quick replies):
   - `A`
   - `B`
   - `C`
   - `D`
3. Goal (quick replies):
   - `A`
   - `B`
   - `C`
   - `D`
   - `E`
4. Webinar intent (`Yes/No` quick replies)
5. If `Yes` -> send webinar link

Student link source:

- `WEBINAR_LINK` env var (fallback default in code)

## 5) Patient Diabetes Flow (Option 1)

After confirmation:

1. Ask diabetes type (quick replies):
   - `Type 1`
   - `Type 2`
   - `Prediabetes`
   - `Gestational`

### 5.1 Type 1 path

If diabetes type resolves to `Type 1`:

1. Send Type 1 introduction block
2. Ask: since how many years diagnosed?
3. Ask: latest fasting & PP sugar values
4. Ask: frequent highs/lows? (`Yes/No`)
5. Ask: symptoms
6. Ask: step-by-step intent (`Yes/No`)
7. Ask: main focus (`A/B/C/D/E` quick replies)
8. Send Type 1 consultation link

Type 1 link source:

- `TYPE1_LINK` env var (fallback default in code)

### 5.2 Type 2 / Prediabetes / Gestational path

If diabetes type is not Type 1:

1. Ask: since how many years?
2. Ask: latest fasting & PP sugar values (if available)
3. Ask goal (`A/B/C/D/E` quick replies)
4. Send two options:
   - 1:1 consult link
   - diabetes webinar link

Link sources:

- Consult link: `PATIENT_LINK` or `1:1_CONSULT_LINK`
- Diabetes webinar: `DIABETES_WEBINAR_LINK`

## 6) Patient Other-Concern Flow (Option 2)

After confirmation and concern details:

1. Send consultation recommendation block
2. Send booking link

Other link source:

- `OTHER_LINK` (fallback to `TYPE1_LINK`)

## 7) Follow-up Scheduling

Follow-ups are scheduled at:

- 24 hours
- 48 hours
- 72 hours

Separate follow-up message sets exist for:

- Student
- Type 2 / Prediabetes / Gestational
- Type 1
- Other concerns

If `Take Followups` is `No`, follow-ups are skipped.

## 8) Google Sheets Mapping

## Sheet1 (Students)

Columns:

- `ID`
- `Name`
- `Age`
- `Number`
- `Email`
- `Profession`
- `Great Which best describes you?`
- `Goal`
- `Willing to Join Webinar`
- `webinarLink`
- `Time/Date`
- `Followups`
- `Take Follow ups`

## Sheet2 (Patients / Type1 / Others)

Columns:

- `ID`
- `Name`
- `Age`
- `Number`
- `Email`
- `Profession`
- `Current Medication (Optionl)`
- `Type Of Diabaties`
- `Since how many years?`
- `Fasting & PP Sugar Value`
- `What is your main goal right now?`
- `Time/Date`
- `Followups`
- `Others`
- `TYPE 1`
- `Since how many years diagnosed?`
- `Latest Fasting & PP sugar values`
- `Do you experience frequent sugar highs or low?`
- `Any symptoms like fatigue, weakness, weight changes or mood swings?`
- `Take Follow ups`

## 9) Key Environment Variables

- `INSTAGRAM_ACCESS_TOKEN`
- `IG_BUSINESS_ID`
- `INSTAGRAM_VERIFY_TOKEN`
- `IG_APP_SCOPED_USER_IDS`
- `GOOGLE_SHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON` (recommended for hosted environments)
- `WEBINAR_LINK`
- `PATIENT_LINK`
- `DIABETES_WEBINAR_LINK`
- `TYPE1_LINK`
- `OTHER_LINK`

