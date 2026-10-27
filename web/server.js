require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const admin = require("firebase-admin");
const OpenAI = require("openai");
const multer = require("multer");
const path = require("path");
const PDFDocument = require("pdfkit");

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024
    }
});

// ======================================================
// RAZORPAY CONFIGURATION
// ======================================================

const Razorpay = require("razorpay");

const RAZORPAY_KEY_ID =
    String(process.env.RAZORPAY_KEY_ID || "").trim();

const RAZORPAY_KEY_SECRET =
    String(process.env.RAZORPAY_KEY_SECRET || "").trim();

const RAZORPAY_WEBHOOK_SECRET =
    String(process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();

const razorpay =
    RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET
        ? new Razorpay({
            key_id: RAZORPAY_KEY_ID,
            key_secret: RAZORPAY_KEY_SECRET
        })
        : null;

// ======================================================
// MEDZONEX SUBSCRIPTION PLANS
// ======================================================

const MEDZONEX_PLANS = {
    monthly: {
        name: "MedZoneX Monthly",
        amount: 449,
        razorpayPlanId: "plan_Tl0KLrhyvsBqQL",
        totalCount: 120
    },

    threeMonth: {
        name: "MedZoneX 3 Months",
        amount: 1200,
        razorpayPlanId: "plan_TlSmuh1Z3mSRw5",
        totalCount: 40
    },

    sixMonth: {
        name: "MedZoneX 6 Months",
        amount: 2274,
        razorpayPlanId: "plan_TmGgFi0atI45r3",
        totalCount: 20
    }
};

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
        limit: "1mb",

        verify: (req, res, buf) => {
            if (
                req.originalUrl.split("?")[0] ===
                "/api/razorpay/webhook"
            ) {
                req.rawBody = Buffer.from(buf);
            }
        }
    })
);

// ======================================================
// WHATSAPP CLOUD API WEBHOOK
// ======================================================

const WHATSAPP_VERIFY_TOKEN =
    String(
        process.env.WHATSAPP_VERIFY_TOKEN || ""
    ).trim();


// ------------------------------------------------------
// META WEBHOOK VERIFICATION
// ------------------------------------------------------

app.get(
    "/api/whatsapp/webhook",
    (req, res) => {

        const mode =
            req.query["hub.mode"];

        const token =
            req.query["hub.verify_token"];

        const challenge =
            req.query["hub.challenge"];


        if (
            mode === "subscribe" &&
            token === WHATSAPP_VERIFY_TOKEN
        ) {

            console.log(
                "WhatsApp webhook verified successfully."
            );

            return res
                .status(200)
                .send(challenge);
        }


        console.error(
            "WhatsApp webhook verification failed."
        );

        return res
            .sendStatus(403);
    }
);


// ------------------------------------------------------
// RECEIVE WHATSAPP WEBHOOK EVENTS
// ------------------------------------------------------

app.post(
    "/api/whatsapp/webhook",
    (req, res) => {

        try {

            console.log(
                "WhatsApp webhook received:"
            );

            console.log(
                JSON.stringify(
                    req.body,
                    null,
                    2
                )
            );


            // Always acknowledge Meta quickly
            return res
                .sendStatus(200);

        } catch (error) {

            console.error(
                "WhatsApp webhook error:",
                error
            );

            return res
                .sendStatus(500);
        }
    }
);

// ======================================================
// CORS
// ======================================================

const defaultOrigins = [
    "https://medzonex.site",
    "https://www.medzonex.site",
    "https://data-2c37b--razorpay-preview-1ukxsgdx.web.app",

    "http://localhost",
    "http://localhost:3000",
    "http://localhost:5000",
    "http://localhost:5500",
    "http://localhost:63342",

    "http://127.0.0.1",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5000",
    "http://127.0.0.1:5500",
    "http://127.0.0.1:63342"
];

const environmentOrigins =
    String(process.env.ALLOWED_ORIGINS || "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);

const allAllowedOrigins = [
    ...new Set([
        ...defaultOrigins,
        ...environmentOrigins
    ])
];

app.use(
    cors({
        origin: function (origin, callback) {

            // Requests without Origin
            if (!origin) {
                return callback(null, true);
            }

            // Exact allowed origins
            if (allAllowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            // Allow localhost / 127.0.0.1 on any port
            try {

                const url = new URL(origin);

                if (
                    (url.protocol === "http:" ||
                        url.protocol === "https:") &&
                    (
                        url.hostname === "localhost" ||
                        url.hostname === "127.0.0.1"
                    )
                ) {
                    return callback(null, true);
                }

            } catch (error) {
                // Ignore invalid origin
            }

            return callback(
                new Error(
                    `CORS blocked origin: ${origin}`
                )
            );
        },

        methods: [
            "GET",
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
            "OPTIONS"
        ],

        allowedHeaders: [
            "Content-Type",
            "Authorization"
        ],

        credentials: true
    })
);

// ======================================================
// FRONTEND
// ======================================================

app.use(
    express.static(
        path.join(__dirname)
    )
);

app.get(
    "/",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "index.html"
            )
        );

    }
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
// Supports normal emails and PDF attachments
// ======================================================

async function sendEmail({
    to,
    subject,
    html,
    attachments = [],
    idempotencyKey = null
}) {
    if (!RESEND_API_KEY) {
        throw new Error(
            "RESEND_API_KEY is not configured."
        );
    }

    const headers = {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
    };

    if (idempotencyKey) {
        headers["Idempotency-Key"] = idempotencyKey;
    }

    const emailPayload = {
        from: EMAIL_FROM,
        to: [to],
        subject,
        html
    };

    if (attachments.length > 0) {
        emailPayload.attachments = attachments;
    }

    const response = await fetch(
        RESEND_API_URL,
        {
            method: "POST",
            headers,
            body: JSON.stringify(emailPayload)
        }
    );

    let responseData = null;

    try {
        responseData = await response.json();
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
// MEDZONEX PDF INVOICE HELPERS
// ======================================================

const INVOICE_EMAIL_JOB_COLLECTION =
    "razorpayInvoiceEmailJobs";

function escapeInvoiceHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[char]));
}

function invoiceDate(value) {
    if (!value) return "Not available";

    let milliseconds = 0;

    if (typeof value.toMillis === "function") {
        milliseconds = value.toMillis();
    } else if (typeof value.seconds === "number") {
        milliseconds = value.seconds * 1000;
    } else if (
        typeof value === "number" ||
        typeof value === "string"
    ) {
        const parsed = new Date(value).getTime();
        milliseconds = Number.isFinite(parsed) ? parsed : 0;
    }

    if (!milliseconds) return "Not available";

    return new Date(milliseconds).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    }) + " IST";
}

function invoiceMoney(amount) {
    return "₹" + Number(amount || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function createInvoicePdf(invoice) {
    return new Promise((resolve, reject) => {
        try {
            const pdf = new PDFDocument({
                size: "A4",
                margin: 48,
                info: {
                    Title: "MedZoneX Subscription Invoice",
                    Author: "MedZoneX"
                }
            });

            const chunks = [];

            pdf.on("data", chunk => chunks.push(chunk));
            pdf.on("error", reject);
            pdf.on("end", () => {
                resolve(Buffer.concat(chunks));
            });

            const logoPath = require("path").join(
                __dirname,
                "assets",
                "medzonex-logo.png"
            );

            if (require("fs").existsSync(logoPath)) {
                pdf.image(logoPath, 48, 40, {
                    fit: [180, 60],
                    align: "left",
                    valign: "center"
                });
            } else {
                pdf.font("Helvetica-Bold")
                    .fontSize(26)
                    .text("MedZoneX", 48, 48);
            }

            pdf.y = 115;

            pdf.moveDown(0.5);

            pdf.fontSize(17)
                .text("SUBSCRIPTION PAYMENT INVOICE");

            pdf.moveDown();

            pdf.font("Helvetica")
                .fontSize(10)
                .text(`Invoice date: ${invoiceDate(invoice.paidAt)}`)
                .text("Payment status: Paid");

            pdf.moveDown();

            pdf.font("Helvetica-Bold")
                .fontSize(12)
                .text("Customer details");

            pdf.moveDown(0.4);

            pdf.font("Helvetica")
                .fontSize(10)
                .text(`Medical store: ${invoice.storeName || "Not provided"}`)
                .text(`Registered email: ${invoice.email || "Not available"}`)
                .text(`Mobile number: ${invoice.phone || "Not available"}`);

            pdf.moveDown();

            pdf.font("Helvetica-Bold")
                .fontSize(12)
                .text("Subscription details");

            pdf.moveDown(0.4);

            pdf.font("Helvetica")
                .fontSize(10)
                .text(`Plan: ${invoice.planName || "MedZoneX Subscription"}`)
                .text(`Payment ID: ${invoice.paymentId || "Not available"}`)
                .text(`Subscription ID: ${invoice.subscriptionId || "Not applicable"}`)
                .text(`Order ID: ${invoice.orderId || "Not applicable"}`)
                .text(`Subscription start: ${invoiceDate(invoice.periodStart)}`)
                .text(`Subscription expiry: ${invoiceDate(invoice.periodEnd)}`);

            pdf.moveDown(1.5);

            pdf.font("Helvetica-Bold")
                .fontSize(12)
                .text(
                    `Total paid: INR ${Number(invoice.amount || 0).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    })}`,
                    {
                        align: "right"
                    }
                );

            pdf.moveDown(2);

            pdf.font("Helvetica")
                .fontSize(11)
                .text("Thank you for subscribing to MedZoneX.");

            pdf.moveDown();

            pdf.text("Regards,");
            pdf.text("Tanveer, CEO of MedZoneX");

            pdf.moveDown(2);

            pdf.fontSize(9)
                .text("For invoice queries, contact:");

            pdf.fillColor("#0568C8")
                .text("support@medzonex.site", {
                    link: "mailto:support@medzonex.site",
                    underline: true
                });

            pdf.fillColor("#000000");

            pdf.end();
        } catch (error) {
            reject(error);
        }
    });
}

// ======================================================
// MEDZONEX INVOICE EMAIL QUEUE WORKER
// ======================================================

async function processInvoiceEmailJob(jobId) {
    const jobRef = db
        .collection(INVOICE_EMAIL_JOB_COLLECTION)
        .doc(jobId);

    // Claim the job safely so multiple workers don't
    // intentionally process the same job at once.
    const claim = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(jobRef);

        if (!snapshot.exists) {
            return null;
        }

        const job = snapshot.data();
        const now = Date.now();

        if (job.status === "sent") {
            return null;
        }

        if (
            job.status === "sending" &&
            job.updatedAt &&
            typeof job.updatedAt.toMillis === "function" &&
            now - job.updatedAt.toMillis() < 5 * 60 * 1000
        ) {
            return null;
        }

        if (!["pending", "retry", "sending"].includes(job.status)) {
            return null;
        }

        // Respect the scheduled retry time.
        if (
            job.status === "retry" &&
            job.nextRetryAt &&
            typeof job.nextRetryAt.toMillis === "function" &&
            job.nextRetryAt.toMillis() > now
        ) {
            return null;
        }

        const attempts = Number(job.attempts || 0);

        if (attempts >= 5) {
            transaction.update(jobRef, {
                status: "failed_permanently",
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return null;
        }

        transaction.update(jobRef, {
            status: "sending",
            attempts: attempts + 1,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return job;
    });

    if (!claim) {
        return;
    }

    try {
        const job = claim;

        // Get customer details from the existing user record.
        let userData = {};

        if (job.uid) {
            const userSnapshot = await db
                .collection("users")
                .doc(job.uid)
                .get();

            if (userSnapshot.exists) {
                userData = userSnapshot.data() || {};
            }
        }

        const email =
            job.email ||
            userData.email ||
            "";

        if (!email) {
            throw new Error(
                "Customer email is missing for invoice email job."
            );
        }

        const storeName =
            job.storeName ||
            userData.storeName ||
            "Not provided";

        const phone =
            job.phone ||
            userData.phone ||
            userData.mobile ||
            "";

        let subject;
        let html;
        let attachments = [];

        if (job.type === "payment_succeeded") {
            subject = "MedZoneX Subscription Payment Confirmation";

            const pdfBuffer = await createInvoicePdf({
                storeName,
                email,
                phone,
                planName: job.planName,
                amount: job.amount,
                paymentId: job.paymentId,
                subscriptionId: job.subscriptionId,
                orderId: job.orderId,
                paidAt: job.paidAt,
                periodStart: job.periodStart,
                periodEnd: job.periodEnd
            });

            attachments = [
                {
                    filename: `MedZoneX-Invoice-${String(
                        job.paymentId || jobId
                    ).replace(/[^a-zA-Z0-9_-]/g, "")}.pdf`,
                    content: pdfBuffer.toString("base64")
                }
            ];

            html = `
                <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222">
                    <h2>Thank you for subscribing to MedZoneX!</h2>

                    <p>Hello ${escapeInvoiceHtml(storeName)},</p>

                    <p>
                        Your subscription payment has been verified successfully.
                    </p>

                    <table style="border-collapse:collapse;width:100%;max-width:550px">
                        <tr>
                            <td style="padding:8px;border:1px solid #ddd">Medical store</td>
                            <td style="padding:8px;border:1px solid #ddd">
                                ${escapeInvoiceHtml(storeName)}
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:8px;border:1px solid #ddd">Plan</td>
                            <td style="padding:8px;border:1px solid #ddd">
                                ${escapeInvoiceHtml(job.planName || "MedZoneX Subscription")}
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:8px;border:1px solid #ddd">Amount paid</td>
                            <td style="padding:8px;border:1px solid #ddd">
                                ${escapeInvoiceHtml(invoiceMoney(job.amount))}
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:8px;border:1px solid #ddd">Payment ID</td>
                            <td style="padding:8px;border:1px solid #ddd">
                                ${escapeInvoiceHtml(job.paymentId || "Not available")}
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:8px;border:1px solid #ddd">Subscription start</td>
                            <td style="padding:8px;border:1px solid #ddd">
                                ${escapeInvoiceHtml(invoiceDate(job.periodStart))}
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:8px;border:1px solid #ddd">Subscription expiry</td>
                            <td style="padding:8px;border:1px solid #ddd">
                                ${escapeInvoiceHtml(invoiceDate(job.periodEnd))}
                            </td>
                        </tr>
                    </table>

                    <p>Your PDF invoice is attached to this email.</p>

                    <p>Thank you for choosing MedZoneX.</p>

                    <p>
                        Regards,<br>
                        Tanveer, CEO of MedZoneX
                    </p>

                    <p>
                        Support:
                        <a href="mailto:support@medzonex.site">
                            support@medzonex.site
                        </a>
                    </p>
                </div>
            `;
        } else if (job.type === "payment_failed") {
            subject = "MedZoneX Subscription Payment Failed";

            html = `
                <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222">
                    <h2>Payment unsuccessful</h2>

                    <p>Hello ${escapeInvoiceHtml(storeName)},</p>

                    <p>
                        We received a payment failure notification for your
                        MedZoneX subscription.
                    </p>

                    <p>
                        <strong>Plan:</strong>
                        ${escapeInvoiceHtml(job.planName || "MedZoneX Subscription")}
                    </p>

                    <p>
                        <strong>Payment ID:</strong>
                        ${escapeInvoiceHtml(job.paymentId || "Not available")}
                    </p>

                    <p>
                        <strong>Amount:</strong>
                        ${escapeInvoiceHtml(invoiceMoney(job.amount))}
                    </p>

                    <p>
                        Please check your payment method and try again
                        from your MedZoneX account if payment is still required.
                    </p>

                    <p>
                        This notification does not, by itself, determine
                        your subscription status.
                    </p>

                    <p>
                        Regards,<br>
                        Tanveer, CEO of MedZoneX
                    </p>

                    <p>MedZoneX Support: support@medzonex.site</p>
                </div>
            `;
        } else {
            throw new Error(
                `Unsupported invoice email job type: ${job.type}`
            );
        }

        const result = await sendEmail({
            to: email,
            subject,
            html,
            attachments,
            idempotencyKey: `medzonex-${job.type}-${job.paymentId || jobId}`
        });

        await jobRef.update({
            status: "sent",
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            resendMessageId: result?.id || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastError: admin.firestore.FieldValue.delete()
        });

        console.log(
            `[INVOICE EMAIL] Job ${jobId} sent successfully.`
        );
    } catch (error) {
        console.error(
            `[INVOICE EMAIL] Job ${jobId} failed:`,
            error.message
        );

        const latestSnapshot = await jobRef.get();
        const latestJob = latestSnapshot.exists
            ? latestSnapshot.data()
            : {};

        const attempts = Number(latestJob.attempts || 1);
        const permanentlyFailed = attempts >= 5;

        // Exponential backoff: 1, 2, 4, 8 minutes.
        const retryDelayMs =
            60 * 1000 * Math.pow(2, Math.max(0, attempts - 1));

        const nextRetryAt = permanentlyFailed
            ? null
            : admin.firestore.Timestamp.fromMillis(
                Date.now() + retryDelayMs
            );

        await jobRef.update({
            status: permanentlyFailed ? "failed_permanently" : "retry",
            nextRetryAt,
            lastError: String(
                error.message || "Email delivery failed"
            ).slice(0, 1000),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }
}


// ======================================================
// PROCESS PENDING INVOICE EMAIL JOBS
// ======================================================

let invoiceEmailWorkerRunning = false;

async function runInvoiceEmailWorker() {
    if (invoiceEmailWorkerRunning) {
        return;
    }

    invoiceEmailWorkerRunning = true;

    try {
        const snapshot = await db
            .collection(INVOICE_EMAIL_JOB_COLLECTION)
            .where("status", "in", ["pending", "retry", "sending"])
            .limit(20)
            .get();

        for (const document of snapshot.docs) {
            try {
                await processInvoiceEmailJob(document.id);
            } catch (error) {
                console.error(
                    `[INVOICE EMAIL] Worker error for ${document.id}:`,
                    error.message
                );
            }
        }
    } catch (error) {
        console.error(
            "[INVOICE EMAIL] Worker query failed:",
            error.message
        );
    } finally {
        invoiceEmailWorkerRunning = false;
    }
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

app.post(
    "/api/inventory/recognize-medicine",
    upload.single("medicineImage"),
    async (req, res) => {

        try {

                    // Verify Firebase user
                    const decodedToken =
                        await authenticateFirebaseRequest(req);

                    // Verify trial or paid subscription
                    const access =
                        await verifySubscriptionAccess(decodedToken.uid);

                    if (!access.active) {
                        return res.status(403).json({
                            success: false,
                            code: "SUBSCRIPTION_REQUIRED",
                            message:
                                "Your free trial has expired. Please subscribe to continue."
                        });
                    }

            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: "Medicine image is required."
                });
            }

            if (!process.env.OPENAI_API_KEY) {
                return res.status(500).json({
                    success: false,
                    message: "OpenAI API key is not configured."
                });
            }

            const base64Image =
                req.file.buffer.toString("base64");

            const mimeType =
                req.file.mimetype || "image/jpeg";

            const response = await openai.responses.create({

                model: "gpt-5.6-luna",

                input: [
                    {
                        role: "user",

                        content: [

                            {
                                type: "input_text",

                                text: `
You are a medicine packaging recognition assistant.

Analyze the uploaded medicine package carefully.

Extract only information that is actually visible or reasonably readable from the package.

Return ONLY valid JSON.
Do not use markdown.
Do not add explanations.

Use exactly this structure:

{
  "name": "",
  "genericName": "",
  "strength": "",
  "manufacturer": "",
  "dosageForm": "",
  "packSize": ""
}

Important:
- Do not invent missing information.
- If a field cannot be determined, return an empty string.
- Do not guess a medicine name from unclear text.
- This is identification assistance only, not medical advice.
`
                            },

                            {
                                type: "input_image",

                                image_url:
                                    `data:${mimeType};base64,${base64Image}`
                            }

                        ]
                    }
                ]
            });

            const output =
                response.output_text?.trim() || "";

            let medicine;

            try {

                medicine = JSON.parse(output);

            } catch (parseError) {

                console.error(
                    "OpenAI returned invalid JSON:",
                    output
                );

                return res.status(502).json({
                    success: false,
                    message:
                        "Medicine information could not be read reliably."
                });
            }

            return res.json({
                success: true,
                medicine: {
                    name: medicine.name || "",
                    genericName: medicine.genericName || "",
                    strength: medicine.strength || "",
                    manufacturer: medicine.manufacturer || "",
                    dosageForm: medicine.dosageForm || "",
                    packSize: medicine.packSize || ""
                }
            });

                } catch (error) {

                    // Firebase authentication errors
                    if (
                        error.statusCode === 401 ||
                        error.statusCode === 503
                    ) {
                        return res.status(error.statusCode).json({
                            success: false,
                            message: error.message
                        });
                    }

                    // OpenAI credits exhausted or quota unavailable
                    if (
                        error.status === 429 &&
                        (
                            error.code === "credit_balance_exhausted" ||
                            error.code === "insufficient_quota" ||
                            error.type === "insufficient_quota"
                        )
                    ) {
                        console.error(
                            "Medicine recognition unavailable: OpenAI API credits exhausted."
                        );

                        return res.status(503).json({
                            success: false,
                            code: "AI_CREDITS_UNAVAILABLE",
                            message:
                                "Medicine recognition is temporarily unavailable. Please try again later."
                        });
                    }

                    console.error(
                        "Medicine recognition error:",
                        error.message || error
                    );

                    return res.status(500).json({
                        success: false,
                        message:
                            "Medicine recognition failed. Please try again later."
                    });
                }
            }
        );


// ======================================================
// RAZORPAY SUBSCRIPTION HELPERS
// ======================================================

const SUBSCRIPTION_COLLECTION = "razorpaySubscriptions";
const PAYMENT_COLLECTION = "razorpayPayments";
const WEBHOOK_EVENT_COLLECTION = "razorpayWebhookEvents";

const PLAN_DURATIONS_MS = {
    monthly: 30 * 24 * 60 * 60 * 1000,
    threeMonth: 90 * 24 * 60 * 60 * 1000,
    sixMonth: 180 * 24 * 60 * 60 * 1000
};

async function authenticateFirebaseRequest(req) {
    if (!firebaseInitialized || !firebaseAuth || !db) {
        const error = new Error(
            "Firebase authentication is unavailable."
        );

        error.statusCode = 503;
        throw error;
    }

    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
        const error = new Error("Authentication required.");
        error.statusCode = 401;
        throw error;
    }

    const idToken = authorization.substring(7).trim();

    if (!idToken) {
        const error = new Error("Authentication token is missing.");
        error.statusCode = 401;
        throw error;
    }

    return firebaseAuth.verifyIdToken(idToken);
}

function requireRazorpay() {
    if (!razorpay || !RAZORPAY_KEY_SECRET) {
        const error = new Error(
            "Razorpay is not configured on the server."
        );

        error.statusCode = 503;
        throw error;
    }
}

function verifyHmacSHA256(
    message,
    suppliedSignature,
    secret
) {
    if (
        typeof message !== "string" &&
        !Buffer.isBuffer(message)
    ) {
        return false;
    }

    if (
        !suppliedSignature ||
        !/^[a-f0-9]{64}$/i.test(suppliedSignature)
    ) {
        return false;
    }

    const expected = crypto
        .createHmac("sha256", secret)
        .update(message)
        .digest();

    const supplied = Buffer.from(
        suppliedSignature,
        "hex"
    );

    return (
        expected.length === supplied.length &&
        crypto.timingSafeEqual(expected, supplied)
    );
}

function getPlan(planKey) {
    const plan = MEDZONEX_PLANS[planKey];

    if (!plan || !plan.razorpayPlanId) {
        const error = new Error(
            "Invalid MedZoneX subscription plan."
        );

        error.statusCode = 400;
        throw error;
    }

    return plan;
}

function getSubscriptionExpiry(planKey, startTime = Date.now()) {
    const duration = PLAN_DURATIONS_MS[planKey];

    if (!duration) {
        throw new Error("Invalid subscription duration.");
    }

    return admin.firestore.Timestamp.fromMillis(
        startTime + duration
    );
}

async function getExistingSubscription(uid) {
    const snapshot = await db
        .collection(SUBSCRIPTION_COLLECTION)
        .where("uid", "==", uid)
        .where("status", "in", ["pending", "active"])
        .limit(1)
        .get();

    if (snapshot.empty) {
        return null;
    }

    return {
        id: snapshot.docs[0].id,
        ...snapshot.docs[0].data()
    };
}

// ======================================================
// RAZORPAY CHECKOUT LOCK — DUPLICATE PREVENTION
// ======================================================

const CHECKOUT_LOCK_COLLECTION = "razorpayCheckoutLocks";

/**
 * Atomically claim a checkout lock for a user.
 * Prevents simultaneous subscription/order creation.
 */
async function claimCheckoutLock(uid, operation, planKey) {
    const lockRef = db
        .collection(CHECKOUT_LOCK_COLLECTION)
        .doc(uid);

    const token = crypto.randomUUID();

    await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(lockRef);

        if (snapshot.exists) {
            const current = snapshot.data() || {};

            const error = new Error(
                current.status === "needs_reconciliation"
                    ? "A previous checkout needs reconciliation. Please contact support before retrying."
                    : "A checkout request is already in progress. Please wait before retrying."
            );

            error.statusCode = 409;
            throw error;
        }

        transaction.create(lockRef, {
            uid,
            operation,
            planKey,
            token,
            status: "creating",
            createdAt:
                admin.firestore.FieldValue.serverTimestamp(),
            updatedAt:
                admin.firestore.FieldValue.serverTimestamp()
        });
    });

    return {
        ref: lockRef,
        token
    };
}

/**
 * Release a checkout lock only when its token matches.
 */
async function releaseCheckoutLock(lock) {
    if (!lock?.ref || !lock?.token) {
        return;
    }

    await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(lock.ref);

        if (
            snapshot.exists &&
            snapshot.data()?.token === lock.token
        ) {
            transaction.delete(lock.ref);
        }
    });
}

/**
 * Preserve the lock when the Razorpay API outcome is uncertain.
 * This avoids blindly creating a duplicate subscription or order.
 */
async function markCheckoutNeedsReconciliation(
    lock,
    resourceId = null,
    reason = "unknown_outcome"
) {
    if (!lock?.ref || !lock?.token) {
        return;
    }

    await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(lock.ref);

        if (
            snapshot.exists &&
            snapshot.data()?.token === lock.token
        ) {
            transaction.update(lock.ref, {
                status: "needs_reconciliation",
                resourceId: resourceId || null,
                reconciliationReason: reason,
                updatedAt:
                    admin.firestore.FieldValue.serverTimestamp()
            });
        }
    });
}

// ======================================================
// VERIFY MEDZONEX SUBSCRIPTION ACCESS
// ======================================================

async function verifySubscriptionAccess(uid) {
    const userDoc = await db
        .collection("users")
        .doc(uid)
        .get();

    if (!userDoc.exists) {
        return {
            active: false,
            status: "locked"
        };
    }

    const userData = userDoc.data() || {};
    const subscription = userData.subscription || {};
    const now = Date.now();

    function toMillis(value) {
        if (!value) return 0;

        if (typeof value.toMillis === "function") {
            return value.toMillis();
        }

        if (typeof value.seconds === "number") {
            return value.seconds * 1000;
        }

        if (
            typeof value === "string" ||
            typeof value === "number"
        ) {
            const parsed = new Date(value).getTime();

            return Number.isFinite(parsed) ? parsed : 0;
        }

        return 0;
    }

    const paidExpiry = toMillis(
        subscription.currentPeriodEnd
    );

    if (
        subscription.status === "active" &&
        paidExpiry > now
    ) {
        return {
            active: true,
            status: "active"
        };
    }

    const trialStart = toMillis(
        userData.trialStartedAt
    );

    const trialExpiry =
        trialStart + 48 * 60 * 60 * 1000;

    if (
        trialStart > 0 &&
        now < trialExpiry
    ) {
        return {
            active: true,
            status: "trial"
        };
    }

    return {
        active: false,
        status: "locked"
    };
}

// ======================================================
// CREATE RAZORPAY RECURRING SUBSCRIPTION
// POST /api/subscription/create
// ======================================================

app.post(
    "/api/subscription/create",
    async (req, res) => {
        let checkoutLock = null;
        let razorpayRequestStarted = false;

        try {
            requireRazorpay();

            const decodedToken =
                await authenticateFirebaseRequest(req);

            const uid = decodedToken.uid;
            const email = decodedToken.email || "";

            // Fetch registered customer details from Firestore
            const userSnapshot = await db
                .collection("users")
                .doc(uid)
                .get();

            const userData = userSnapshot.exists
                ? userSnapshot.data()
                : {};

            const customerPhone = String(
                req.body.customerPhone || ""
            ).trim();

            if (!/^[6-9]\d{9}$/.test(customerPhone)) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Enter a valid 10-digit Indian mobile number."
                });
            }

            const planKey = String(
                req.body.planKey || ""
            ).trim();

            const selectedPlan = getPlan(planKey);

            if (!email) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Your account does not have an email address."
                });
            }

            // Check existing subscription against Razorpay's actual status.
            const existing = await getExistingSubscription(uid);

            if (existing) {
                const existingSubscriptionId =
                    existing.razorpaySubscriptionId ||
                    (String(existing.id || "").startsWith("sub_")
                        ? existing.id
                        : null);

                if (!existingSubscriptionId) {
                    return res.status(409).json({
                        success: false,
                        code: "SUBSCRIPTION_RECONCILIATION_REQUIRED",
                        message:
                            "Your previous subscription needs reconciliation. Please contact support@medzonex.site."
                    });
                }

                let razorpayExisting;

                try {
                    razorpayExisting =
                        await razorpay.subscriptions.fetch(existingSubscriptionId);
                } catch (fetchError) {
                    console.error(
                        "Existing Razorpay subscription lookup failed:",
                        fetchError?.error?.description || fetchError.message
                    );

                    return res.status(503).json({
                        success: false,
                        code: "SUBSCRIPTION_STATUS_UNAVAILABLE",
                        message:
                            "Unable to verify your previous subscription. Please try again shortly."
                    });
                }

                let actualStatus =
                    String(razorpayExisting.status || "").toLowerCase();

                const existingPlanKey =
                    String(existing.planKey || "").trim();

                const existingRazorpayPlanId =
                    String(razorpayExisting.plan_id || "").trim();

                const samePlan =
                    existingPlanKey === planKey &&
                    existingRazorpayPlanId === selectedPlan.razorpayPlanId;

                // Reuse only a created subscription belonging to the selected plan.
                if (actualStatus === "created" && samePlan) {
                    await db
                        .collection(SUBSCRIPTION_COLLECTION)
                        .doc(existing.id)
                        .set({
                            razorpaySubscriptionId: existingSubscriptionId,
                            razorpayStatus: actualStatus,
                            updatedAt:
                                admin.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });

                    return res.json({
                        success: true,
                        reusedExistingSubscription: true,
                        keyId: RAZORPAY_KEY_ID,
                        subscriptionId: existingSubscriptionId,
                        planKey,
                        planName: selectedPlan.name,
                        amount: selectedPlan.amount,
                        currency: "INR"
                    });
                }

                // Only an unauthorised "created" subscription can be
                // automatically replaced with another plan.
                if (actualStatus === "created" && !samePlan) {
                    checkoutLock = await claimCheckoutLock(
                        uid,
                        "recurring_subscription",
                        planKey
                    );

                    try {
                        // Cancellation is an external, potentially uncertain action.
                        razorpayRequestStarted = true;

                        await razorpay.subscriptions.cancel(
                            existingSubscriptionId,
                            false
                        );

                        const verified =
                            await razorpay.subscriptions.fetch(
                                existingSubscriptionId
                            );

                        actualStatus =
                            String(verified.status || "").toLowerCase();

                        if (actualStatus !== "cancelled") {
                            await markCheckoutNeedsReconciliation(
                                checkoutLock,
                                existingSubscriptionId,
                                "old_subscription_cancellation_unconfirmed"
                            );

                            checkoutLock = null;

                            return res.status(409).json({
                                success: false,
                                code: "SUBSCRIPTION_CANCELLATION_UNCONFIRMED",
                                razorpayStatus: actualStatus,
                                message:
                                    "Razorpay has not confirmed cancellation of your previous subscription yet. No new subscription was created. Please retry later or contact support@medzonex.site."
                            });
                        }

                        await db
                            .collection(SUBSCRIPTION_COLLECTION)
                            .doc(existing.id)
                            .set({
                                razorpayStatus: "cancelled",
                                status: "cancelled",
                                planSwitchCancelledAt:
                                    admin.firestore.FieldValue.serverTimestamp(),
                                updatedAt:
                                    admin.firestore.FieldValue.serverTimestamp()
                            }, { merge: true });

                        // The old subscription is now verified as cancelled.
                        // Continue with new-plan creation while holding the lock.
                        razorpayRequestStarted = false;
                    } catch (cancelError) {
                        console.error(
                            "Previous subscription cancellation could not be verified:",
                            cancelError?.error?.description || cancelError.message
                        );

                        await markCheckoutNeedsReconciliation(
                            checkoutLock,
                            existingSubscriptionId,
                            "old_subscription_cancellation_outcome_uncertain"
                        );

                        checkoutLock = null;

                        return res.status(409).json({
                            success: false,
                            code: "SUBSCRIPTION_CANCELLATION_REQUIRES_REVIEW",
                            message:
                                "We could not confirm cancellation of your previous subscription. No new subscription was created. Please contact support@medzonex.site."
                        });
                    }
                } else if (
                    actualStatus === "authenticated" ||
                    actualStatus === "active" ||
                    actualStatus === "pending"
                ) {
                    return res.status(409).json({
                        success: false,
                        code: "SUBSCRIPTION_IN_PROGRESS",
                        razorpayStatus: actualStatus,
                        message:
                            "Your existing subscription is authorised or undergoing payment processing. Please verify its status before switching plans."
                    });
                } else if (actualStatus !== "created") {
                    return res.status(409).json({
                        success: false,
                        code: "SUBSCRIPTION_REQUIRES_REVIEW",
                        razorpayStatus: actualStatus,
                        message:
                            "Your previous subscription needs status reconciliation before another subscription can be created."
                    });
                }
            }

            // Atomically prevent concurrent checkout requests.
            if (!checkoutLock) {
                checkoutLock = await claimCheckoutLock(
                    uid,
                    "recurring_subscription",
                    planKey
                );
            }

            // Once the external request starts, its outcome may be uncertain
            // if a network error occurs. Preserve the lock in that case.
            razorpayRequestStarted = true;

            // total_count is the number of billing cycles.
            // Twelve cycles means the subscription is finite.
            const subscription =
                await razorpay.subscriptions.create({
                    plan_id: selectedPlan.razorpayPlanId,
                    total_count: selectedPlan.totalCount,
                    quantity: 1,
                    customer_notify: true,

                    notes: {
                        uid,
                        planKey,
                        product: "MedZoneX"
                    }
                });

            await db
                .collection(SUBSCRIPTION_COLLECTION)
                .doc(subscription.id)
                .set({
                    uid,
                    email,
                    planKey,
                    planName: selectedPlan.name,
                    amount: selectedPlan.amount,
                    customerPhone,
                    storeName: userData.storeName || "Not provided",

                    razorpaySubscriptionId:
                        subscription.id,

                    razorpayPlanId:
                        selectedPlan.razorpayPlanId,

                    razorpayStatus:
                        subscription.status || "created",

                    status: "pending",

                    currentPeriodEnd: null,

                    createdAt:
                        admin.firestore.FieldValue
                            .serverTimestamp(),

                    updatedAt:
                        admin.firestore.FieldValue
                            .serverTimestamp()
                });

                // Subscription has been saved successfully.
                // The checkout lock can now be released.
                await releaseCheckoutLock(checkoutLock);
                checkoutLock = null;

            return res.json({
                success: true,

                keyId: RAZORPAY_KEY_ID,

                subscriptionId: subscription.id,

                planKey,

                planName: selectedPlan.name,

                amount: selectedPlan.amount,

                currency: "INR",

                shortUrl: subscription.short_url || null
            });


        } catch (error) {

            if (checkoutLock) {
                try {
                    if (razorpayRequestStarted) {
                        await markCheckoutNeedsReconciliation(
                            checkoutLock,
                            null,
                            "subscription_creation_outcome_uncertain"
                        );
                    } else {
                        await releaseCheckoutLock(checkoutLock);
                    }
                } catch (lockError) {
                    console.error(
                        "Subscription checkout lock recovery error:",
                        lockError.message
                    );
                }
            }

            console.error(
                "Razorpay subscription creation error:",
                error
            );

            return res.status(
                error.statusCode || 500
            ).json({
                success: false,
                message:
                    error.statusCode
                        ? error.message
                        : "Unable to create Razorpay subscription."
            });
        }
    }
);

// ======================================================
// CREATE MANUAL PAYMENT ORDER
// POST /api/subscription/manual-order
// ======================================================

app.post(
    "/api/subscription/manual-order",
    async (req, res) => {
        let checkoutLock = null;
        let razorpayRequestStarted = false;

        try {
            requireRazorpay();

            if (!firebaseInitialized || !db) {
                return res.status(503).json({
                    success: false,
                    message: "Database is unavailable."
                });
            }

            const decodedToken =
                await authenticateFirebaseRequest(req);

            const uid = decodedToken.uid;

            const planKey = String(
                req.body?.planKey || ""
            ).trim();

            const selectedPlan = getPlan(planKey);

            if (!selectedPlan) {
                return res.status(400).json({
                    success: false,
                    message: "Please select a valid subscription plan."
                });
            }

            // Read the user's current subscription.
            const userRef = db
                .collection("users")
                .doc(uid);

            const userSnapshot = await userRef.get();

            if (!userSnapshot.exists) {
                return res.status(404).json({
                    success: false,
                    message: "User account was not found."
                });
            }

            const userData = userSnapshot.data() || {};
            const currentSubscription =
                userData.subscription || {};

            const currentExpiry =
                currentSubscription.currentPeriodEnd
                    ?.toMillis?.() || 0;

            const currentStatus =
                String(currentSubscription.status || "")
                    .toLowerCase();

            const currentRecurringId =
                currentSubscription.razorpaySubscriptionId;

            // Do not create a manual order while a recurring
            // subscription is still active or awaiting payment.
            if (
                currentRecurringId &&
                [
                    "created",
                    "authenticated",
                    "pending",
                    "active",
                    "halted",
                    "paused"
                ].includes(currentStatus)
            ) {
                return res.status(409).json({
                    success: false,
                    code: "RECURRING_SUBSCRIPTION_EXISTS",
                    message:
                        "A recurring subscription already exists. Manage that subscription before starting manual payment."
                });
            }

            // Do not start another manual payment while an
            // earlier manual order is still awaiting verification.
            const pendingPayments = await db
                .collection(PAYMENT_COLLECTION)
                .where("uid", "==", uid)
                .where("status", "==", "created")
                .limit(10)
                .get();

            if (!pendingPayments.empty) {
                return res.status(409).json({
                    success: false,
                    code: "PAYMENT_ALREADY_PENDING",
                    message:
                        "A payment is already pending. Complete or resolve it before creating another order."
                });
            }

            // If a manual subscription is currently paid,
            // do not start another manual payment until it expires.
            if (
                !currentRecurringId &&
                currentStatus === "active" &&
                currentExpiry > Date.now()
            ) {
                return res.status(409).json({
                    success: false,
                    code: "SUBSCRIPTION_ALREADY_ACTIVE",
                    message:
                        "Your subscription is already active."
                });
            }

            // Prevent simultaneous manual payment order creation.
            checkoutLock = await claimCheckoutLock(
                uid,
                "manual_payment_order",
                planKey
            );

            razorpayRequestStarted = true;

            const order = await razorpay.orders.create({
                amount: selectedPlan.amount * 100,
                currency: "INR",

                receipt:
                    `mzx_${crypto.randomBytes(8).toString("hex")}`,

                notes: {
                    uid,
                    planKey,
                    product: "MedZoneX",
                    paymentType: "manual_subscription_payment"
                }
            });

            await db
                .collection(PAYMENT_COLLECTION)
                .doc(order.id)
                .set({
                    uid,
                    planKey,
                    planName: selectedPlan.name,
                    amount: selectedPlan.amount * 100,
                    currency: "INR",
                    razorpayOrderId: order.id,
                    status: "created",

                    createdAt:
                        admin.firestore.FieldValue
                            .serverTimestamp()
                });

                // Payment order is saved in Firestore.
                await releaseCheckoutLock(checkoutLock);
                checkoutLock = null;

            return res.json({
                success: true,
                keyId: RAZORPAY_KEY_ID,
                orderId: order.id,
                amount: order.amount,
                currency: order.currency,
                planKey,
                planName: selectedPlan.name
            });

        } catch (error) {

             if (checkoutLock) {
                 try {
                     if (razorpayRequestStarted) {
                         await markCheckoutNeedsReconciliation(
                             checkoutLock,
                             null,
                             "manual_order_creation_outcome_uncertain"
                         );
                     } else {
                         await releaseCheckoutLock(checkoutLock);
                     }
                 } catch (lockError) {
                     console.error(
                         "Manual checkout lock recovery error:",
                         lockError.message
                     );
                 }
             }

            console.error(
                "Manual payment order error:",
                error
            );

            return res.status(
                error.statusCode || 500
            ).json({
                success: false,
                message:
                    error.statusCode
                        ? error.message
                        : "Unable to create payment order."
            });
        }
    }
);

// ======================================================
// VERIFY MANUAL PAYMENT
// POST /api/subscription/verify-manual-payment
// ======================================================

app.post(
    "/api/subscription/verify-manual-payment",
    async (req, res) => {
        try {
            requireRazorpay();

            const decodedToken =
                await authenticateFirebaseRequest(req);

            const uid = decodedToken.uid;

            const orderId = String(
                req.body.razorpay_order_id || ""
            );

            const paymentId = String(
                req.body.razorpay_payment_id || ""
            );

            const signature = String(
                req.body.razorpay_signature || ""
            );

            if (!orderId || !paymentId || !signature) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Razorpay payment verification details are missing."
                });
            }

            const paymentRef = db
                .collection(PAYMENT_COLLECTION)
                .doc(orderId);

            const paymentDoc = await paymentRef.get();

            if (!paymentDoc.exists) {
                return res.status(404).json({
                    success: false,
                    message: "Payment order not found."
                });
            }

            const paymentData = paymentDoc.data();

            if (paymentData.uid !== uid) {
                return res.status(403).json({
                    success: false,
                    message:
                        "This payment order does not belong to your account."
                });
            }

            const validSignature = verifyHmacSHA256(
                `${orderId}|${paymentId}`,
                signature,
                RAZORPAY_KEY_SECRET
            );

            if (!validSignature) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid payment signature."
                });
            }

            // Fetch and validate payment directly from Razorpay.
            const payment =
                await razorpay.payments.fetch(paymentId);

            if (
                payment.order_id !== orderId ||
                payment.status !== "captured" ||
                Number(payment.amount) !== Number(paymentData.amount) ||
                payment.currency !== "INR"
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Payment is not captured or its details do not match."
                });
            }

            // Verify that the payment belongs to a valid MedZoneX plan.
            const verifiedPlan = MEDZONEX_PLANS[paymentData.planKey];

            if (
                !verifiedPlan ||
                Number(payment.amount) !== Number(verifiedPlan.amount) * 100 ||
                paymentData.currency !== "INR" ||
                paymentData.razorpayOrderId !== orderId
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Payment order does not match a valid MedZoneX plan."
                });
            }

            // Return already-processed success only after signature
            // and Razorpay payment details have been verified.
            if (paymentData.status === "paid") {
                if (paymentData.razorpayPaymentId !== paymentId) {
                    return res.status(409).json({
                        success: false,
                        message:
                            "This order was already processed with a different payment."
                    });
                }

                return res.json({
                    success: true,
                    alreadyProcessed: true,
                    message: "Payment was already verified."
                });
            }

            const planKey = paymentData.planKey;

            const userRef = db
                .collection("users")
                .doc(uid);

            const now = Date.now();

            const transactionResult = await db.runTransaction(async (transaction) => {
                const freshPayment =
                    await transaction.get(paymentRef);

                if (!freshPayment.exists) {
                    throw new Error("Payment record disappeared.");
                }

                const freshPaymentData = freshPayment.data();

                // Revalidate ownership and order binding inside the transaction.
                if (
                    freshPaymentData.uid !== uid ||
                    freshPaymentData.razorpayOrderId !== orderId
                ) {
                    throw new Error(
                        "Payment ownership or order mismatch."
                    );
                }

                // Revalidate the plan and amount against the fresh Firestore record.
                const freshPlan =
                    MEDZONEX_PLANS[freshPaymentData.planKey];

                if (
                    !freshPlan ||
                    freshPaymentData.currency !== "INR" ||
                    Number(freshPaymentData.amount) !==
                        Number(freshPlan.amount) * 100 ||
                    freshPaymentData.planKey !== paymentData.planKey
                ) {
                    throw new Error(
                        "Fresh payment record failed plan validation."
                    );
                }

                // Do not process an order already associated with another payment.
                if (freshPaymentData.status === "paid") {
                    if (freshPaymentData.razorpayPaymentId !== paymentId) {
                        throw new Error(
                            "Order was already processed with another payment."
                        );
                    }

                    return {
                        applied: true,
                        alreadyPaid: true
                    };
                }

                // Only a newly created order can grant subscription access.
                if (freshPaymentData.status !== "created") {
                    throw new Error(
                        "This payment order cannot be processed again."
                    );
                }

                const invoiceJobRef = db
                    .collection(INVOICE_EMAIL_JOB_COLLECTION)
                    .doc(`paid_${paymentId}`);

                const invoiceJobSnapshot =
                    await transaction.get(invoiceJobRef);

                const freshUser = await transaction.get(userRef);

                if (!freshUser.exists) {
                    throw new Error("User account was not found.");
                }

                const userData = freshUser.data() || {};

                const currentSubscription =
                    userData.subscription || {};

                const existingExpiry =
                    currentSubscription.currentPeriodEnd
                        ?.toMillis?.() || 0;

                const currentStatus =
                    String(currentSubscription.status || "").toLowerCase();

                const currentRecurringId =
                    currentSubscription.razorpaySubscriptionId || null;

                const nowMs = Date.now();

                if (
                    currentRecurringId &&
                    ["created", "authenticated", "pending", "active", "halted", "paused"]
                        .includes(currentStatus)
                ) {
                    transaction.update(paymentRef, {
                        status: "captured_conflict",
                        razorpayPaymentId: paymentId,
                        conflictReason:
                            "A recurring subscription exists; manual payment needs review.",
                        updatedAt: serverTimestamp()
                    });

                    return {
                        applied: false,
                        conflict: true
                    };
                }

                const paymentCreatedAt =
                    freshPaymentData.createdAt?.toMillis?.() || 0;

                const subscriptionUpdatedAt =
                    currentSubscription.updatedAt?.toMillis?.() || 0;

                if (
                    currentStatus === "active" &&
                    existingExpiry > nowMs &&
                    subscriptionUpdatedAt > paymentCreatedAt
                ) {
                    transaction.update(paymentRef, {
                        status: "captured_conflict",
                        razorpayPaymentId: paymentId,
                        conflictReason:
                            "Subscription is already active; manual payment needs review.",
                        updatedAt: serverTimestamp()
                    });

                    return {
                        applied: false,
                        conflict: true
                    };
                }
                const periodStart =
                    Math.max(now, existingExpiry);

                const expiry =
                    getSubscriptionExpiry(
                        planKey,
                        periodStart
                    );

                transaction.set(
                    userRef,
                    {
                        subscription: {
                            provider: "razorpay",
                            status: "active",
                            planKey,
                            planName: paymentData.planName,

                            currentPeriodStart:
                                admin.firestore.Timestamp
                                    .fromMillis(periodStart),

                            currentPeriodEnd: expiry,

                            lastPaymentId: paymentId,
                            lastOrderId: orderId,

                            updatedAt:
                                admin.firestore.FieldValue
                                    .serverTimestamp()
                        }
                    },
                    { merge: true }
                );

                transaction.update(paymentRef, {
                    status: "paid",
                    razorpayPaymentId: paymentId,

                    paidAt:
                        admin.firestore.FieldValue
                            .serverTimestamp(),

                    updatedAt:
                        admin.firestore.FieldValue
                            .serverTimestamp()
                });

                // Create exactly one invoice email job per payment.
                if (!invoiceJobSnapshot.exists) {
                    const paidAt = admin.firestore.Timestamp.fromMillis(now);

                    transaction.set(invoiceJobRef, {
                        type: "payment_succeeded",
                        uid,
                        email: userData.email || decodedToken.email || "",
                        phone: userData.phone || userData.mobile || "",
                        storeName: userData.storeName || "Not provided",
                        planKey: freshPaymentData.planKey,
                        planName: freshPaymentData.planName || freshPlan.name,
                        amount: Number(freshPlan.amount),
                        paymentId,
                        orderId,
                        subscriptionId: null,
                        paidAt,
                        periodStart: admin.firestore.Timestamp.fromMillis(periodStart),
                        periodEnd: expiry,
                        status: "pending",
                        attempts: 0,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }

            });

            if (transactionResult?.conflict) {
                return res.status(409).json({
                    success: false,
                    conflict: true,
                    paymentRecorded: true,
                    message:
                        "Payment was received, but could not be applied automatically. Please contact support."
                });
            }

            return res.json({
                success: true,
                verified: true,
                message:
                    "Payment verified. Subscription access has been updated."
            });

        } catch (error) {
            console.error(
                "Manual payment verification error:",
                error
            );

            return res.status(
                error.statusCode || 500
            ).json({
                success: false,
                message:
                    error.statusCode
                        ? error.message
                        : "Unable to verify payment."
            });
        }
    }
);

// ======================================================
// GET SUBSCRIPTION STATUS
// GET /api/subscription/status
// ======================================================

app.get(
    "/api/subscription/status",
    async (req, res) => {
        try {
            const decodedToken =
                await authenticateFirebaseRequest(req);

            const uid = decodedToken.uid;

            const userDoc = await db
                .collection("users")
                .doc(uid)
                .get();

            // Missing user document: deny access
            if (!userDoc.exists) {
                return res.json({
                    success: true,
                    active: false,
                    status: "locked",
                    reason: "user_not_found",
                    planKey: null,
                    expiresAt: null
                });
            }

            const userData = userDoc.data() || {};
            const subscription = userData.subscription || {};
            const now = Date.now();

            // Convert Firestore Timestamp or supported date values to milliseconds
            const toMillis = (value) => {
                if (!value) return 0;

                if (typeof value.toMillis === "function") {
                    return value.toMillis();
                }

                if (typeof value.seconds === "number") {
                    return value.seconds * 1000;
                }

                if (typeof value === "string" || typeof value === "number") {
                    const parsed = new Date(value).getTime();
                    return Number.isFinite(parsed) ? parsed : 0;
                }

                return 0;
            };

            // 1. Check paid subscription first
            const paidExpiry =
                toMillis(subscription.currentPeriodEnd);

            const paidStatus =
                subscription.status === "active" &&
                paidExpiry > now;

            if (paidStatus) {
                return res.json({
                    success: true,
                    active: true,
                    status: "active",
                    accessType: "subscription",
                    planKey: subscription.planKey || null,
                    expiresAt: new Date(paidExpiry).toISOString()
                });
            }

            // 2. Check the 48-hour free trial
            const trialStart =
                toMillis(userData.trialStartedAt);

            const trialDurationMs =
                48 * 60 * 60 * 1000;

            const trialExpiry =
                trialStart > 0
                    ? trialStart + trialDurationMs
                    : 0;

            const trialActive =
                trialStart > 0 &&
                now < trialExpiry;

            if (trialActive) {
                return res.json({
                    success: true,
                    active: true,
                    status: "trial",
                    accessType: "trial",
                    planKey: null,
                    expiresAt: new Date(trialExpiry).toISOString()
                });
            }

            // 3. Neither paid access nor trial is valid
            return res.json({
                success: true,
                active: false,
                status: "locked",
                reason: trialStart > 0
                    ? "trial_expired"
                    : "trial_start_missing",
                planKey: subscription.planKey || null,
                expiresAt: null
            });

        } catch (error) {
            console.error(
                "Subscription status error:",
                error
            );

            return res.status(
                error.statusCode || 500
            ).json({
                success: false,
                active: false,
                status: "locked",
                message: error.statusCode
                    ? error.message
                    : "Unable to fetch subscription status."
            });
        }
    }
);

// ======================================================
// RAZORPAY WEBHOOK
// POST /api/razorpay/webhook
// ======================================================

app.post("/api/razorpay/webhook", async (req, res) => {
    let eventRef = null;
    let eventClaimed = false;

    try {
        // 1. Check configuration.
        if (!RAZORPAY_WEBHOOK_SECRET) {
            console.error(
                "Razorpay webhook secret is missing."
            );

            return res.status(500).json({
                success: false,
                message: "Webhook configuration error."
            });
        }

        if (!firebaseInitialized || !db) {
            return res.status(503).json({
                success: false,
                message: "Database is unavailable."
            });
        }

        // 2. Verify exact raw body.
        const signature =
            req.headers["x-razorpay-signature"];

        const rawBody = req.rawBody;

        if (!Buffer.isBuffer(rawBody)) {
            return res.status(400).json({
                success: false,
                message: "Webhook raw body is missing."
            });
        }

        const validSignature = verifyHmacSHA256(
            rawBody,
            signature,
            RAZORPAY_WEBHOOK_SECRET
        );

        if (!validSignature) {
            console.error(
                "Invalid Razorpay webhook signature."
            );

            return res.status(400).json({
                success: false,
                message: "Invalid webhook signature."
            });
        }

        // 3. Validate event.
        const event = req.body;

        const eventId =
            req.headers["x-razorpay-event-id"];

        if (
            !eventId ||
            typeof eventId !== "string" ||
            !event ||
            typeof event.event !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid webhook event."
            });
        }

        const eventType = event.event;

        const subscriptionEntity =
            event.payload?.subscription?.entity || null;

        const paymentEntity =
            event.payload?.payment?.entity || null;

        const subscriptionId =
            subscriptionEntity?.id ||
            paymentEntity?.subscription_id ||
            null;

       // ----------------------------------------------
       // 4. CLAIM OR RECOVER WEBHOOK EVENT
       // ----------------------------------------------

       const claimToken = crypto.randomUUID();

       eventRef = db
           .collection(WEBHOOK_EVENT_COLLECTION)
           .doc(eventId);

       const PROCESSING_TIMEOUT_MS = 2 * 60 * 1000;

       let claimResult = "busy";

       await db.runTransaction(async (transaction) => {
            claimResult = "busy";

           const eventSnapshot = await transaction.get(eventRef);

           // New event: claim it.
           if (!eventSnapshot.exists) {
               transaction.create(eventRef, {
                   eventId,
                   eventType,
                   eventPayload: event,
                   subscriptionId: subscriptionId || null,
                   status: "processing",
                   claimToken,
                   receivedAt:
                       admin.firestore.FieldValue.serverTimestamp(),
                   processingStartedAt:
                       admin.firestore.FieldValue.serverTimestamp(),
                   attemptCount: 1
               });

               claimResult = "claimed";
               return;
           }

           const existingEvent = eventSnapshot.data();

           // Already processed: never process it again.
           if (existingEvent.status === "processed") {
               claimResult = "processed";
               return;
           }

           // Retry unmatched events only when their retry time is due.
           if (existingEvent.status === "unmatched") {
               const nextRetryAt =
                   existingEvent.nextRetryAt?.toMillis?.() || 0;

               const attemptCount =
                   Number(existingEvent.attemptCount || 1);

               const MAX_WEBHOOK_ATTEMPTS = 10;

               if (attemptCount >= MAX_WEBHOOK_ATTEMPTS) {
                   claimResult = "retry_limit_reached";
                   return;
               }

               if (nextRetryAt > Date.now()) {
                   claimResult = "retry_not_due";
                   return;
               }

               transaction.update(eventRef, {
                   status: "processing",
                   claimToken,
                   processingStartedAt:
                       admin.firestore.FieldValue.serverTimestamp(),
                   attemptCount: attemptCount + 1,
                   recoveredAt:
                       admin.firestore.FieldValue.serverTimestamp()
               });

               claimResult = "claimed";
               return;
           }

           // Only recover a processing claim if it is stale.
           const startedAt =
               existingEvent.processingStartedAt
                   ?.toMillis?.() ||
               existingEvent.receivedAt
                   ?.toMillis?.() ||
               0;

           const isStale =
               existingEvent.status === "processing" &&
               startedAt > 0 &&
               Date.now() - startedAt > PROCESSING_TIMEOUT_MS;

           if (isStale) {
               transaction.update(eventRef, {
                   status: "processing",
                   claimToken,
                   processingStartedAt:
                       admin.firestore.FieldValue.serverTimestamp(),
                   attemptCount:
                       Number(existingEvent.attemptCount || 1) + 1,
                   recoveredAt:
                       admin.firestore.FieldValue.serverTimestamp()
               });

               claimResult = "claimed";
           }
       });

       // ----------------------------------------------
       // 5. HANDLE CLAIM RESULT
       // ----------------------------------------------
       if (claimResult === "processed") {
           return res.status(200).json({
               success: true,
               duplicate: true
           });
       }

       if (claimResult === "retry_limit_reached") {
           return res.status(200).json({
               success: true,
               unmatched: true,
               retryLimitReached: true
           });
       }

       if (claimResult === "retry_not_due") {
           return res.status(200).json({
               success: true,
               unmatched: true,
               retryScheduled: true
           });
       }

       if (claimResult !== "claimed") {
           return res.status(500).json({
               success: false,
               message: "Webhook event is already being processed."
           });
       }

       eventClaimed = true;


        // 5. Locate MedZoneX subscription.
        let subscriptionRecord = null;

        if (subscriptionId) {
            const subscriptionDoc = await db
                .collection(SUBSCRIPTION_COLLECTION)
                .doc(subscriptionId)
                .get();

            if (subscriptionDoc.exists) {
                subscriptionRecord = {
                    id: subscriptionDoc.id,
                    ...subscriptionDoc.data()
                };
            }
        }

        // Unknown events should be acknowledged after
        // successful signature verification.
        const supportedEvents = [
            "subscription.activated",
            "subscription.authenticated",
            "subscription.pending",
            "subscription.charged",
            "subscription.updated",
            "subscription.resumed",
            "subscription.paused",
            "subscription.halted",
            "subscription.cancelled",
            "subscription.completed",
            "payment.failed"
        ];

        if (!supportedEvents.includes(eventType)) {
            await db.runTransaction(async (transaction) => {
                const snapshot = await transaction.get(eventRef);

                if (
                    !snapshot.exists ||
                    snapshot.data().status !== "processing" ||
                    snapshot.data().claimToken !== claimToken
                ) {
                    throw new Error("Webhook claim ownership lost.");
                }

                transaction.update(eventRef, {
                    status: "processed",
                    ignored: true,
                    processedAt:
                        admin.firestore.FieldValue.serverTimestamp()
                });
            });

            return res.status(200).json({
                success: true,
                ignored: true
            });
        }

        // No matching subscription means we cannot safely
        // change any user's subscription access.
        if (!subscriptionRecord?.uid) {
            console.error(
                "No matching MedZoneX subscription found.",
                {
                    eventType,
                    subscriptionId
                }
            );

            // Record the event for investigation.
            await db.runTransaction(async (transaction) => {
                const snapshot = await transaction.get(eventRef);

                if (
                    !snapshot.exists ||
                    snapshot.data().status !== "processing" ||
                    snapshot.data().claimToken !== claimToken
                ) {
                    throw new Error(
                        "Webhook claim ownership lost."
                    );
                }

                const currentAttemptCount =
                    Number(snapshot.data().attemptCount || 1);

                const retryDelayMs = Math.min(
                    60 * 60 * 1000,
                    60 * 1000 * Math.pow(
                        2,
                        Math.max(0, currentAttemptCount - 1)
                    )
                );

                transaction.update(eventRef, {
                    status: "unmatched",
                    subscriptionId: subscriptionId || null,
                    nextRetryAt:
                        admin.firestore.Timestamp.fromMillis(
                            Date.now() + retryDelayMs
                        ),
                    lastError: "Matching subscription record not found.",
                    updatedAt:
                        admin.firestore.FieldValue.serverTimestamp()
                });
            });

            // Acknowledge to avoid an endless retry loop.
            return res.status(200).json({
                success: true,
                matched: false
            });
        }

        const uid = subscriptionRecord.uid;

        const userRef = db
            .collection("users")
            .doc(uid);

        const subscriptionRef = db
            .collection(SUBSCRIPTION_COLLECTION)
            .doc(subscriptionId);

        // 6. Validate recurring payment failure linkage.
        if (
            eventType === "payment.failed" &&
            paymentEntity?.subscription_id !== subscriptionId
        ) {
            throw new Error(
                "Failed payment does not match the subscription."
            );
        }

        // Validate recurring payment before granting subscription access.
        if (eventType === "subscription.charged") {
            const expectedPlan =
                MEDZONEX_PLANS[subscriptionRecord.planKey];

            if (!expectedPlan) {
                throw new Error(
                    "Subscription has an invalid plan."
                );
            }

            // A charged event must include a usable payment entity.
            if (
                !paymentEntity ||
                typeof paymentEntity.id !== "string" ||
                !paymentEntity.id.trim()
            ) {
                throw new Error(
                    "Charged event is missing a valid payment ID."
                );
            }

            // Require an exact amount match; missing amounts are rejected.
            if (
                paymentEntity.amount == null ||
                !Number.isSafeInteger(Number(paymentEntity.amount)) ||
                Number(paymentEntity.amount) !==
                    expectedPlan.amount * 100
            ) {
                throw new Error(
                    "Recurring payment amount does not match the plan."
                );
            }

            // Require INR currency.
            if (paymentEntity.currency !== "INR") {
                throw new Error(
                    "Recurring payment currency does not match INR."
                );
            }

            // Require the payment to belong to this subscription.
            if (
                paymentEntity.subscription_id !== subscriptionId
            ) {
                throw new Error(
                    "Charged payment belongs to another subscription."
                );
            }
        }

        // 7. Update subscription and user atomically.
        await db.runTransaction(async (transaction) => {
            // First, verify that this handler still owns the event.
            const eventSnapshot =
                await transaction.get(eventRef);

            if (!eventSnapshot.exists) {
                throw new Error(
                    "Webhook event claim no longer exists."
                );
            }

            const currentEvent = eventSnapshot.data();

            if (
                currentEvent.status !== "processing" ||
                currentEvent.claimToken !== claimToken
            ) {
                throw new Error(
                    "Webhook claim ownership lost; refusing subscription update."
                );
            }

            // ================================================
            // READ INVOICE EMAIL JOB BEFORE TRANSACTION WRITES
            // ================================================

            let paymentEmailJobRef = null;
            let paymentEmailJobSnapshot = null;

            if (
                eventType === "subscription.charged" &&
                paymentEntity?.id
            ) {
                paymentEmailJobRef = db
                    .collection(INVOICE_EMAIL_JOB_COLLECTION)
                    .doc(`paid_${paymentEntity.id}`);

                paymentEmailJobSnapshot =
                    await transaction.get(paymentEmailJobRef);

            } else if (
                eventType === "payment.failed" &&
                paymentEntity?.id
            ) {
                paymentEmailJobRef = db
                    .collection(INVOICE_EMAIL_JOB_COLLECTION)
                    .doc(`failed_${paymentEntity.id}`);

                paymentEmailJobSnapshot =
                    await transaction.get(paymentEmailJobRef);
            }

            // Continue with the existing transaction.
            const userSnapshot =
                await transaction.get(userRef);

            const currentUser = userSnapshot.exists
                ? userSnapshot.data()
                : {};

            const currentSubscription =
                currentUser.subscription || {};

            const now = Date.now();

            const expectedPlan =
                MEDZONEX_PLANS[subscriptionRecord.planKey];

            const nowTimestamp =
                admin.firestore.Timestamp.fromMillis(now);

            const currentSubscriptionId =
                currentSubscription.razorpaySubscriptionId || null;

            // A separate manually paid subscription must not
            // be overwritten by an unrelated recurring event.
            const hasManualPayment =
                currentSubscription.status === "active" &&
                Boolean(currentSubscription.lastOrderId) &&
                !currentSubscriptionId;

            const belongsToCurrentSubscription =
                !currentSubscriptionId ||
                currentSubscriptionId === subscriptionId;

            const canChangeAccess =
                belongsToCurrentSubscription &&
                !hasManualPayment;

                          // ----------------------------------------------
                          // SUCCESSFUL RECURRING CHARGE
                          // ----------------------------------------------
                          if (eventType === "subscription.charged") {
                              const periodEndSeconds = Number(
                                  subscriptionEntity?.current_end || 0
                              );
                              const successfulPaymentCreatedAt = Number(
                                  paymentEntity?.created_at ||
                                  event.created_at ||
                                  0
                              );

                              const lastSuccessfulPaymentCreatedAt = Number(
                                  currentSubscription.lastSuccessfulPaymentCreatedAt || 0
                              );

                              const isOlderOrUnverifiableSuccess =
                                  lastSuccessfulPaymentCreatedAt > 0 &&
                                  (
                                      successfulPaymentCreatedAt <= 0 ||
                                      successfulPaymentCreatedAt <
                                          lastSuccessfulPaymentCreatedAt
                                  );

                              const expiry = periodEndSeconds > 0
                                  ? admin.firestore.Timestamp.fromMillis(
                                      periodEndSeconds * 1000
                                  )
                                  : getSubscriptionExpiry(
                                      subscriptionRecord.planKey,
                                      now
                                  );

                              if (
                                  canChangeAccess &&
                                  !isOlderOrUnverifiableSuccess
                              ) {
                                  transaction.set(
                                      userRef,
                                      {
                                          subscription: {
                                              provider: "razorpay",
                                              status: "active",
                                              planKey: subscriptionRecord.planKey,
                                              planName: subscriptionRecord.planName,
                                              razorpaySubscriptionId: subscriptionId,
                                              lastPaymentId:
                                                  paymentEntity?.id || null,
                                              lastSuccessfulPaymentCreatedAt:
                                                  successfulPaymentCreatedAt,

                                              lastPaymentEventCreatedAt: Number(
                                                  event.created_at || successfulPaymentCreatedAt || 0
                                              ),
                                              currentPeriodStart:
                                                  admin.firestore.Timestamp.fromMillis(
                                                      Number(
                                                          subscriptionEntity?.current_start ||
                                                          now / 1000
                                                      ) * 1000
                                                  ),
                                              currentPeriodEnd: expiry,
                                              updatedAt:
                                                  admin.firestore.FieldValue
                                                      .serverTimestamp()
                                          }
                                      },
                                      { merge: true }
                                  );

                                  transaction.set(
                                      subscriptionRef,
                                      {
                                          status: "active",
                                          razorpayStatus:
                                              subscriptionEntity?.status || "active",
                                          currentPeriodEnd: expiry,
                                          lastWebhookEvent: eventType,
                                          updatedAt:
                                              admin.firestore.FieldValue
                                                  .serverTimestamp()
                                      },
                                      { merge: true }
                                  );
                              }

                          // QUEUE SUCCESSFUL PAYMENT INVOICE EMAIL
                          if (
                              paymentEmailJobRef &&
                              !paymentEmailJobSnapshot?.exists &&
                              canChangeAccess &&
                              !isOlderOrUnverifiableSuccess
                          ) {
                              const paidAtSeconds = Number(
                                  paymentEntity?.created_at ||
                                  event.created_at ||
                                  0
                              );

                              const periodStartSeconds = Number(
                                  subscriptionEntity?.current_start ||
                                  now / 1000
                              );

                              transaction.set(paymentEmailJobRef, {
                                  type: "payment_succeeded",
                                  uid: subscriptionRecord.uid,
                                  email: currentUser.email || subscriptionRecord.email || "",
                                  phone: subscriptionRecord.customerPhone || currentUser.phone || "",
                                  storeName: currentUser.storeName || subscriptionRecord.storeName || "Not provided",
                                  planKey: subscriptionRecord.planKey,
                                  planName: subscriptionRecord.planName,
                                  amount: Number(expectedPlan.amount),
                                  paymentId: paymentEntity.id,
                                  orderId: null,
                                  subscriptionId,
                                  paidAt: admin.firestore.Timestamp.fromMillis(
                                      paidAtSeconds > 0 ? paidAtSeconds * 1000 : now
                                  ),
                                  periodStart: admin.firestore.Timestamp.fromMillis(
                                      periodStartSeconds * 1000
                                  ),
                                  periodEnd: expiry,
                                  status: "pending",
                                  attempts: 0,
                                  createdAt: admin.firestore.FieldValue.serverTimestamp(),
                                  updatedAt: admin.firestore.FieldValue.serverTimestamp()
                              });
                          }
                      }


                          // ----------------------------------------------
                          // FAILED RECURRING PAYMENT
                          // Lock immediately, unless a newer successful
                          // payment has already been recorded.
                          // ----------------------------------------------

            else if (eventType === "payment.failed") {
                const failedPaymentCreatedAt = Number(
                    paymentEntity?.created_at ||
                    event.created_at ||
                    0
                );

                const lastSuccessfulPaymentCreatedAt =
                    Number(
                        currentSubscription
                            .lastSuccessfulPaymentCreatedAt || 0
                    );

                const lastPaymentEventCreatedAt = Number(
                    currentSubscription.lastPaymentEventCreatedAt || 0
                );

                const isOlderPaymentEvent =
                    lastPaymentEventCreatedAt > 0 &&
                    (
                        failedPaymentCreatedAt <= 0 ||
                        failedPaymentCreatedAt < lastPaymentEventCreatedAt
                    );

                const isOlderOrUnverifiableFailure =
                    (
                        lastSuccessfulPaymentCreatedAt > 0 &&
                        (
                            failedPaymentCreatedAt <= 0 ||
                            failedPaymentCreatedAt <
                                lastSuccessfulPaymentCreatedAt
                        )
                    ) ||
                    isOlderPaymentEvent;

                if (
                    canChangeAccess &&
                    !isOlderOrUnverifiableFailure
                ) {
                    // Preserve the customer's already-paid period.
                    const userExpiry =
                        currentSubscription.currentPeriodEnd
                            ?.toMillis?.() || 0;

                    const recordExpiry =
                        subscriptionRecord.currentPeriodEnd
                            ?.toMillis?.() || 0;

                    const existingExpiry =
                        userExpiry > 0 ? userExpiry : recordExpiry;

                    const paidPeriodStillValid = existingExpiry > now;

                    transaction.set(
                        userRef,
                        {
                            subscription: {
                                ...currentSubscription,
                                provider: "razorpay",

                                // Keep access active only while the existing
                                // paid period is still valid.
                                status: paidPeriodStillValid
                                    ? "active"
                                    : "payment_failed",

                                lastPaymentFailureAt:
                                    admin.firestore.FieldValue.serverTimestamp(),

                                lastFailedPaymentId:
                                    paymentEntity?.id || null,

                                lastPaymentEventCreatedAt:
                                    failedPaymentCreatedAt,

                                razorpaySubscriptionId: subscriptionId,

                                // Never shorten an existing valid paid period.
                                currentPeriodEnd: existingExpiry > 0
                                    ? admin.firestore.Timestamp.fromMillis(
                                        existingExpiry
                                    )
                                    : nowTimestamp,

                                updatedAt:
                                    admin.firestore.FieldValue.serverTimestamp()
                            }
                        },
                        { merge: true }
                    );

                    transaction.set(
                        subscriptionRef,
                        {
                            status: "payment_failed",

                            lastFailedPaymentId:
                                paymentEntity?.id || null,

                            lastFailedPaymentCreatedAt:
                                failedPaymentCreatedAt,

                            lastPaymentEventCreatedAt:
                                failedPaymentCreatedAt,

                            lastWebhookEvent: eventType,

                            updatedAt:
                                admin.firestore.FieldValue.serverTimestamp()
                        },
                        { merge: true }
                    );
                }

            // QUEUE FAILED PAYMENT NOTIFICATION
            if (
                paymentEmailJobRef &&
                !paymentEmailJobSnapshot?.exists
            ) {
                const failedPlan =
                    MEDZONEX_PLANS[subscriptionRecord.planKey];

                transaction.set(paymentEmailJobRef, {
                    type: "payment_failed",
                    uid: subscriptionRecord.uid,
                    email: currentUser.email || subscriptionRecord.email || "",
                    phone: subscriptionRecord.customerPhone || currentUser.phone || "",
                    storeName: currentUser.storeName || subscriptionRecord.storeName || "Not provided",
                    planKey: subscriptionRecord.planKey,
                    planName: subscriptionRecord.planName || failedPlan?.name || "MedZoneX Subscription",
                    amount: Number(failedPlan?.amount || 0),
                    paymentId: paymentEntity?.id || null,
                    subscriptionId,
                    status: "pending",
                    attempts: 0,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        }

            // ----------------------------------------------
            // CANCELLATION
            // Preserve access until the paid period ends.
            // ----------------------------------------------
            else if (eventType === "subscription.cancelled") {
                const periodEndSeconds = Number(
                    subscriptionEntity?.current_end || 0
                );

                const storedEnd =
                    currentSubscription.currentPeriodEnd
                        ?.toMillis?.() ||
                    subscriptionRecord.currentPeriodEnd
                        ?.toMillis?.() ||
                    0;

                const expiryMs =
                    periodEndSeconds > 0
                        ? periodEndSeconds * 1000
                        : storedEnd;

                const expiry = expiryMs > 0
                    ? admin.firestore.Timestamp.fromMillis(expiryMs)
                    : nowTimestamp;

                const paidPeriodStillValid =
                    expiryMs > now;

                if (canChangeAccess) {
                    transaction.set(
                        userRef,
                        {
                            subscription: {
                                ...currentSubscription,
                                provider: "razorpay",
                                razorpaySubscriptionId: subscriptionId,

                                status: paidPeriodStillValid
                                    ? "active"
                                    : "cancelled",

                                cancelAtPeriodEnd: true,
                                currentPeriodEnd: expiry,

                                cancelledAt:
                                    admin.firestore.FieldValue
                                        .serverTimestamp(),

                                updatedAt:
                                    admin.firestore.FieldValue
                                        .serverTimestamp()
                            }
                        },
                        { merge: true }
                    );
                }

                transaction.set(
                    subscriptionRef,
                    {
                        status: paidPeriodStillValid
                            ? "active"
                            : "cancelled",

                        razorpayStatus:
                            subscriptionEntity?.status || "cancelled",

                        cancelAtPeriodEnd: true,
                        currentPeriodEnd: expiry,
                        lastWebhookEvent: eventType,

                        updatedAt:
                            admin.firestore.FieldValue
                                .serverTimestamp()
                    },
                    { merge: true }
                );
            }

            // ----------------------------------------------
            // HALTED, PAUSED OR COMPLETED
            // ----------------------------------------------
            else if (
                [
                    "subscription.halted",
                    "subscription.paused",
                    "subscription.completed"
                ].includes(eventType)
            ) {
                const eventStatus = eventType.replace(
                    "subscription.",
                    ""
                );

                const storedPeriodEnd =
                    currentSubscription.currentPeriodEnd
                        ?.toMillis?.() ||
                    subscriptionRecord.currentPeriodEnd
                        ?.toMillis?.() ||
                    0;

                const razorpayPeriodEnd = Number(
                    subscriptionEntity?.current_end || 0
                ) * 1000;

                const periodEndMs =
                    razorpayPeriodEnd > 0
                        ? razorpayPeriodEnd
                        : storedPeriodEnd;

                const paidPeriodStillValid =
                    periodEndMs > now;

                // A terminal event must not revoke a newer subscription.
                if (canChangeAccess) {
                    let nextStatus = eventStatus;
                    let nextPeriodEnd = nowTimestamp;

                    if (
                        eventType === "subscription.completed" &&
                        paidPeriodStillValid
                    ) {
                        // The subscription has completed, but the
                        // already-paid period may still be valid.
                        nextStatus = "active";
                        nextPeriodEnd =
                            admin.firestore.Timestamp.fromMillis(
                                periodEndMs
                            );
                    } else if (
                        eventType === "subscription.paused" &&
                        paidPeriodStillValid
                    ) {
                        // Preserve the recorded paid-period expiry.
                        // Access policy for paused subscriptions must
                        // be enforced separately if pausing should lock access.
                        nextPeriodEnd =
                            admin.firestore.Timestamp.fromMillis(
                                periodEndMs
                            );
                    }

                    transaction.set(
                        userRef,
                        {
                            subscription: {
                                ...currentSubscription,
                                provider: "razorpay",
                                status: nextStatus,
                                razorpaySubscriptionId: subscriptionId,
                                currentPeriodEnd: nextPeriodEnd,
                                updatedAt:
                                    admin.firestore.FieldValue
                                        .serverTimestamp()
                            }
                        },
                        { merge: true }
                    );
                }

                transaction.set(
                    subscriptionRef,
                    {
                        status: eventStatus,
                        razorpayStatus:
                            subscriptionEntity?.status || eventStatus,
                        currentPeriodEnd:
                            periodEndMs > 0
                                ? admin.firestore.Timestamp.fromMillis(
                                    periodEndMs
                                )
                                : nowTimestamp,
                        lastWebhookEvent: eventType,
                        updatedAt:
                            admin.firestore.FieldValue
                                .serverTimestamp()
                    },
                    { merge: true }
                );
              }


            // ----------------------------------------------
            // OTHER SUBSCRIPTION STATUS EVENTS
            // ----------------------------------------------
            else {
                transaction.set(
                    subscriptionRef,
                    {
                        razorpayStatus:
                            subscriptionEntity?.status ||
                            eventType,
                        lastWebhookEvent: eventType,
                        updatedAt:
                            admin.firestore.FieldValue
                                .serverTimestamp()
                    },
                    { merge: true }
                );
            }

            // Mark the event processed atomically with subscription updates.
            transaction.update(eventRef, {
                status: "processed",
                processedAt:
                    admin.firestore.FieldValue.serverTimestamp()
            });
        });

        return res.status(200).json({
            success: true,
            received: true
        });

    } catch (error) {
        console.error(
            "Razorpay webhook processing error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Webhook processing failed."
        });
    }
});

// ======================================================
// CANCEL SUBSCRIPTION
// POST /api/subscription/cancel
// Access remains active until the paid period ends.
// ======================================================

app.post("/api/subscription/cancel", async (req, res) => {
    try {
        if (!razorpay) {
            return res.status(503).json({
                success: false,
                message: "Payment service is unavailable."
            });
        }

        if (!firebaseInitialized || !db) {
            return res.status(503).json({
                success: false,
                message: "Database is unavailable."
            });
        }

        // 1. Authenticate the Firebase user.
        const decodedToken =
            await authenticateFirebaseRequest(req);

        const uid = decodedToken.uid;

        // 2. Get the user's subscription.
        const userRef = db.collection("users").doc(uid);
        const userSnapshot = await userRef.get();

        if (!userSnapshot.exists) {
            return res.status(404).json({
                success: false,
                message: "User account was not found."
            });
        }

        const userData = userSnapshot.data();
        const userSubscription = userData.subscription || {};

        const subscriptionId =
            userSubscription.razorpaySubscriptionId;

        if (!subscriptionId) {
            return res.status(400).json({
                success: false,
                message:
                    "No recurring Razorpay subscription was found."
            });
        }

        // 3. Verify that the subscription belongs to this user.
        const subscriptionRef = db
            .collection(SUBSCRIPTION_COLLECTION)
            .doc(subscriptionId);

        const subscriptionSnapshot =
            await subscriptionRef.get();

        if (!subscriptionSnapshot.exists) {
            return res.status(404).json({
                success: false,
                message: "Subscription record was not found."
            });
        }

        const subscriptionData =
            subscriptionSnapshot.data();

        if (subscriptionData.uid !== uid) {
            return res.status(403).json({
                success: false,
                message: "You cannot cancel this subscription."
            });
        }

        // 4. Prevent duplicate cancellation requests.
        if (userSubscription.cancelAtPeriodEnd === true) {
            return res.status(200).json({
                success: true,
                message:
                    "Cancellation has already been requested.",
                cancelAtPeriodEnd: true,
                expiresAt:
                    userSubscription.currentPeriodEnd
                        ?.toDate?.() || null
            });
        }

        // 5. Ask Razorpay to cancel at the end of the cycle.
        const razorpaySubscription =
            await razorpay.subscriptions.cancel(
                subscriptionId,
                {
                    cancel_at_cycle_end: true
                }
            );

        // 6. Determine the paid period's end.
        const razorpayEnd = Number(
            razorpaySubscription.current_end || 0
        );

        const storedEnd =
            userSubscription.currentPeriodEnd
                ?.toMillis?.() || 0;

        const expiryMs = razorpayEnd > 0
            ? razorpayEnd * 1000
            : storedEnd;

        if (!expiryMs) {
            throw new Error(
                "Could not determine the paid period end."
            );
        }

        const expiryTimestamp =
            admin.firestore.Timestamp.fromMillis(expiryMs);

        // 7. Update the user's access without extending it.
        await db.runTransaction(async (transaction) => {
            const freshUser =
                await transaction.get(userRef);

            const freshSubscription =
                freshUser.exists
                    ? freshUser.data().subscription || {}
                    : {};

            if (
                freshSubscription.razorpaySubscriptionId !==
                subscriptionId
            ) {
                throw new Error(
                    "The user's subscription changed. Please retry."
                );
            }

            transaction.set(
                userRef,
                {
                    subscription: {
                        ...freshSubscription,

                        // Access continues only until the
                        // already-paid period ends.
                        status: expiryMs > Date.now()
                            ? "active"
                            : "cancelled",

                        cancelAtPeriodEnd: true,
                        currentPeriodEnd: expiryTimestamp,

                        cancelledAt:
                            admin.firestore.FieldValue
                                .serverTimestamp(),

                        updatedAt:
                            admin.firestore.FieldValue
                                .serverTimestamp()
                    }
                },
                { merge: true }
            );

            transaction.set(
                subscriptionRef,
                {
                    status: expiryMs > Date.now()
                                ? "active"
                                : "cancelled",
                    razorpayStatus:
                        razorpaySubscription.status || "cancelled",

                    cancelAtPeriodEnd: true,
                    currentPeriodEnd: expiryTimestamp,

                    updatedAt:
                        admin.firestore.FieldValue
                            .serverTimestamp()
                },
                { merge: true }
            );
        });

        return res.status(200).json({
            success: true,
            message:
                "Cancellation requested. Your dashboard remains available until the paid period ends.",

            cancelAtPeriodEnd: true,
            expiresAt: expiryTimestamp.toDate()
        });

    } catch (error) {
        console.error(
            "Subscription cancellation error:",
            error.message
        );

        return res.status(error.statusCode || 500).json({
            success: false,
            message:
                error.statusCode
                    ? error.message
                    : "Unable to cancel the subscription. Please try again."
        });
    }
});

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
// RAZORPAY WEBHOOK RECONCILIATION WORKER
// ======================================================

let webhookReconciliationRunning = false;

async function reconcileUnmatchedRazorpayWebhooks() {
    if (
        webhookReconciliationRunning ||
        !firebaseInitialized ||
        !db ||
        !RAZORPAY_WEBHOOK_SECRET
    ) {
        return;
    }

    webhookReconciliationRunning = true;

    try {
        const now = Date.now();

        const snapshot = await db
            .collection(WEBHOOK_EVENT_COLLECTION)
            .where("status", "==", "unmatched")
            .limit(100)
            .get();

        const dueEvents = snapshot.docs
            .filter((doc) => {
                const data = doc.data();

                const attempts = Number(
                    data.attemptCount || 1
                );

                const nextRetryAt =
                    data.nextRetryAt?.toMillis?.() || 0;

                return (
                    attempts < 10 &&
                    nextRetryAt <= now &&
                    data.eventPayload
                );
            })
            .slice(0, 10);

        for (const eventDoc of dueEvents) {
            const data = eventDoc.data();

            try {
                const payload = JSON.stringify(
                    data.eventPayload
                );

                const signature = crypto
                    .createHmac(
                        "sha256",
                        RAZORPAY_WEBHOOK_SECRET
                    )
                    .update(payload)
                    .digest("hex");

                const response = await fetch(
                    `http://127.0.0.1:${PORT}/api/razorpay/webhook`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "x-razorpay-signature": signature,
                            "x-razorpay-event-id": eventDoc.id
                        },
                        body: payload,
                        signal: AbortSignal.timeout(15000)
                    }
                );

                if (!response.ok) {
                    console.error(
                        "Webhook reconciliation returned HTTP",
                        response.status,
                        "for event",
                        eventDoc.id
                    );
                }
            } catch (error) {
                console.error(
                    "Webhook reconciliation failed for event",
                    eventDoc.id,
                    error.message
                );
            }
        }
    } catch (error) {
        console.error(
            "Razorpay webhook reconciliation worker error:",
            error.message
        );
    } finally {
        webhookReconciliationRunning = false;
    }
}

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

        // ======================================================
        // START INVOICE EMAIL WORKER
        // ======================================================

        setInterval(() => {
            runInvoiceEmailWorker().catch((error) => {
                console.error(
                    "[INVOICE EMAIL] Worker failed:",
                    error.message
                );
            });
        }, 30 * 1000);

        runInvoiceEmailWorker().catch((error) => {
            console.error(
                "[INVOICE EMAIL] Initial worker failed:",
                error.message
            );
        });

        // Start unmatched-webhook reconciliation.
            setInterval(() => {
                reconcileUnmatchedRazorpayWebhooks().catch(
                    (error) => {
                        console.error(
                            "Webhook reconciliation scheduler error:",
                            error.message
                        );
                    }
                );
            }, 60 * 1000);

            // Run once after startup.
            reconcileUnmatchedRazorpayWebhooks().catch(
                (error) => {
                    console.error(
                        "Initial webhook reconciliation error:",
                        error.message
                    );
                }
            );
        }
    );