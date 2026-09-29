/* =========================================================
   MEDZONEX
   MAIN APPLICATION
   ========================================================= */

import {
    auth,
    db
} from "./firebase.js";

import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    updateProfile,
    updatePassword
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";


/* =========================================================
   CONFIG
   ========================================================= */

const API_BASE_URL =
    (
        location.hostname === "localhost" ||
        location.hostname === "127.0.0.1"
    )
        ? "http://localhost:5000"
        : "https://medzonex-backend.onrender.com";


const TRIAL_DURATION_MS =
    48 * 60 * 60 * 1000;


/* =========================================================
   HELPERS
   ========================================================= */

const $ = (id) =>
    document.getElementById(id);


function apiUrl(path) {

    return `${API_BASE_URL}${path}`;

}


function setMessage(
    id,
    message = "",
    type = ""
) {

    const element = $(id);

    if (!element) return;

    element.textContent = message;

    element.className = "form-message";

    if (type) {
        element.classList.add(type);
    }

}


function clearMessage(id) {

    setMessage(id, "");

}


function showElement(
    id,
    display = "block"
) {

    const element = $(id);

    if (!element) return;

    element.style.display = display;

}


function hideElement(id) {

    const element = $(id);

    if (!element) return;

    element.style.display = "none";

}


/* =========================================================
   PAGE NAVIGATION
   ========================================================= */

function showPage(pageId) {

    const pages =
        document.querySelectorAll(".app-page");


    pages.forEach((page) => {

        page.classList.remove("active");

        page.style.display = "none";

    });


    const target =
        $(pageId);


    if (!target) {

        console.error(
            `MedZoneX: Page not found: ${pageId}`
        );

        return false;

    }


    target.classList.add("active");

    target.style.display = "flex";


    return true;

}


/* =========================================================
   AUTH SECTION NAVIGATION
   ========================================================= */

function showAuthSection(sectionId) {

    const sections =
        document.querySelectorAll(".auth-section");


    sections.forEach((section) => {

        section.classList.remove("active");

        section.style.display = "none";

    });


    const section =
        $(sectionId);


    if (!section) {

        console.error(
            `MedZoneX: Auth section not found: ${sectionId}`
        );

        return false;

    }


    section.classList.add("active");

    section.style.display = "block";


    return true;

}


/* =========================================================
   GET STARTED
   ========================================================= */

function openGetStarted() {

    console.log(
        "MedZoneX: Get Started clicked"
    );


    showPage("authPage");

    showAuthSection("signupSection");


    clearMessage("signupMessage");

}


const getStartedBtn =
    $("getStartedBtn");


if (getStartedBtn) {

    getStartedBtn.addEventListener(
        "click",
        openGetStarted
    );

}


/* =========================================================
   LOGIN / SIGNUP / FORGOT NAVIGATION
   ========================================================= */

$("showSignupBtn")?.addEventListener(
    "click",
    () => {

        showPage("authPage");

        showAuthSection("signupSection");

        clearMessage("signupMessage");

    }
);


$("showLoginFromSignupBtn")?.addEventListener(
    "click",
    () => {

        showPage("authPage");

        showAuthSection("loginSection");

        clearMessage("loginMessage");

    }
);


$("showForgotBtn")?.addEventListener(
    "click",
    () => {

        showPage("authPage");

        showAuthSection("forgotSection");

        clearMessage("forgotMessage");

    }
);


$("backToLoginBtn")?.addEventListener(
    "click",
    () => {

        showPage("authPage");

        showAuthSection("loginSection");

        clearMessage("loginMessage");

    }
);


/* =========================================================
   SEND EMAIL OTP
   ========================================================= */

async function sendEmailOtp(
    email,
    purpose
) {

    const response =
        await fetch(
            apiUrl("/api/auth/send-email-otp"),
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    email,
                    purpose
                })
            }
        );


    const data =
        await response.json()
            .catch(() => ({}));


    if (!response.ok) {

        throw new Error(
            data.message ||
            "Unable to send OTP."
        );

    }


    return data;

}


/* =========================================================
   VERIFY EMAIL OTP
   ========================================================= */

async function verifyEmailOtp(
    email,
    otp,
    purpose
) {

    const response =
        await fetch(
            apiUrl("/api/auth/verify-email-otp"),
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    email,
                    otp,
                    purpose
                })
            }
        );


    const data =
        await response.json()
            .catch(() => ({}));


    if (!response.ok) {

        throw new Error(
            data.message ||
            "Invalid or expired OTP."
        );

    }


    return data;

}


/* =========================================================
   SIGNUP OTP
   ========================================================= */

let signupEmailVerified = false;


$("sendSignupOtpBtn")?.addEventListener(
    "click",
    async () => {

        const email =
            $("signupEmail")?.value
                .trim()
                .toLowerCase();


        if (!email) {

            setMessage(
                "signupMessage",
                "Please enter your email.",
                "error"
            );

            return;

        }


        try {

            $("sendSignupOtpBtn").disabled =
                true;


            setMessage(
                "signupMessage",
                "Sending OTP..."
            );


            await sendEmailOtp(
                email,
                "signup"
            );


            signupEmailVerified =
                false;


            showElement(
                "signupOtpArea",
                "block"
            );


            setMessage(
                "signupMessage",
                "OTP sent to your email.",
                "success"
            );


            if ($("signupOtpStatus")) {

                $("signupOtpStatus")
                    .textContent =
                    "Enter the OTP sent to your email.";

            }


        } catch (error) {

            console.error(error);


            setMessage(
                "signupMessage",
                error.message ||
                "Failed to send OTP.",
                "error"
            );


        } finally {

            $("sendSignupOtpBtn").disabled =
                false;

        }

    }
);


/* =========================================================
   VERIFY SIGNUP OTP
   ========================================================= */

$("verifySignupOtpBtn")?.addEventListener(
    "click",
    async () => {

        const email =
            $("signupEmail")?.value
                .trim()
                .toLowerCase();

        const otp =
            $("signupOtp")?.value
                .trim();


        if (!email || !otp) {

            setMessage(
                "signupMessage",
                "Enter your email and OTP.",
                "error"
            );

            return;

        }


        try {

            $("verifySignupOtpBtn").disabled =
                true;


            if ($("signupOtpStatus")) {

                $("signupOtpStatus")
                    .textContent =
                    "Verifying OTP...";

            }


            await verifyEmailOtp(
                email,
                otp,
                "signup"
            );


            signupEmailVerified =
                true;


            if ($("signupOtpStatus")) {

                $("signupOtpStatus")
                    .textContent =
                    "Email verified successfully.";

                $("signupOtpStatus")
                    .className =
                    "success";

            }


            setMessage(
                "signupMessage",
                "Email verified. You can create your account now.",
                "success"
            );


        } catch (error) {

            console.error(error);


            signupEmailVerified =
                false;


            if ($("signupOtpStatus")) {

                $("signupOtpStatus")
                    .textContent =
                    error.message ||
                    "Invalid OTP.";

                $("signupOtpStatus")
                    .className =
                    "error";

            }


        } finally {

            $("verifySignupOtpBtn").disabled =
                false;

        }

    }
);


/* =========================================================
   SIGNUP
   ========================================================= */

$("signupForm")?.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();


        const storeName =
            $("storeName")?.value
                .trim();

        const email =
            $("signupEmail")?.value
                .trim()
                .toLowerCase();

        const password =
            $("signupPassword")?.value;

        const confirmPassword =
            $("signupConfirmPassword")?.value;

        const termsAccepted =
            $("signupTerms")?.checked;


        if (
            !storeName ||
            !email ||
            !password ||
            !confirmPassword
        ) {

            setMessage(
                "signupMessage",
                "All fields are required.",
                "error"
            );

            return;

        }


        if (!signupEmailVerified) {

            setMessage(
                "signupMessage",
                "Please verify your email with OTP first.",
                "error"
            );

            return;

        }


        if (password.length < 6) {

            setMessage(
                "signupMessage",
                "Password must contain at least 6 characters.",
                "error"
            );

            return;

        }


        if (password !== confirmPassword) {

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
                "Please accept the Terms & Conditions and Privacy Policy.",
                "error"
            );

            return;

        }


        try {

            $("signupBtn").disabled =
                true;


            setMessage(
                "signupMessage",
                "Creating your account..."
            );


            const credential =
                await createUserWithEmailAndPassword(
                    auth,
                    email,
                    password
                );


            const user =
                credential.user;


            await updateProfile(
                user,
                {
                    displayName:
                        storeName
                }
            );


            const trialStart =
                Date.now();


            const trialEnd =
                trialStart +
                TRIAL_DURATION_MS;


            await setDoc(
                doc(
                    db,
                    "users",
                    user.uid
                ),
                {
                    uid: user.uid,

                    email: email,

                    storeName: storeName,

                    trialStart:
                        trialStart,

                    trialExpiresAt:
                        trialEnd,

                    createdAt:
                        serverTimestamp(),

                    subscriptionStatus:
                        "trial"
                },
                {
                    merge: true
                }
            );


            setMessage(
                "signupMessage",
                "Account created successfully. Opening dashboard...",
                "success"
            );


            setTimeout(
                () => {

                    loadDashboard(user);

                },
                700
            );


        } catch (error) {

            console.error(error);


            let message =
                "Unable to create account.";


            if (
                error.code ===
                "auth/email-already-in-use"
            ) {

                message =
                    "This email is already registered.";

            }


            if (
                error.code ===
                "auth/invalid-email"
            ) {

                message =
                    "Please enter a valid email address.";

            }


            if (
                error.code ===
                "auth/weak-password"
            ) {

                message =
                    "Password is too weak.";

            }


            setMessage(
                "signupMessage",
                message,
                "error"
            );


        } finally {

            $("signupBtn").disabled =
                false;

        }

    }
);


/* =========================================================
   LOGIN
   ========================================================= */

$("loginForm")?.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();


        const email =
            $("loginEmail")?.value
                .trim()
                .toLowerCase();

        const password =
            $("loginPassword")?.value;


        if (!email || !password) {

            setMessage(
                "loginMessage",
                "All fields are required.",
                "error"
            );

            return;

        }


        try {

            $("loginBtn").disabled =
                true;


            setMessage(
                "loginMessage",
                "Logging in..."
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

            console.error(error);


            let message =
                "Unable to login.";


            if (
                error.code ===
                "auth/invalid-credential"
            ) {

                message =
                    "Invalid email or password.";

            }


            if (
                error.code ===
                "auth/user-not-found"
            ) {

                message =
                    "Account not found.";

            }


            if (
                error.code ===
                "auth/wrong-password"
            ) {

                message =
                    "Invalid email or password.";

            }


            setMessage(
                "loginMessage",
                message,
                "error"
            );


        } finally {

            $("loginBtn").disabled =
                false;

        }

    }
);


/* =========================================================
   FORGOT PASSWORD OTP
   ========================================================= */

let forgotEmailVerified = false;


$("sendForgotOtpBtn")?.addEventListener(
    "click",
    async () => {

        const email =
            $("forgotEmail")?.value
                .trim()
                .toLowerCase();


        if (!email) {

            setMessage(
                "forgotMessage",
                "Please enter your email.",
                "error"
            );

            return;

        }


        try {

            $("sendForgotOtpBtn").disabled =
                true;


            setMessage(
                "forgotMessage",
                "Sending OTP..."
            );


            await sendEmailOtp(
                email,
                "forgot-password"
            );


            forgotEmailVerified =
                false;


            showElement(
                "forgotOtpArea",
                "block"
            );


            setMessage(
                "forgotMessage",
                "OTP sent to your email.",
                "success"
            );


        } catch (error) {

            console.error(error);


            setMessage(
                "forgotMessage",
                error.message ||
                "Unable to send OTP.",
                "error"
            );


        } finally {

            $("sendForgotOtpBtn").disabled =
                false;

        }

    }
);


/* =========================================================
   VERIFY FORGOT OTP
   ========================================================= */

$("verifyForgotOtpBtn")?.addEventListener(
    "click",
    async () => {

        const email =
            $("forgotEmail")?.value
                .trim()
                .toLowerCase();

        const otp =
            $("forgotOtp")?.value
                .trim();


        if (!email || !otp) {

            setMessage(
                "forgotMessage",
                "Enter your email and OTP.",
                "error"
            );

            return;

        }


        try {

            $("verifyForgotOtpBtn").disabled =
                true;


            if ($("forgotOtpStatus")) {

                $("forgotOtpStatus")
                    .textContent =
                    "Verifying OTP...";

            }


            await verifyEmailOtp(
                email,
                otp,
                "forgot-password"
            );


            forgotEmailVerified =
                true;


            if ($("forgotOtpStatus")) {

                $("forgotOtpStatus")
                    .textContent =
                    "Email verified successfully.";

                $("forgotOtpStatus")
                    .className =
                    "success";

            }


            showElement(
                "newPasswordArea",
                "block"
            );


            setMessage(
                "forgotMessage",
                "OTP verified. Create your new password.",
                "success"
            );


        } catch (error) {

            console.error(error);


            forgotEmailVerified =
                false;


            if ($("forgotOtpStatus")) {

                $("forgotOtpStatus")
                    .textContent =
                    error.message ||
                    "Invalid OTP.";

                $("forgotOtpStatus")
                    .className =
                    "error";

            }


        } finally {

            $("verifyForgotOtpBtn").disabled =
                false;

        }

    }
);


/* =========================================================
   RESET PASSWORD
   ========================================================= */

$("resetPasswordBtn")?.addEventListener(
    "click",
    async () => {

        const email =
            $("forgotEmail")?.value
                .trim()
                .toLowerCase();

        const newPassword =
            $("newPassword")?.value;

        const confirmPassword =
            $("confirmNewPassword")?.value;


        if (!forgotEmailVerified) {

            setMessage(
                "forgotMessage",
                "Please verify your email first.",
                "error"
            );

            return;

        }


        if (
            !newPassword ||
            !confirmPassword
        ) {

            setMessage(
                "forgotMessage",
                "Both password fields are required.",
                "error"
            );

            return;

        }


        if (newPassword.length < 6) {

            setMessage(
                "forgotMessage",
                "Password must contain at least 6 characters.",
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


        try {

            $("resetPasswordBtn").disabled =
                true;


            setMessage(
                "forgotMessage",
                "Changing password..."
            );


            const response =
                await fetch(
                    apiUrl("/api/auth/reset-password"),
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({
                            email,
                            newPassword
                        })
                    }
                );


            const data =
                await response.json()
                    .catch(() => ({}));


            if (!response.ok) {

                throw new Error(
                    data.message ||
                    "Unable to reset password."
                );

            }


            setMessage(
                "forgotMessage",
                "Password changed successfully. You can now login.",
                "success"
            );


            setTimeout(
                () => {

                    showPage("authPage");

                    showAuthSection(
                        "loginSection"
                    );

                    if ($("loginEmail")) {

                        $("loginEmail").value =
                            email;

                    }

                    if ($("loginPassword")) {

                        $("loginPassword").value =
                            "";

                    }

                    clearMessage(
                        "forgotMessage"
                    );

                },
                1200
            );


        } catch (error) {

            console.error(error);


            setMessage(
                "forgotMessage",
                error.message ||
                "Unable to reset password.",
                "error"
            );


        } finally {

            $("resetPasswordBtn").disabled =
                false;

        }

    }
);


/* =========================================================
   DASHBOARD
   ========================================================= */

async function loadDashboard(user) {

    if (!user) return;


    let userData = {};


    try {

        const snapshot =
            await getDoc(
                doc(
                    db,
                    "users",
                    user.uid
                )
            );


        if (snapshot.exists()) {

            userData =
                snapshot.data();

        }

    } catch (error) {

        console.error(
            "Unable to load user data:",
            error
        );

    }


    const storeName =
        userData.storeName ||
        user.displayName ||
        "Pharmacy";


    if ($("dashboardStoreName")) {

        $("dashboardStoreName")
            .textContent =
            storeName;

    }


    showPage("dashboardPage");


    updateTrialStatus(
        userData
    );

}


/* =========================================================
   TRIAL
   ========================================================= */

let trialTimer = null;


function updateTrialStatus(
    userData
) {

    if (trialTimer) {

        clearInterval(trialTimer);

        trialTimer = null;

    }


    const status =
        $("trialStatus");


    if (!status) return;


    let expiresAt =
        Number(
            userData?.trialExpiresAt || 0
        );


    /*
       Existing accounts without a trial date
       get a 48-hour trial starting now.
    */

    if (!expiresAt) {

        expiresAt =
            Date.now() +
            TRIAL_DURATION_MS;

    }


    function update() {

        const remaining =
            expiresAt -
            Date.now();


        if (remaining <= 0) {

            status.textContent =
                "Trial expired";

            status.className =
                "warning";


            if (trialTimer) {

                clearInterval(trialTimer);

                trialTimer = null;

            }


            return;

        }


        const totalSeconds =
            Math.floor(
                remaining / 1000
            );


        const days =
            Math.floor(
                totalSeconds / 86400
            );

        const hours =
            Math.floor(
                (totalSeconds % 86400) /
                3600
            );

        const minutes =
            Math.floor(
                (totalSeconds % 3600) /
                60
            );


        status.textContent =
            `Free Trial: ${days}d ${hours}h ${minutes}m`;

    }


    update();


    trialTimer =
        setInterval(
            update,
            60000
        );

}


/* =========================================================
   LOGOUT
   ========================================================= */

$("logoutBtn")?.addEventListener(
    "click",
    async () => {

        try {

            await signOut(auth);


            showPage(
                "welcomePage"
            );


        } catch (error) {

            console.error(
                "Logout failed:",
                error
            );

        }

    }
);


/* =========================================================
   BILLING
   ========================================================= */

function openBilling() {

    showPage("billingPage");


    clearMessage(
        "billingMessage"
    );


    /*
       Existing billing.js can handle
       additional billing functionality.
    */

    if (
        window.MedZoneXBilling &&
        typeof
        window.MedZoneXBilling.loadBilling
        === "function"
    ) {

        window.MedZoneXBilling
            .loadBilling();

    }

}


function closeBilling() {

    showPage("dashboardPage");

}


$("billingDashboardBtn")?.addEventListener(
    "click",
    openBilling
);


$("closeBillingBtn")?.addEventListener(
    "click",
    closeBilling
);


$("billingPayBtn")?.addEventListener(
    "click",
    () => {

        showPage("paymentPage");

    }
);


/* =========================================================
   INVENTORY
   ========================================================= */

function openInventory() {

    showPage("inventoryPage");


    if (
        window.MedZoneXInventory &&
        typeof
        window.MedZoneXInventory.loadInventory
        === "function"
    ) {

        window.MedZoneXInventory
            .loadInventory();

    }

}


$("inventoryDashboardBtn")?.addEventListener(
    "click",
    openInventory
);


$("closeInventoryBtn")?.addEventListener(
    "click",
    () => {

        showPage("dashboardPage");

    }
);


/* =========================================================
   PURCHASES
   ========================================================= */

function openPurchases() {

    /*
       IMPORTANT:
       HTML uses purchasePage,
       not purchasesPage.
    */

    showPage("purchasePage");


    if (
        window.MedZoneXPurchases &&
        typeof
        window.MedZoneXPurchases.loadPurchases
        === "function"
    ) {

        window.MedZoneXPurchases
            .loadPurchases();

    }

}


$("purchaseDashboardBtn")?.addEventListener(
    "click",
    openPurchases
);


$("closePurchaseBtn")?.addEventListener(
    "click",
    () => {

        showPage("dashboardPage");

    }
);


/* =========================================================
   PAYMENT
   ========================================================= */

$("paymentBackBtn")?.addEventListener(
    "click",
    () => {

        showPage("dashboardPage");

    }
);


$("paymentBtn")?.addEventListener(
    "click",
    () => {

        /*
           Keep payment integration here.
           Razorpay/payment module can attach
           its own logic to this button.
        */

        if (
            window.MedZoneXBilling &&
            typeof
            window.MedZoneXBilling.openPayment
            === "function"
        ) {

            window.MedZoneXBilling
                .openPayment();

        } else {

            setMessage(
                "billingMessage",
                "Payment system is not available yet.",
                "warning"
            );

        }

    }
);


/* =========================================================
   LEGAL MODALS
   ========================================================= */

function openModal(id) {

    const modal =
        $(id);

    if (!modal) return;

    modal.style.display =
        "flex";

}


function closeModal(id) {

    const modal =
        $(id);

    if (!modal) return;

    modal.style.display =
        "none";

}


$("signupTermsLink")?.addEventListener(
    "click",
    (event) => {

        event.preventDefault();

        openModal("termsModal");

    }
);


$("signupPrivacyLink")?.addEventListener(
    "click",
    (event) => {

        event.preventDefault();

        openModal("privacyModal");

    }
);


document
    .querySelectorAll(
        "[data-close-modal]"
    )
    .forEach(
        (button) => {

            button.addEventListener(
                "click",
                () => {

                    closeModal(
                        button.dataset.closeModal
                    );

                }
            );

        }
    );


document
    .querySelectorAll(".modal")
    .forEach(
        (modal) => {

            modal.addEventListener(
                "click",
                (event) => {

                    if (
                        event.target === modal
                    ) {

                        modal.style.display =
                            "none";

                    }

                }
            );

        }
    );


/* =========================================================
   FIREBASE AUTH STATE
   ========================================================= */

onAuthStateChanged(
    auth,
    async (user) => {

        if (user) {

            console.log(
                "MedZoneX: User logged in:",
                user.email
            );


            await loadDashboard(
                user
            );

        } else {

            console.log(
                "MedZoneX: User signed out"
            );


            showPage(
                "welcomePage"
            );

        }

    }
);


/* =========================================================
   GLOBAL API
   ========================================================= */

window.MedZoneX = {

    auth,

    db,

    apiUrl,

    showPage,

    showAuthSection,

    openGetStarted,

    openBilling,

    closeBilling,

    openInventory,

    openPurchases,

    getCurrentUser: () =>
        auth.currentUser

};


console.log(
    "MedZoneX application loaded."
);

console.log(
    "API:",
    API_BASE_URL
);