import pkg from "pg";
const { Pool } = pkg;

/* ==========================================
   🔍 Detect if running on Render
========================================== */
const isRender =
  process.env.RENDER === "true" ||
  (process.env.DATABASE_URL && process.env.DATABASE_URL.includes("render.com"));

/* ==========================================
   🗄 PostgreSQL Pool Configuration
========================================== */
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://aquameter_user:egaiwPMT5bDfW5eyvFhe2j9du7NSfV3j@dpg-d4qfu6chg0os73894hb0-a.singapore-postgres.render.com/aquameter_68ce",

  ssl: isRender
    ? { rejectUnauthorized: false }   // Render production
    : false,                          // Local dev
});

/* ==========================================
   🔌 Test Connection
========================================== */
pool
  .connect()
  .then((client) => {
    console.log("✅ Connected to PostgreSQL");
    client.release();
  })
  .catch((err) => {
    console.error("❌ DB Connection Error:", err.message);
  });

export default pool;
