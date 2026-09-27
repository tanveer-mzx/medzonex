// ======================================================
// MEDZONEX BACKEND
// ======================================================

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const admin = require("firebase-admin");


// ======================================================
// APP
// ======================================================

const app =
    express();


// ======================================================
// PORT
// ======================================================

const PORT =
    Number(
        process.env.PORT || 5000
    );


// ======================================================
// BASIC CONFIG
// ======================================================

app.disable("x-powered-by");

app.use(
    express.json({
        limit: "1mb"
    })
);


// ======================================================
// CORS
// ======================================================

const defaultAllowedOrigins = [
    "https://medzonex.site",
    "https://www.medzonex.site",
    "http://localhost",
    "http://127.0.0.1"
];


const allowedOrigins = [
    ...new Set([
        ...defaultAllowedOrigins,

        ...(process.env.ALLOWED_ORIGINS || "")
            .split(",")
            .map(
                (origin) =>
                    origin.trim()
            )
            .filter(Boolean)
    ])
];


app.use(
    cors({

        origin:
            function (
                origin,
                callback
            ) {

                // Server-to-server / Postman
                if (!origin) {

                    return callback(
                        null,
                        true
                    );

                }


                if (
                    allowedOrigins.includes(
                        origin
                    )
                ) {

                    return callback(
                        null,
                        true
                    );

                }


                console.warn(
                    "CORS blocked:",
                    origin
                );


                return callback(
                    new Error(
                        "CORS: Origin not allowed"
                    )
                );

            },

        credentials: true

    })
);


// ======================================================
// FIREBASE ADMIN
// ======================================================

let firebaseInitialized =
    false;


// ------------------------------------------------------
// Method 1: FIREBASE_SERVICE_ACCOUNT_JSON
// ------------------------------------------------------

try {

    if (
        process.env
            .FIREBASE_SERVICE_ACCOUNT_JSON
    ) {

        const serviceAccount =
            JSON.parse(
                process.env
                    .FIREBASE_SERVICE_ACCOUNT_JSON
            );


        admin.initializeApp({

            credential:
                admin.credential.cert(
                    serviceAccount
                )

        });


        firebaseInitialized =
            true;


        console.log(
            "Firebase Admin initialized using FIREBASE_SERVICE_ACCOUNT_JSON."
        );

    }

} catch (error) {

    console.error(
        "Firebase JSON initialization failed:",
        error.message
    );

}


// ------------------------------------------------------
// Method 2: individual environment variables
// ------------------------------------------------------

if (
    !firebaseInitialized &&
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
) {

    try {

        const privateKey =
            process.env.FIREBASE_PRIVATE_KEY
                .replace(
                    /\\n/g,
                    "\n"
                );


        admin.initializeApp({

            credential:
                admin.credential.cert({

                    projectId:
                        process.env
                            .FIREBASE_PROJECT_ID,

                    clientEmail:
                        process.env
                            .FIREBASE_CLIENT_EMAIL,

                    privateKey

                })

        });


        firebaseInitialized =
            true;


        console.log(
            "Firebase Admin initialized using environment variables."
        );

    } catch (error) {

        console.error(
            "Firebase environment initialization failed:",
            error.message
        );

    }

}


// ------------------------------------------------------
// Method 3: local serviceAccountKey.json
// ------------------------------------------------------

if (
    !firebaseInitialized
) {

    try {

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


        firebaseInitialized =
            true;


        console.log(
            "Firebase Admin initialized using serviceAccountKey.json."
        );

    } catch (error) {

        console.error(
            "Firebase Admin initialization failed."
        );

        console.error(
            "Use FIREBASE_SERVICE_ACCOUNT_JSON, Firebase environment variables, or serviceAccountKey.json."
        );

    }

}


const db =
    firebaseInitialized
        ? admin.firestore()
        : null;


const firebaseAuth =
    firebaseInitialized
        ? admin.auth()
        : null;


// ======================================================
// SMTP CONFIGURATION
// ======================================================

/*
    Namecheap Private Email:

    SMTP Host:
        mail.privateemail.com

    Port:
        465 = SSL
        587 = STARTTLS

    Recommended:
        465
        secure=true
*/


const smtpHost =
    process.env.SMTP_HOST ||
    "mail.privateemail.com";


const smtpPort =
    Number(
        process.env.SMTP_PORT || 465
    );


let smtpSecure;


if (
    typeof process.env.SMTP_SECURE !==
    "undefined"
) {

    smtpSecure =
        String(
            process.env.SMTP_SECURE
        ).toLowerCase() ===
        "true";

} else {

    smtpSecure =
        smtpPort === 465;

}


const smtpUser =
    process.env.SMTP_USER;


const smtpPass =
    process.env.SMTP_PASS;


const smtpFrom =
    process.env.SMTP_FROM ||
    smtpUser;


if (
    !smtpUser ||
    !smtpPass
) {

    console.error(
        "SMTP configuration is missing."
    );

    console.error(
        "Required: SMTP_USER and SMTP_PASS."
    );

}


const transporter =
    nodemailer.createTransport({

        host:
            smtpHost,

        port:
            smtpPort,

        secure:
            smtpSecure,

        auth: {

            user:
                smtpUser,

            pass:
                smtpPass

        },

        connectionTimeout:
            15000,

        greetingTimeout:
            15000,

        socketTimeout:
            20000

    });


// ======================================================
// SMTP VERIFY
// ======================================================

async function verifySMTP() {

    if (
        !smtpUser ||
        !smtpPass
    ) {

        console.error(
            "SMTP verification skipped because credentials are missing."
        );

        return;

    }


    try {

        await transporter.verify();


        console.log(
            "Namecheap SMTP connection successful."
        );


        console.log(
            `SMTP: ${smtpHost}:${smtpPort} secure=${smtpSecure}`
        );


    } catch (error) {

        console.error(
            "Namecheap SMTP connection failed:"
        );


        console.error(
            error.message
        );


        console.error(
            `SMTP settings: host=${smtpHost}, port=${smtpPort}, secure=${smtpSecure}, user=${smtpUser}`
        );

    }

}


verifySMTP();


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

    return String(
        email || ""
    )
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
// OTP EMAIL
// ======================================================

function createOTPEmail({
    otp,
    purpose
}) {

    const isPasswordReset =
        purpose ===
        "password_reset";


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
    content="width=device-width, initial-scale=1.0"
>

<title>MedZoneX OTP</title>

</head>


<body
style="
margin:0;
padding:0;
background:#070b14;
font-family:Arial,Helvetica,sans-serif;
"
>


<div
style="
max-width:560px;
margin:40px auto;
padding:35px;
background:#111827;
border-radius:20px;
color:#ffffff;
"
>


<div
style="
font-size:28px;
font-weight:700;
margin-bottom:25px;
"
>
MedZoneX
</div>


<h1
style="
font-size:24px;
margin-bottom:15px;
"
>
${title}
</h1>


<p
style="
color:#cbd5e1;
line-height:1.6;
"
>
${description}
</p>


<div
style="
margin:30px 0;
padding:22px;
text-align:center;
background:#050814;
border-radius:14px;
font-size:36px;
font-weight:700;
letter-spacing:9px;
"
>
${otp}
</div>


<p
style="
color:#cbd5e1;
line-height:1.6;
"
>
This OTP is valid for 5 minutes.
</p>


<p
style="
font-size:13px;
color:#94a3b8;
line-height:1.6;
"
>
Never share this OTP with anyone.
MedZoneX will never ask you to share your verification code.
</p>


<div
style="
margin-top:30px;
font-size:12px;
color:#64748b;
"
>
© ${new Date().getFullYear()} MedZoneX
</div>


</div>

</body>

</html>
`;

}


// ======================================================
// HEALTH CHECK
// ======================================================

app.get(
    "/api/health",
    (req, res) => {

        res.json({

            success:
                true,

            service:
                "MedZoneX Backend",

            status:
                "running",

            firebase:
                firebaseInitialized,

            smtp:
                Boolean(
                    smtpUser &&
                    smtpPass
                )

        });

    }
);


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


            // ------------------------------------------
            // Validation
            // ------------------------------------------

            if (!email) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Email is required."

                });

            }


            if (!isValidEmail(email)) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Enter a valid email address."

                });

            }


            // ------------------------------------------
            // Firebase required
            // ------------------------------------------

            if (!db) {

                return res.status(500).json({

                    success:
                        false,

                    message:
                        "Firebase Admin is not configured on the server."

                });

            }


            // ------------------------------------------
            // SMTP required
            // ------------------------------------------

            if (
                !smtpUser ||
                !smtpPass
            ) {

                return res.status(500).json({

                    success:
                        false,

                    message:
                        "SMTP is not configured on the server."

                });

            }


            // ------------------------------------------
            // OTP document
            // ------------------------------------------

            const otpRef =
                db
                    .collection(
                        "emailOtps"
                    )
                    .doc(
                        `${purpose}_${email}`
                    );


            const existing =
                await otpRef.get();


            if (
                existing.exists
            ) {

                const data =
                    existing.data();


                const lastSentAt =
                    data.lastSentAt
                        ?.toMillis?.() ||
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

                        success:
                            false,

                        message:
                            `Please wait ${remaining} seconds before requesting another OTP.`

                    });

                }

            }


            // ------------------------------------------
            // Generate OTP
            // ------------------------------------------

            const otp =
                generateOTP();


            const otpHash =
                hashOTP(
                    otp
                );


            const expiresAt =
                admin.firestore.Timestamp
                    .fromMillis(
                        Date.now() +
                        OTP_EXPIRY_MS
                    );


            // ------------------------------------------
            // Store OTP
            // ------------------------------------------

            await otpRef.set({

                email,

                purpose,

                otpHash,

                expiresAt,

                lastSentAt:
                    admin.firestore.FieldValue
                        .serverTimestamp(),

                attempts:
                    0,

                verified:
                    false,

                createdAt:
                    admin.firestore.FieldValue
                        .serverTimestamp()

            });


            // ------------------------------------------
            // Send email
            // ------------------------------------------

            const info =
                await transporter.sendMail({

                    from:
                        `"MedZoneX" <${smtpFrom}>`,

                    to:
                        email,

                    subject:
                        purpose ===
                        "password_reset"
                            ? "MedZoneX Password Reset OTP"
                            : "MedZoneX Email Verification OTP",

                    html:
                        createOTPEmail({
                            otp,
                            purpose
                        })

                });


            console.log(
                "OTP email sent:",
                {
                    email,
                    purpose,
                    messageId:
                        info.messageId
                }
            );


            return res.json({

                success:
                    true,

                message:
                    "OTP sent successfully."

            });


        } catch (error) {

            console.error(
                "SEND OTP ERROR:"
            );


            console.error(
                error
            );


            return res.status(500).json({

                success:
                    false,

                message:
                    "Unable to send OTP right now. Please try again."

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


            if (
                !email ||
                !otp
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Email and OTP are required."

                });

            }


            if (!validOtp(otp)) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "OTP must contain 6 digits."

                });

            }


            if (!db) {

                return res.status(500).json({

                    success:
                        false,

                    message:
                        "Firebase Admin is not configured."

                });

            }


            const otpRef =
                db
                    .collection(
                        "emailOtps"
                    )
                    .doc(
                        `${purpose}_${email}`
                    );


            const snapshot =
                await otpRef.get();


            if (!snapshot.exists) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "OTP not found. Please request a new OTP."

                });

            }


            const data =
                snapshot.data();


            // ------------------------------------------
            // Expiry
            // ------------------------------------------

            const expiresAt =
                data.expiresAt
                    ?.toMillis?.() ||
                0;


            if (
                Date.now() >
                expiresAt
            ) {

                await otpRef.delete();


                return res.status(400).json({

                    success:
                        false,

                    message:
                        "OTP has expired. Please request a new OTP."

                });

            }


            // ------------------------------------------
            // Attempts
            // ------------------------------------------

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

                    success:
                        false,

                    message:
                        "Too many incorrect attempts. Please request a new OTP."

                });

            }


            // ------------------------------------------
            // Compare hash
            // ------------------------------------------

            const submittedHash =
                hashOTP(
                    otp
                );


            if (
                submittedHash !==
                data.otpHash
            ) {

                await otpRef.update({

                    attempts:
                        attempts + 1

                });


                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Invalid OTP."

                });

            }


            // ------------------------------------------
            // Verified
            // ------------------------------------------

            await otpRef.update({

                verified:
                    true,

                verifiedAt:
                    admin.firestore
                        .FieldValue
                        .serverTimestamp()

            });


            return res.json({

                success:
                    true,

                verified:
                    true,

                message:
                    "Email verified successfully."

            });


        } catch (error) {

            console.error(
                "VERIFY OTP ERROR:"
            );


            console.error(
                error
            );


            return res.status(500).json({

                success:
                    false,

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


            if (!email) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Email is required."

                });

            }


            if (
                newPassword.length <
                8
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Password must contain at least 8 characters."

                });

            }


            if (
                !db ||
                !firebaseAuth
            ) {

                return res.status(500).json({

                    success:
                        false,

                    message:
                        "Firebase Admin is not configured."

                });

            }


            const otpRef =
                db
                    .collection(
                        "emailOtps"
                    )
                    .doc(
                        `password_reset_${email}`
                    );


            const snapshot =
                await otpRef.get();


            if (!snapshot.exists) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Email verification required."

                });

            }


            const data =
                snapshot.data();


            if (
                data.verified !==
                true
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Please verify the OTP first."

                });

            }


            // ------------------------------------------
            // Verification lifetime
            // ------------------------------------------

            const verifiedAt =
                data.verifiedAt
                    ?.toMillis?.() ||
                0;


            if (
                Date.now() -
                verifiedAt >
                10 * 60 * 1000
            ) {

                await otpRef.delete();


                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Verification expired. Please verify again."

                });

            }


            // ------------------------------------------
            // Find Firebase user
            // ------------------------------------------

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

                        success:
                            false,

                        message:
                            "No MedZoneX account exists with this email."

                    });

                }


                throw error;

            }


            // ------------------------------------------
            // Update password
            // ------------------------------------------

            await firebaseAuth
                .updateUser(
                    userRecord.uid,
                    {
                        password:
                            newPassword
                    }
                );


            // ------------------------------------------
            // Delete used OTP
            // ------------------------------------------

            await otpRef.delete();


            return res.json({

                success:
                    true,

                message:
                    "Password reset successfully."

            });


        } catch (error) {

            console.error(
                "RESET PASSWORD ERROR:"
            );


            console.error(
                error
            );


            return res.status(500).json({

                success:
                    false,

                message:
                    "Unable to reset password."

            });

        }

    }
);


// ======================================================
// 404
// ======================================================

app.use(
    (req, res) => {

        res.status(404).json({

            success:
                false,

            message:
                "API endpoint not found."

        });

    }
);


// ======================================================
// GLOBAL ERROR HANDLER
// ======================================================

app.use(
    (
        error,
        req,
        res,
        next
    ) => {

        console.error(
            "GLOBAL SERVER ERROR:",
            error
        );


        if (
            !res.headersSent
        ) {

            res.status(500).json({

                success:
                    false,

                message:
                    "Internal server error."

            });

        }

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
            "========================================"
        );

        console.log(
            "MedZoneX Backend"
        );

        console.log(
            `Running on port ${PORT}`
        );

        console.log(
            `Firebase Admin: ${firebaseInitialized ? "READY" : "NOT CONFIGURED"}`
        );

        console.log(
            `SMTP: ${smtpUser && smtpPass ? "CONFIGURED" : "NOT CONFIGURED"}`
        );

        console.log(
            "========================================"
        );

    }
);