import express from "express";
import pool from "../index.js";
import bcrypt from "bcrypt";

const router = express.Router();
const saltRounds = 10;

/* =====================================================
   Helpers: masking
===================================================== */
function maskEmail(email) {
    if (!email || !email.includes("@")) return "Hidden by user";
    const [local, domain] = email.split("@");
    const first = local ? local[0] : "";
    return `${first}*******@${domain}`;
}

function maskRow(user) {
    // returns a shallow copy with masked fields if user.is_hidden === true
    if (!user.is_hidden) return user;

    return {
        ...user,
        username: "Hidden by user",
        email: maskEmail(user.email),
        first_name: "Hidden by user",
        last_name: "Hidden by user",
        mobile_number: "Hidden by user",
        // keep other fields like user_id, middle_initial as-is
    };
}

/* =====================================================
   📌 TOTAL COUNTS (INCLUDES HIDDEN USERS)
===================================================== */
router.get("/users/count", async (req, res) => {
    try {
        const result = await pool.query("SELECT COUNT(*) FROM users");
        res.json({ total_users: result.rows[0].count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get("/devices/count", async (req, res) => {
    try {
        const result = await pool.query("SELECT COUNT(*) FROM smart_device");
        res.json({ total_devices: result.rows[0].count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   📌 USERS LIST (RETURN ALL, MASK SENSITIVE FIELDS WHEN is_hidden = TRUE)
===================================================== */
router.get("/users", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                user_id, username, email, first_name, last_name, 
                middle_initial, mobile_number, is_hidden
             FROM users
             ORDER BY user_id`
        );

        const masked = result.rows.map(r => maskRow(r));
        res.json({ success: true, users: masked });
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
   ✏️ UPDATE USER
   (keeps existing behavior — admin can update fields)
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
             RETURNING user_id, username, email, first_name, last_name, middle_initial, mobile_number, is_hidden`,
            [username, email, first_name, last_name, middle_initial, mobile_number, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Mask if updated user is_hidden
        const user = maskRow(result.rows[0]);

        res.json({ success: true, user });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   ✏️ UPDATE DEVICE
===================================================== */
router.put("/devices/:id", async (req, res) => {
    const { id } = req.params;
    const { user_id, device_serial, location, device_status } = req.body;

    try {
        const result = await pool.query(
            `UPDATE smart_device SET
                user_id = COALESCE($1, user_id),
                device_serial = COALESCE($2, device_serial),
                location = COALESCE($3, location),
                device_status = COALESCE($4, device_status)
             WHERE device_id = $5
             RETURNING *`,
            [user_id, device_serial, location, device_status, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "Device not found" });
        }

        res.json({ success: true, device: result.rows[0] });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   ➕ ADD USER
===================================================== */
router.post("/users", async (req, res) => {
    const {
        username, password, email, first_name,
        last_name, middle_initial, mobile_number
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
            [username, hashedPassword, email, first_name, last_name, middle_initial || null, mobile_number]
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
   ❌ DELETE DEVICE
===================================================== */
router.delete("/devices/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query("DELETE FROM smart_device WHERE device_id = $1", [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "Device not found" });
        }

        res.json({ success: true, message: "Device deleted successfully" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   ⭐ ADD DEVICE
===================================================== */
router.post("/devices", async (req, res) => {
    const { user_id, device_serial, location } = req.body;

    if (!device_serial || !location) {
        return res.status(400).json({
            success: false,
            message: "Device Serial and Location are required."
        });
    }

    try {
        const result = await pool.query(
            `INSERT INTO smart_device 
                (user_id, device_serial, location, installed_at, device_status)
             VALUES ($1, $2, $3, NOW(), 'Active')
             RETURNING *`,
            [user_id || null, device_serial, location]
        );

        res.json({
            success: true,
            message: "Device added successfully",
            device: result.rows[0]
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/* =====================================================
   🔄 TOGGLE HIDE FLAG (accepts { is_hidden: true|false } in body)
   Route kept as /users/:id/hide (no route name change)
===================================================== */
router.put("/users/:id/hide", async (req, res) => {
    const { id } = req.params;
    // allow client to pass { is_hidden: true|false }, default true
    const is_hidden = typeof req.body.is_hidden !== "undefined" ? req.body.is_hidden : true;

    try {
        const result = await pool.query(
            `UPDATE users SET is_hidden = $1 WHERE user_id = $2 RETURNING user_id, is_hidden`,
            [is_hidden, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        res.json({ success: true, message: "User privacy flag updated", user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =====================================================
   🔓 UNHIDE USER (kept for convenience — still available)
===================================================== */
router.put("/users/:id/unhide", async (req, res) => {
    try {
        const result = await pool.query(
            `UPDATE users SET is_hidden = FALSE WHERE user_id = $1 RETURNING *`,
            [req.params.id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Mask in response if somehow still hidden (should not be)
        const user = maskRow(result.rows[0]);

        res.json({ success: true, message: "User is now visible", user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
