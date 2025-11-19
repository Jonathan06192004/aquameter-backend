import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
const SECRET_KEY =
  process.env.ENCRYPTION_KEY ||
  "12345678901234567890123456789012";

const IV_LENGTH = 16;

// =========================
// Detect if NEW format
// =========================
export function isEncryptedNew(text) {
  return (
    typeof text === "string" &&
    text.startsWith("enc:") &&
    text.split(":").length === 3
  );
}

// =========================
// Detect OLD format (iv:encrypted)
// =========================
export function isEncryptedOld(text) {
  if (typeof text !== "string") return false;
  const parts = text.split(":");
  return parts.length === 2 && parts[0].length === 32; // iv = 16 bytes hex = 32 chars
}

// =========================
// Is encrypted (any format)
// =========================
export function isEncrypted(text) {
  return isEncryptedNew(text) || isEncryptedOld(text);
}

// =========================
// Encrypt (NEW FORMAT ONLY)
// =========================
export function encrypt(text) {
  if (!text) return text;
  if (isEncrypted(text)) return text;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(SECRET_KEY), iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  return `enc:${iv.toString("hex")}:${encrypted}`;
}

// =========================
// Decrypt (supports old + new)
// =========================
export function decrypt(text) {
  if (!isEncrypted(text)) return text;

  try {
    let ivHex, encryptedText;

    // NEW FORMAT
    if (isEncryptedNew(text)) {
      [, ivHex, encryptedText] = text.split(":");
    }

    // OLD FORMAT (no enc prefix)
    else if (isEncryptedOld(text)) {
      [ivHex, encryptedText] = text.split(":");
    }

    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      Buffer.from(SECRET_KEY),
      iv
    );

    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;

  } catch (err) {
    console.error("❌ Decrypt error:", err.message);
    return text; // fallback so UI doesn't break
  }
}
