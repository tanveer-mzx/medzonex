require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const admin = require("firebase-admin");

const app = express();

const PORT = process.env.PORT || 5000;

// ======================================================
// CORS
// ======================================================

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests such as Postman/server-to-server
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error("CORS: Origin not allowed")
      );
    },
    credentials: true
  })
);

app.use(express.json());

// ======================================================
// FIREBASE ADMIN
// ======================================================

/*
  OPTION 1:
  Use serviceAccountKey.json

  Put the file in the same folder as server.js.

  IMPORTANT:
  NEVER upload this file to GitHub or frontend.
*/

let firebaseInitialized = false;

try {
  const serviceAccount = require("./serviceAccountKey.json");

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  firebaseInitialized = true;

  console.log("Firebase Admin initialized.");
} catch (error) {
  console.error(
    "Firebase Admin initialization failed:",
    error.message
  );
}

const db = firebaseInitialized
  ? admin.firestore()
  : null;

const firebaseAuth = firebaseInitialized
  ? admin.auth()
  : null;

// ======================================================
// NAMECHEAP SMTP
// ======================================================

const smtpPort = Number(
  process.env.SMTP_PORT || 465
);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: smtpPort,

  // 465 = SSL
  // 587 = STARTTLS
  secure:
    String(process.env.SMTP_SECURE).toLowerCase() ===
    "true",

  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// ======================================================
// SMTP TEST
// ======================================================

async function verifySMTP() {
  try {
    await transporter.verify();

    console.log(
      "Namecheap SMTP connection successful."
    );
  } catch (error) {
    console.error(
      "Namecheap SMTP connection failed:",
      error.message
    );
  }
}

verifySMTP();

// ======================================================
// OTP SETTINGS
// ======================================================

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

const RESEND_COOLDOWN_MS =
  60 * 1000; // 60 seconds

const MAX_ATTEMPTS = 5;

// ======================================================
// OTP HELPERS
// ======================================================

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email
  );
}

function generateOTP() {
  return String(
    crypto.randomInt(100000, 1000000)
  );
}

function hashOTP(otp) {
  return crypto
    .createHash("sha256")
    .update(otp)
    .digest("hex");
}

// ======================================================
// EMAIL TEMPLATE
// ======================================================

function createOTPEmail({
  otp,
  purpose
}) {
  let title =
    "Verify your MedZoneX email";

  let description =
    "Use the verification code below to continue.";

  if (purpose === "password_reset") {
    title =
      "Reset your MedZoneX password";

    description =
      "Use the code below to verify your email and reset your password.";
  }

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">

<title>MedZoneX OTP</title>

<style>

body {
  margin: 0;
  padding: 0;
  background: #0b1020;
  font-family: Arial, sans-serif;
}

.container {
  max-width: 560px;
  margin: 40px auto;
  background: #11182d;
  border-radius: 18px;
  padding: 35px;
  color: white;
}

.logo {
  font-size: 28px;
  font-weight: bold;
  margin-bottom: 25px;
}

h1 {
  font-size: 24px;
}

p {
  color: #c8cee0;
  line-height: 1.6;
}

.otp {
  margin: 30px 0;
  padding: 20px;
  text-align: center;
  background: #080c18;
  border-radius: 12px;
  font-size: 34px;
  font-weight: bold;
  letter-spacing: 8px;
}

.warning {
  font-size: 13px;
  color: #9299ad;
}

.footer {
  margin-top: 30px;
  font-size: 12px;
  color: #737b91;
}

</style>

</head>

<body>

<div class="container">

  <div class="logo">
    MedZoneX
  </div>

  <h1>
    ${title}
  </h1>

  <p>
    ${description}
  </p>

  <div class="otp">
    ${otp}
  </div>

  <p>
    This OTP is valid for 5 minutes.
  </p>

  <p class="warning">
    Never share this OTP with anyone.
    MedZoneX will never ask you to share your verification code.
  </p>

  <div class="footer">
    © ${new Date().getFullYear()} MedZoneX
  </div>

</div>

</body>
</html>
`;
}

// ======================================================
// SEND OTP
// ======================================================

app.post(
  "/api/auth/send-email-otp",
  async (req, res) => {

    try {

      const email = normalizeEmail(
        req.body.email
      );

      const purpose =
        req.body.purpose ===
        "password_reset"
          ? "password_reset"
          : "signup";

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Email is required."
        });
      }

      if (!isValidEmail(email)) {
        return res.status(400).json({
          success: false,
          message: "Enter a valid email address."
        });
      }

      if (!db) {
        return res.status(500).json({
          success: false,
          message:
            "Firebase Admin is not configured."
        });
      }

      const otpRef = db
        .collection("emailOtps")
        .doc(
          `${purpose}_${email}`
        );

      const existing =
        await otpRef.get();

      if (existing.exists) {

        const data =
          existing.data();

        const lastSentAt =
          data.lastSentAt?.toMillis?.() || 0;

        if (
          Date.now() - lastSentAt <
          RESEND_COOLDOWN_MS
        ) {

          const remaining = Math.ceil(
            (
              RESEND_COOLDOWN_MS -
              (Date.now() - lastSentAt)
            ) / 1000
          );

          return res.status(429).json({
            success: false,
            message:
              `Please wait ${remaining} seconds before requesting another OTP.`
          });
        }
      }

      const otp =
        generateOTP();

      const otpHash =
        hashOTP(otp);

      const expiresAt =
        admin.firestore.Timestamp.fromMillis(
          Date.now() +
            OTP_EXPIRY_MS
        );

      await otpRef.set({

        email,

        purpose,

        otpHash,

        expiresAt,

        lastSentAt:
          admin.firestore.FieldValue.serverTimestamp(),

        attempts: 0,

        verified: false,

        createdAt:
          admin.firestore.FieldValue.serverTimestamp()

      });

      await transporter.sendMail({

        from:
          `"MedZoneX" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,

        to: email,

        subject:
          purpose === "password_reset"
            ? "MedZoneX Password Reset OTP"
            : "MedZoneX Email Verification OTP",

        html:
          createOTPEmail({
            otp,
            purpose
          })

      });

      return res.json({

        success: true,

        message:
          "OTP sent successfully."

      });

    } catch (error) {

      console.error(
        "SEND OTP ERROR:",
        error
      );

      return res.status(500).json({

        success: false,

        message:
          "Unable to send OTP right now."

      });
    }
  }
);

// ======================================================
// VERIFY OTP
// ======================================================

app.post(
  "/api/auth/verify-email-otp",
  async (req, res) => {

    try {

      const email =
        normalizeEmail(
          req.body.email
        );

      const otp =
        String(
          req.body.otp || ""
        ).trim();

      const purpose =
        req.body.purpose ===
        "password_reset"
          ? "password_reset"
          : "signup";

      if (!email || !otp) {

        return res.status(400).json({

          success: false,

          message:
            "Email and OTP are required."

        });
      }

      const otpRef =
        db
          .collection("emailOtps")
          .doc(
            `${purpose}_${email}`
          );

      const snapshot =
        await otpRef.get();

      if (!snapshot.exists) {

        return res.status(400).json({

          success: false,

          message:
            "OTP not found. Please request a new OTP."

        });
      }

      const data =
        snapshot.data();

      // Expired
      const expiresAt =
        data.expiresAt?.toMillis?.() || 0;

      if (
        Date.now() >
        expiresAt
      ) {

        await otpRef.delete();

        return res.status(400).json({

          success: false,

          message:
            "OTP has expired. Please request a new OTP."

        });
      }

      const attempts =
        Number(
          data.attempts || 0
        );

      if (
        attempts >=
        MAX_ATTEMPTS
      ) {

        await otpRef.delete();

        return res.status(429).json({

          success: false,

          message:
            "Too many incorrect attempts. Please request a new OTP."

        });
      }

      const submittedHash =
        hashOTP(otp);

      if (
        submittedHash !==
        data.otpHash
      ) {

        await otpRef.update({

          attempts:
            attempts + 1

        });

        return res.status(400).json({

          success: false,

          message:
            "Invalid OTP."

        });
      }

      await otpRef.update({

        verified: true,

        verifiedAt:
          admin.firestore.FieldValue.serverTimestamp()

      });

      return res.json({

        success: true,

        verified: true,

        message:
          "Email verified successfully."

      });

    } catch (error) {

      console.error(
        "VERIFY OTP ERROR:",
        error
      );

      return res.status(500).json({

        success: false,

        message:
          "Unable to verify OTP."

      });
    }
  }
);

// ======================================================
// PASSWORD RESET
// ======================================================

app.post(
  "/api/auth/reset-password",
  async (req, res) => {

    try {

      const email =
        normalizeEmail(
          req.body.email
        );

      const newPassword =
        String(
          req.body.newPassword || ""
        );

      if (!email || !newPassword) {

        return res.status(400).json({

          success: false,

          message:
            "Email and new password are required."

        });
      }

      if (
        newPassword.length < 8
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Password must contain at least 8 characters."

        });
      }

      if (!db || !firebaseAuth) {

        return res.status(500).json({

          success: false,

          message:
            "Firebase Admin is not configured."

        });
      }

      const otpRef =
        db
          .collection("emailOtps")
          .doc(
            `password_reset_${email}`
          );

      const snapshot =
        await otpRef.get();

      if (!snapshot.exists) {

        return res.status(400).json({

          success: false,

          message:
            "Email verification required."

        });
      }

      const data =
        snapshot.data();

      if (
        data.verified !== true
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Please verify the OTP first."

        });
      }

      // Make sure verification isn't ancient
      const verifiedAt =
        data.verifiedAt?.toMillis?.() || 0;

      if (
        Date.now() - verifiedAt >
        10 * 60 * 1000
      ) {

        await otpRef.delete();

        return res.status(400).json({

          success: false,

          message:
            "Verification expired. Please verify again."

        });
      }

      let userRecord;

      try {

        userRecord =
          await firebaseAuth
            .getUserByEmail(email);

      } catch (error) {

        if (
          error.code ===
          "auth/user-not-found"
        ) {

          return res.status(404).json({

            success: false,

            message:
              "No MedZoneX account exists with this email."

          });
        }

        throw error;
      }

      await firebaseAuth.updateUser(
        userRecord.uid,
        {
          password:
            newPassword
        }
      );

      await otpRef.delete();

      return res.json({

        success: true,

        message:
          "Password reset successfully."

      });

    } catch (error) {

      console.error(
        "RESET PASSWORD ERROR:",
        error
      );

      return res.status(500).json({

        success: false,

        message:
          "Unable to reset password."

      });
    }
  }
);

// ======================================================
// HEALTH CHECK
// ======================================================

app.get(
  "/api/health",
  (req, res) => {

    res.json({

      success: true,

      service:
        "MedZoneX Backend",

      status:
        "running"

    });
  }
);

// ======================================================
// 404
// ======================================================

app.use(
  (req, res) => {

    res.status(404).json({

      success: false,

      message:
        "API endpoint not found."

    });

  }
);

// ======================================================
// ERROR HANDLER
// ======================================================

app.use(
  (error, req, res, next) => {

    console.error(
      "SERVER ERROR:",
      error
    );

    res.status(500).json({

      success: false,

      message:
        "Internal server error."

    });

  }
);

// ======================================================
// START SERVER
// ======================================================

const PORT = process.env.PORT || 5000;

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `MedZoneX backend running on port ${PORT}`
    );

  }
);