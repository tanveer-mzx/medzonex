import {
    auth
} from "./firebase.js";


const API_BASE_URL =
    "https://medzonex-backend.onrender.com";


/* =====================================================
   HELPERS
===================================================== */

function $(id) {
    return document.getElementById(id);
}


function showSubscriptionMessage(
    message,
    success = false
) {

    const el =
        $("subscriptionMessage");

    if (!el) {
        return;
    }

    el.textContent =
        message;

    el.style.display =
        "block";

    el.style.color =
        success
            ? "#62e6a7"
            : "#ff7b7b";
}


/* =====================================================
   CREATE CASHFREE SUBSCRIPTION
===================================================== */

async function startSubscription(
    planKey,
    button
) {

    try {

        const user =
            auth.currentUser;


        if (!user) {

            showSubscriptionMessage(
                "Please login again.",
                false
            );

            return;
        }


        /* ---------------------------------------------
           MOBILE NUMBER
        --------------------------------------------- */

        const phone =
            String(
                $("subscriptionPhone")?.value || ""
            ).trim();


        if (!/^[6-9]\d{9}$/.test(phone)) {

            showSubscriptionMessage(
                "Please enter a valid 10-digit Indian mobile number.",
                false
            );

            $("subscriptionPhone")?.focus();

            return;
        }


        /* ---------------------------------------------
           BUTTON STATE
        --------------------------------------------- */

        const originalText =
            button.textContent;

        button.disabled =
            true;

        button.textContent =
            "Creating Subscription...";


        showSubscriptionMessage(
            "Connecting to Cashfree...",
            true
        );


        /* ---------------------------------------------
           FIREBASE ID TOKEN
        --------------------------------------------- */

        const idToken =
            await user.getIdToken();


        /* ---------------------------------------------
           BACKEND
        --------------------------------------------- */

        const response =
            await fetch(
                `${API_BASE_URL}/api/subscription/create`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        "Authorization":
                            `Bearer ${idToken}`
                    },

                    body:
                        JSON.stringify({
                            planKey,
                            customerPhone:
                                phone
                        })
                }
            );


        let data = null;


        try {

            data =
                await response.json();

        } catch {

            data = null;
        }


        if (!response.ok) {

            throw new Error(
                data?.message ||
                data?.error ||
                "Unable to create subscription."
            );
        }


        /* ---------------------------------------------
           SESSION ID
        --------------------------------------------- */

        const sessionId =
            data?.subscriptionSessionId;


        if (!sessionId) {

            console.error(
                "Cashfree response:",
                data
            );

            throw new Error(
                "Cashfree subscription session was not received."
            );
        }


        /* ---------------------------------------------
           CASHFREE CHECKOUT
        --------------------------------------------- */

        if (
            typeof window.Cashfree !==
            "function"
        ) {

            throw new Error(
                "Cashfree SDK is not loaded."
            );
        }


        const cashfree =
            window.Cashfree({
                mode: "sandbox"
            });


        showSubscriptionMessage(
            "Opening Cashfree Checkout...",
            true
        );


        await cashfree.checkout({

            subsSessionId:
                sessionId,

            redirectTarget:
                "_self"
        });


    } catch (error) {

        console.error(
            "Subscription error:",
            error
        );


        showSubscriptionMessage(
            error.message ||
            "Subscription could not be started.",
            false
        );

        if (button) {

            button.disabled =
                false;

            button.textContent =
                "Subscribe";
        }
    }
}


/* =====================================================
   PLAN BUTTONS
===================================================== */

document
    .querySelectorAll(
        ".subscription-plan-btn"
    )
    .forEach((button) => {

        button.addEventListener(
            "click",
            () => {

                const planKey =
                    button.dataset.plan;


                if (!planKey) {

                    showSubscriptionMessage(
                        "Subscription plan is missing.",
                        false
                    );

                    return;
                }


                startSubscription(
                    planKey,
                    button
                );

            }
        );

    });


/* =====================================================
   BACK TO DASHBOARD
===================================================== */

$("closeSubscriptionBtn")
    ?.addEventListener(
        "click",
        () => {

            if (
                typeof window.MedZoneX
                    ?.showPage ===
                "function"
            ) {

                window.MedZoneX
                    .showPage(
                        "dashboardPage"
                    );

            }

        }
    );


/* =====================================================
   PUBLIC API
===================================================== */

window.MedZoneXSubscription = {

    startSubscription

};