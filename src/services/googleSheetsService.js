const { google } = require("googleapis");

const getAuth = () => {
  const scopes = ["https://www.googleapis.com/auth/spreadsheets"];
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;

  if (json) {
    const credentials = JSON.parse(json);
    return new google.auth.GoogleAuth({ credentials, scopes });
  }

  if (keyFile) {
    return new google.auth.GoogleAuth({ keyFile, scopes });
  }

  throw new Error(
    "Missing Google credentials. Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_PATH.",
  );
};

const parseRowFromRange = (range) => {
  if (!range) return null;
  const match = range.match(/!A(\d+):/);
  return match ? Number(match[1]) : null;
};

const getSheetsClient = () => {
  const auth = getAuth();
  return google.sheets({ version: "v4", auth });
};

const appendRow = async ({ sheetName, values }) => {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error("Missing GOOGLE_SHEET_ID");

  const sheets = getSheetsClient();
  const range = `${sheetName}!A1`;

  const result = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [values] },
  });

  return parseRowFromRange(result.data?.updates?.updatedRange);
};

const updateRow = async ({ sheetName, row, values, lastColumn }) => {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error("Missing GOOGLE_SHEET_ID");
  if (!row) throw new Error("Missing row for Google Sheets update");

  const sheets = getSheetsClient();
  const range = `${sheetName}!A${row}:${lastColumn}${row}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
};

const getById = async ({ sheetName, lastColumn, id }) => {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error("Missing GOOGLE_SHEET_ID");

  const sheets = getSheetsClient();
  const range = `${sheetName}!A2:${lastColumn}`;
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = result.data?.values || [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    if (row[0] === String(id)) {
      return { row: i + 2, data: row };
    }
  }
  return null;
};

exports.appendStudent = async ({
  id,
  name,
  age,
  number,
  email,
  profession,
  experienceLevel,
  goal,
  willingWebinar,
  webinarLink,
  timeDate,
  followups,
}) =>
  appendRow({
    sheetName: "Sheet1",
    values: [
      id,
      name,
      age,
      number,
      email,
      profession,
      experienceLevel,
      goal,
      willingWebinar,
      webinarLink,
      timeDate,
      followups,
    ],
  });

exports.updateStudent = async ({
  row,
  id,
  name,
  age,
  number,
  email,
  profession,
  experienceLevel,
  goal,
  willingWebinar,
  webinarLink,
  timeDate,
  followups,
}) =>
  updateRow({
    sheetName: "Sheet1",
    row,
    lastColumn: "L",
    values: [
      id,
      name,
      age,
      number,
      email,
      profession,
      experienceLevel,
      goal,
      willingWebinar,
      webinarLink,
      timeDate,
      followups,
    ],
  });

exports.getStudentById = async ({ id }) => getById({ sheetName: "Sheet1", lastColumn: "L", id });

exports.appendPatient = async ({
  id,
  name,
  age,
  number,
  email,
  profession,
  diabetic,
  diabetesType,
  diabetesYears,
  onInsulin,
  patientGoal,
  guidance,
  willBook,
  timeDate,
  followups,
  others,
}) =>
  appendRow({
    sheetName: "Sheet2",
    values: [
      id,
      name,
      age,
      number,
      email,
      profession,
      diabetic,
      diabetesType,
      diabetesYears,
      onInsulin,
      patientGoal,
      guidance,
      willBook,
      timeDate,
      followups,
      others,
    ],
  });

exports.updatePatient = async ({
  row,
  id,
  name,
  age,
  number,
  email,
  profession,
  diabetic,
  diabetesType,
  diabetesYears,
  onInsulin,
  patientGoal,
  guidance,
  willBook,
  timeDate,
  followups,
  others,
}) =>
  updateRow({
    sheetName: "Sheet2",
    row,
    lastColumn: "P",
    values: [
      id,
      name,
      age,
      number,
      email,
      profession,
      diabetic,
      diabetesType,
      diabetesYears,
      onInsulin,
      patientGoal,
      guidance,
      willBook,
      timeDate,
      followups,
      others,
    ],
  });

exports.getPatientById = async ({ id }) => getById({ sheetName: "Sheet2", lastColumn: "P", id });
