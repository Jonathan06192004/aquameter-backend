import express from "express";
import pool from "../config/db.js";
import { encrypt, decrypt, isEncrypted } from "../utils/encryption.js";

const router = express.Router();

/**
 * HELPER: Safely decrypt a value only if encrypted
 */
const safeDecrypt = (value) => {
  try {
    return isEncrypted(value) ? decrypt(value) : value;
  } catch {
    return value; // fallback
  }
};

/**
 * HELPER: Safely encrypt a value only if NOT already encrypted
 */
const safeEncrypt = (value) => {
  try {
    return isEncrypted(value) ? value : encrypt(value);
  } catch {
    return value; // fallback
  }
};

// =========================================
// 🔐 TOGGLE HIDE / SHOW USER DATA
// =========================================
router.put("/:id/hide", async (req, res) => {
  const userId = req.params.id;
  const { is_hidden } = req.body;

  try {
    const result = await pool.query(
      "SELECT first_name, last_name, mobile_number, email, is_hidden FROM users WHERE user_id=$1",
      [userId]
    );

    if (result.rows.length === 0)
      return res.json({ success: false, message: "User not found" });

    const user = result.rows[0];

    // CURRENT VALUES
    const currentFirst = user.first_name;
    const currentLast = user.last_name;
    const currentMobile = user.mobile_number;
    const currentEmail = user.email;

    let updatedFirst = currentFirst;
    let updatedLast = currentLast;
    let updatedMobile = currentMobile;
    let updatedEmail = currentEmail;

    // ==============================
    // 🔐 HIDE (Encrypt)
    // ==============================
    if (is_hidden) {
      updatedFirst = safeEncrypt(currentFirst);
      updatedLast = safeEncrypt(currentLast);
      updatedMobile = safeEncrypt(currentMobile);
      updatedEmail = safeEncrypt(currentEmail);
    }

    // ==============================
    // 🔓 SHOW (Decrypt)
    // ==============================
    else {
      updatedFirst = safeDecrypt(currentFirst);
      updatedLast = safeDecrypt(currentLast);
      updatedMobile = safeDecrypt(currentMobile);
      updatedEmail = safeDecrypt(currentEmail);
    }

    // SAVE CHANGES
    await pool.query(
      `UPDATE users SET
        is_hidden = $1,
        first_name = $2,
        last_name = $3,
        mobile_number = $4,
        email = $5
      WHERE user_id = $6`,
      [
        is_hidden,
        updatedFirst,
        updatedLast,
        updatedMobile,
        updatedEmail,
        userId,
      ]
    );

    return res.json({ success: true, message: "Privacy updated" });
  } catch (error) {
    console.error("Error updating privacy:", error);
    return res.json({ success: false, message: "Server error" });
  }
});

export default router;
