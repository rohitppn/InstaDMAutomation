const express = require("express");
const cors = require("cors");

const instagramRoutes = require("./routes/instagramRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🔥 IMPORTANT: Bypass ngrok browser warning (required for Meta webhooks)
app.use((req, res, next) => {
  res.setHeader("ngrok-skip-browser-warning", "true");
  next();
});

// 🔥 Mount Instagram routes
app.use("/", instagramRoutes);

// Health check
app.get("/", (req, res) => {
  res.send("Instagram AI Agent is running ✅");
});

module.exports = app;
