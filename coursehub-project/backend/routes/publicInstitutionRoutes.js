const express = require("express");
const { getPublicInstitutionInfo } = require("../config/institutionPublicConfig");

const router = express.Router();

/**
 * GET /api/public/institution
 */
router.get("/institution", (req, res) => {
  return res.status(200).json({ data: getPublicInstitutionInfo() });
});

module.exports = router;
