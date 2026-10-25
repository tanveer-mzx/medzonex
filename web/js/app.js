/* ======================================================
   FIREBASE
====================================================== */

import {
    auth,
    db
} from "./firebase.js";

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
    doc,
    setDoc,
    getDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";


/* ======================================================
   API
====================================================== */

const API_BASE_URL =
    "https://medzonex-backend.onrender.com";


function apiUrl(path) {

    return `${API_BASE_URL}${path}`;
}


/* ======================================================
   DOM
====================================================== */

const $ = (id) =>
    document.getElementById(id);


/* ======================================================
   PAGE SYSTEM
====================================================== */

let currentAuthSection = "loginSection";


function showPage(pageId) {

    document
        .querySelectorAll(".app-page")
        .forEach((page) => {

            page.classList.remove("active");

        });

    const page = $(pageId);

    if (!page) {
        console.error(
            "Page not found:",
            pageId
        );

        return;
    }

    page.classList.add("active");
}


function showAuthSection(
    sectionId,
    direction = "right"
) {

    document
        .querySelectorAll(".auth-section")
        .forEach((section) => {

            section.classList.remove(
                "active",
                "flip-in-right",
                "flip-in-left"
            );

        });

    const section = $(sectionId);

    if (!section) {
        return;
    }

    section.classList.add("active");

    /*
       Force browser to restart animation
    */

    void section.offsetWidth;

    section.classList.add(
        direction === "left"
            ? "flip-in-left"
            : "flip-in-right"
    );

    currentAuthSection =
        sectionId;
}


/* ======================================================
   MESSAGES
====================================================== */

function setMessage(
    id,
    message,
    type = ""
) {

    const element = $(id);

    if (!element) {
        return;
    }

    element.textContent =
        message || "";

    element.className =
        `form-message ${type}`;
}


function setOtpStatus(
    id,
    message,
    type = ""
) {

    const element = $(id);

    if (!element) {
        return;
    }

    element.textContent =
        message || "";

    element.className =
        `otp-status ${type}`;
}


/* ======================================================
   ELEMENT VISIBILITY
====================================================== */

function showElement(id) {

    const element = $(id);

    if (!element) {
        return;
    }

    element.classList.add("visible");

    element.style.display = "";
}


function hideElement(id) {

    const element = $(id);

    if (!element) {
        return;
    }

    element.classList.remove("visible");

    element.style.display = "none";
}


/* ======================================================
   BACKEND REQUEST
====================================================== */

async function backendRequest(
    path,
    body
) {

    let response;

    try {

        response =
            await fetch(
                apiUrl(path),
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify(body)
                }
            );

    } catch (error) {

        console.error(
            "Backend connection error:",
            error
        );

        throw new Error(
            "Failed to connect to MedZoneX server."
        );
    }


    let data = {};

    try {

        data =
            await response.json();

    } catch {

        data = {};

    }


    if (!response.ok) {

        throw new Error(
            data.message ||
            data.error ||
            `Server error (${response.status})`
        );
    }


    return data;
}


/* ======================================================
   OTP STATE
====================================================== */

let signupOtpVerified =
    false;

let forgotOtpVerified =
    false;


let signupTimerInterval =
    null;

let forgotTimerInterval =
    null;


/* ======================================================
   60 SECOND OTP TIMER
====================================================== */

function startOtpTimer(
    timerId,
    resendButtonId,
    seconds = 60
) {

    const timer =
        $(timerId);

    const resendButton =
        $(resendButtonId);

    if (!timer || !resendButton) {
        return;
    }


    if (
        timerId ===
        "signupTimer"
    ) {

        clearInterval(
            signupTimerInterval
        );

    } else {

        clearInterval(
            forgotTimerInterval
        );

    }


    resendButton.disabled =
        true;

    let remaining =
        seconds;


    timer.classList.remove(
        "ready"
    );


    function update() {

        if (remaining <= 0) {

            clearInterval(
                timerId ===
                    "signupTimer"
                    ? signupTimerInterval
                    : forgotTimerInterval
            );

            timer.textContent =
                "You can resend OTP now.";

            timer.classList.add(
                "ready"
            );

            resendButton.disabled =
                false;

            return;
        }


        timer.textContent =
            `Resend OTP available in ${remaining} seconds`;

        remaining--;
    }


    update();


    const interval =
        setInterval(
            update,
            1000
        );


    if (
        timerId ===
        "signupTimer"
    ) {

        signupTimerInterval =
            interval;

    } else {

        forgotTimerInterval =
            interval;

    }

}


/* ======================================================
   RESET OTP TIMER
====================================================== */

function resetSignupOtpState() {

    signupOtpVerified =
        false;

    clearInterval(
        signupTimerInterval
    );

    const button =
        $("resendSignupOtpBtn");

    if (button) {
        button.disabled =
            true;
    }

    setOtpStatus(
        "signupOtpStatus",
        ""
    );

    const timer =
        $("signupTimer");

    if (timer) {

        timer.textContent =
            "Resend OTP available in 60 seconds";

        timer.classList.remove(
            "ready"
        );

    }

}


function resetForgotOtpState() {

    forgotOtpVerified =
        false;

    clearInterval(
        forgotTimerInterval
    );

    const button =
        $("resendForgotOtpBtn");

    if (button) {
        button.disabled =
            true;
    }

    setOtpStatus(
        "forgotOtpStatus",
        ""
    );

    const timer =
        $("forgotTimer");

    if (timer) {

        timer.textContent =
            "Resend OTP available in 60 seconds";

        timer.classList.remove(
            "ready"
        );

    }

}


/* ======================================================
   GET STARTED
====================================================== */

$("getStartedBtn")
    ?.addEventListener(
        "click",
        () => {

            showPage(
                "authPage"
            );

            showAuthSection(
                "loginSection",
                "right"
            );

        }
    );


/* ======================================================
   BACK TO WELCOME
====================================================== */

$("backToWelcomeBtn")
    ?.addEventListener(
        "click",
        () => {

            showPage(
                "welcomePage"
            );

        }
    );


/* ======================================================
   LOGIN → SIGNUP
====================================================== */

$("showSignupBtn")
    ?.addEventListener(
        "click",
        () => {

            setMessage(
                "loginMessage",
                ""
            );

            showAuthSection(
                "signupSection",
                "right"
            );

        }
    );


/* ======================================================
   SIGNUP → LOGIN
====================================================== */

$("showLoginFromSignupBtn")
    ?.addEventListener(
        "click",
        () => {

            setMessage(
                "signupMessage",
                ""
            );

            showAuthSection(
                "loginSection",
                "left"
            );

        }
    );


/* ======================================================
   LOGIN → FORGOT
====================================================== */

$("showForgotBtn")
    ?.addEventListener(
        "click",
        () => {

            setMessage(
                "loginMessage",
                ""
            );

            showAuthSection(
                "forgotSection",
                "right"
            );

        }
    );


/* ======================================================
   FORGOT → LOGIN
====================================================== */

$("backToLoginBtn")
    ?.addEventListener(
        "click",
        () => {

            resetForgotOtpState();

            hideElement(
                "forgotOtpArea"
            );

            hideElement(
                "newPasswordArea"
            );

            setMessage(
                "forgotMessage",
                ""
            );

            showAuthSection(
                "loginSection",
                "left"
            );

        }
    );


/* ======================================================
   SEND SIGNUP OTP
====================================================== */

async function sendSignupOtp() {

    const email =
        $("signupEmail")
            ?.value
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

        const button =
            $("sendSignupOtpBtn");

        if (button) {
            button.disabled =
                true;

            button.textContent =
                "Sending OTP...";
        }


        await backendRequest(
            "/api/auth/send-email-otp",
            {
                email,
                purpose: "signup"
            }
        );


        resetSignupOtpState();

        showElement(
            "signupOtpArea"
        );

        setOtpStatus(
            "signupOtpStatus",
            "OTP sent to your email.",
            "success"
        );

        setMessage(
            "signupMessage",
            ""
        );

        startOtpTimer(
            "signupTimer",
            "resendSignupOtpBtn",
            60
        );


        $("signupOtp")
            ?.focus();


    } catch (error) {

        console.error(
            "SIGNUP OTP ERROR:",
            error
        );

        setMessage(
            "signupMessage",
            error.message,
            "error"
        );

    } finally {

        const button =
            $("sendSignupOtpBtn");

        if (button) {

            button.disabled =
                false;

            button.textContent =
                "Send Email OTP";

        }

    }

}


$("sendSignupOtpBtn")
    ?.addEventListener(
        "click",
        sendSignupOtp
    );


/* ======================================================
   RESEND SIGNUP OTP
====================================================== */

$("resendSignupOtpBtn")
    ?.addEventListener(
        "click",
        async () => {

            if (
                $("resendSignupOtpBtn")
                    ?.disabled
            ) {
                return;
            }

            await sendSignupOtp();

        }
    );


/* ======================================================
   VERIFY SIGNUP OTP
====================================================== */

$("verifySignupOtpBtn")
    ?.addEventListener(
        "click",
        async () => {

            const email =
                $("signupEmail")
                    ?.value
                    .trim()
                    .toLowerCase();

            const otp =
                $("signupOtp")
                    ?.value
                    .trim();


            if (!email) {

                setOtpStatus(
                    "signupOtpStatus",
                    "Please enter your email.",
                    "error"
                );

                return;
            }


            if (!/^\d{6}$/.test(otp)) {

                setOtpStatus(
                    "signupOtpStatus",
                    "Enter the 6-digit OTP.",
                    "error"
                );

                return;
            }


            try {

                const button =
                    $("verifySignupOtpBtn");

                if (button) {

                    button.disabled =
                        true;

                    button.textContent =
                        "Verifying...";
                }


                await backendRequest(
                    "/api/auth/verify-email-otp",
                    {
                        email,
                        otp,
                        purpose: "signup"
                    }
                );


                signupOtpVerified =
                    true;


                setOtpStatus(
                    "signupOtpStatus",
                    "Email verified successfully.",
                    "success"
                );


                clearInterval(
                    signupTimerInterval
                );


                const resendButton =
                    $("resendSignupOtpBtn");

                if (resendButton) {

                    resendButton.disabled =
                        true;

                }


                const timer =
                    $("signupTimer");

                if (timer) {

                    timer.textContent =
                        "Email verified ✓";

                    timer.classList.add(
                        "ready"
                    );

                }


            } catch (error) {

                signupOtpVerified =
                    false;

                setOtpStatus(
                    "signupOtpStatus",
                    error.message,
                    "error"
                );

            } finally {

                const button =
                    $("verifySignupOtpBtn");

                if (button) {

                    button.disabled =
                        false;

                    button.textContent =
                        "Verify OTP";

                }

            }

        }
    );


/* ======================================================
   SIGNUP
====================================================== */

$("signupBtn")
    ?.addEventListener(
        "click",
        async () => {

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

            const terms =
                $("signupTerms")
                    ?.checked;


            setMessage(
                "signupMessage",
                ""
            );


            if (!storeName) {

                setMessage(
                    "signupMessage",
                    "Please enter your store name.",
                    "error"
                );

                return;
            }


            if (!email) {

                setMessage(
                    "signupMessage",
                    "Please enter your email.",
                    "error"
                );

                return;
            }


            if (!signupOtpVerified) {

                setMessage(
                    "signupMessage",
                    "Please verify OTP first.",
                    "error"
                );

                return;
            }


            /*
               EXACT PASSWORD MATCH
            */

            if (
                password !==
                confirmPassword
            ) {

                setMessage(
                    "signupMessage",
                    "Password did not match",
                    "error"
                );

                return;
            }


            if (
                password.length < 8
            ) {

                setMessage(
                    "signupMessage",
                    "Password must contain at least 8 characters.",
                    "error"
                );

                return;
            }


            if (!terms) {

                setMessage(
                    "signupMessage",
                    "Please accept the Terms & Conditions and Privacy Policy.",
                    "error"
                );

                return;
            }


            try {

                const button =
                    $("signupBtn");

                if (button) {

                    button.disabled =
                        true;

                    button.textContent =
                        "Creating Account...";

                }


                /*
                   Firebase creates the actual account.
                */

                const credential =
                    await createUserWithEmailAndPassword(
                        auth,
                        email,
                        password
                    );


                const user =
                    credential.user;


                /*
                   Store pharmacy information
                   in Firestore.
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

                        email:
                            email,

                        storeName:
                            storeName,

                        createdAt:
                            serverTimestamp(),

                        trialStartedAt:
                            serverTimestamp(),

                        trialDays:
                            2,

                        subscriptionStatus:
                            "trial"
                    },
                    {
                        merge: true
                    }
                );


                setMessage(
                    "signupMessage",
                    "Account created successfully.",
                    "success"
                );

                await routeUserByAccess(user);

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
                                                       "An account with this email already exists.";

                                               } else if (
                                                   error.code ===
                                                   "auth/invalid-email"
                                               ) {

                                                   message =
                                                       "Please enter a valid email address.";

                                               } else if (
                                                   error.code ===
                                                   "auth/weak-password"
                                               ) {

                                                   message =
                                                       "Password is too weak.";

                                               } else if (
                                                   error.code ===
                                                   "auth/network-request-failed"
                                               ) {

                                                   message =
                                                       "Network error. Please check your internet connection.";

                                               } else {

                                                   message =
                                                       error.message ||
                                                       message;

                                               }

                                               setMessage(
                                                   "signupMessage",
                                                   message,
                                                   "error"
                                               );

                                           } finally {

                                               const button =
                                                   $("signupBtn");

                                               if (button) {

                                                   button.disabled =
                                                       false;

                                                   button.textContent =
                                                       "Create Account";

                                               }

                                           }

                                       }

                                   );

/* ======================================================
   SEND FORGOT OTP
====================================================== */

async function sendForgotOtp() {

    const email =
        $("forgotEmail")
            ?.value
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

        const button =
            $("sendForgotOtpBtn");

        if (button) {

            button.disabled =
                true;

            button.textContent =
                "Sending OTP...";

        }


        await backendRequest(
            "/api/auth/send-email-otp",
            {
                email,
                purpose: "password_reset"
            }
        );


        resetForgotOtpState();


        showElement(
            "forgotOtpArea"
        );

        hideElement(
            "newPasswordArea"
        );


        setOtpStatus(
            "forgotOtpStatus",
            "OTP sent to your email.",
            "success"
        );


        setMessage(
            "forgotMessage",
            ""
        );


        startOtpTimer(
            "forgotTimer",
            "resendForgotOtpBtn",
            60
        );


        $("forgotOtp")
            ?.focus();


    } catch (error) {

        console.error(
            "FORGOT OTP ERROR:",
            error
        );

        setMessage(
            "forgotMessage",
            error.message,
            "error"
        );

    } finally {

        const button =
            $("sendForgotOtpBtn");

        if (button) {

            button.disabled =
                false;

            button.textContent =
                "Send Email OTP";

        }

    }

}


$("sendForgotOtpBtn")
    ?.addEventListener(
        "click",
        sendForgotOtp
    );


/* ======================================================
   RESEND FORGOT OTP
====================================================== */

$("resendForgotOtpBtn")
    ?.addEventListener(
        "click",
        async () => {

            if (
                $("resendForgotOtpBtn")
                    ?.disabled
            ) {
                return;
            }

            await sendForgotOtp();

        }
    );


/* ======================================================
   VERIFY FORGOT OTP
====================================================== */

$("verifyForgotOtpBtn")
    ?.addEventListener(
        "click",
        async () => {

            const email =
                $("forgotEmail")
                    ?.value
                    .trim()
                    .toLowerCase();

            const otp =
                $("forgotOtp")
                    ?.value
                    .trim();


            if (!email) {

                setOtpStatus(
                    "forgotOtpStatus",
                    "Please enter your email.",
                    "error"
                );

                return;
            }


            if (!/^\d{6}$/.test(otp)) {

                setOtpStatus(
                    "forgotOtpStatus",
                    "Enter the 6-digit OTP.",
                    "error"
                );

                return;
            }


            try {

                const button =
                    $("verifyForgotOtpBtn");

                if (button) {

                    button.disabled =
                        true;

                    button.textContent =
                        "Verifying...";

                }


                await backendRequest(
                    "/api/auth/verify-email-otp",
                    {
                        email,
                        otp,
                        purpose: "password_reset"
                    }
                );


                forgotOtpVerified =
                    true;


                setOtpStatus(
                    "forgotOtpStatus",
                    "Email verified successfully.",
                    "success"
                );


                clearInterval(
                    forgotTimerInterval
                );


                const resendButton =
                    $("resendForgotOtpBtn");

                if (resendButton) {

                    resendButton.disabled =
                        true;

                }


                const timer =
                    $("forgotTimer");

                if (timer) {

                    timer.textContent =
                        "Email verified ✓";

                    timer.classList.add(
                        "ready"
                    );

                }


                showElement(
                    "newPasswordArea"
                );


                $("newPassword")
                    ?.focus();


            } catch (error) {

                forgotOtpVerified =
                    false;

                setOtpStatus(
                    "forgotOtpStatus",
                    error.message,
                    "error"
                );

            } finally {

                const button =
                    $("verifyForgotOtpBtn");

                if (button) {

                    button.disabled =
                        false;

                    button.textContent =
                        "Verify OTP";

                }

            }

        }
    );


/* ======================================================
   RESET PASSWORD
====================================================== */

$("resetPasswordBtn")
    ?.addEventListener(
        "click",
        async () => {

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


            /*
               OTP FIRST
            */

            if (!forgotOtpVerified) {

                setMessage(
                    "forgotMessage",
                    "Please verify OTP first",
                    "error"
                );

                return;
            }


            /*
               EXACT PASSWORD MATCH
            */

            if (
                newPassword !==
                confirmPassword
            ) {

                setMessage(
                    "forgotMessage",
                    "Password did not match",
                    "error"
                );

                return;
            }


            if (
                newPassword.length < 8
            ) {

                setMessage(
                    "forgotMessage",
                    "Password must contain at least 8 characters.",
                    "error"
                );

                return;
            }


            try {

                const button =
                    $("resetPasswordBtn");

                if (button) {

                    button.disabled =
                        true;

                    button.textContent =
                        "Changing Password...";

                }


                await backendRequest(
                    "/api/auth/reset-password",
                    {
                        email,
                        newPassword
                    }
                );


                setMessage(
                    "forgotMessage",
                    "Password changed successfully. You can now login.",
                    "success"
                );


                forgotOtpVerified =
                    false;


                setTimeout(
                    () => {

                        $("forgotEmail").value =
                            "";

                        $("forgotOtp").value =
                            "";

                        $("newPassword").value =
                            "";

                        $("confirmNewPassword").value =
                            "";

                        hideElement(
                            "forgotOtpArea"
                        );

                        hideElement(
                            "newPasswordArea"
                        );

                        resetForgotOtpState();

                        showAuthSection(
                            "loginSection",
                            "left"
                        );

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
                    error.message,
                    "error"
                );


            } finally {

                const button =
                    $("resetPasswordBtn");

                if (button) {

                    button.disabled =
                        false;

                    button.textContent =
                        "Change Password";

                }

            }

        }
    );


/* ======================================================
   LOGIN
====================================================== */

$("loginBtn")
    ?.addEventListener(
        "click",
        async () => {

            const email =
                $("loginEmail")
                    ?.value
                    .trim()
                    .toLowerCase();

            const password =
                $("loginPassword")
                    ?.value || "";


            if (!email || !password) {

                setMessage(
                    "loginMessage",
                    "All fields are required.",
                    "error"
                );

                return;
            }


            try {

                const button =
                    $("loginBtn");

                if (button) {

                    button.disabled =
                        true;

                    button.textContent =
                        "Logging in...";

                }


                const credential =
                    await signInWithEmailAndPassword(
                        auth,
                        email,
                        password
                    );


                setMessage(
                    "loginMessage",
                    ""
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
                        "Invalid email or password.";

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

                } else {

                    message =
                        error.message ||
                        message;

                }


                setMessage(
                    "loginMessage",
                    message,
                    "error"
                );


            } finally {

                const button =
                    $("loginBtn");

                if (button) {

                    button.disabled =
                        false;

                    button.textContent =
                        "Login";

                }

            }

        }
    );


/* ======================================================
   ENTER KEY LOGIN
====================================================== */

$("loginPassword")
    ?.addEventListener(
        "keydown",
        (event) => {

            if (
                event.key ===
                "Enter"
            ) {

                $("loginBtn")
                    ?.click();

            }

        }
    );


/* ======================================================
   PASSWORD MATCH LIVE CHECK
====================================================== */

$("signupConfirmPassword")
    ?.addEventListener(
        "input",
        () => {

            const password =
                $("signupPassword")
                    ?.value || "";

            const confirm =
                $("signupConfirmPassword")
                    ?.value || "";


            if (
                confirm &&
                password !==
                confirm
            ) {

                setMessage(
                    "signupMessage",
                    "Password did not match",
                    "error"
                );

            } else {

                setMessage(
                    "signupMessage",
                    ""
                );

            }

        }
    );


$("confirmNewPassword")
    ?.addEventListener(
        "input",
        () => {

            const password =
                $("newPassword")
                    ?.value || "";

            const confirm =
                $("confirmNewPassword")
                    ?.value || "";


            if (
                confirm &&
                password !==
                confirm
            ) {

                setMessage(
                    "forgotMessage",
                    "Password did not match",
                    "error"
                );

            } else {

                setMessage(
                    "forgotMessage",
                    ""
                );

            }

        }
    );


/* ======================================================
   DASHBOARD
====================================================== */

async function loadDashboard(
    user
) {

    if (!user) {
        return;
    }


    let storeName =
        "Your Pharmacy";


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
            snapshot.exists()
        ) {

            const data =
                snapshot.data();


            if (
                data.storeName
            ) {

                storeName =
                    data.storeName;

            }


            const trialText =
                calculateTrialStatus(
                    data
                );


            const trialElement =
                $("trialStatus");


            if (trialElement) {

                trialElement.textContent =
                    trialText;

            }

        }

    } catch (error) {

        console.error(
            "DASHBOARD ERROR:",
            error
        );

    }


    const storeElement =
        $("dashboardStoreName");


    if (storeElement) {

        storeElement.textContent =
            storeName;

    }

}


function calculateTrialStatus(
    data
) {

    const subscription =
        data.subscription || {};

    const expiryValue =
        subscription.currentPeriodEnd;

    let paidExpiry = 0;

    if (
        expiryValue &&
        typeof expiryValue.toMillis === "function"
    ) {
        paidExpiry = expiryValue.toMillis();
    } else if (
        expiryValue &&
        typeof expiryValue.seconds === "number"
    ) {
        paidExpiry = expiryValue.seconds * 1000;
    } else if (
        typeof expiryValue === "string" ||
        typeof expiryValue === "number"
    ) {
        const parsed = new Date(expiryValue).getTime();

        paidExpiry = Number.isFinite(parsed)
            ? parsed
            : 0;
    }

    if (
        subscription.status === "active" &&
        paidExpiry > Date.now()
    ) {
        return "Subscription active";
    }

    let startTime =
        null;


    if (
        data.trialStartedAt
    ) {

        if (
            typeof data.trialStartedAt.toMillis ===
            "function"
        ) {

            startTime =
                data.trialStartedAt.toMillis();

        } else if (
            data.trialStartedAt.seconds
        ) {

            startTime =
                data.trialStartedAt.seconds *
                1000;

        }

    }


    if (!startTime) {

        return "Trial status unavailable. Please contact support.";

    }


    const trialDuration =
        2 *
        24 *
        60 *
        60 *
        1000;


    const remaining =
        (
            startTime +
            trialDuration
        ) -
        Date.now();


    if (
        remaining <= 0
    ) {

        return "Free trial expired. Please subscribe.";

    }


    const days =
        Math.floor(
            remaining /
            (
                24 *
                60 *
                60 *
                1000
            )
        );


    const hours =
        Math.floor(
            (
                remaining %
                (
                    24 *
                    60 *
                    60 *
                    1000
                )
            ) /
            (
                60 *
                60 *
                1000
            )
        );


    return `Free trial: ${days} day(s), ${hours} hour(s) remaining`;

}

/* ======================================================
   SUBSCRIPTION ACCESS VERIFICATION
====================================================== */

async function verifySubscriptionAccess(user) {

    if (!user) {
        throw new Error("User is not authenticated.");
    }

    const idToken = await user.getIdToken();

    // Retry if the signup document has not appeared yet.
    // This handles the Firebase signup/auth-state race.
    for (let attempt = 0; attempt < 5; attempt++) {

        const response = await fetch(
            apiUrl("/api/subscription/status"),
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${idToken}`
                }
            }
        );

        let access = {};

        try {
            access = await response.json();
        } catch {
            throw new Error(
                "The server returned an invalid response."
            );
        }

        if (!response.ok || access.success !== true) {
            throw new Error(
                access.message ||
                "Subscription verification failed."
            );
        }

        // A new signup may briefly be missing from Firestore.
        if (
            access.active !== true &&
            access.reason === "user_not_found" &&
            attempt < 4
        ) {
            await new Promise(
                resolve => setTimeout(resolve, 500)
            );

            continue;
        }

        return access;
    }

    throw new Error(
        "Unable to verify your subscription. Please try again."
    );
}


/* ======================================================
   ROUTE USER BASED ON VERIFIED ACCESS
====================================================== */

async function routeUserByAccess(user) {
    try {
        const access = await verifySubscriptionAccess(user);

        // Backend response validation
        if (access.success !== true) {
            throw new Error("Invalid subscription response.");
        }

        // Active subscription or valid free trial
        if (
            access.active === true &&
            (access.status === "active" ||
             access.status === "trial")
        ) {
            showPage("dashboardPage");
            startSubscriptionCountdown(access);
            await loadDashboard(user);
            return;
        }

        // Expired trial or inactive subscription
        if (
            access.active === false &&
            access.status === "locked"
        ) {
            showPage("subscriptionPage");
            return;
        }

        // Unknown response: deny access
        throw new Error("Unknown subscription status.");

    } catch (error) {
        console.error(
            "SUBSCRIPTION ACCESS CHECK ERROR:",
            error
        );

        // Fail closed
        showPage("subscriptionPage");

        setMessage(
            "subscriptionMessage",
            "Unable to verify your subscription. Please try again.",
            "error"
        );
    }
}

/* ======================================================
   SAFE DASHBOARD NAVIGATION
====================================================== */

async function returnToDashboardSafely() {
    const user = auth.currentUser;

    if (!user) {
        console.warn("Dashboard blocked: user is not logged in.");
        return;
    }

    await routeUserByAccess(user);
}

/* ======================================================
   FIREBASE AUTH STATE
====================================================== */

onAuthStateChanged(
    auth,
    async (user) => {

        if (user) {

            await routeUserByAccess(user);

        } else {

            const dashboard =
                $("dashboardPage");

            const subscriptionPage =
                $("subscriptionPage");

            // If the user logs out while viewing a protected page,
            // return them to the welcome page.
            if (
                dashboard?.classList.contains("active") ||
                subscriptionPage?.classList.contains("active")
            ) {
                showPage("welcomePage");
            }

        }

    }
);


/* ======================================================
   LOGOUT
====================================================== */

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
                    "LOGOUT ERROR:",
                    error
                );

            }

        }
    );


/* ======================================================
   DASHBOARD PAGE NAVIGATION
====================================================== */

$("openBillingBtn")
    ?.addEventListener("click", () => {
        showPage("billingPage");
    });

$("openInventoryBtn")
    ?.addEventListener("click", () => {
        showPage("inventoryPage");
    });

$("openPurchaseBtn")
    ?.addEventListener("click", () => {
        showPage("purchasePage");
    });

$("closeBillingBtn")
    ?.addEventListener("click", async () => {
        await returnToDashboardSafely();
    });

$("closeInventoryBtn")
    ?.addEventListener("click", async () => {
        await returnToDashboardSafely();
    });

/* ======================================================
   SAFE PAGE BACK NAVIGATION
====================================================== */

$("closePurchaseBtn")
    ?.addEventListener("click", async () => {
        await returnToDashboardSafely();
    });

$("backToDashboardFromInventoryBtn")
    ?.addEventListener("click", async () => {
        await returnToDashboardSafely();
    });

$("closeCustomersBtn")
    ?.addEventListener("click", async () => {
        await returnToDashboardSafely();
    });

$("closeProfileBtn")
    ?.addEventListener("click", async () => {
        await returnToDashboardSafely();
    });

$("closeSettingsBtn")
    ?.addEventListener("click", async () => {
        await returnToDashboardSafely();
    });


/* ======================================================
   TERMS / PRIVACY
====================================================== */

function openModal(
    id
) {

    $(id)
        ?.classList
        .add("active");

}


function closeModal(
    id
) {

    $(id)
        ?.classList
        .remove("active");

}


$("openTermsFromSignup")
    ?.addEventListener(
        "click",
        () => {

            openModal(
                "termsModal"
            );

        }
    );


$("openPrivacyFromSignup")
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

                        modal.classList
                            .remove("active");

                    }

                }
            );

        }
    );


/* ======================================================
   INITIAL UI STATE
====================================================== */

hideElement(
    "signupOtpArea"
);

hideElement(
    "forgotOtpArea"
);

hideElement(
    "newPasswordArea"
);


/* ======================================================
   GLOBAL API
====================================================== */

window.MedZoneX = {

    auth,

    db,

    apiUrl,

    showPage,

    showAuthSection,

    backendRequest

};

/* =========================================================
   MEDZONEX DASHBOARD UI
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    /* -------------------------
       AD CAROUSEL
    ------------------------- */

    const slides = Array.from(
        document.querySelectorAll(".ad-slide")
    );

    const dotsContainer =
        document.getElementById("adDots");

    const prevAdBtn =
        document.getElementById("prevAdBtn");

    const nextAdBtn =
        document.getElementById("nextAdBtn");

    let currentAd = 0;
    let adInterval = null;

    function buildAdDots() {

        if (!dotsContainer) return;

        dotsContainer.innerHTML = "";

        slides.forEach((_, index) => {

            const dot =
                document.createElement("span");

            dot.className = "ad-dot";

            if (index === currentAd) {
                dot.classList.add("active");
            }

            dot.addEventListener("click", () => {
                showAd(index);
            });

            dotsContainer.appendChild(dot);
        });
    }


    function showAd(index) {

        if (!slides.length) return;

        currentAd =
            (index + slides.length) % slides.length;

        slides.forEach((slide, i) => {

            slide.classList.toggle(
                "active",
                i === currentAd
            );

            const video =
                slide.querySelector("video");

            if (video) {

                if (i === currentAd) {
                    video.play().catch(() => {});
                } else {
                    video.pause();
                }

            }

        });

        buildAdDots();
    }


    function startAdRotation() {

        clearInterval(adInterval);

        adInterval = setInterval(() => {
            showAd(currentAd + 1);
        }, 7000);
    }


    prevAdBtn?.addEventListener(
        "click",
        () => {
            showAd(currentAd - 1);
            startAdRotation();
        }
    );


    nextAdBtn?.addEventListener(
        "click",
        () => {
            showAd(currentAd + 1);
            startAdRotation();
        }
    );


    if (slides.length) {

        buildAdDots();
        showAd(0);
        startAdRotation();

    }


    /* -------------------------
       CUSTOMER CARE
    ------------------------- */

    const careModal =
        document.getElementById(
            "customerCareModal"
        );

    const openCare =
        document.getElementById(
            "openCustomerCareBtn"
        );

    const closeCare =
        document.getElementById(
            "closeCustomerCareBtn"
        );


    openCare?.addEventListener(
        "click",
        () => {
            careModal?.classList.add("visible");
        }
    );


    closeCare?.addEventListener(
        "click",
        () => {
            careModal?.classList.remove("visible");
        }
    );


    careModal?.addEventListener(
        "click",
        (event) => {

            if (
                event.target === careModal
            ) {
                careModal.classList.remove(
                    "visible"
                );
            }

        }
    );


    /* -------------------------
       QUICK ACTIONS
    ------------------------- */

    document
        .getElementById("quickBillingBtn")
        ?.addEventListener("click", () => {

            document
                .getElementById("openBillingBtn")
                ?.click();

        });


    document
        .getElementById("quickInventoryBtn")
        ?.addEventListener("click", () => {

            document
                .getElementById("openInventoryBtn")
                ?.click();

        });


    document
        .getElementById("quickCustomerBtn")
        ?.addEventListener("click", () => {

            document
                .getElementById("openCustomersBtn")
                ?.click();

        });


    document
        .getElementById("createBillDashboardBtn")
        ?.addEventListener("click", () => {

            document
                .getElementById("openBillingBtn")
                ?.click();

        });


    /* -------------------------
       DASHBOARD NAV
    ------------------------- */

    document
        .getElementById("dashboardNavBtn")
        ?.addEventListener("click", async () => {

            await returnToDashboardSafely();

        });


    /* -------------------------
       CUSTOMER PAGE
    ------------------------- */

    document
        .getElementById("openCustomersBtn")
        ?.addEventListener("click", async () => {

            const user = auth.currentUser;

            if (!user) {
                return;
            }

            const access = await verifySubscriptionAccess(user);

            if (
                access.success === true &&
                access.active === true &&
                ["active", "trial"].includes(access.status)
            ) {
                showPage("customersPage");
            } else {
                await routeUserByAccess(user);
            }

        });


    /* -------------------------
       PROFILE
    ------------------------- */

    document
        .getElementById("openProfileBtn")
        ?.addEventListener("click", async () => {

            const user = auth.currentUser;

            if (!user) {
                return;
            }

            const access = await verifySubscriptionAccess(user);

            if (
                access.success === true &&
                access.active === true &&
                ["active", "trial"].includes(access.status)
            ) {
                showPage("profilePage");
            } else {
                await routeUserByAccess(user);
            }

        });


    /* -------------------------
       SETTINGS
    ------------------------- */

    document
        .getElementById("openSettingsBtn")
        ?.addEventListener("click", async () => {

            const user = auth.currentUser;

            if (!user) {
                return;
            }

            const access = await verifySubscriptionAccess(user);

            if (
                access.success === true &&
                access.active === true &&
                ["active", "trial"].includes(access.status)
            ) {
                showPage("settingsPage");
            } else {
                await routeUserByAccess(user);
            }

        });

    });

    /* ======================================================
    MEDZONEX SUBSCRIPTION COUNTDOWN
    ====================================================== */

    let subscriptionCountdownInterval = null;
    let subscriptionExpiryTimestamp = 0;
    let subscriptionCountdownAccessType = "subscription";

    function updateSubscriptionIndicator(status, remainingMs) {
    const signal = document.getElementById(
    "sidebarSubscriptionSignal"
    );

    const badge = document.getElementById(
        "subscriptionStatusBadge"
    );

    if (!signal || !badge) return;

    signal.classList.remove(
        "status-green",
        "status-yellow",
        "status-red"
    );

    badge.classList.remove(
        "status-green",
        "status-yellow",
        "status-red"
    );

    let label;
    let color;

    if (status === "expired" || remainingMs <= 0) {
        label = "EXPIRED";
        color = "status-red";
    } else if (remainingMs <= 5 * 24 * 60 * 60 * 1000) {
        label = "EXPIRING SOON";
        color = "status-yellow";
    } else {
        label = status === "trial" ? "TRIAL ACTIVE" : "ACTIVE";
        color = "status-green";
    }

    signal.classList.add(color);
    badge.classList.add(color);
    badge.textContent = label;
    signal.setAttribute("aria-label", label);

    }

    function renderSubscriptionCountdown() {
    const timer = document.getElementById(
    "subscriptionCountdownTimer"
    );

    const label = document.getElementById(
        "subscriptionCountdownLabel"
    );

    const expiryDate = document.getElementById(
        "subscriptionExpiryDate"
    );

    if (!timer || !label || !expiryDate) return;

    const remainingMs =
        subscriptionExpiryTimestamp - Date.now();

    if (!Number.isFinite(subscriptionExpiryTimestamp) ||
        subscriptionExpiryTimestamp <= 0) {
        timer.textContent = "Expiry time unavailable";
        label.textContent = "Unable to determine subscription expiry.";
        expiryDate.textContent = "";
        updateSubscriptionIndicator("expired", 0);
        return;
    }

    if (remainingMs <= 0) {
        timer.textContent =
            "0 Days : 0 Hours : 0 Minutes : 0 Seconds";

        label.textContent =
            "Your access period has expired.";

        updateSubscriptionIndicator("expired", 0);

        clearInterval(subscriptionCountdownInterval);
        subscriptionCountdownInterval = null;

        // Re-check access with the backend once the local timer reaches zero.
        const user = auth.currentUser;

        if (user) {
            verifySubscriptionAccess(user)
                .then(access => {
                    if (
                        access.active !== true ||
                        !["active", "trial"].includes(access.status)
                    ) {
                        showPage("subscriptionPage");
                    } else {
                        startSubscriptionCountdown(access);
                    }
                })
                .catch(error => {
                    console.error(
                        "Subscription expiry verification failed:",
                        error
                    );
                });
        }

        return;
    }

    const totalSeconds = Math.floor(remainingMs / 1000);

    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    timer.textContent =
        `${days} Days : ${hours} Hours : ` +
        `${minutes} Minutes : ${seconds} Seconds`;

    label.textContent =
        subscriptionCountdownAccessType === "trial"
            ? "Your free trial ends in:"
            : "Your subscription expires in:";

    expiryDate.textContent =
        "Expiry date: " +
        new Date(subscriptionExpiryTimestamp).toLocaleString(
            "en-IN",
            {
                dateStyle: "medium",
                timeStyle: "medium"
            }
        );

    updateSubscriptionIndicator(
        subscriptionCountdownAccessType,
        remainingMs
    );

    }

    function startSubscriptionCountdown(access) {
    const card = document.getElementById(
    "subscriptionCountdownCard"
    );

    if (!card) return;

    if (
        !access ||
        access.success !== true ||
        access.active !== true ||
        !["active", "trial"].includes(access.status)
    ) {
        card.hidden = true;

        clearInterval(subscriptionCountdownInterval);
        subscriptionCountdownInterval = null;
        return;
    }

    const expiryTimestamp = new Date(
        access.expiresAt
    ).getTime();

    if (!Number.isFinite(expiryTimestamp) || expiryTimestamp <= 0) {
        card.hidden = false;

        document.getElementById(
            "subscriptionCountdownTimer"
        ).textContent = "Expiry time unavailable";

        document.getElementById(
            "subscriptionCountdownLabel"
        ).textContent = "Please refresh or contact support.";

        return;
    }

    card.hidden = false;

    subscriptionExpiryTimestamp = expiryTimestamp;
    subscriptionCountdownAccessType = access.status;

    clearInterval(subscriptionCountdownInterval);

    renderSubscriptionCountdown();

    subscriptionCountdownInterval = setInterval(
        renderSubscriptionCountdown,
        1000
    );

    }

    document
    .getElementById("openSubscriptionBtn")
    ?.addEventListener("click", async () => {
    const user = auth.currentUser;

        if (!user) return;

        try {
            const access = await verifySubscriptionAccess(user);

            if (
                access.active === true &&
                ["active", "trial"].includes(access.status)
            ) {
                startSubscriptionCountdown(access);
            }

            showPage("subscriptionPage");
        } catch (error) {
            console.error(
                "Unable to load subscription details:",
                error
            );

            showPage("subscriptionPage");
        }
    });

    document
    .getElementById("subscriptionManageBtn")
    ?.addEventListener("click", () => {
    showPage("subscriptionPage");
    });
    });