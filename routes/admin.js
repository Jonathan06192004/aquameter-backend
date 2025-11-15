import express from "express";
import pool from "../index.js";

const router = express.Router();

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
            "SELECT user_id, username, email, first_name, last_name FROM users ORDER BY user_id"
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
        const result = await pool.query("SELECT * FROM smart_device ORDER BY device_id");
        res.json({ success: true, devices: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   ✏️ UPDATE A SINGLE USER
===================================================== */
router.put("/users/:id", async (req, res) => {
    const { id } = req.params;
    const { username, email, first_name, last_name } = req.body;

    try {
        const result = await pool.query(
            `UPDATE users SET 
                username = $1,
                email = $2,
                first_name = $3,
                last_name = $4
             WHERE user_id = $5
             RETURNING *`,
            [username, email, first_name, last_name, id]
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
   🔥 NEW: BATCH UPDATE USERS
   PUT /admin/users/update-batch
===================================================== */
router.put("/users/update-batch", async (req, res) => {
    const { updates } = req.body;

    if (!updates || typeof updates !== "object") {
        return res.status(400).json({ success: false, message: "No updates provided." });
    }

    try {
        for (const userId in updates) {
            const fields = updates[userId];

            const { username, email, first_name, last_name } = fields;

            await pool.query(
                `UPDATE users SET
                    username = COALESCE($1, username),
                    email = COALESCE($2, email),
                    first_name = COALESCE($3, first_name),
                    last_name = COALESCE($4, last_name)
                 WHERE user_id = $5`,
                [username, email, first_name, last_name, userId]
            );
        }

        res.json({ success: true, message: "Batch update successful!" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   🔥 NEW: ADD USER
   POST /admin/users/add
===================================================== */
router.post("/users/add", async (req, res) => {
    const { username, email, first_name, last_name } = req.body;

    if (!username || !email || !first_name || !last_name) {
        return res.status(400).json({
            success: false,
            message: "All fields are required."
        });
    }

    try {
        const result = await pool.query(
            `INSERT INTO users (username, email, first_name, last_name, password)
             VALUES ($1, $2, $3, $4, 'defaultpass')
             RETURNING user_id`,
            [username, email, first_name, last_name]
        );

        res.json({
            success: true,
            message: "User added successfully",
            user_id: result.rows[0].user_id
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
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
