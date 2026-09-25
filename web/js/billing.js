// ============================================================
// MEDZONEX - BILLING.JS
// Pharmacy Billing / POS
// No Tax
// No Invoice
// ============================================================

import {
    auth,
    db
} from "./firebase.js";

import {
    collection,
    getDocs,
    doc,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";


// ============================================================
// STATE
// ============================================================

let medicines = [];

let cart = [];

let billingInitialized = false;


// ============================================================
// HELPERS
// ============================================================

function $(id) {
    return document.getElementById(id);
}


function escapeHtml(value) {

    if (value === null || value === undefined) {
        return "";
    }

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function money(value) {

    const number = Number(value) || 0;

    return `₹${number.toFixed(2)}`;

}


function showBillingMessage(message, type = "error") {

    const element = $("billingMessage");

    if (!element) {
        return;
    }

    element.textContent = message;

    element.className =
        `billing-message ${type}`;

    element.style.display = "block";

}


function hideBillingMessage() {

    const element = $("billingMessage");

    if (!element) {
        return;
    }

    element.textContent = "";

    element.style.display = "none";

}


function getCurrentUser() {

    return auth.currentUser;

}


// ============================================================
// LOAD MEDICINES
// ============================================================

async function loadMedicines() {

    const user = getCurrentUser();

    if (!user) {

        showBillingMessage(
            "Please login first."
        );

        return;

    }

    try {

        hideBillingMessage();

        const stockRef =
            collection(
                db,
                "users",
                user.uid,
                "stock"
            );

        const snapshot =
            await getDocs(stockRef);

        medicines = [];

        snapshot.forEach((item) => {

            const data = item.data();

            medicines.push({

                id: item.id,

                ...data

            });

        });

        console.log(
            `Loaded ${medicines.length} medicines.`
        );

        renderSearchResults([]);

        renderCart();

    } catch (error) {

        console.error(
            "Could not load medicines:",
            error
        );

        showBillingMessage(
            "Unable to load medicines. Please try again."
        );

    }

}


// ============================================================
// SEARCH MEDICINES
// ============================================================

function searchMedicines(searchText) {

    const query =
        searchText
            .trim()
            .toLowerCase();

    if (!query) {

        renderSearchResults([]);

        return;

    }

    const results =
        medicines.filter((medicine) => {

            const name =
                String(
                    medicine.name || ""
                ).toLowerCase();

            const salt =
                String(
                    medicine.salt || ""
                ).toLowerCase();

            const manufacturer =
                String(
                    medicine.manufacturer || ""
                ).toLowerCase();

            const batch =
                String(
                    medicine.batch || ""
                ).toLowerCase();

            return (
                name.includes(query) ||
                salt.includes(query) ||
                manufacturer.includes(query) ||
                batch.includes(query)
            );

        });

    renderSearchResults(
        results.slice(0, 20)
    );

}


// ============================================================
// CHECK EXPIRY
// ============================================================

function getExpiryDate(medicine) {

    if (!medicine.expiry) {
        return null;
    }

    if (
        typeof medicine.expiry.toDate ===
        "function"
    ) {

        return medicine.expiry.toDate();

    }

    if (
        medicine.expiry instanceof Date
    ) {

        return medicine.expiry;

    }

    const date =
        new Date(
            medicine.expiry
        );

    if (
        isNaN(
            date.getTime()
        )
    ) {

        return null;

    }

    return date;

}


function isMedicineExpired(medicine) {

    const expiry =
        getExpiryDate(medicine);

    if (!expiry) {
        return false;
    }

    /*
     * Medicine expiry is considered expired after
     * the end of the expiry date.
     */

    const endOfExpiryDay =
        new Date(expiry);

    endOfExpiryDay.setHours(
        23,
        59,
        59,
        999
    );

    return (
        Date.now() >
        endOfExpiryDay.getTime()
    );

}


function formatExpiry(medicine) {

    const expiry =
        getExpiryDate(medicine);

    if (!expiry) {
        return "No expiry";
    }

    return expiry.toLocaleDateString(
        "en-IN",
        {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }
    );

}


// ============================================================
// SEARCH RESULTS UI
// ============================================================

function renderSearchResults(results) {

    const container =
        $("billingSearchResults");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    if (!results.length) {
        return;
    }

    results.forEach((medicine) => {

        const expired =
            isMedicineExpired(medicine);

        const quantity =
            Number(
                medicine.quantity || 0
            );

        const sellingPrice =
            Number(
                medicine.sellingPrice || 0
            );

        const item =
            document.createElement("div");

        item.className =
            "billing-search-item";

        item.innerHTML = `
            <div class="billing-search-item-info">

                <strong>
                    ${escapeHtml(medicine.name || "Unnamed Medicine")}
                </strong>

                <span>
                    ${escapeHtml(medicine.salt || "")}
                </span>

                <small>
                    Batch:
                    ${escapeHtml(medicine.batch || "-")}
                    |
                    Expiry:
                    ${escapeHtml(formatExpiry(medicine))}
                </small>

            </div>

            <div class="billing-search-item-right">

                <strong>
                    ${money(sellingPrice)}
                </strong>

                <span>
                    Stock:
                    ${quantity}
                </span>

                <button
                    type="button"
                    class="billing-add-btn"
                    data-medicine-id="${escapeHtml(medicine.id)}"
                    ${expired || quantity <= 0 ? "disabled" : ""}
                >
                    ${
                        expired
                            ? "Expired"
                            : quantity <= 0
                                ? "Out of Stock"
                                : "Add"
                    }
                </button>

            </div>
        `;

        container.appendChild(item);

    });

    container
        .querySelectorAll(
            ".billing-add-btn"
        )
        .forEach((button) => {

            button.addEventListener(
                "click",
                () => {

                    const medicineId =
                        button.dataset.medicineId;

                    addToCart(
                        medicineId
                    );

                }
            );

        });

}


// ============================================================
// ADD MEDICINE TO CART
// ============================================================

function addToCart(medicineId) {

    const medicine =
        medicines.find(
            (item) =>
                item.id === medicineId
        );

    if (!medicine) {

        showBillingMessage(
            "Medicine not found."
        );

        return;

    }

    if (
        isMedicineExpired(medicine)
    ) {

        showBillingMessage(
            `${medicine.name || "This medicine"} is expired and cannot be billed.`
        );

        return;

    }

    const stock =
        Number(
            medicine.quantity || 0
        );

    if (stock <= 0) {

        showBillingMessage(
            "This medicine is out of stock."
        );

        return;

    }

    const existing =
        cart.find(
            (item) =>
                item.id === medicineId
        );

    if (existing) {

        if (
            existing.cartQuantity >=
            stock
        ) {

            showBillingMessage(
                "You cannot add more than available stock."
            );

            return;

        }

        existing.cartQuantity += 1;

    } else {

        cart.push({

            ...medicine,

            cartQuantity: 1

        });

    }

    hideBillingMessage();

    renderCart();

}


// ============================================================
// UPDATE CART QUANTITY
// ============================================================

function updateCartQuantity(
    medicineId,
    quantity
) {

    const item =
        cart.find(
            (medicine) =>
                medicine.id === medicineId
        );

    if (!item) {
        return;
    }

    const stock =
        Number(
            item.quantity || 0
        );

    let newQuantity =
        Number(quantity);

    if (
        isNaN(newQuantity)
    ) {

        newQuantity = 1;

    }

    newQuantity =
        Math.floor(
            newQuantity
        );

    if (newQuantity <= 0) {

        removeFromCart(
            medicineId
        );

        return;

    }

    if (
        newQuantity > stock
    ) {

        newQuantity = stock;

        showBillingMessage(
            "Quantity cannot exceed available stock."
        );

    }

    item.cartQuantity =
        newQuantity;

    renderCart();

}


// ============================================================
// REMOVE FROM CART
// ============================================================

function removeFromCart(medicineId) {

    cart =
        cart.filter(
            (item) =>
                item.id !== medicineId
        );

    renderCart();

}


// ============================================================
// CART SUBTOTAL
// ============================================================

function calculateSubtotal() {

    return cart.reduce(
        (total, item) => {

            const price =
                Number(
                    item.sellingPrice || 0
                );

            const quantity =
                Number(
                    item.cartQuantity || 0
                );

            return (
                total +
                (price * quantity)
            );

        },
        0
    );

}


// ============================================================
// DISCOUNT
// ============================================================

function getDiscount() {

    const input =
        $("billingDiscount");

    if (!input) {
        return 0;
    }

    let discount =
        Number(
            input.value
        );

    if (
        isNaN(discount) ||
        discount < 0
    ) {

        discount = 0;

    }

    return discount;

}


// ============================================================
// TOTAL
// ============================================================

function calculateTotal() {

    const subtotal =
        calculateSubtotal();

    const discount =
        getDiscount();

    return Math.max(
        0,
        subtotal - discount
    );

}


// ============================================================
// RENDER CART
// ============================================================

function renderCart() {

    const container =
        $("billingCart");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    if (!cart.length) {

        container.innerHTML = `
            <div class="billing-cart-empty">

                <div class="billing-cart-empty-icon">
                    🛒
                </div>

                <p>
                    No medicines added yet.
                </p>

                <small>
                    Search and add medicines to create a bill.
                </small>

            </div>
        `;

    } else {

        cart.forEach((item) => {

            const price =
                Number(
                    item.sellingPrice || 0
                );

            const quantity =
                Number(
                    item.cartQuantity || 0
                );

            const lineTotal =
                price * quantity;

            const row =
                document.createElement(
                    "div"
                );

            row.className =
                "billing-cart-item";

            row.innerHTML = `
                <div class="billing-cart-item-info">

                    <strong>
                        ${escapeHtml(
                            item.name ||
                            "Unnamed Medicine"
                        )}
                    </strong>

                    <small>
                        Batch:
                        ${escapeHtml(
                            item.batch || "-"
                        )}
                    </small>

                    <small>
                        ${money(price)} each
                    </small>

                </div>

                <div class="billing-cart-item-controls">

                    <button
                        type="button"
                        class="cart-qty-btn"
                        data-action="minus"
                        data-id="${escapeHtml(item.id)}"
                    >
                        −
                    </button>

                    <input
                        type="number"
                        min="1"
                        max="${Number(item.quantity || 0)}"
                        value="${quantity}"
                        class="cart-qty-input"
                        data-id="${escapeHtml(item.id)}"
                    />

                    <button
                        type="button"
                        class="cart-qty-btn"
                        data-action="plus"
                        data-id="${escapeHtml(item.id)}"
                    >
                        +
                    </button>

                </div>

                <div class="billing-cart-item-total">

                    <strong>
                        ${money(lineTotal)}
                    </strong>

                    <button
                        type="button"
                        class="cart-remove-btn"
                        data-id="${escapeHtml(item.id)}"
                    >
                        Remove
                    </button>

                </div>
            `;

            container.appendChild(row);

        });

        // Quantity buttons

        container
            .querySelectorAll(
                ".cart-qty-btn"
            )
            .forEach((button) => {

                button.addEventListener(
                    "click",
                    () => {

                        const id =
                            button.dataset.id;

                        const item =
                            cart.find(
                                (medicine) =>
                                    medicine.id === id
                            );

                        if (!item) {
                            return;
                        }

                        let quantity =
                            Number(
                                item.cartQuantity
                            );

                        if (
                            button.dataset.action ===
                            "plus"
                        ) {

                            quantity += 1;

                        } else {

                            quantity -= 1;

                        }

                        updateCartQuantity(
                            id,
                            quantity
                        );

                    }
                );

            });

        // Quantity inputs

        container
            .querySelectorAll(
                ".cart-qty-input"
            )
            .forEach((input) => {

                input.addEventListener(
                    "change",
                    () => {

                        updateCartQuantity(
                            input.dataset.id,
                            input.value
                        );

                    }
                );

            });

        // Remove buttons

        container
            .querySelectorAll(
                ".cart-remove-btn"
            )
            .forEach((button) => {

                button.addEventListener(
                    "click",
                    () => {

                        removeFromCart(
                            button.dataset.id
                        );

                    }
                );

            });

    }

    updateBillTotals();

}


// ============================================================
// UPDATE BILL TOTALS
// ============================================================

function updateBillTotals() {

    const subtotal =
        calculateSubtotal();

    const discount =
        getDiscount();

    const total =
        Math.max(
            0,
            subtotal - discount
        );

    if ($("billingSubtotal")) {

        $("billingSubtotal").textContent =
            money(subtotal);

    }

    if ($("billingDiscountAmount")) {

        $("billingDiscountAmount").textContent =
            money(discount);

    }

    if ($("billingGrandTotal")) {

        $("billingGrandTotal").textContent =
            money(total);

    }

}


// ============================================================
// CLEAR BILL
// ============================================================

function clearBill() {

    cart = [];

    if ($("billingCustomerName")) {
        $("billingCustomerName").value = "";
    }

    if ($("billingCustomerPhone")) {
        $("billingCustomerPhone").value = "";
    }

    if ($("billingDiscount")) {
        $("billingDiscount").value = "0";
    }

    if ($("billingPaymentMethod")) {
        $("billingPaymentMethod").value = "cash";
    }

    const search =
        $("billingMedicineSearch");

    if (search) {
        search.value = "";
    }

    renderSearchResults([]);

    renderCart();

    hideBillingMessage();

}


// ============================================================
// VALIDATE CART
// ============================================================

function validateCart() {

    if (!cart.length) {

        return {
            valid: false,
            message: "Please add at least one medicine."
        };

    }

    for (const item of cart) {

        if (
            isMedicineExpired(item)
        ) {

            return {
                valid: false,
                message:
                    `${item.name || "Medicine"} is expired. Remove it from the bill.`
            };

        }

        const quantity =
            Number(
                item.cartQuantity || 0
            );

        const stock =
            Number(
                item.quantity || 0
            );

        if (quantity <= 0) {

            return {
                valid: false,
                message:
                    `${item.name || "Medicine"} has an invalid quantity.`
            };

        }

        if (quantity > stock) {

            return {
                valid: false,
                message:
                    `Not enough stock for ${item.name || "medicine"}.`
            };

        }

        const price =
            Number(
                item.sellingPrice || 0
            );

        if (
            price < 0
        ) {

            return {
                valid: false,
                message:
                    `${item.name || "Medicine"} has an invalid selling price.`
            };

        }

    }

    return {
        valid: true
    };

}


// ============================================================
// VALIDATE CUSTOMER PHONE
// ============================================================

function validateCustomerPhone(phone) {

    if (!phone) {
        return true;
    }

    const cleaned =
        phone.replace(
            /[\s-]/g,
            ""
        );

    return (
        /^(\+91)?[6-9]\d{9}$/.test(
            cleaned
        )
    );

}


// ============================================================
// COMPLETE SALE
// ============================================================

async function completeSale() {

    hideBillingMessage();

    const user =
        getCurrentUser();

    if (!user) {

        showBillingMessage(
            "Your login session has expired. Please login again."
        );

        return;

    }

    const validation =
        validateCart();

    if (!validation.valid) {

        showBillingMessage(
            validation.message
        );

        return;

    }

    const customerName =
        $("billingCustomerName")?.value
            .trim() || "";

    const customerPhone =
        $("billingCustomerPhone")?.value
            .trim() || "";

    const paymentMethod =
        $("billingPaymentMethod")?.value ||
        "cash";

    if (
        !validateCustomerPhone(
            customerPhone
        )
    ) {

        showBillingMessage(
            "Please enter a valid customer mobile number."
        );

        return;

    }

    const discount =
        getDiscount();

    const subtotal =
        calculateSubtotal();

    if (
        discount > subtotal
    ) {

        showBillingMessage(
            "Discount cannot be greater than subtotal."
        );

        return;

    }

    const grandTotal =
        Math.max(
            0,
            subtotal - discount
        );

    const button =
        $("completeSaleBtn");

    if (button) {

        button.disabled = true;

        button.dataset.originalText =
            button.textContent;

        button.textContent =
            "Processing...";

    }

    try {

        /*
         * We use a Firestore transaction.
         *
         * This is important because two billing screens
         * could otherwise sell the same stock simultaneously.
         */

        const saleId =
            await runTransaction(
                db,
                async (transaction) => {

                    const freshItems = [];

                    // ------------------------------------------------
                    // READ ALL STOCK DOCUMENTS FIRST
                    // ------------------------------------------------

                    for (const cartItem of cart) {

                        const stockRef =
                            doc(
                                db,
                                "users",
                                user.uid,
                                "stock",
                                cartItem.id
                            );

                        const stockSnapshot =
                            await transaction.get(
                                stockRef
                            );

                        if (
                            !stockSnapshot.exists()
                        ) {

                            throw new Error(
                                `${cartItem.name || "Medicine"} no longer exists in stock.`
                            );

                        }

                        const freshData =
                            stockSnapshot.data();

                        freshItems.push({

                            ref: stockRef,

                            data: freshData,

                            cartItem: cartItem

                        });

                    }

                    // ------------------------------------------------
                    // VALIDATE FRESH STOCK
                    // ------------------------------------------------

                    let freshSubtotal = 0;

                    const saleItems = [];

                    for (
                        const item
                        of freshItems
                    ) {

                        const data =
                            item.data;

                        const cartItem =
                            item.cartItem;

                        const currentQuantity =
                            Number(
                                data.quantity || 0
                            );

                        const requestedQuantity =
                            Number(
                                cartItem.cartQuantity || 0
                            );

                        // Fresh expiry check

                        if (
                            isMedicineExpired(
                                data
                            )
                        ) {

                            throw new Error(
                                `${data.name || "Medicine"} is expired and cannot be sold.`
                            );

                        }

                        if (
                            currentQuantity <
                            requestedQuantity
                        ) {

                            throw new Error(
                                `Only ${currentQuantity} unit(s) of ${data.name || "medicine"} are available.`
                            );

                        }

                        const sellingPrice =
                            Number(
                                data.sellingPrice || 0
                            );

                        if (
                            sellingPrice < 0
                        ) {

                            throw new Error(
                                `Invalid selling price for ${data.name || "medicine"}.`
                            );

                        }

                        const lineTotal =
                            sellingPrice *
                            requestedQuantity;

                        freshSubtotal +=
                            lineTotal;

                        saleItems.push({

                            stockId:
                                cartItem.id,

                            name:
                                data.name || "",

                            salt:
                                data.salt || "",

                            manufacturer:
                                data.manufacturer || "",

                            batch:
                                data.batch || "",

                            expiry:
                                data.expiry || null,

                            quantity:
                                requestedQuantity,

                            sellingPrice:
                                sellingPrice,

                            lineTotal:
                                lineTotal

                        });

                    }

                    // ------------------------------------------------
                    // RECALCULATE DISCOUNT USING FRESH STOCK PRICES
                    // ------------------------------------------------

                    const freshDiscount =
                        Math.min(
                            Math.max(
                                0,
                                discount
                            ),
                            freshSubtotal
                        );

                    const freshGrandTotal =
                        Math.max(
                            0,
                            freshSubtotal -
                            freshDiscount
                        );

                    // ------------------------------------------------
                    // UPDATE STOCK
                    // ------------------------------------------------

                    for (
                        const item
                        of freshItems
                    ) {

                        const currentQuantity =
                            Number(
                                item.data.quantity ||
                                0
                            );

                        const requestedQuantity =
                            Number(
                                item.cartItem.cartQuantity ||
                                0
                            );

                        const newQuantity =
                            currentQuantity -
                            requestedQuantity;

                        transaction.update(
                            item.ref,
                            {
                                quantity:
                                    newQuantity,

                                updatedAt:
                                    serverTimestamp()
                            }
                        );

                    }

                    // ------------------------------------------------
                    // CREATE SALE DOCUMENT
                    // ------------------------------------------------

                    const salesCollection =
                        collection(
                            db,
                            "users",
                            user.uid,
                            "sales"
                        );

                    const saleRef =
                        doc(
                            salesCollection
                        );

                    transaction.set(
                        saleRef,
                        {

                            // Sale identification
                            saleId:
                                saleRef.id,

                            userId:
                                user.uid,

                            // Customer
                            customerName:
                                customerName,

                            customerPhone:
                                customerPhone,

                            // Items
                            items:
                                saleItems,

                            // Amounts
                            subtotal:
                                freshSubtotal,

                            discount:
                                freshDiscount,

                            grandTotal:
                                freshGrandTotal,

                            // Payment
                            paymentMethod:
                                paymentMethod,

                            paymentStatus:
                                "paid",

                            // Time
                            createdAt:
                                serverTimestamp(),

                            updatedAt:
                                serverTimestamp()

                        }
                    );

                    return saleRef.id;

                }
            );

        console.log(
            "Sale completed:",
            saleId
        );

        showBillingMessage(
            `Sale completed successfully. Sale ID: ${saleId}`,
            "success"
        );

        // --------------------------------------------------------
        // CLEAR CART
        // --------------------------------------------------------

        cart = [];

        if ($("billingCustomerName")) {
            $("billingCustomerName").value = "";
        }

        if ($("billingCustomerPhone")) {
            $("billingCustomerPhone").value = "";
        }

        if ($("billingDiscount")) {
            $("billingDiscount").value = "0";
        }

        if ($("billingPaymentMethod")) {
            $("billingPaymentMethod").value = "cash";
        }

        if ($("billingMedicineSearch")) {
            $("billingMedicineSearch").value = "";
        }

        renderSearchResults([]);

        renderCart();

        // Reload fresh stock

        await loadMedicines();

    } catch (error) {

        console.error(
            "Sale transaction failed:",
            error
        );

        showBillingMessage(
            error.message ||
            "Unable to complete sale."
        );

    } finally {

        if (button) {

            button.disabled = false;

            button.textContent =
                button.dataset.originalText ||
                "Complete Sale";

        }

    }

}


// ============================================================
// SEARCH INPUT
// ============================================================

$("billingMedicineSearch")?.addEventListener(
    "input",
    (event) => {

        searchMedicines(
            event.target.value
        );

    }
);


// ============================================================
// DISCOUNT INPUT
// ============================================================

$("billingDiscount")?.addEventListener(
    "input",
    () => {

        let value =
            Number(
                $("billingDiscount").value
            );

        if (
            isNaN(value) ||
            value < 0
        ) {

            value = 0;

        }

        const subtotal =
            calculateSubtotal();

        if (
            value > subtotal
        ) {

            value = subtotal;

            $("billingDiscount").value =
                value;

        }

        updateBillTotals();

    }
);


// ============================================================
// COMPLETE SALE BUTTON
// ============================================================

$("completeSaleBtn")?.addEventListener(
    "click",
    () => {

        completeSale();

    }
);


// ============================================================
// CLEAR BILL BUTTON
// ============================================================

$("clearBillBtn")?.addEventListener(
    "click",
    () => {

        clearBill();

    }
);


// ============================================================
// PAYMENT METHOD CHANGE
// ============================================================

$("billingPaymentMethod")?.addEventListener(
    "change",
    () => {

        hideBillingMessage();

    }
);


// ============================================================
// INITIALIZE
// ============================================================

function initializeBilling() {

    if (billingInitialized) {
        return;
    }

    billingInitialized = true;

    console.log(
        "MedZoneX Billing initialized."
    );

}


// ============================================================
// PUBLIC BILLING API
// ============================================================

window.MedZoneXBilling = {

    loadMedicines,

    searchMedicines,

    addToCart,

    updateCartQuantity,

    removeFromCart,

    clearBill,

    calculateSubtotal,

    calculateTotal,

    getCart() {

        return [...cart];

    },

    getMedicines() {

        return [...medicines];

    }

};


// ============================================================
// START
// ============================================================

initializeBilling();

console.log(
    "MedZoneX Billing.js loaded successfully."
);