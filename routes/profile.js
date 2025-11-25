import express from "express";
import pool from "../config/db.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { encrypt, decrypt, isEncrypted } from "../utils/encryption.js";

export default function profileRoutes(upload) {
  const router = express.Router();

  /* ================
     FETCH PROFILE
  =================== */
  router.get("/:user_id", authenticateToken, async (req, res) => {
    const { user_id } = req.params;

    try {
      const result = await pool.query(
        `SELECT user_id, username, email, first_name, last_name,
                middle_initial, mobile_number, profile_image, is_hidden
         FROM users WHERE user_id = $1`,
        [user_id]
      );

      if (result.rows.length === 0)
        return res.status(404).json({ success: false, message: "User not found" });

      const user = result.rows[0];

      // Fix image URL
      if (user.profile_image?.trim() && !user.profile_image.startsWith("http")) {
        user.profile_image = `${req.protocol}://${req.get("host")}${
          user.profile_image.startsWith("/") ? "" : "/"
        }${user.profile_image}`;
      }

      res.json({ success: true, user });
    } catch (err) {
      console.error("❌ Profile fetch error:", err.message);
      res.status(500).json({ success: false, error: "Server error" });
    }
  });

  /* ================
     UPLOAD PROFILE IMAGE
  =================== */
  router.post(
    "/:user_id/upload",
    authenticateToken,
    upload.single("profile_image"),
    async (req, res) => {
      const { user_id } = req.params;

      if (!req.file)
        return res.status(400).json({ success: false, message: "No file uploaded" });

      const filePath = `/uploads/${req.file.filename}`;

      try {
        await pool.query(
          "UPDATE users SET profile_image = $1 WHERE user_id = $2",
          [filePath, user_id]
        );

        res.json({ success: true, profile_image: filePath });
      } catch (err) {
        console.error("❌ Upload error:", err.message);
        res.status(500).json({ success: false, error: "Failed to save profile" });
      }
    }
  );

  /* ================
     UPDATE PROFILE
  =================== */
  router.put("/:user_id/update", authenticateToken, async (req, res) => {
    const { user_id } = req.params;
    const { first_name, last_name, middle_initial, mobile_number, username } = req.body;

    try {
      // Check duplicate username
      const existing = await pool.query(
        "SELECT user_id FROM users WHERE username = $1 AND user_id != $2",
        [username, user_id]
      );

      if (existing.rows.length > 0)
        return res.status(400).json({ success: false, message: "Username already taken" });

      const q = `
        UPDATE users
        SET first_name=$1, last_name=$2, middle_initial=$3,
            mobile_number=$4, username=$5
        WHERE user_id=$6
        RETURNING user_id, username, email, first_name, last_name,
                  middle_initial, mobile_number, profile_image
      `;

      const result = await pool.query(q, [
        first_name,
        last_name,
        middle_initial,
        mobile_number,
        username,
        user_id,
      ]);

      const user = result.rows[0];
      res.json({ success: true, user });
    } catch (err) {
      console.error("❌ Profile update error:", err.message);
      res.status(500).json({ success: false, error: "Update failed" });
    }
  });

  /* ==================================================
     UPDATE PRIVACY (HIDE / SHOW USER)
     Mobile route: PUT /profile/:user_id/privacy
  =================================================== */
  router.put("/:user_id/privacy", authenticateToken, async (req, res) => {
    const { user_id } = req.params;
    const { is_private } = req.body;
    const is_hidden = is_private === true;

    try {
      const found = await pool.query(
        "SELECT * FROM users WHERE user_id=$1",
        [user_id]
      );

      if (found.rows.length === 0)
        return res.status(404).json({ success: false, message: "User not found" });

      const user = found.rows[0];

      // Safe encrypt/decrypt helpers
      const safeEncrypt = (val) =>
        val && !isEncrypted(val) ? encrypt(val) : val;

      const safeDecrypt = (val) =>
        val && isEncrypted(val) ? decrypt(val) : val;

      // Prepare DB values
      let dbFirst = user.first_name;
      let dbLast = user.last_name;
      let dbMobile = user.mobile_number;
      let dbEmail = user.email;

      if (is_hidden === true) {
        dbFirst = safeEncrypt(dbFirst);
        dbLast = safeEncrypt(dbLast);
        dbMobile = safeEncrypt(dbMobile);
        dbEmail = safeEncrypt(dbEmail);
      } else {
        dbFirst = safeDecrypt(dbFirst);
        dbLast = safeDecrypt(dbLast);
        dbMobile = safeDecrypt(dbMobile);
        dbEmail = safeDecrypt(dbEmail);
      }

      const result = await pool.query(
        `UPDATE users SET 
            is_hidden=$1,
            first_name=$2,
            last_name=$3,
            mobile_number=$4,
            email=$5
         WHERE user_id=$6
         RETURNING *`,
        [
          is_hidden,
          dbFirst,
          dbLast,
          dbMobile,
          dbEmail,
          user_id,
        ]
      );

      const updatedUserFromDB = result.rows[0];

      // Decrypt for mobile response
      if (updatedUserFromDB.is_hidden) {
        updatedUserFromDB.email = safeDecrypt(updatedUserFromDB.email);
        updatedUserFromDB.first_name = safeDecrypt(updatedUserFromDB.first_name);
        updatedUserFromDB.last_name = safeDecrypt(updatedUserFromDB.last_name);
        updatedUserFromDB.mobile_number = safeDecrypt(updatedUserFromDB.mobile_number);
      }

      // Fix image URL
      if (
        updatedUserFromDB.profile_image?.trim() &&
        !updatedUserFromDB.profile_image.startsWith("http")
      ) {
        updatedUserFromDB.profile_image = `${req.protocol}://${req.get("host")}${
          updatedUserFromDB.profile_image.startsWith("/") ? "" : "/"
        }${updatedUserFromDB.profile_image}`;
      }

      res.json({
        success: true,
        message: "Privacy updated",
        user: updatedUserFromDB,
      });
    } catch (err) {
      console.error("❌ Privacy update error:", err.message);
      res.status(500).json({
        success: false,
        message: "Failed to update privacy",
      });
    }
  });

  return router;
}
