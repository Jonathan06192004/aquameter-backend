import express from "express";
import pool from "../index.js";
import bcrypt from "bcrypt";

const router = express.Router();
const saltRounds = 10;

/* =====================================================
   📌 TOTAL COUNTS
===================================================== */

// Total users
router.get("/users/count", async (req, res) => {
    try {
        const result = await pool.query("SELECT COUNT(*) FROM users");
        res.json({ total_users: result.rows[0].count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Total devices
router.get("/devices/count", async (req, res) => {
    try {
        const result = await pool.query("SELECT COUNT(*) FROM smart_device");
        res.json({ total_devices: result.rows[0].count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   📌 USERS LIST
===================================================== */
router.get("/users", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                user_id, username, email, first_name, last_name, 
                middle_initial, mobile_number
             FROM users
             ORDER BY user_id`
        );

        res.json({ success: true, users: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   📌 DEVICES LIST
===================================================== */
router.get("/devices", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM smart_device ORDER BY device_id"
        );
        res.json({ success: true, devices: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   ✏️ UPDATE SINGLE USER
===================================================== */
router.put("/users/:id", async (req, res) => {
    const { id } = req.params;
    const { username, email, first_name, last_name, middle_initial, mobile_number } = req.body;

    try {
        const result = await pool.query(
            `UPDATE users SET 
                username = $1,
                email = $2,
                first_name = $3,
                last_name = $4,
                middle_initial = $5,
                mobile_number = $6
             WHERE user_id = $7
             RETURNING *`,
            [username, email, first_name, last_name, middle_initial, mobile_number, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        res.json({ success: true, user: result.rows[0] });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   🔥 BATCH UPDATE USERS (Save All)
===================================================== */
router.put("/users/update-batch", async (req, res) => {
    const { updates } = req.body;

    if (!updates || Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, message: "No updates provided." });
    }

    try {
        const queries = [];

        for (const userId in updates) {
            const fields = updates[userId];

            const {
                username,
                email,
                first_name,
                last_name,
                middle_initial,
                mobile_number
            } = fields;

            const query = pool.query(
                `UPDATE users SET
                    username = COALESCE($1, username),
                    email = COALESCE($2, email),
                    first_name = COALESCE($3, first_name),
                    last_name = COALESCE($4, last_name),
                    middle_initial = COALESCE($5, middle_initial),
                    mobile_number = COALESCE($6, mobile_number)
                 WHERE user_id = $7`,
                [
                    username,
                    email,
                    first_name,
                    last_name,
                    middle_initial,
                    mobile_number,
                    userId
                ]
            );

            queries.push(query);
        }

        await Promise.all(queries);

        res.json({ success: true, message: "Batch update successful!" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   ➕ ADD USER (WITH HASHED PASSWORD)
===================================================== */
router.post("/users", async (req, res) => {
    const {
        username,
        password,
        email,
        first_name,
        last_name,
        middle_initial,
        mobile_number
    } = req.body;

    if (!username || !password || !email || !first_name || !last_name || !mobile_number) {
        return res.status(400).json({
            success: false,
            message: "Please fill in all required fields."
        });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const result = await pool.query(
            `INSERT INTO users 
            (username, password, email, first_name, last_name, middle_initial, mobile_number)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING user_id, username, email, first_name, last_name, middle_initial, mobile_number`,
            [
                username,
                hashedPassword,
                email,
                first_name,
                last_name,
                middle_initial || null,
                mobile_number
            ]
        );

        res.json({
            success: true,
            message: "User added successfully",
            user: result.rows[0]
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/* =====================================================
   ❌ DELETE USER
===================================================== */
router.delete("/users/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query("DELETE FROM users WHERE user_id = $1", [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        res.json({ success: true, message: "User deleted successfully" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   🚀 EXPORT ROUTER
===================================================== */
export default router;
