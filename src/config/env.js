require("dotenv").config();

module.exports = {
  PORT: process.env.PORT || 3000,
  INSTAGRAM_VERIFY_TOKEN: process.env.INSTAGRAM_VERIFY_TOKEN,
  INSTAGRAM_ACCESS_TOKEN: process.env.INSTAGRAM_ACCESS_TOKEN,
  MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
  GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID,
  CALENDLY_LINK: process.env.CALENDLY_LINK,
};
