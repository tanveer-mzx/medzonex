require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const admin = require("firebase-admin");

// ======================================================
// APP
// ======================================================

const app = express();

const PORT =
    Number(process.env.PORT) || 5000;

// ======================================================
// BODY
// ======================================================

app.use(
    express.json({
        limit: "1mb"
    })
);

// ======================================================
// CORS
// ======================================================

const defaultOrigins = [
    "https://medzonex.site",
    "https://www.medzonex.site",
    "http://localhost",
    "http://localhost:3000",
    "http://localhost:5500",
    "http://127.0.0.1:5500"
];

const environmentOrigins =
    String(process.env.ALLOWED_ORIGINS || "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);

const allowedOrigins = [
    ...new Set([
        ...defaultOrigins,
        ...environmentOrigins
    ])
];

const allowedOrigins = [
  "https://medzonex.site",
  "https://www.medzonex.site",
  "http://localhost:3000",
  "http://localhost:5000",
  "http://localhost:5500",
  "http://localhost:63342",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5000",
  "http://127.0.0.1:5500",
  "http://127.0.0.1:63342"
];

const extraOrigins = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

const allAllowedOrigins = [
  ...new Set([...allowedOrigins, ...extraOrigins])
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests without an Origin header
      // such as some server-to-server requests.
      if (!origin) {
        return callback(null, true);
      }

      // Exact allowed origins
      if (allAllowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Allow localhost / 127.0.0.1 on any port during development
      try {
        const url = new URL(origin);

        if (
          (url.protocol === "http:" || url.protocol === "https:") &&
          (url.hostname === "localhost" ||
            url.hostname === "127.0.0.1")
        ) {
          return callback(null, true);
        }
      } catch (error) {
        // Invalid origin
      }

      return callback(
        new Error(`CORS blocked origin: ${origin}`)
      );
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  })
);

// ======================================================
// FIREBASE ADMIN
// ======================================================

let firebaseInitialized = false;
let db = null;
let firebaseAuth = null;

function initializeFirebase() {

    try {

        // ==================================================
        // PRIORITY 1
        // Render environment variables
        // ==================================================

        const projectId =
            process.env.FIREBASE_PROJECT_ID;

        const clientEmail =
            process.env.FIREBASE_CLIENT_EMAIL;

        let privateKey =
            process.env.FIREBASE_PRIVATE_KEY;

        if (
            projectId &&
            clientEmail &&
            privateKey
        ) {

            console.log(
                "Firebase: using Render environment variables"
            );

            privateKey =
                privateKey.replace(
                    /\\n/g,
                    "\n"
                );

            admin.initializeApp({
                credential:
                    admin.credential.cert({
                        projectId,
                        clientEmail,
                        privateKey
                    })
            });
        }

        // ==================================================
        // PRIORITY 2
        // Complete service account JSON
        // ==================================================

        else if (
            process.env.FIREBASE_SERVICE_ACCOUNT_JSON
        ) {

            console.log(
                "Firebase: using FIREBASE_SERVICE_ACCOUNT_JSON"
            );

            const serviceAccount =
                JSON.parse(
                    process.env.FIREBASE_SERVICE_ACCOUNT_JSON
                );

            if (
                serviceAccount.private_key
            ) {

                serviceAccount.private_key =
                    serviceAccount.private_key.replace(
                        /\\n/g,
                        "\n"
                    );
            }

            admin.initializeApp({
                credential:
                    admin.credential.cert(
                        serviceAccount
                    )
            });
        }

        // ==================================================
        // PRIORITY 3
        // Local development
        // ==================================================

        else {

            console.log(
                "Firebase: trying local serviceAccountKey.json"
            );

            const serviceAccount =
                require(
                    "./serviceAccountKey.json"
                );

            admin.initializeApp({
                credential:
                    admin.credential.cert(
                        serviceAccount
                    )
            });
        }

        db =
            admin.firestore();

        firebaseAuth =
            admin.auth();

        firebaseInitialized =
            true;

        console.log(
            "Firebase Admin initialized successfully."
        );

    } catch (error) {

        firebaseInitialized = false;

        db = null;

        firebaseAuth = null;

        console.error(
            "Firebase Admin initialization FAILED:"
        );

        console.error(
            error.message
        );
    }
}

initializeFirebase();

// ======================================================
// RESEND EMAIL API
// ======================================================

const RESEND_API_URL =
    "https://api.resend.com/emails";

const RESEND_API_KEY =
    String(
        process.env.RESEND_API_KEY || ""
    ).trim();

const EMAIL_FROM =
    String(
        process.env.EMAIL_FROM ||
        "MedZoneX <support@medzonex.site>"
    ).trim();

let resendVerified = false;

// ======================================================
// RESEND CONFIGURATION CHECK
// ======================================================

function initializeResend() {

    if (!RESEND_API_KEY) {

        console.error(
            "Resend configuration missing: RESEND_API_KEY"
        );

        resendVerified = false;

        return;
    }

    if (!EMAIL_FROM) {

        console.error(
            "Resend configuration missing: EMAIL_FROM"
        );

        resendVerified = false;

        return;
    }

    resendVerified = true;

    console.log(
        "Resend email API configured successfully."
    );

    console.log(
        "Email sender:",
        EMAIL_FROM
    );
}

initializeResend();

// ======================================================
// SEND EMAIL THROUGH RESEND
// ======================================================

async function sendEmail({
    to,
    subject,
    html
}) {

    if (!RESEND_API_KEY) {

        throw new Error(
            "RESEND_API_KEY is not configured."
        );
    }

    const response =
        await fetch(
            RESEND_API_URL,
            {
                method: "POST",

                headers: {
                    "Authorization":
                        `Bearer ${RESEND_API_KEY}`,

                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify({

                        from:
                            EMAIL_FROM,

                        to: [
                            to
                        ],

                        subject,

                        html
                    })
            }
        );

    let responseData = null;

    try {

        responseData =
            await response.json();

    } catch {

        responseData = null;
    }

    if (!response.ok) {

        const providerMessage =
            responseData?.message ||
            responseData?.error ||
            `HTTP ${response.status}`;

        throw new Error(
            `Resend API error: ${providerMessage}`
        );
    }

    return responseData;
}

// ======================================================
// OTP SETTINGS
// ======================================================

const OTP_EXPIRY_MS =
    5 * 60 * 1000;

const RESEND_COOLDOWN_MS =
    60 * 1000;

const MAX_ATTEMPTS =
    5;

// ======================================================
// EMAIL HELPERS
// ======================================================

function normalizeEmail(email) {

    return String(email || "")
        .trim()
        .toLowerCase();
}

function isValidEmail(email) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        .test(email);
}

function generateOTP() {

    return String(
        crypto.randomInt(
            100000,
            1000000
        )
    );
}

function hashOTP(otp) {

    return crypto
        .createHash("sha256")
        .update(otp)
        .digest("hex");
}

// ======================================================
// OTP EMAIL HTML
// ======================================================

function createOTPEmail({
    otp,
    purpose
}) {

    const isPasswordReset =
        purpose === "password_reset";

    const title =
        isPasswordReset
            ? "Reset your MedZoneX password"
            : "Verify your MedZoneX email";

    const description =
        isPasswordReset
            ? "Use the verification code below to reset your MedZoneX password."
            : "Use the verification code below to verify your MedZoneX email address.";

    return `
<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width,initial-scale=1.0"
>

<title>MedZoneX OTP</title>

</head>

<body style="
margin:0;
padding:0;
background:#070b16;
font-family:Arial,sans-serif;
">

<div style="
max-width:560px;
margin:40px auto;
padding:35px;
background:#11182d;
border-radius:20px;
color:#ffffff;
">

<div style="
font-size:30px;
font-weight:700;
margin-bottom:25px;
">
MedZoneX
</div>

<h1 style="
font-size:24px;
margin-bottom:15px;
">
${title}
</h1>

<p style="
color:#c8cee0;
line-height:1.6;
">
${description}
</p>

<div style="
margin:30px 0;
padding:22px;
text-align:center;
background:#080c18;
border-radius:14px;
font-size:34px;
font-weight:700;
letter-spacing:8px;
">
${otp}
</div>

<p style="
color:#c8cee0;
line-height:1.6;
">
This OTP is valid for 5 minutes.
</p>

<p style="
font-size:13px;
color:#9299ad;
line-height:1.6;
">
Never share this OTP with anyone.
MedZoneX will never ask you to share your verification code.
</p>

<div style="
margin-top:30px;
font-size:12px;
color:#737b91;
">
© ${new Date().getFullYear()} MedZoneX
</div>

</div>

</body>

</html>
`;
}

// ======================================================
// SEND EMAIL OTP
// ======================================================

app.post(
    "/api/auth/send-email-otp",
    async (req, res) => {

        try {

            const email =
                normalizeEmail(
                    req.body.email
                );

            const purpose =
                req.body.purpose ===
                "password_reset"
                    ? "password_reset"
                    : "signup";

            // ----------------------------------------------
            // Validate email
            // ----------------------------------------------

            if (!email) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Email is required."

                });
            }

            if (!isValidEmail(email)) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Enter a valid email address."

                });
            }

            // ----------------------------------------------
            // Firebase check
            // ----------------------------------------------

            if (
                !firebaseInitialized ||
                !db
            ) {

                return res.status(503).json({

                    success: false,

                    message:
                        "Firebase service is not configured on the server."

                });
            }

            // ----------------------------------------------
            // Resend check
            // ----------------------------------------------

            if (!resendVerified) {

                return res.status(503).json({

                    success: false,

                    message:
                        "Email service is currently unavailable. Please try again shortly."

                });
            }

            // ----------------------------------------------
            // OTP document
            // ----------------------------------------------

            const otpRef =
                db
                    .collection("emailOtps")
                    .doc(
                        `${purpose}_${email}`
                    );

            const existing =
                await otpRef.get();

            // ----------------------------------------------
            // 60-second resend cooldown
            // ----------------------------------------------

            if (existing.exists) {

                const data =
                    existing.data();

                const lastSentAt =
                    data.lastSentAt?.toMillis?.() ||
                    0;

                const elapsed =
                    Date.now() -
                    lastSentAt;

                if (
                    elapsed <
                    RESEND_COOLDOWN_MS
                ) {

                    const remaining =
                        Math.ceil(
                            (
                                RESEND_COOLDOWN_MS -
                                elapsed
                            ) / 1000
                        );

                    return res.status(429).json({

                        success: false,

                        message:
                            `Please wait ${remaining} seconds before requesting another OTP.`

                    });
                }
            }

            // ----------------------------------------------
            // Generate OTP
            // ----------------------------------------------

            const otp =
                generateOTP();

            const otpHash =
                hashOTP(otp);

            const expiresAt =
                admin.firestore.Timestamp.fromMillis(
                    Date.now() +
                    OTP_EXPIRY_MS
                );

            // ----------------------------------------------
            // Subject
            // ----------------------------------------------

            const subject =
                purpose ===
                "password_reset"
                    ? "MedZoneX Password Reset OTP"
                    : "MedZoneX Email Verification OTP";

            // ----------------------------------------------
            // SEND OTP USING RESEND
            // ----------------------------------------------

            const emailResult =
                await sendEmail({

                    to: email,

                    subject,

                    html:
                        createOTPEmail({

                            otp,

                            purpose

                        })

                });

            // ----------------------------------------------
            // Save OTP AFTER successful Resend request
            // ----------------------------------------------

            await otpRef.set({

                email,

                purpose,

                otpHash,

                expiresAt,

                lastSentAt:
                    admin.firestore.FieldValue
                        .serverTimestamp(),

                attempts: 0,

                verified: false,

                createdAt:
                    admin.firestore.FieldValue
                        .serverTimestamp(),

                resendEmailId:
                    emailResult?.id ||
                    null

            });

            console.log(
                `OTP email sent successfully to ${email}`
            );

            return res.json({

                success: true,

                message:
                    "OTP sent successfully."

            });

        } catch (error) {

            console.error(
                "SEND OTP ERROR:",
                error.message
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
// VERIFY EMAIL OTP
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

            // ----------------------------------------------
            // Validate
            // ----------------------------------------------

            if (
                !email ||
                !otp
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Email and OTP are required."

                });
            }

            if (!db) {

                return res.status(503).json({

                    success: false,

                    message:
                        "Firebase service is unavailable."

                });
            }

            // ----------------------------------------------
            // Find OTP
            // ----------------------------------------------

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

            // ----------------------------------------------
            // Expiry
            // ----------------------------------------------

            const expiresAt =
                data.expiresAt?.toMillis?.() ||
                0;

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

            // ----------------------------------------------
            // Attempts
            // ----------------------------------------------

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

            // ----------------------------------------------
            // Compare OTP hash
            // ----------------------------------------------

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

            // ----------------------------------------------
            // OTP verified
            // ----------------------------------------------

            await otpRef.update({

                verified: true,

                verifiedAt:
                    admin.firestore.FieldValue
                        .serverTimestamp()

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
                error.message
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
// RESET PASSWORD
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

            // ----------------------------------------------
            // Validate
            // ----------------------------------------------

            if (
                !email ||
                !newPassword
            ) {

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

            // ----------------------------------------------
            // Firebase check
            // ----------------------------------------------

            if (
                !db ||
                !firebaseAuth
            ) {

                return res.status(503).json({

                    success: false,

                    message:
                        "Firebase service is unavailable."

                });
            }

            // ----------------------------------------------
            // Get password-reset OTP
            // ----------------------------------------------

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

            // ----------------------------------------------
            // OTP must be verified
            // ----------------------------------------------

            if (
                data.verified !== true
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please verify the OTP first."

                });
            }

            // ----------------------------------------------
            // Verification expiry
            // ----------------------------------------------

            const verifiedAt =
                data.verifiedAt?.toMillis?.() ||
                0;

            if (
                Date.now() -
                verifiedAt >
                10 * 60 * 1000
            ) {

                await otpRef.delete();

                return res.status(400).json({

                    success: false,

                    message:
                        "Verification expired. Please verify again."

                });
            }

            // ----------------------------------------------
            // Find Firebase user
            // ----------------------------------------------

            let userRecord;

            try {

                userRecord =
                    await firebaseAuth
                        .getUserByEmail(
                            email
                        );

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

            // ----------------------------------------------
            // Update password
            // ----------------------------------------------

            await firebaseAuth.updateUser(
                userRecord.uid,
                {
                    password:
                        newPassword
                }
            );

            // ----------------------------------------------
            // Delete used OTP
            // ----------------------------------------------

            await otpRef.delete();

            return res.json({

                success: true,

                message:
                    "Password reset successfully."

            });

        } catch (error) {

            console.error(
                "RESET PASSWORD ERROR:",
                error.message
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
                "running",

            firebase:
                firebaseInitialized,

            resend:
                resendVerified,

            timestamp:
                new Date().toISOString()

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
    (
        error,
        req,
        res,
        next
    ) => {

        console.error(
            "SERVER ERROR:",
            error.message
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

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `MedZoneX backend running on port ${PORT}`
        );

        console.log(
            "Firebase status:",
            firebaseInitialized
        );

        console.log(
            "Resend status:",
            resendVerified
        );
    }
);