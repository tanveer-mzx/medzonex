import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";


// =====================================================
// FIREBASE CONFIG
// =====================================================

const firebaseConfig = {
    apiKey: "AIzaSyBlu8NE_YftR8waBycLoXnpDcdxL9whECw",
    authDomain: "data-2c37b.firebaseapp.com",
    projectId: "data-2c37b",
    storageBucket: "data-2c37b.firebasestorage.app",
    messagingSenderId: "117351129570",
    appId: "1:117351129570:web:cc7e045aa33730f29d59bb",
    measurementId: "G-PMPDHJ6PJL"
};


// =====================================================
// FIREBASE INITIALIZATION
// =====================================================

const firebaseApp = initializeApp(firebaseConfig);

const auth = getAuth(firebaseApp);

const db = getFirestore(firebaseApp);

console.log(
    "Firebase client initialized:",
    firebaseApp.options.projectId
);


// =====================================================
// BACKEND API
// =====================================================

const API_BASE_URL =
    (
        location.hostname === "localhost" ||
        location.hostname === "127.0.0.1"
    )
        ? "http://localhost:5000"
        : "https://medzonex-backend.onrender.com";


function apiUrl(path) {

    if (!path.startsWith("/")) {
        path = "/" + path;
    }

    return `${API_BASE_URL}${path}`;
}


console.log(
    "MedZoneX API:",
    API_BASE_URL
);


// =====================================================
// CONSTANTS
// =====================================================

const TRIAL_DURATION_MS =
    48 * 60 * 60 * 1000;

const API_TIMEOUT_MS =
    20000;


// =====================================================
// STATE
// =====================================================

let signupOtpVerified = false;
let signupOtpEmail = "";

let forgotOtpVerified = false;
let forgotOtpEmail = "";

let trialTimer = null;


// =====================================================
// DOM HELPER
// =====================================================

function $(id) {
    return document.getElementById(id);
}


// =====================================================
// PAGE NAVIGATION
// =====================================================

function showPage(pageId) {

    document
        .querySelectorAll(".page")
        .forEach((page) => {
            page.classList.add("hidden");
        });

    const page = $(pageId);

    if (!page) {
        console.warn(
            "Page not found:",
            pageId
        );
        return;
    }

    page.classList.remove("hidden");

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


// =====================================================
// AUTH SECTION
// =====================================================

function showAuthSection(sectionId) {

    document
        .querySelectorAll(".form-section")
        .forEach((section) => {
            section.classList.remove("active");
        });

    const section = $(sectionId);

    if (!section) {
        console.warn(
            "Auth section not found:",
            sectionId
        );
        return;
    }

    section.classList.add("active");
}


// =====================================================
// MESSAGE
// =====================================================

function setMessage(
    elementId,
    message,
    type = "info"
) {

    const element = $(elementId);

    if (!element) {
        console.warn(
            "Message element not found:",
            elementId
        );
        return;
    }

    element.textContent = message;

    element.className =
        `message ${type}`;
}


function clearMessage(elementId) {

    const element = $(elementId);

    if (!element) return;

    element.textContent = "";

    element.className = "message";
}


// =====================================================
// BUTTON LOADING
// =====================================================

function setButtonLoading(
    button,
    loading,
    loadingText,
    normalText
) {

    if (!button) return;

    if (loading) {

        if (!button.dataset.originalText) {
            button.dataset.originalText =
                button.textContent;
        }

        button.textContent =
            loadingText;

        button.disabled = true;

        button.classList.add("loading");

    } else {

        button.textContent =
            normalText ||
            button.dataset.originalText ||
            button.textContent;

        button.disabled = false;

        button.classList.remove("loading");
    }
}


// =====================================================
// VALIDATION
// =====================================================

function validEmail(email) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        String(email || "")
            .trim()
            .toLowerCase()
    );
}


function validPassword(password) {

    return (
        typeof password === "string" &&
        password.length >= 8
    );
}


function validOtp(otp) {

    return /^\d{6}$/.test(
        String(otp || "").trim()
    );
}


// =====================================================
// API REQUEST
// =====================================================

async function apiRequest(
    path,
    options = {}
) {

    const controller =
        new AbortController();

    const timeout =
        setTimeout(
            () => controller.abort(),
            API_TIMEOUT_MS
        );

    try {

        const response =
            await fetch(
                apiUrl(path),
                {
                    ...options,
                    signal:
                        controller.signal
                }
            );

        const contentType =
            response.headers.get(
                "content-type"
            ) || "";

        let data = {};

        if (
            contentType.includes(
                "application/json"
            )
        ) {

            data =
                await response
                    .json()
                    .catch(() => ({}));

        } else {

            const text =
                await response
                    .text()
                    .catch(() => "");

            if (text) {
                data = {
                    message: text
                };
            }
        }

        if (!response.ok) {

            throw new Error(
                data.message ||
                data.error ||
                `Server error (${response.status})`
            );
        }

        return data;

    } catch (error) {

        if (
            error.name ===
            "AbortError"
        ) {

            throw new Error(
                "Backend request timed out. Please try again."
            );
        }

        if (
            error instanceof TypeError
        ) {

            throw new Error(
                "Unable to connect to MedZoneX server. Please check your internet connection."
            );
        }

        throw error;

    } finally {

        clearTimeout(timeout);
    }
}


// =====================================================
// SEND EMAIL OTP
// =====================================================

async function sendEmailOtp(
    email,
    purpose
) {

    return await apiRequest(
        "/api/auth/send-email-otp",
        {
            method: "POST",

            headers: {
                "Content-Type":
                    "application/json"
            },

            body: JSON.stringify({
                email:
                    email
                        .trim()
                        .toLowerCase(),

                purpose
            })
        }
    );
}


// =====================================================
// VERIFY EMAIL OTP
// =====================================================

async function verifyEmailOtp(
    email,
    otp,
    purpose
) {

    return await apiRequest(
        "/api/auth/verify-email-otp",
        {
            method: "POST",

            headers: {
                "Content-Type":
                    "application/json"
            },

            body: JSON.stringify({
                email:
                    email
                        .trim()
                        .toLowerCase(),

                otp:
                    otp.trim(),

                purpose
            })
        }
    );
}


// =====================================================
// RESET PASSWORD
// =====================================================

async function resetPasswordApi(
    email,
    newPassword
) {

    return await apiRequest(
        "/api/auth/reset-password",
        {
            method: "POST",

            headers: {
                "Content-Type":
                    "application/json"
            },

            body: JSON.stringify({
                email:
                    email
                        .trim()
                        .toLowerCase(),

                newPassword
            })
        }
    );
}


// =====================================================
// GET STARTED
// =====================================================

function openGetStarted() {

    showPage("authPage");

    showAuthSection(
        "signupSection"
    );

    clearMessage(
        "signupMessage"
    );
}


$("getStartedBtn")
    ?.addEventListener(
        "click",
        openGetStarted
    );


// =====================================================
// AUTH NAVIGATION
// =====================================================

$("showSignupBtn")
    ?.addEventListener(
        "click",
        () => {

            showAuthSection(
                "signupSection"
            );

            clearMessage(
                "signupMessage"
            );
        }
    );


$("showLoginFromSignupBtn")
    ?.addEventListener(
        "click",
        () => {

            showAuthSection(
                "loginSection"
            );

            clearMessage(
                "loginMessage"
            );
        }
    );


$("showForgotBtn")
    ?.addEventListener(
        "click",
        () => {

            showAuthSection(
                "forgotSection"
            );

            clearMessage(
                "forgotMessage"
            );
        }
    );


$("backToLoginBtn")
    ?.addEventListener(
        "click",
        () => {

            showAuthSection(
                "loginSection"
            );

            clearMessage(
                "loginMessage"
            );
        }
    );


// =====================================================
// SIGNUP — SEND OTP
// =====================================================

$("sendSignupOtpBtn")
    ?.addEventListener(
        "click",
        async () => {

            clearMessage(
                "signupMessage"
            );

            const email =
                $("signupEmail")
                    ?.value
                    .trim()
                    .toLowerCase();

            if (!validEmail(email)) {

                setMessage(
                    "signupMessage",
                    "Please enter a valid email address.",
                    "error"
                );

                return;
            }

            const button =
                $("sendSignupOtpBtn");

            try {

                setButtonLoading(
                    button,
                    true,
                    "Sending...",
                    "Send OTP"
                );

                const result =
                    await sendEmailOtp(
                        email,
                        "signup"
                    );

                console.log(
                    "Signup OTP response:",
                    result
                );

                signupOtpVerified =
                    false;

                signupOtpEmail =
                    email;

                $("signupOtpArea")
                    ?.classList
                    .remove("hidden");

                if ($("signupOtpStatus")) {

                    $("signupOtpStatus")
                        .textContent =
                        "OTP sent. Check your email.";
                }

                setMessage(
                    "signupMessage",
                    "OTP has been sent successfully. Please check your email.",
                    "success"
                );

            } catch (error) {

                console.error(
                    "SIGNUP OTP ERROR:",
                    error
                );

                setMessage(
                    "signupMessage",
                    error.message ||
                    "Unable to send OTP.",
                    "error"
                );

            } finally {

                setButtonLoading(
                    button,
                    false,
                    "",
                    "Send OTP"
                );
            }
        }
    );


// =====================================================
// SIGNUP — VERIFY OTP
// =====================================================

$("verifySignupOtpBtn")
    ?.addEventListener(
        "click",
        async () => {

            clearMessage(
                "signupMessage"
            );

            const email =
                $("signupEmail")
                    ?.value
                    .trim()
                    .toLowerCase();

            const otp =
                $("signupOtp")
                    ?.value
                    .trim();

            if (!validEmail(email)) {

                setMessage(
                    "signupMessage",
                    "Please enter your email first.",
                    "error"
                );

                return;
            }

            if (!validOtp(otp)) {

                setMessage(
                    "signupMessage",
                    "Enter the 6-digit OTP.",
                    "error"
                );

                return;
            }

            const button =
                $("verifySignupOtpBtn");

            try {

                setButtonLoading(
                    button,
                    true,
                    "Verifying...",
                    "Verify OTP"
                );

                const result =
                    await verifyEmailOtp(
                        email,
                        otp,
                        "signup"
                    );

                console.log(
                    "Signup OTP verification:",
                    result
                );

                signupOtpVerified =
                    true;

                signupOtpEmail =
                    email;

                if ($("signupOtpStatus")) {

                    $("signupOtpStatus")
                        .textContent =
                        "✓ Email verified";
                }

                setMessage(
                    "signupMessage",
                    "Email verified successfully.",
                    "success"
                );

            } catch (error) {

                console.error(
                    "SIGNUP OTP VERIFY ERROR:",
                    error
                );

                signupOtpVerified =
                    false;

                setMessage(
                    "signupMessage",
                    error.message ||
                    "OTP verification failed.",
                    "error"
                );

            } finally {

                setButtonLoading(
                    button,
                    false,
                    "",
                    "Verify OTP"
                );
            }
        }
    );


// =====================================================
// CREATE ACCOUNT
// =====================================================

$("signupBtn")
    ?.addEventListener(
        "click",
        async () => {

            clearMessage(
                "signupMessage"
            );

            const storeName =
                $("storeName")
                    ?.value
                    .trim();

            const email =
                $("signupEmail")
                    ?.value
                    .trim()
                    .toLowerCase();

            const password =
                $("signupPassword")
                    ?.value || "";

            const confirmPassword =
                $("signupConfirmPassword")
                    ?.value || "";

            const termsAccepted =
                $("signupTerms")
                    ?.checked;

            if (!storeName) {

                setMessage(
                    "signupMessage",
                    "Store Name is required.",
                    "error"
                );

                return;
            }

            if (!validEmail(email)) {

                setMessage(
                    "signupMessage",
                    "Enter a valid email address.",
                    "error"
                );

                return;
            }

            if (
                !signupOtpVerified ||
                signupOtpEmail !== email
            ) {

                setMessage(
                    "signupMessage",
                    "Please verify your email OTP first.",
                    "error"
                );

                return;
            }

            if (!validPassword(password)) {

                setMessage(
                    "signupMessage",
                    "Password must contain at least 8 characters.",
                    "error"
                );

                return;
            }

            if (
                password !==
                confirmPassword
            ) {

                setMessage(
                    "signupMessage",
                    "Passwords do not match.",
                    "error"
                );

                return;
            }

            if (!termsAccepted) {

                setMessage(
                    "signupMessage",
                    "Please agree to the Terms & Conditions and Privacy Policy.",
                    "error"
                );

                return;
            }

            const button =
                $("signupBtn");

            try {

                setButtonLoading(
                    button,
                    true,
                    "Creating Account...",
                    "Create Account"
                );

                const credential =
                    await createUserWithEmailAndPassword(
                        auth,
                        email,
                        password
                    );

                const user =
                    credential.user;

                const trialEnd =
                    new Date(
                        Date.now() +
                        TRIAL_DURATION_MS
                    );

                await setDoc(
                    doc(
                        db,
                        "users",
                        user.uid
                    ),
                    {
                        uid:
                            user.uid,

                        name:
                            storeName,

                        storeName:
                            storeName,

                        email:
                            email,

                        trialStart:
                            serverTimestamp(),

                        trialEnd:
                            trialEnd,

                        subscriptionStatus:
                            "trial",

                        subscriptionPlan:
                            null,

                        createdAt:
                            serverTimestamp(),

                        updatedAt:
                            serverTimestamp()
                    },
                    {
                        merge: true
                    }
                );

                signupOtpVerified =
                    false;

                signupOtpEmail =
                    "";

                setMessage(
                    "signupMessage",
                    "Account created successfully.",
                    "success"
                );

                setTimeout(
                    () => {
                        loadDashboard(user);
                    },
                    700
                );

            } catch (error) {

                console.error(
                    "SIGNUP ERROR:",
                    error
                );

                let message =
                    "Unable to create account.";

                switch (error.code) {

                    case "auth/email-already-in-use":

                        message =
                            "An account with this email already exists. Please login.";

                        break;

                    case "auth/invalid-email":

                        message =
                            "Invalid email address.";

                        break;

                    case "auth/weak-password":

                        message =
                            "Password must be at least 8 characters.";

                        break;

                    case "auth/network-request-failed":

                        message =
                            "Network error. Please check your internet connection.";

                        break;

                    default:

                        if (error.message) {
                            message =
                                error.message;
                        }
                }

                setMessage(
                    "signupMessage",
                    message,
                    "error"
                );

            } finally {

                setButtonLoading(
                    button,
                    false,
                    "",
                    "Create Account"
                );
            }
        }
    );


// =====================================================
// LOGIN
// =====================================================

$("loginBtn")
    ?.addEventListener(
        "click",
        async () => {

            clearMessage(
                "loginMessage"
            );

            const email =
                $("loginEmail")
                    ?.value
                    .trim()
                    .toLowerCase();

            const password =
                $("loginPassword")
                    ?.value || "";

            if (!validEmail(email)) {

                setMessage(
                    "loginMessage",
                    "Please enter a valid email address.",
                    "error"
                );

                return;
            }

            if (!password) {

                setMessage(
                    "loginMessage",
                    "Please enter your password.",
                    "error"
                );

                return;
            }

            const button =
                $("loginBtn");

            try {

                setButtonLoading(
                    button,
                    true,
                    "Signing in...",
                    "Login"
                );

                const credential =
                    await signInWithEmailAndPassword(
                        auth,
                        email,
                        password
                    );

                await loadDashboard(
                    credential.user
                );

            } catch (error) {

                console.error(
                    "LOGIN ERROR:",
                    error
                );

                let message =
                    "Login failed.";

                switch (error.code) {

                    case "auth/invalid-credential":
                    case "auth/wrong-password":
                    case "auth/user-not-found":

                        message =
                            "Invalid email or password.";

                        break;

                    case "auth/invalid-email":

                        message =
                            "Invalid email address.";

                        break;

                    case "auth/too-many-requests":

                        message =
                            "Too many attempts. Please try again later.";

                        break;

                    case "auth/network-request-failed":

                        message =
                            "Network error. Please check your connection.";

                        break;

                    default:

                        if (error.message) {
                            message =
                                error.message;
                        }
                }

                setMessage(
                    "loginMessage",
                    message,
                    "error"
                );

            } finally {

                setButtonLoading(
                    button,
                    false,
                    "",
                    "Login"
                );
            }
        }
    );


// =====================================================
// FORGOT PASSWORD — SEND OTP
// =====================================================

$("sendForgotOtpBtn")
    ?.addEventListener(
        "click",
        async () => {

            clearMessage(
                "forgotMessage"
            );

            const email =
                $("forgotEmail")
                    ?.value
                    .trim()
                    .toLowerCase();

            if (!validEmail(email)) {

                setMessage(
                    "forgotMessage",
                    "Please enter a valid email address.",
                    "error"
                );

                return;
            }

            const button =
                $("sendForgotOtpBtn");

            try {

                setButtonLoading(
                    button,
                    true,
                    "Sending...",
                    "Send OTP"
                );

                const result =
                    await sendEmailOtp(
                        email,
                        "reset"
                    );

                console.log(
                    "Forgot OTP response:",
                    result
                );

                forgotOtpVerified =
                    false;

                forgotOtpEmail =
                    email;

                $("forgotOtpArea")
                    ?.classList
                    .remove("hidden");

                setMessage(
                    "forgotMessage",
                    "OTP has been sent successfully. Please check your email.",
                    "success"
                );

            } catch (error) {

                console.error(
                    "FORGOT OTP ERROR:",
                    error
                );

                setMessage(
                    "forgotMessage",
                    error.message ||
                    "Unable to send OTP.",
                    "error"
                );

            } finally {

                setButtonLoading(
                    button,
                    false,
                    "",
                    "Send OTP"
                );
            }
        }
    );


// =====================================================
// FORGOT PASSWORD — VERIFY OTP
// =====================================================

$("verifyForgotOtpBtn")
    ?.addEventListener(
        "click",
        async () => {

            clearMessage(
                "forgotMessage"
            );

            const email =
                $("forgotEmail")
                    ?.value
                    .trim()
                    .toLowerCase();

            const otp =
                $("forgotOtp")
                    ?.value
                    .trim();

            if (!validEmail(email)) {

                setMessage(
                    "forgotMessage",
                    "Please enter your email first.",
                    "error"
                );

                return;
            }

            if (!validOtp(otp)) {

                setMessage(
                    "forgotMessage",
                    "Enter the 6-digit OTP.",
                    "error"
                );

                return;
            }

            const button =
                $("verifyForgotOtpBtn");

            try {

                setButtonLoading(
                    button,
                    true,
                    "Verifying...",
                    "Verify OTP"
                );

                await verifyEmailOtp(
                    email,
                    otp,
                    "reset"
                );

                forgotOtpVerified =
                    true;

                forgotOtpEmail =
                    email;

                $("newPasswordArea")
                    ?.classList
                    .remove("hidden");

                setMessage(
                    "forgotMessage",
                    "OTP verified successfully. You can now reset your password.",
                    "success"
                );

            } catch (error) {

                console.error(
                    "FORGOT OTP VERIFY ERROR:",
                    error
                );

                forgotOtpVerified =
                    false;

                setMessage(
                    "forgotMessage",
                    error.message ||
                    "OTP verification failed.",
                    "error"
                );

            } finally {

                setButtonLoading(
                    button,
                    false,
                    "",
                    "Verify OTP"
                );
            }
        }
    );


// =====================================================
// RESET PASSWORD
// =====================================================

$("resetPasswordBtn")
    ?.addEventListener(
        "click",
        async () => {

            clearMessage(
                "forgotMessage"
            );

            const email =
                $("forgotEmail")
                    ?.value
                    .trim()
                    .toLowerCase();

            const newPassword =
                $("newPassword")
                    ?.value || "";

            const confirmPassword =
                $("confirmNewPassword")
                    ?.value || "";

            if (
                !forgotOtpVerified ||
                forgotOtpEmail !== email
            ) {

                setMessage(
                    "forgotMessage",
                    "Please verify the OTP first.",
                    "error"
                );

                return;
            }

            if (!validPassword(newPassword)) {

                setMessage(
                    "forgotMessage",
                    "Password must contain at least 8 characters.",
                    "error"
                );

                return;
            }

            if (
                newPassword !==
                confirmPassword
            ) {

                setMessage(
                    "forgotMessage",
                    "Passwords do not match.",
                    "error"
                );

                return;
            }

            const button =
                $("resetPasswordBtn");

            try {

                setButtonLoading(
                    button,
                    true,
                    "Resetting...",
                    "Reset Password"
                );

                await resetPasswordApi(
                    email,
                    newPassword
                );

                forgotOtpVerified =
                    false;

                forgotOtpEmail =
                    "";

                setMessage(
                    "forgotMessage",
                    "Password reset successfully. You can now login.",
                    "success"
                );

                setTimeout(
                    () => {

                        showAuthSection(
                            "loginSection"
                        );

                        if ($("loginEmail")) {
                            $("loginEmail")
                                .value = email;
                        }

                    },
                    1200
                );

            } catch (error) {

                console.error(
                    "RESET PASSWORD ERROR:",
                    error
                );

                setMessage(
                    "forgotMessage",
                    error.message ||
                    "Unable to reset password.",
                    "error"
                );

            } finally {

                setButtonLoading(
                    button,
                    false,
                    "",
                    "Reset Password"
                );
            }
        }
    );


// =====================================================
// DASHBOARD
// =====================================================

async function loadDashboard(user) {

    if (!user) return;

    try {

        const userRef =
            doc(
                db,
                "users",
                user.uid
            );

        const snapshot =
            await getDoc(userRef);

        if (!snapshot.exists()) {

            console.warn(
                "User document not found."
            );

            return;
        }

        const data =
            snapshot.data();

        const storeName =
            data.storeName ||
            data.name ||
            "MedZoneX Store";

        if ($("dashboardStoreName")) {

            $("dashboardStoreName")
                .textContent =
                storeName;
        }

        showPage(
            "dashboardPage"
        );

        startTrialStatus(
            data
        );

    } catch (error) {

        console.error(
            "DASHBOARD ERROR:",
            error
        );

        setMessage(
            "loginMessage",
            "Unable to load your account.",
            "error"
        );
    }
}


// =====================================================
// TRIAL STATUS
// =====================================================

function startTrialStatus(
    userData
) {

    if (trialTimer) {

        clearInterval(
            trialTimer
        );

        trialTimer = null;
    }

    function updateTrial() {

        const statusElement =
            $("trialStatus");

        if (!statusElement) return;

        if (
            userData.subscriptionStatus ===
            "active"
        ) {

            statusElement.textContent =
                "Subscription active";

            return;
        }

        let trialEnd =
            userData.trialEnd;

        if (
            trialEnd &&
            typeof trialEnd.toDate ===
            "function"
        ) {
            trialEnd =
                trialEnd.toDate();
        }

        if (
            !trialEnd
        ) {

            statusElement.textContent =
                "Trial information unavailable";

            return;
        }

        const remaining =
            new Date(trialEnd).getTime() -
            Date.now();

        if (remaining <= 0) {

            statusElement.textContent =
                "Free trial expired";

            return;
        }

        const totalSeconds =
            Math.floor(
                remaining / 1000
            );

        const hours =
            Math.floor(
                totalSeconds / 3600
            );

        const minutes =
            Math.floor(
                (totalSeconds % 3600) / 60
            );

        const seconds =
            totalSeconds % 60;

        statusElement.textContent =
            `Free trial: ${hours}h ${minutes}m ${seconds}s remaining`;
    }

    updateTrial();

    trialTimer =
        setInterval(
            updateTrial,
            1000
        );
}


// =====================================================
// LOGOUT
// =====================================================

$("logoutBtn")
    ?.addEventListener(
        "click",
        async () => {

            try {

                await signOut(auth);

                if (trialTimer) {

                    clearInterval(
                        trialTimer
                    );

                    trialTimer = null;
                }

                showPage(
                    "welcomePage"
                );

            } catch (error) {

                console.error(
                    "LOGOUT ERROR:",
                    error
                );
            }
        }
    );


// =====================================================
// BILLING
// =====================================================

function openBilling() {

    document
        .querySelectorAll(".page")
        .forEach((page) => {
            page.classList.add("hidden");
        });

    const billingPage =
        $("billingPage");

    if (billingPage) {

        billingPage.classList.remove(
            "hidden"
        );

        billingPage.style.display =
            "block";
    }

    if (
        window.MedZoneXBilling &&
        typeof
        window.MedZoneXBilling.loadMedicines ===
        "function"
    ) {

        window.MedZoneXBilling
            .loadMedicines()
            .catch((error) => {

                console.error(
                    "Billing load error:",
                    error
                );
            });
    }
}


// =====================================================
// PURCHASES
// =====================================================

function openPurchases() {

    document
        .querySelectorAll(".page")
        .forEach((page) => {
            page.classList.add("hidden");
        });

    const purchasesPage =
        $("purchasesPage");

    if (purchasesPage) {

        purchasesPage.classList.remove(
            "hidden"
        );

        purchasesPage.style.display =
            "block";
    }

    if (
        window.MedZoneXPurchases &&
        typeof
        window.MedZoneXPurchases.loadSuppliers ===
        "function"
    ) {

        window.MedZoneXPurchases
            .loadSuppliers()
            .catch((error) => {
                console.error(
                    "Purchase load error:",
                    error
                );
            });
    }
}


// =====================================================
// LEGAL MODALS
// =====================================================

function openModal(modalId) {

    const modal =
        $(modalId);

    if (!modal) return;

    modal.classList.remove(
        "hidden"
    );

    modal.style.display =
        "flex";
}


function closeModal(modal) {

    if (!modal) return;

    modal.classList.add(
        "hidden"
    );

    modal.style.display =
        "none";
}


$("welcomeTermsBtn")
    ?.addEventListener(
        "click",
        () => {
            openModal(
                "termsModal"
            );
        }
    );


$("welcomePrivacyBtn")
    ?.addEventListener(
        "click",
        () => {
            openModal(
                "privacyModal"
            );
        }
    );


$("signupTermsBtn")
    ?.addEventListener(
        "click",
        () => {
            openModal(
                "termsModal"
            );
        }
    );


$("signupPrivacyBtn")
    ?.addEventListener(
        "click",
        () => {
            openModal(
                "privacyModal"
            );
        }
    );


document
    .querySelectorAll(
        "[data-close-modal]"
    )
    .forEach((button) => {

        button.addEventListener(
            "click",
            () => {

                const modal =
                    button.closest(
                        ".modal"
                    );

                closeModal(
                    modal
                );
            }
        );
    });


document
    .querySelectorAll(
        ".modal"
    )
    .forEach((modal) => {

        modal.addEventListener(
            "click",
            (event) => {

                if (
                    event.target ===
                    modal
                ) {
                    closeModal(
                        modal
                    );
                }
            }
        );
    });


// =====================================================
// AUTH STATE
// =====================================================

onAuthStateChanged(
    auth,
    async (user) => {

        console.log(
            "Auth state:",
            user
                ? user.email
                : "signed out"
        );

        if (!user) {

            return;
        }

        try {

            await loadDashboard(
                user
            );

        } catch (error) {

            console.error(
                "AUTH STATE ERROR:",
                error
            );
        }
    }
);


// =====================================================
// GLOBAL MEDZONEX OBJECT
// =====================================================

window.MedZoneX = {

    ...(window.MedZoneX || {}),

    auth,

    db,

    apiUrl,

    getCurrentUser() {
        return auth.currentUser;
    },

    showPage,

    showAuthSection,

    openBilling,

    openPurchases,

    openModal,

    closeModal,

    async logout() {

        await signOut(auth);
    },

    checkBackend: async function () {

        return await apiRequest(
            "/api/health"
        );
    },

    trialDuration:
        TRIAL_DURATION_MS
};


// =====================================================
// INITIAL PAGE
// =====================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        console.log(
            "MedZoneX app initialized."
        );

        /*
         * Do not force login here.
         * Firebase onAuthStateChanged()
         * handles the current session.
         */
    }
);