import express from "express";
import pool from "../config/db.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { encrypt, decrypt } from "../utils/encryption.js";

export default function profileRoutes(upload) {
  const router = express.Router();

  /* Fetch profile */
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

      if (user.profile_image?.trim() && !user.profile_image.startsWith("http")) {
        user.profile_image = `${req.protocol}://${req.get("host")}${user.profile_image.startsWith("/") ? "" : "/"}${user.profile_image}`;
      }

      res.json({ success: true, user });
    } catch (err) {
      console.error("❌ Profile fetch error:", err.message);
      res.status(500).json({ success: false, error: "Server error" });
    }
  });

  /* Upload profile image */
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

  /* Update profile */
  router.put("/:user_id/update", authenticateToken, async (req, res) => {
    const { user_id } = req.params;
    const { first_name, last_name, middle_initial, mobile_number, username } = req.body;

    try {
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
        RETURNING user_id, username, email, first_name, last_name, middle_initial, mobile_number, profile_image
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

  /* Hide user info — UPDATED WITH ENCRYPTION */
  router.put("/:user_id/hide", authenticateToken, async (req, res) => {
    const { user_id } = req.params;
    const { is_hidden } = req.body;

    try {
      const found = await pool.query(
        "SELECT * FROM users WHERE user_id=$1",
        [user_id]
      );

      if (found.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const user = found.rows[0];

      if (is_hidden === true) {
        // Encrypt all sensitive fields
        await pool.query(
          `UPDATE users SET 
            is_hidden=$1,
            first_name=$2,
            last_name=$3,
            mobile_number=$4,
            email=$5
          WHERE user_id=$6`,
          [
            true,
            encrypt(user.first_name),
            encrypt(user.last_name),
            encrypt(user.mobile_number),
            encrypt(user.email),
            user_id,
          ]
        );
      } else {
        // Decrypt all sensitive fields
        await pool.query(
          `UPDATE users SET 
            is_hidden=$1,
            first_name=$2,
            last_name=$3,
            mobile_number=$4,
            email=$5
          WHERE user_id=$6`,
          [
            false,
            decrypt(user.first_name),
            decrypt(user.last_name),
            decrypt(user.mobile_number),
            decrypt(user.email),
            user_id,
          ]
        );
      }

      return res.json({
        success: true,
        message: "Privacy updated",
        is_hidden,
      });

    } catch (err) {
      console.error("❌ Hide user error:", err);
      res.status(500).json({ success: false, message: "Hide failed" });
    }
  });

  return router;
}
