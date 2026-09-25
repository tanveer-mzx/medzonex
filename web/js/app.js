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

    apiKey:
        "AIzaSyBlu8NE_YftR8waBycLoXnpDcdxL9whECw",

    authDomain:
        "data-2c37b.firebaseapp.com",

    projectId:
        "data-2c37b",

    storageBucket:
        "data-2c37b.firebasestorage.app",

    messagingSenderId:
        "117351129570",

    appId:
        "1:117351129570:web:cc7e045aa33730f29d59bb",

    measurementId:
        "G-PMPDHJ6PJL"
};


// =====================================================
// FIREBASE INITIALIZE
// =====================================================

const firebaseApp =
    initializeApp(firebaseConfig);

const auth =
    getAuth(firebaseApp);

const db =
    getFirestore(firebaseApp);


// =====================================================
// API BASE URL
// =====================================================

/*
    LOCAL TEST:

    Website opened through local development:
        http://localhost/...
    Backend:
        http://localhost:5000

    LIVE:

    https://medzonex.site

    If Firebase Hosting is configured to forward
    /api/** to your Node backend, use:
        /api
*/

const savedApiBase =
    localStorage.getItem(
        "MedZoneX_API_BASE_URL"
    );


let API_BASE_URL;

if (savedApiBase) {

    API_BASE_URL =
        savedApiBase.replace(/\/+$/, "");

} else if (
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1"
) {

    API_BASE_URL =
        "http://localhost:5000";

} else {

    /*
        Production same-domain API.

        This requires your hosting/reverse proxy
        to forward /api requests to Node backend.
    */

    API_BASE_URL = "";

}


// =====================================================
// API HELPER
// =====================================================

function apiUrl(path) {

    if (!path.startsWith("/")) {
        path = "/" + path;
    }

    return `${API_BASE_URL}${path}`;
}


// =====================================================
// TRIAL
// =====================================================

const TRIAL_DURATION_MS =
    48 * 60 * 60 * 1000;


// =====================================================
// STATE
// =====================================================

let signupOtpVerified = false;

let signupOtpEmail = "";

let forgotOtpVerified = false;

let forgotOtpEmail = "";


// =====================================================
// DOM HELPERS
// =====================================================

function $(id) {
    return document.getElementById(id);
}


function showPage(pageId) {

    document
        .querySelectorAll(".page")
        .forEach((page) => {

            page.classList.add("hidden");

        });


    const page =
        $(pageId);

    if (page) {

        page.classList.remove("hidden");

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });

    }

}


function showAuthSection(sectionId) {

    document
        .querySelectorAll(".form-section")
        .forEach((section) => {

            section.classList.remove("active");

        });


    const section =
        $(sectionId);

    if (section) {

        section.classList.add("active");

    }

}


function setMessage(
    elementId,
    message,
    type = "info"
) {

    const element =
        $(elementId);

    if (!element) return;

    element.textContent =
        message;

    element.className =
        `message ${type}`;

}


function clearMessage(elementId) {

    const element =
        $(elementId);

    if (!element) return;

    element.textContent = "";

    element.className =
        "message";

}


function setButtonLoading(
    button,
    loading,
    loadingText,
    normalText
) {

    if (!button) return;

    if (loading) {

        button.dataset.originalText =
            button.textContent;

        button.textContent =
            loadingText;

        button.classList.add(
            "loading"
        );

    } else {

        button.textContent =
            normalText ||
            button.dataset.originalText ||
            button.textContent;

        button.classList.remove(
            "loading"
        );

    }

}


// =====================================================
// EMAIL VALIDATION
// =====================================================

function validEmail(email) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        .test(
            String(email || "")
                .trim()
                .toLowerCase()
        );

}


// =====================================================
// PASSWORD VALIDATION
// =====================================================

function validPassword(password) {

    return (
        typeof password === "string" &&
        password.length >= 8
    );

}


// =====================================================
// OTP VALIDATION
// =====================================================

function validOtp(otp) {

    return /^\d{6}$/.test(
        String(otp || "").trim()
    );

}


// =====================================================
// SEND OTP API
// =====================================================

async function sendEmailOtp(
    email,
    purpose
) {

    const response =
        await fetch(
            apiUrl(
                "/api/auth/send-email-otp"
            ),
            {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({

                    email:
                        email.trim().toLowerCase(),

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


// =====================================================
// VERIFY OTP API
// =====================================================

async function verifyEmailOtp(
    email,
    otp,
    purpose
) {

    const response =
        await fetch(
            apiUrl(
                "/api/auth/verify-email-otp"
            ),
            {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({

                    email:
                        email.trim().toLowerCase(),

                    otp:
                        otp.trim(),

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
            "OTP verification failed."
        );

    }


    return data;

}


// =====================================================
// RESET PASSWORD API
// =====================================================

async function resetPasswordApi(
    email,
    newPassword
) {

    const response =
        await fetch(
            apiUrl(
                "/api/auth/reset-password"
            ),
            {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({

                    email:
                        email.trim().toLowerCase(),

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
            "Password reset failed."
        );

    }


    return data;

}


// =====================================================
// GET STARTED
// =====================================================

function openGetStarted() {

    showPage(
        "authPage"
    );

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
// LOGIN / SIGNUP NAVIGATION
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
// SIGNUP EMAIL OTP
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


                await sendEmailOtp(
                    email,
                    "signup"
                );


                signupOtpVerified =
                    false;

                signupOtpEmail =
                    email;


                $("signupOtpArea")
                    ?.classList
                    .remove("hidden");


                $("signupOtpStatus")
                    .textContent =
                    "";


                setMessage(
                    "signupMessage",
                    "OTP sent to your email. Check your inbox.",
                    "success"
                );


            } catch (error) {

                console.error(
                    error
                );


                setMessage(
                    "signupMessage",
                    error.message,
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
// VERIFY SIGNUP OTP
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


            if (
                !validEmail(email)
            ) {

                setMessage(
                    "signupMessage",
                    "Please enter your email first.",
                    "error"
                );

                return;
            }


            if (
                !validOtp(otp)
            ) {

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


                await verifyEmailOtp(
                    email,
                    otp,
                    "signup"
                );


                signupOtpVerified =
                    true;

                signupOtpEmail =
                    email;


                $("signupOtpStatus")
                    .textContent =
                    "✓ Email verified";


                setMessage(
                    "signupMessage",
                    "Email verified successfully. You can create your account.",
                    "success"
                );


            } catch (error) {

                console.error(
                    error
                );


                signupOtpVerified =
                    false;


                setMessage(
                    "signupMessage",
                    error.message,
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
                    ?.value;


            const confirmPassword =
                $("signupConfirmPassword")
                    ?.value;


            const termsAccepted =
                $("signupTerms")
                    ?.checked;


            // Store name
            if (!storeName) {

                setMessage(
                    "signupMessage",
                    "Store Name is required.",
                    "error"
                );

                return;
            }


            // Email
            if (!validEmail(email)) {

                setMessage(
                    "signupMessage",
                    "Enter a valid email address.",
                    "error"
                );

                return;
            }


            // OTP
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


            // Password
            if (
                !validPassword(password)
            ) {

                setMessage(
                    "signupMessage",
                    "Password must contain at least 8 characters.",
                    "error"
                );

                return;
            }


            // Confirm
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


            // Terms
            if (!termsAccepted) {

                setMessage(
                    "signupMessage",
                    "You must agree to the Terms & Conditions and Privacy Policy.",
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


                /*
                    Create Firebase account.
                */

                const credential =
                    await createUserWithEmailAndPassword(
                        auth,
                        email,
                        password
                    );


                const user =
                    credential.user;


                const now =
                    Date.now();


                const trialEnd =
                    new Date(
                        now +
                        TRIAL_DURATION_MS
                    );


                /*
                    Create user profile.
                */

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

                        showPage(
                            "dashboardPage"
                        );

                        loadDashboard(
                            user
                        );

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


                if (
                    error.code ===
                    "auth/email-already-in-use"
                ) {

                    message =
                        "An account with this email already exists. Please login.";

                } else if (
                    error.code ===
                    "auth/invalid-email"
                ) {

                    message =
                        "Invalid email address.";

                } else if (
                    error.code ===
                    "auth/weak-password"
                ) {

                    message =
                        "Password is too weak.";

                } else if (
                    error.message
                ) {

                    message =
                        error.message;

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
                    ?.value;


            if (
                !validEmail(email)
            ) {

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
                    "Password is required.",
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
                    "Logging in...",
                    "Login"
                );


                const credential =
                    await signInWithEmailAndPassword(
                        auth,
                        email,
                        password
                    );


                loadDashboard(
                    credential.user
                );


            } catch (error) {

                console.error(
                    "LOGIN ERROR:",
                    error
                );


                let message =
                    "Unable to login.";


                if (
                    error.code ===
                    "auth/invalid-credential"
                ) {

                    message =
                        "Incorrect email or password.";

                } else if (
                    error.code ===
                    "auth/user-not-found"
                ) {

                    message =
                        "No account found with this email.";

                } else if (
                    error.code ===
                    "auth/wrong-password"
                ) {

                    message =
                        "Incorrect password.";

                } else if (
                    error.code ===
                    "auth/too-many-requests"
                ) {

                    message =
                        "Too many attempts. Please try again later.";

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
// FORGOT PASSWORD SEND OTP
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


            if (
                !validEmail(email)
            ) {

                setMessage(
                    "forgotMessage",
                    "Enter a valid email address.",
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
                    "password_reset"
                );


                forgotOtpVerified =
                    false;

                forgotOtpEmail =
                    email;


                $("forgotOtpArea")
                    ?.classList
                    .remove("hidden");


                $("newPasswordArea")
                    ?.classList
                    .add("hidden");


                $("forgotOtpStatus")
                    .textContent =
                    "";


                setMessage(
                    "forgotMessage",
                    "Password reset OTP sent to your email.",
                    "success"
                );


            } catch (error) {

                console.error(
                    error
                );


                setMessage(
                    "forgotMessage",
                    error.message,
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
// VERIFY FORGOT OTP
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


            if (
                !validEmail(email)
            ) {

                setMessage(
                    "forgotMessage",
                    "Please enter your email.",
                    "error"
                );

                return;
            }


            if (
                !validOtp(otp)
            ) {

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
                    "password_reset"
                );


                forgotOtpVerified =
                    true;

                forgotOtpEmail =
                    email;


                $("forgotOtpStatus")
                    .textContent =
                    "✓ Email verified";


                $("newPasswordArea")
                    ?.classList
                    .remove("hidden");


                setMessage(
                    "forgotMessage",
                    "Email verified. Create your new password.",
                    "success"
                );


            } catch (error) {

                console.error(
                    error
                );


                forgotOtpVerified =
                    false;


                setMessage(
                    "forgotMessage",
                    error.message,
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
                    ?.value;


            const confirmPassword =
                $("confirmNewPassword")
                    ?.value;


            if (
                !forgotOtpVerified ||
                forgotOtpEmail !== email
            ) {

                setMessage(
                    "forgotMessage",
                    "Please verify the email OTP first.",
                    "error"
                );

                return;
            }


            if (
                !validPassword(
                    newPassword
                )
            ) {

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


                $("forgotOtpArea")
                    ?.classList
                    .add("hidden");


                $("newPasswordArea")
                    ?.classList
                    .add("hidden");


                $("forgotEmail").value =
                    "";

                $("forgotOtp").value =
                    "";

                $("newPassword").value =
                    "";

                $("confirmNewPassword").value =
                    "";


                setTimeout(
                    () => {

                        showAuthSection(
                            "loginSection"
                        );

                    },
                    1200
                );


            } catch (error) {

                console.error(
                    error
                );


                setMessage(
                    "forgotMessage",
                    error.message,
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

async function loadDashboard(
    user
) {

    showPage(
        "dashboardPage"
    );


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


        if (
            !snapshot.exists()
        ) {

            return;
        }


        const data =
            snapshot.data();


        const storeName =
            data.storeName ||
            data.name ||
            "Pharmacy";


        $("dashboardStoreName")
            .textContent =
            storeName;


        updateTrialStatus(
            data
        );


    } catch (error) {

        console.error(
            "Dashboard error:",
            error
        );

    }

}


// =====================================================
// TRIAL STATUS
// =====================================================

function updateTrialStatus(
    userData
) {

    const element =
        $("trialStatus");


    if (!element) return;


    const trialEnd =
        userData.trialEnd?.toDate
            ? userData.trialEnd.toDate()
            : new Date(
                userData.trialEnd
            );


    if (
        Number.isNaN(
            trialEnd.getTime()
        )
    ) {

        element.textContent =
            "Trial information unavailable.";

        return;
    }


    const remaining =
        trialEnd.getTime() -
        Date.now();


    if (
        remaining <= 0
    ) {

        element.textContent =
            "Free trial expired.";

        return;
    }


    const hours =
        Math.floor(
            remaining /
            (1000 * 60 * 60)
        );


    const minutes =
        Math.floor(
            (
                remaining %
                (1000 * 60 * 60)
            ) /
            (1000 * 60)
        );


    element.textContent =
        `Free trial remaining: ${hours}h ${minutes}m`;

}


// =====================================================
// LOGOUT
// =====================================================

$("logoutBtn")
    ?.addEventListener(
        "click",
        async () => {

            try {

                await signOut(
                    auth
                );

                showPage(
                    "welcomePage"
                );

            } catch (error) {

                console.error(
                    "Logout error:",
                    error
                );

            }

        }
    );


// =====================================================
// LEGAL MODALS
// =====================================================

function openModal(
    modalId
) {

    const modal =
        $(modalId);

    if (modal) {

        modal.classList.add(
            "active"
        );

        document.body.style.overflow =
            "hidden";

    }

}


function closeModal(
    modalId
) {

    const modal =
        $(modalId);

    if (modal) {

        modal.classList.remove(
            "active"
        );

        document.body.style.overflow =
            "";

    }

}


$("welcomeTermsBtn")
    ?.addEventListener(
        "click",
        () => openModal(
            "termsModal"
        )
    );


$("welcomePrivacyBtn")
    ?.addEventListener(
        "click",
        () => openModal(
            "privacyModal"
        )
    );


$("signupTermsBtn")
    ?.addEventListener(
        "click",
        () => openModal(
            "termsModal"
        )
    );


$("signupPrivacyBtn")
    ?.addEventListener(
        "click",
        () => openModal(
            "privacyModal"
        )
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
                        event.target ===
                        modal
                    ) {

                        closeModal(
                            modal.id
                        );

                    }

                }
            );

        }
    );


// =====================================================
// ESCAPE CLOSE MODAL
// =====================================================

document.addEventListener(
    "keydown",
    (event) => {

        if (
            event.key === "Escape"
        ) {

            document
                .querySelectorAll(
                    ".modal.active"
                )
                .forEach(
                    (modal) => {

                        closeModal(
                            modal.id
                        );

                    }
                );

        }

    }
);


// =====================================================
// OTP INPUT ONLY NUMBERS
// =====================================================

[
    "signupOtp",
    "forgotOtp"
].forEach(
    (id) => {

        $(id)
            ?.addEventListener(
                "input",
                (event) => {

                    event.target.value =
                        event.target.value
                            .replace(
                                /\D/g,
                                ""
                            )
                            .slice(
                                0,
                                6
                            );

                }
            );

    }
);


// =====================================================
// FIREBASE AUTH STATE
// =====================================================

onAuthStateChanged(
    auth,
    async (user) => {

        if (!user) {

            /*
                Only show welcome page if user
                isn't already on an auth screen.
            */

            if (
                !$("authPage")
                    ?.classList
                    .contains("hidden")
            ) {

                return;

            }

            showPage(
                "welcomePage"
            );

            return;
        }


        console.log(
            "Authenticated user:",
            user.uid
        );


        await loadDashboard(
            user
        );

    }
);


// =====================================================
// BILLING HOOK
// =====================================================

window.MedZoneX = {

    auth,

    db,

    apiUrl,

    showPage,

    showMessage:
        setMessage,

    setLoading:
        setButtonLoading,

    openBilling() {

        /*
            If your billing page/module already exists,
            this function can open it.

            We keep a safe fallback for now.
        */

        const billingPage =
            document.getElementById(
                "billingPage"
            );


        if (billingPage) {

            document
                .querySelectorAll(
                    ".page"
                )
                .forEach(
                    (page) => {

                        page.classList.add(
                            "hidden"
                        );

                    }
                );


            billingPage.classList.remove(
                "hidden"
            );


            if (
                window.MedZoneXBilling
                    ?.loadMedicines
            ) {

                window.MedZoneXBilling
                    .loadMedicines();

            }

            return;

        }


        alert(
            "Billing module will be connected here."
        );

    },

    closeBilling() {

        showPage(
            "dashboardPage"
        );

    }

};


// =====================================================
// DEBUG INFO
// =====================================================

console.log(
    "MedZoneX frontend initialized."
);

console.log(
    "API Base URL:",
    API_BASE_URL || "(same-domain /api)"
);