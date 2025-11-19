import express from "express";
import pool from "../config/db.js";
import { encrypt, decrypt } from "../utils/encryption.js";

const router = express.Router();

// 🔐 TOGGLE HIDE / SHOW USER DATA
router.put("/:id/hide", async (req, res) => {
  const userId = req.params.id;
  const { is_hidden } = req.body;

  try {
    const result = await pool.query("SELECT * FROM users WHERE user_id=$1", [userId]);
    if (result.rows.length === 0)
      return res.json({ success: false, message: "User not found" });

    const user = result.rows[0];

    if (is_hidden) {
      // 🔐 ENCRYPT FIELDS
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
          userId,
        ]
      );
    } else {
      // 🔓 DECRYPT FIELDS
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
          userId,
        ]
      );
    }

    return res.json({ success: true, message: "Privacy updated" });

  } catch (error) {
    console.error("Error updating privacy:", error);
    res.json({ success: false, message: "Server error" });
  }
});

export default router;
