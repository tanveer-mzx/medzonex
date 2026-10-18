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
    const el = $("subscriptionMessage");

    if (!el) {
        return;
    }

    el.textContent = message;
    el.style.display = "block";
    el.style.color = success
        ? "#62e6a7"
        : "#ff7b7b";
}

async function getIdToken() {
    const user = auth.currentUser;

    if (!user) {
        throw new Error("Please log in again.");
    }

    return user.getIdToken();
}

/* =====================================================
   CREATE RAZORPAY SUBSCRIPTION
===================================================== */

async function startSubscription(
    planKey,
    button
) {
    if (button?.disabled) {
        return;
    }

    const originalText =
        button?.textContent || "Subscribe";

    try {
        const user = auth.currentUser;

        if (!user) {
            throw new Error("Please log in again.");
        }

        const phone = String(
            $("subscriptionPhone")?.value || ""
        ).trim();

        if (!/^[6-9]\d{9}$/.test(phone)) {
            showSubscriptionMessage(
                "Please enter a valid 10-digit Indian mobile number."
            );

            $("subscriptionPhone")?.focus();
            return;
        }

        if (
            typeof window.Razorpay !== "function"
        ) {
            throw new Error(
                "Razorpay Checkout could not be loaded. Please refresh the page."
            );
        }

        if (button) {
            button.disabled = true;
            button.textContent = "Creating Subscription...";
        }

        showSubscriptionMessage(
            "Connecting to Razorpay...",
            true
        );

        const idToken = await user.getIdToken();

        const response = await fetch(
            `${API_BASE_URL}/api/subscription/create`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    planKey,
                    customerPhone: phone
                })
            }
        );

        let data = {};

        try {
            data = await response.json();
        } catch {
            throw new Error(
                "The server returned an invalid response."
            );
        }

        if (!response.ok || data.success !== true) {
            throw new Error(
                data.message ||
                "Unable to create subscription."
            );
        }

        if (
            !data.subscriptionId ||
            !data.keyId
        ) {
            throw new Error(
                "Razorpay subscription details are incomplete."
            );
        }

        showSubscriptionMessage(
            "Opening secure Razorpay Checkout...",
            true
        );

        let checkout;

        checkout = new window.Razorpay({
            key: data.keyId,

            subscription_id:
                data.subscriptionId,

            name: "MedZoneX",

            description:
                `${data.planName || "MedZoneX Subscription"} subscription`,

            prefill: {
                name: user.displayName || "",
                email: user.email || "",
                contact: phone
            },

            notes: {
                planKey
            },

            theme: {
                color: "#2563eb"
            },

            modal: {
                ondismiss: function () {
                    showSubscriptionMessage(
                        "Checkout closed. Your subscription has not been confirmed."
                    );

                    if (button) {
                        button.disabled = false;
                        button.textContent = originalText;
                    }
                }
            },

            handler: async function (paymentResult) {
                /*
                 * Razorpay's checkout callback alone is not
                 * sufficient to grant subscription access.
                 * The backend webhook must verify payment.
                 */
                showSubscriptionMessage(
                    "Payment submitted. Verifying your subscription...",
                    true
                );

                try {
                    const freshToken =
                        await getIdToken();

                    /*
                     * Ask the backend for the authoritative
                     * subscription status after checkout.
                     */
                    let verified = false;

                    for (
                        let attempt = 0;
                        attempt < 5;
                        attempt++
                    ) {
                        if (attempt > 0) {
                            await new Promise(
                                resolve => setTimeout(resolve, 5000)
                            );
                        }

                        const statusResponse =
                            await fetch(
                                `${API_BASE_URL}/api/subscription/status`,
                                {
                                    method: "GET",
                                    headers: {
                                        "Authorization":
                                            `Bearer ${freshToken}`
                                    }
                                }
                            );

                        const statusData =
                            await statusResponse.json();

                        if (
                            statusResponse.ok &&
                            statusData.success === true &&
                            statusData.active === true &&
                            statusData.status === "active"
                        ) {
                            verified = true;
                            break;
                        }
                    }

                    if (verified) {
                        showSubscriptionMessage(
                            "Subscription verified successfully!",
                            true
                        );

                        window.location.reload();
                        return;
                    }

                    showSubscriptionMessage(
                        "Payment details were received, but subscription activation is still pending. Please wait briefly and refresh the page. If the amount was deducted, do not pay again."
                    );

                } catch (error) {
                    console.error(
                        "Subscription status verification error:",
                        error
                    );

                    showSubscriptionMessage(
                        "We could not confirm activation yet. If the amount was deducted, do not pay again; refresh the page or contact support."
                    );
                } finally {
                    if (button) {
                        button.disabled = false;
                        button.textContent = originalText;
                    }
                }
            }
        });

        checkout.on(
            "payment.failed",
            function (event) {
                console.error(
                    "Razorpay payment failed:",
                    event?.error?.code || "unknown",
                    event?.error?.description || "No description"
                );

                showSubscriptionMessage(
                    "Payment was not completed. Please check the details and try again."
                );

                if (button) {
                    button.disabled = false;
                    button.textContent = originalText;
                }
            }
        );

        checkout.open();

    } catch (error) {
        console.error(
            "Razorpay subscription error:",
            error.message || error
        );

        showSubscriptionMessage(
            error.message ||
            "Subscription could not be started."
        );

        if (button) {
            button.disabled = false;
            button.textContent = originalText;
        }
    }
}

/* =====================================================
   PLAN BUTTONS
===================================================== */

document
    .querySelectorAll(".subscription-plan-btn")
    .forEach((button) => {
        button.addEventListener("click", () => {
            const planKey = button.dataset.plan;

            if (!planKey) {
                showSubscriptionMessage(
                    "Subscription plan is missing."
                );
                return;
            }

            startSubscription(
                planKey,
                button
            );
        });
    });

/* =====================================================
   BACK TO DASHBOARD
===================================================== */

$("closeSubscriptionBtn")
    ?.addEventListener("click", async () => {
        try {
            const user = auth.currentUser;

            if (!user) {
                showSubscriptionMessage(
                    "Please log in again."
                );
                return;
            }

            const idToken = await user.getIdToken();

            const response = await fetch(
                `${API_BASE_URL}/api/subscription/status`,
                {
                    headers: {
                        "Authorization": `Bearer ${idToken}`
                    }
                }
            );

            const access = await response.json();

            if (
                response.ok &&
                access.success === true &&
                access.active === true &&
                (
                    access.status === "active" ||
                    access.status === "trial"
                )
            ) {
                if (
                    typeof window.MedZoneX?.showPage ===
                    "function"
                ) {
                    window.MedZoneX.showPage(
                        "dashboardPage"
                    );
                }

                return;
            }

            showSubscriptionMessage(
                "Your trial has expired or your subscription is inactive. Please choose a plan."
            );

        } catch (error) {
            console.error(
                "Subscription access verification error:",
                error
            );

            showSubscriptionMessage(
                "Unable to verify access. Please try again."
            );
        }
    });

/* =====================================================
   PUBLIC API
===================================================== */

window.MedZoneXSubscription = {
    startSubscription
};
