// =====================================================
// MEDZONEX APP.JS
// =====================================================

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
    "Firebase initialized:",
    firebaseApp.options.projectId
);


// =====================================================
// BACKEND
// =====================================================

const API_BASE_URL =
    (
        location.hostname === "localhost" ||
        location.hostname === "127.0.0.1"
    )
        ? "http://localhost:5000"
        : "https://medzonex-backend.onrender.com";


const API_TIMEOUT_MS = 20000;

const TRIAL_DURATION_MS =
    48 * 60 * 60 * 1000;


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

    console.log(
        "Opening page:",
        pageId
    );

    const pages =
        document.querySelectorAll(
            ".app-page"
        );

    pages.forEach((page) => {

        page.classList.remove("active");

        page.style.display = "none";
    });


    const target =
        document.getElementById(pageId);


    if (!target) {

        console.error(
            "Page not found:",
            pageId
        );

        return false;
    }


    target.classList.add("active");

    target.style.display = "flex";


    console.log(
        "Page opened:",
        pageId
    );

    return true;
}


// =====================================================
// AUTH SECTION NAVIGATION
// IMPORTANT:
// HTML USES .auth-section
// =====================================================

function showAuthSection(sectionId) {

    console.log(
        "Opening auth section:",
        sectionId
    );


    const sections =
        document.querySelectorAll(
            ".auth-section"
        );


    sections.forEach((section) => {

        section.style.display = "none";

        section.classList.remove("active");
    });


    const section =
        document.getElementById(sectionId);


    if (!section) {

        console.error(
            "Auth section not found:",
            sectionId
        );

        return false;
    }


    section.style.display = "block";

    section.classList.add("active");


    return true;
}


// =====================================================
// GET STARTED
// =====================================================

function openGetStarted() {

    console.log(
        "Get Started clicked"
    );


    const opened =
        showPage("authPage");


    if (!opened) {
        return;
    }


    showAuthSection(
        "loginSection"
    );


    clearMessage(
        "loginMessage"
    );

    clearMessage(
        "signupMessage"
    );

    clearMessage(
        "forgotMessage"
    );
}


// =====================================================
// AUTH NAVIGATION
// =====================================================

function openSignup() {

    showPage("authPage");

    showAuthSection(
        "signupSection"
    );

    clearMessage(
        "signupMessage"
    );
}


function openLogin() {

    showPage("authPage");

    showAuthSection(
        "loginSection"
    );

    clearMessage(
        "loginMessage"
    );
}


function openForgotPassword() {

    showPage("authPage");

    showAuthSection(
        "forgotSection"
    );

    clearMessage(
        "forgotMessage"
    );
}


// =====================================================
// MESSAGE
// =====================================================

function setMessage(
    elementId,
    message,
    type = "info"
) {

    const element =
        $(elementId);


    if (!element) {

        console.warn(
            "Message element not found:",
            elementId
        );

        return;
    }


    element.textContent =
        message;


    element.className =
        `form-message ${type}`;
}


function clearMessage(elementId) {

    const element =
        $(elementId);


    if (!element) {
        return;
    }


    element.textContent = "";

    element.className =
        "form-message";
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

    if (!button) {
        return;
    }


    if (loading) {

        if (!button.dataset.originalText) {

            button.dataset.originalText =
                button.textContent.trim();
        }


        button.textContent =
            loadingText;


        button.disabled = true;

        button.classList.add(
            "loading"
        );

    } else {

        button.textContent =
            normalText ||
            button.dataset.originalText ||
            button.textContent;


        button.disabled = false;

        button.classList.remove(
            "loading"
        );
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
            () => {
                controller.abort();
            },
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

        console.error(
            "API ERROR:",
            error
        );


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

    return apiRequest(
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

    return apiRequest(
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
                    otp
                        .trim(),

                purpose
            })
        }
    );
}


// =====================================================
// RESET PASSWORD API
// =====================================================

async function resetPasswordApi(
    email,
    newPassword
) {

    return apiRequest(
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
// SIGNUP — SEND OTP
// =====================================================

async function handleSignupSendOtp() {

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
            "Signup OTP:",
            result
        );


        signupOtpVerified =
            false;


        signupOtpEmail =
            email;


        const otpArea =
            $("signupOtpArea");


        if (otpArea) {

            otpArea.style.display =
                "block";

            otpArea.classList.remove(
                "hidden"
            );
        }


        const status =
            $("signupOtpStatus");


        if (status) {

            status.textContent =
                "OTP sent. Check your email.";
        }


        setMessage(
            "signupMessage",
            "OTP sent successfully. Please check your email.",
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


// =====================================================
// SIGNUP — VERIFY OTP
// =====================================================

async function handleSignupVerifyOtp() {

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
            "Verify Email"
        );


        await verifyEmailOtp(
            email,
            otp,
            "signup"
        );


        signupOtpVerified =
            true;


        signupOtpEmail =
            email;


        const status =
            $("signupOtpStatus");


        if (status) {

            status.textContent =
                "✓ Email verified successfully";
        }


        setMessage(
            "signupMessage",
            "Email verified successfully.",
            "success"
        );


    } catch (error) {

        console.error(
            "SIGNUP VERIFY ERROR:",
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
            "Verify Email"
        );
    }
}


// =====================================================
// CREATE ACCOUNT
// =====================================================

async function handleSignup() {

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
            ?.value ||
        "";


    const confirmPassword =
        $("signupConfirmPassword")
            ?.value ||
        "";


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

                loadDashboard(
                    user
                );

            },
            500
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
                    "Password must contain at least 8 characters.";

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


// =====================================================
// LOGIN
// =====================================================

async function handleLogin() {

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
            ?.value ||
        "";


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
                    "Network error. Please check your internet connection.";

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


// =====================================================
// FORGOT PASSWORD — SEND OTP
// =====================================================

async function handleForgotSendOtp() {

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


        await sendEmailOtp(
            email,
            "reset"
        );


        forgotOtpVerified =
            false;


        forgotOtpEmail =
            email;


        const otpArea =
            $("forgotOtpArea");


        if (otpArea) {

            otpArea.style.display =
                "block";

            otpArea.classList.remove(
                "hidden"
            );
        }


        setMessage(
            "forgotMessage",
            "OTP sent successfully. Please check your email.",
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


// =====================================================
// FORGOT PASSWORD — VERIFY OTP
// =====================================================

async function handleForgotVerifyOtp() {

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


        const passwordArea =
            $("newPasswordArea");


        if (passwordArea) {

            passwordArea.style.display =
                "block";

            passwordArea.classList.remove(
                "hidden"
            );
        }


        setMessage(
            "forgotMessage",
            "OTP verified successfully. You can now reset your password.",
            "success"
        );


    } catch (error) {

        console.error(
            "FORGOT VERIFY ERROR:",
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


// =====================================================
// RESET PASSWORD
// =====================================================

async function handleResetPassword() {

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
            ?.value ||
        "";


    const confirmPassword =
        $("confirmNewPassword")
            ?.value ||
        "";


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
                        .value =
                        email;
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


// =====================================================
// DASHBOARD
// =====================================================

async function loadDashboard(user) {

    if (!user) {
        return;
    }


    try {

        const userRef =
            doc(
                db,
                "users",
                user.uid
            );


        const snapshot =
            await getDoc(
                userRef
            );


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


        if (!statusElement) {
            return;
        }


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


        if (!trialEnd) {

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

async function handleLogout() {

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


        showAuthSection(
            "loginSection"
        );


    } catch (error) {

        console.error(
            "LOGOUT ERROR:",
            error
        );
    }
}


// =====================================================
// BILLING
// =====================================================

function openBilling() {

    console.log(
        "Opening billing"
    );


    showPage(
        "billingPage"
    );


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

    console.log(
        "Opening purchases"
    );


    showPage(
        "purchasePage"
    );


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
// MODALS
// =====================================================

function openModal(modalId) {

    const modal =
        $(modalId);


    if (!modal) {

        console.warn(
            "Modal not found:",
            modalId
        );

        return;
    }


    modal.style.display =
        "flex";


    modal.classList.remove(
        "hidden"
    );
}


function closeModal(modal) {

    if (!modal) {
        return;
    }


    modal.style.display =
        "none";


    modal.classList.add(
        "hidden"
    );
}


// =====================================================
// EVENT LISTENERS
// =====================================================

// GET STARTED

const getStartedBtn =
    $("getStartedBtn");


if (getStartedBtn) {

    getStartedBtn.addEventListener(
        "click",
        openGetStarted
    );

} else {

    console.error(
        "getStartedBtn not found"
    );
}


// SIGNUP

$("showSignupBtn")
    ?.addEventListener(
        "click",
        openSignup
    );


// LOGIN FROM SIGNUP

$("showLoginFromSignupBtn")
    ?.addEventListener(
        "click",
        openLogin
    );


// FORGOT PASSWORD

$("showForgotBtn")
    ?.addEventListener(
        "click",
        openForgotPassword
    );


// BACK TO LOGIN

$("backToLoginBtn")
    ?.addEventListener(
        "click",
        openLogin
    );


// SEND SIGNUP OTP

$("sendSignupOtpBtn")
    ?.addEventListener(
        "click",
        handleSignupSendOtp
    );


// VERIFY SIGNUP OTP

$("verifySignupOtpBtn")
    ?.addEventListener(
        "click",
        handleSignupVerifyOtp
    );


// CREATE ACCOUNT

$("signupBtn")
    ?.addEventListener(
        "click",
        handleSignup
    );


// LOGIN

$("loginBtn")
    ?.addEventListener(
        "click",
        handleLogin
    );


// SEND FORGOT OTP

$("sendForgotOtpBtn")
    ?.addEventListener(
        "click",
        handleForgotSendOtp
    );


// VERIFY FORGOT OTP

$("verifyForgotOtpBtn")
    ?.addEventListener(
        "click",
        handleForgotVerifyOtp
    );


// RESET PASSWORD

$("resetPasswordBtn")
    ?.addEventListener(
        "click",
        handleResetPassword
    );


// LOGOUT

$("logoutBtn")
    ?.addEventListener(
        "click",
        handleLogout
    );


// =====================================================
// LEGAL MODALS
// =====================================================

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


// CLOSE MODAL

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


// CLICK OUTSIDE MODAL

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
// FIREBASE AUTH STATE
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

    openGetStarted,

    openSignup,

    openLogin,

    openForgotPassword,

    openBilling,

    openPurchases,

    openModal,

    closeModal,


    async logout() {

        await signOut(auth);
    },


    async checkBackend() {

        return apiRequest(
            "/api/health"
        );
    },


    trialDuration:
        TRIAL_DURATION_MS
};


// =====================================================
// INITIALIZATION
// =====================================================

console.log(
    "MedZoneX app.js loaded successfully."
);

console.log(
    "Get Started element:",
    $("getStartedBtn")
);

console.log(
    "Auth page:",
    $("authPage")
);

console.log(
    "Login section:",
    $("loginSection")
);

console.log(
    "Signup section:",
    $("signupSection")
);