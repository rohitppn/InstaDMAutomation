const express = require("express");
const instagramRoutes = require("./instagramRoutes");

const router = express.Router();

// Mount Instagram webhook routes
router.use("/", instagramRoutes);

module.exports = router;
