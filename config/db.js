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
    "postgresql://aquameter_user:J2cpNXQznZllOKRSvXv5GGtxQYuzgA3z@dpg-d44qseuuk2gs73fl9e8g-a.singapore-postgres.render.com/aquameter_3fag",

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
