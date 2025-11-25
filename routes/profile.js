import express from "express";
import pool from "../config/db.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { encrypt, decrypt, isEncrypted } from "../utils/encryption.js";

export default function profileRoutes(upload) {
const router = express.Router();

/* ================
 FETCH PROFILE - 🔄 MODIFIED to include water_rate
=================== */
router.get("/:user_id", authenticateToken, async (req, res) => {
 const { user_id } = req.params;

 try {
 const result = await pool.query(
  `SELECT user_id, username, email, first_name, last_name,
    middle_initial, mobile_number, profile_image, is_hidden, water_rate
  FROM users WHERE user_id = $1`,
  [user_id]
 );

 if (result.rows.length === 0)
  return res.status(404).json({ success: false, message: "User not found" });

 const user = result.rows[0];

 // --- 🔑 New Decryption Logic for GET request ---
 // This ensures the client always receives plaintext, regardless of the 'is_hidden' status.
 if (user.is_hidden) {
  user.email = decrypt(user.email);
  user.first_name = decrypt(user.first_name);
  user.last_name = decrypt(user.last_name);
  user.mobile_number = decrypt(user.mobile_number);
 }
 // --- End Decryption Logic ---

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
 UPLOAD PROFILE IMAGE (No changes needed)
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
 UPDATE PROFILE (No changes needed)
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
    middle_initial, mobile_number, profile_image, water_rate
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
 // Note: If is_hidden is true, these values might be encrypted in DB,
 // but since the client isn't explicitly requesting a 'privacy' update here,
 // we assume they sent plaintext for these fields, so no decryption needed *here*.
 // The GET /:user_id will handle decryption if needed on a fresh fetch.
 res.json({ success: true, user });
 } catch (err) {
 console.error("❌ Profile update error:", err.message);
 res.status(500).json({ success: false, error: "Update failed" });
 }
});

/* ==================================================
UPDATE PRIVACY (HIDE / SHOW USER) (No changes needed)
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

 const safeEncrypt = (val) =>
 val && !isEncrypted(val) ? encrypt(val) : val;

 const safeDecrypt = (val) =>
 val && isEncrypted(val) ? decrypt(val) : val;

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

 // Always decrypt for the client response, if the DB record holds encrypted data
 if (updatedUserFromDB.is_hidden) {
 updatedUserFromDB.email = decrypt(updatedUserFromDB.email);
 updatedUserFromDB.first_name = decrypt(updatedUserFromDB.first_name);
 updatedUserFromDB.last_name = decrypt(updatedUserFromDB.last_name);
 updatedUserFromDB.mobile_number = decrypt(updatedUserFromDB.mobile_number);
 }
 
 // Ensure the image URL is correctly formatted for the mobile app
 if (updatedUserFromDB.profile_image?.trim() && !updatedUserFromDB.profile_image.startsWith("http")) {
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

return router;}