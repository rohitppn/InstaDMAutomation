const express = require("express");
const router = express.Router();
const instagramController = require("../controllers/instagramController");

router.get("/instagram", instagramController.verifyWebhook);
router.post("/instagram", instagramController.handleMessage);

module.exports = router;
