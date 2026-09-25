// ============================================================
// MedZoneX - Purchase / Stock In Module
// ============================================================

import { auth, db } from "./firebase.js";

import {
    collection,
    getDocs,
    addDoc,
    doc,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";


// ============================================================
// STATE
// ============================================================

let purchaseItems = [];
let suppliers = [];

let purchaseInitialized = false;


// ============================================================
// HELPERS
// ============================================================

function getCurrentUser() {
    return auth.currentUser;
}


function showPurchaseMessage(message, type = "info") {

    const box = document.getElementById("purchaseMessage");

    if (!box) return;

    box.textContent = message;

    box.className = `purchase-message ${type}`;

    setTimeout(() => {
        if (box) {
            box.textContent = "";
            box.className = "purchase-message";
        }
    }, 4000);
}


function money(value) {

    return Number(value || 0).toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    });
}


function escapeHTML(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function getToday() {

    const now = new Date();

    const year = now.getFullYear();

    const month = String(now.getMonth() + 1).padStart(2, "0");

    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


// ============================================================
// INITIALIZE
// ============================================================

async function initPurchases() {

    if (purchaseInitialized) {

        await loadPurchaseHistory();

        return;
    }

    purchaseInitialized = true;

    const purchaseDate = document.getElementById("purchaseDate");

    if (purchaseDate && !purchaseDate.value) {
        purchaseDate.value = getToday();
    }

    setupPurchaseEvents();

    await loadSuppliers();

    await loadPurchaseHistory();

    calculatePurchaseTotal();
}


// ============================================================
// EVENTS
// ============================================================

function setupPurchaseEvents() {

    const addItemBtn =
        document.getElementById("addPurchaseItemBtn");

    if (addItemBtn) {

        addItemBtn.addEventListener(
            "click",
            addPurchaseItem
        );
    }


    const saveBtn =
        document.getElementById("savePurchaseBtn");

    if (saveBtn) {

        saveBtn.addEventListener(
            "click",
            savePurchase
        );
    }


    const clearBtn =
        document.getElementById("clearPurchaseBtn");

    if (clearBtn) {

        clearBtn.addEventListener(
            "click",
            clearPurchaseForm
        );
    }


    const refreshBtn =
        document.getElementById("refreshPurchaseHistoryBtn");

    if (refreshBtn) {

        refreshBtn.addEventListener(
            "click",
            loadPurchaseHistory
        );
    }


    const supplierSelect =
        document.getElementById("purchaseSupplier");

    if (supplierSelect) {

        supplierSelect.addEventListener(
            "change",
            handleSupplierChange
        );
    }


    const discountInput =
        document.getElementById("purchaseDiscount");

    if (discountInput) {

        discountInput.addEventListener(
            "input",
            calculatePurchaseTotal
        );
    }


    const paidInput =
        document.getElementById("purchasePaidAmount");

    if (paidInput) {

        paidInput.addEventListener(
            "input",
            calculatePurchaseTotal
        );
    }


    const purchaseSearch =
        document.getElementById("purchaseMedicineSearch");

    if (purchaseSearch) {

        purchaseSearch.addEventListener(
            "input",
            searchExistingMedicines
        );
    }
}


// ============================================================
// SUPPLIERS
// ============================================================

async function loadSuppliers() {

    const user = getCurrentUser();

    if (!user) return;

    try {

        const suppliersRef =
            collection(
                db,
                "users",
                user.uid,
                "suppliers"
            );

        const snapshot =
            await getDocs(suppliersRef);

        suppliers = [];

        snapshot.forEach((item) => {

            suppliers.push({
                id: item.id,
                ...item.data()
            });

        });

        renderSupplierDropdown();

    } catch (error) {

        console.error(
            "Failed to load suppliers:",
            error
        );
    }
}


function renderSupplierDropdown() {

    const select =
        document.getElementById("purchaseSupplier");

    if (!select) return;

    select.innerHTML = `
        <option value="">Select supplier</option>
    `;

    suppliers.forEach((supplier) => {

        const option =
            document.createElement("option");

        option.value = supplier.id;

        option.textContent =
            supplier.name ||
            supplier.supplierName ||
            "Unnamed Supplier";

        select.appendChild(option);

    });
}


function handleSupplierChange() {

    const select =
        document.getElementById("purchaseSupplier");

    const supplierName =
        document.getElementById("purchaseSupplierName");

    const supplierPhone =
        document.getElementById("purchaseSupplierPhone");

    if (!select) return;

    const supplier =
        suppliers.find(
            item => item.id === select.value
        );

    if (!supplier) {

        if (supplierName) supplierName.value = "";

        if (supplierPhone) supplierPhone.value = "";

        return;
    }

    if (supplierName) {

        supplierName.value =
            supplier.name ||
            supplier.supplierName ||
            "";
    }

    if (supplierPhone) {

        supplierPhone.value =
            supplier.phone ||
            "";
    }
}


// ============================================================
// SEARCH EXISTING MEDICINES
// ============================================================

async function searchExistingMedicines() {

    const input =
        document.getElementById(
            "purchaseMedicineSearch"
        );

    const results =
        document.getElementById(
            "purchaseMedicineResults"
        );

    if (!input || !results) return;

    const query =
        input.value.trim().toLowerCase();

    if (!query) {

        results.innerHTML = "";

        return;
    }

    const user = getCurrentUser();

    if (!user) return;

    try {

        const stockRef =
            collection(
                db,
                "users",
                user.uid,
                "stock"
            );

        const snapshot =
            await getDocs(stockRef);

        const matches = [];

        snapshot.forEach((item) => {

            const data = item.data();

            const searchable = [
                data.name,
                data.salt,
                data.manufacturer,
                data.batch
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            if (searchable.includes(query)) {

                matches.push({
                    id: item.id,
                    ...data
                });

            }

        });

        renderMedicineSearchResults(matches);

    } catch (error) {

        console.error(error);

        showPurchaseMessage(
            "Unable to search medicines.",
            "error"
        );
    }
}


function renderMedicineSearchResults(items) {

    const results =
        document.getElementById(
            "purchaseMedicineResults"
        );

    if (!results) return;

    if (!items.length) {

        results.innerHTML = `
            <div class="purchase-search-empty">
                No existing medicine found.
            </div>
        `;

        return;
    }

    results.innerHTML =
        items.slice(0, 10).map(item => {

            return `
                <button
                    type="button"
                    class="purchase-search-item"
                    data-id="${escapeHTML(item.id)}"
                >

                    <strong>
                        ${escapeHTML(item.name || "Medicine")}
                    </strong>

                    <span>
                        ${escapeHTML(item.salt || "")}
                    </span>

                    <small>
                        Batch:
                        ${escapeHTML(item.batch || "N/A")}
                        |
                        Stock:
                        ${Number(item.quantity || 0)}
                    </small>

                </button>
            `;

        }).join("");


    results
        .querySelectorAll(".purchase-search-item")
        .forEach(button => {

            button.addEventListener(
                "click",
                async () => {

                    await selectExistingMedicine(
                        button.dataset.id
                    );

                }
            );

        });
}


async function selectExistingMedicine(stockId) {

    const user = getCurrentUser();

    if (!user) return;

    try {

        const stockRef =
            doc(
                db,
                "users",
                user.uid,
                "stock",
                stockId
            );

        const snapshot =
            await import(
                "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js"
            );

        const item =
            await snapshot.getDoc(stockRef);

        if (!item.exists()) return;

        const data = item.data();

        document.getElementById(
            "purchaseMedicineName"
        ).value = data.name || "";

        document.getElementById(
            "purchaseMedicineSalt"
        ).value = data.salt || "";

        document.getElementById(
            "purchaseMedicineManufacturer"
        ).value = data.manufacturer || "";

        document.getElementById(
            "purchaseMedicineBatch"
        ).value = "";

        document.getElementById(
            "purchaseMedicineExpiry"
        ).value = "";

        document.getElementById(
            "purchaseMedicinePurchasePrice"
        ).value = data.purchasePrice || "";

        document.getElementById(
            "purchaseMedicineSellingPrice"
        ).value = data.sellingPrice || "";

        const results =
            document.getElementById(
                "purchaseMedicineResults"
            );

        if (results) {
            results.innerHTML = "";
        }

        const search =
            document.getElementById(
                "purchaseMedicineSearch"
            );

        if (search) {
            search.value = "";
        }

        showPurchaseMessage(
            "Medicine details loaded. Enter the new batch, expiry and quantity.",
            "success"
        );

    } catch (error) {

        console.error(error);

        showPurchaseMessage(
            "Unable to load medicine.",
            "error"
        );
    }
}


// ============================================================
// ADD PURCHASE ITEM
// ============================================================

function addPurchaseItem() {

    const name =
        document.getElementById(
            "purchaseMedicineName"
        )?.value.trim();

    const salt =
        document.getElementById(
            "purchaseMedicineSalt"
        )?.value.trim();

    const manufacturer =
        document.getElementById(
            "purchaseMedicineManufacturer"
        )?.value.trim();

    const batch =
        document.getElementById(
            "purchaseMedicineBatch"
        )?.value.trim();

    const expiry =
        document.getElementById(
            "purchaseMedicineExpiry"
        )?.value;

    const purchasePrice =
        Number(
            document.getElementById(
                "purchaseMedicinePurchasePrice"
            )?.value || 0
        );

    const sellingPrice =
        Number(
            document.getElementById(
                "purchaseMedicineSellingPrice"
            )?.value || 0
        );

    const quantity =
        Number(
            document.getElementById(
                "purchaseMedicineQuantity"
            )?.value || 0
        );


    // -------------------------
    // VALIDATION
    // -------------------------

    if (!name) {

        showPurchaseMessage(
            "Medicine name is required.",
            "error"
        );

        return;
    }

    if (!batch) {

        showPurchaseMessage(
            "Batch number is required.",
            "error"
        );

        return;
    }

    if (!expiry) {

        showPurchaseMessage(
            "Expiry date is required.",
            "error"
        );

        return;
    }

    if (purchasePrice <= 0) {

        showPurchaseMessage(
            "Purchase price must be greater than 0.",
            "error"
        );

        return;
    }

    if (sellingPrice <= 0) {

        showPurchaseMessage(
            "Selling price must be greater than 0.",
            "error"
        );

        return;
    }

    if (quantity <= 0) {

        showPurchaseMessage(
            "Quantity must be greater than 0.",
            "error"
        );

        return;
    }


    // -------------------------
    // EXPIRY VALIDATION
    // -------------------------

    const expiryDate =
        new Date(`${expiry}T23:59:59`);

    const today =
        new Date();

    if (expiryDate <= today) {

        showPurchaseMessage(
            "Expired medicine cannot be added.",
            "error"
        );

        return;
    }


    // -------------------------
    // ITEM
    // -------------------------

    const item = {

        localId:
            `${Date.now()}_${Math.random()
                .toString(36)
                .slice(2, 8)}`,

        name,

        salt,

        manufacturer,

        batch,

        expiry,

        purchasePrice,

        sellingPrice,

        quantity,

        total:
            purchasePrice * quantity

    };


    purchaseItems.push(item);

    renderPurchaseItems();

    calculatePurchaseTotal();

    clearMedicineEntryFields();
}


// ============================================================
// RENDER PURCHASE ITEMS
// ============================================================

function renderPurchaseItems() {

    const container =
        document.getElementById(
            "purchaseItemsList"
        );

    if (!container) return;


    if (!purchaseItems.length) {

        container.innerHTML = `
            <div class="purchase-empty">
                No medicines added to this purchase.
            </div>
        `;

        return;
    }


    container.innerHTML =
        purchaseItems.map((item, index) => {

            return `
                <div
                    class="purchase-item-card"
                    data-index="${index}"
                >

                    <div class="purchase-item-main">

                        <strong>
                            ${escapeHTML(item.name)}
                        </strong>

                        <span>
                            ${escapeHTML(item.salt || "")}
                        </span>

                        <small>
                            Manufacturer:
                            ${escapeHTML(
                                item.manufacturer || "N/A"
                            )}
                        </small>

                    </div>


                    <div class="purchase-item-details">

                        <div>
                            <label>Batch</label>
                            <span>
                                ${escapeHTML(item.batch)}
                            </span>
                        </div>

                        <div>
                            <label>Expiry</label>
                            <span>
                                ${escapeHTML(item.expiry)}
                            </span>
                        </div>

                        <div>
                            <label>Qty</label>
                            <span>
                                ${item.quantity}
                            </span>
                        </div>

                        <div>
                            <label>Purchase</label>
                            <span>
                                ${money(item.purchasePrice)}
                            </span>
                        </div>

                        <div>
                            <label>Selling</label>
                            <span>
                                ${money(item.sellingPrice)}
                            </span>
                        </div>

                        <div>
                            <label>Total</label>
                            <strong>
                                ${money(item.total)}
                            </strong>
                        </div>

                    </div>


                    <button
                        type="button"
                        class="purchase-remove-btn"
                        data-index="${index}"
                    >
                        Remove
                    </button>

                </div>
            `;

        }).join("");


    container
        .querySelectorAll(".purchase-remove-btn")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const index =
                        Number(button.dataset.index);

                    purchaseItems.splice(index, 1);

                    renderPurchaseItems();

                    calculatePurchaseTotal();

                }
            );

        });
}


// ============================================================
// CLEAR MEDICINE INPUTS
// ============================================================

function clearMedicineEntryFields() {

    const ids = [

        "purchaseMedicineName",

        "purchaseMedicineSalt",

        "purchaseMedicineManufacturer",

        "purchaseMedicineBatch",

        "purchaseMedicineExpiry",

        "purchaseMedicinePurchasePrice",

        "purchaseMedicineSellingPrice",

        "purchaseMedicineQuantity"

    ];

    ids.forEach(id => {

        const element =
            document.getElementById(id);

        if (element) {
            element.value = "";
        }

    });

}


// ============================================================
// CALCULATE TOTAL
// ============================================================

function calculatePurchaseTotal() {

    const subtotal =
        purchaseItems.reduce(
            (sum, item) =>
                sum + Number(item.total || 0),
            0
        );


    const discount =
        Number(
            document.getElementById(
                "purchaseDiscount"
            )?.value || 0
        );


    const safeDiscount =
        Math.min(
            Math.max(discount, 0),
            subtotal
        );


    const grandTotal =
        subtotal - safeDiscount;


    const paidAmount =
        Number(
            document.getElementById(
                "purchasePaidAmount"
            )?.value || 0
        );


    const balance =
        Math.max(
            grandTotal - paidAmount,
            0
        );


    const subtotalElement =
        document.getElementById(
            "purchaseSubtotal"
        );

    const discountElement =
        document.getElementById(
            "purchaseDiscountAmount"
        );

    const totalElement =
        document.getElementById(
            "purchaseGrandTotal"
        );

    const balanceElement =
        document.getElementById(
            "purchaseBalance"
        );


    if (subtotalElement) {

        subtotalElement.textContent =
            money(subtotal);

    }

    if (discountElement) {

        discountElement.textContent =
            money(safeDiscount);

    }

    if (totalElement) {

        totalElement.textContent =
            money(grandTotal);

    }

    if (balanceElement) {

        balanceElement.textContent =
            money(balance);

    }


    return {

        subtotal,

        discount: safeDiscount,

        grandTotal,

        paidAmount,

        balance

    };
}


// ============================================================
// SAVE PURCHASE
// ============================================================

async function savePurchase() {

    const user = getCurrentUser();

    if (!user) {

        showPurchaseMessage(
            "Please login first.",
            "error"
        );

        return;
    }


    if (!purchaseItems.length) {

        showPurchaseMessage(
            "Add at least one medicine.",
            "error"
        );

        return;
    }


    const supplierId =
        document.getElementById(
            "purchaseSupplier"
        )?.value || "";


    const supplierName =
        document.getElementById(
            "purchaseSupplierName"
        )?.value.trim() || "";


    const supplierPhone =
        document.getElementById(
            "purchaseSupplierPhone"
        )?.value.trim() || "";


    const purchaseDate =
        document.getElementById(
            "purchaseDate"
        )?.value || getToday();


    const invoiceReference =
        document.getElementById(
            "purchaseReference"
        )?.value.trim() || "";


    const paymentMethod =
        document.getElementById(
            "purchasePaymentMethod"
        )?.value || "cash";


    const totals =
        calculatePurchaseTotal();


    if (!supplierName) {

        showPurchaseMessage(
            "Supplier name is required.",
            "error"
        );

        return;
    }


    if (!purchaseDate) {

        showPurchaseMessage(
            "Purchase date is required.",
            "error"
        );

        return;
    }


    const saveButton =
        document.getElementById(
            "savePurchaseBtn"
        );


    if (saveButton) {

        saveButton.disabled = true;

        saveButton.textContent =
            "Saving...";
    }


    try {

        const stockCollection =
            collection(
                db,
                "users",
                user.uid,
                "stock"
            );


        const purchaseCollection =
            collection(
                db,
                "users",
                user.uid,
                "purchases"
            );


        const purchaseRef =
            doc(purchaseCollection);


        await runTransaction(
            db,
            async transaction => {

                const stockRefs = [];

                for (const item of purchaseItems) {

                    const stockRef =
                        doc(stockCollection);

                    stockRefs.push({
                        item,
                        ref: stockRef
                    });

                }


                /*
                 * Create stock records.
                 *
                 * Each purchase item gets its own stock
                 * document. This is useful because different
                 * batches can have different expiry dates.
                 */

                for (const stockItem of stockRefs) {

                    const item =
                        stockItem.item;

                    const stockRef =
                        stockItem.ref;


                    transaction.set(
                        stockRef,
                        {

                            name:
                                item.name,

                            salt:
                                item.salt || "",

                            manufacturer:
                                item.manufacturer || "",

                            batch:
                                item.batch,

                            expiry:
                                item.expiry,

                            purchasePrice:
                                Number(
                                    item.purchasePrice
                                ),

                            sellingPrice:
                                Number(
                                    item.sellingPrice
                                ),

                            quantity:
                                Number(
                                    item.quantity
                                ),

                            minimumStock:
                                10,

                            source:
                                "purchase",

                            purchaseId:
                                purchaseRef.id,

                            supplierId:
                                supplierId,

                            supplierName:
                                supplierName,

                            createdAt:
                                serverTimestamp(),

                            updatedAt:
                                serverTimestamp()

                        }
                    );

                }


                transaction.set(
                    purchaseRef,
                    {

                        purchaseId:
                            purchaseRef.id,

                        userId:
                            user.uid,

                        supplierId:
                            supplierId,

                        supplierName:
                            supplierName,

                        supplierPhone:
                            supplierPhone,

                        purchaseDate:
                            purchaseDate,

                        reference:
                            invoiceReference,

                        paymentMethod:
                            paymentMethod,

                        items:
                            purchaseItems.map(
                                item => ({

                                    name:
                                        item.name,

                                    salt:
                                        item.salt || "",

                                    manufacturer:
                                        item.manufacturer || "",

                                    batch:
                                        item.batch,

                                    expiry:
                                        item.expiry,

                                    purchasePrice:
                                        Number(
                                            item.purchasePrice
                                        ),

                                    sellingPrice:
                                        Number(
                                            item.sellingPrice
                                        ),

                                    quantity:
                                        Number(
                                            item.quantity
                                        ),

                                    total:
                                        Number(
                                            item.total
                                        )

                                })
                            ),

                        subtotal:
                            totals.subtotal,

                        discount:
                            totals.discount,

                        grandTotal:
                            totals.grandTotal,

                        paidAmount:
                            totals.paidAmount,

                        balance:
                            totals.balance,

                        paymentStatus:
                            totals.balance <= 0
                                ? "paid"
                                : "pending",

                        createdAt:
                            serverTimestamp(),

                        updatedAt:
                            serverTimestamp()

                    }
                );

            }
        );


        showPurchaseMessage(
            "Purchase saved and stock added successfully.",
            "success"
        );


        clearPurchaseForm();


        await loadPurchaseHistory();


        /*
         * Refresh Inventory if its module is loaded.
         */

        if (
            window.MedZoneXInventory &&
            typeof
            window.MedZoneXInventory.loadInventory ===
            "function"
        ) {

            await
                window.MedZoneXInventory
                    .loadInventory();

        }


    } catch (error) {

        console.error(
            "Purchase save error:",
            error
        );

        showPurchaseMessage(
            error.message ||
            "Unable to save purchase.",
            "error"
        );

    } finally {

        if (saveButton) {

            saveButton.disabled = false;

            saveButton.textContent =
                "Save Purchase";
        }

    }
}


// ============================================================
// CLEAR PURCHASE
// ============================================================

function clearPurchaseForm() {

    purchaseItems = [];

    renderPurchaseItems();

    const ids = [

        "purchaseSupplier",

        "purchaseSupplierName",

        "purchaseSupplierPhone",

        "purchaseDate",

        "purchaseReference",

        "purchaseDiscount",

        "purchasePaidAmount",

        "purchasePaymentMethod"

    ];


    ids.forEach(id => {

        const element =
            document.getElementById(id);

        if (!element) return;

        if (id === "purchasePaymentMethod") {

            element.value = "cash";

        } else {

            element.value = "";
        }

    });


    const date =
        document.getElementById(
            "purchaseDate"
        );

    if (date) {

        date.value = getToday();

    }


    clearMedicineEntryFields();

    calculatePurchaseTotal();

}


// ============================================================
// PURCHASE HISTORY
// ============================================================

async function loadPurchaseHistory() {

    const user = getCurrentUser();

    if (!user) return;


    const container =
        document.getElementById(
            "purchaseHistoryList"
        );

    if (!container) return;


    container.innerHTML = `
        <div class="purchase-loading">
            Loading purchases...
        </div>
    `;


    try {

        const purchasesRef =
            collection(
                db,
                "users",
                user.uid,
                "purchases"
            );


        const snapshot =
            await getDocs(purchasesRef);


        const purchases = [];


        snapshot.forEach(item => {

            purchases.push({
                id: item.id,
                ...item.data()
            });

        });


        purchases.sort(
            (a, b) => {

                const dateA =
                    a.createdAt?.seconds ||
                    0;

                const dateB =
                    b.createdAt?.seconds ||
                    0;

                return dateB - dateA;

            }
        );


        renderPurchaseHistory(
            purchases
        );


        updatePurchaseSummary(
            purchases
        );


    } catch (error) {

        console.error(error);

        container.innerHTML = `
            <div class="purchase-error">
                Unable to load purchase history.
            </div>
        `;

    }
}


// ============================================================
// RENDER HISTORY
// ============================================================

function renderPurchaseHistory(
    purchases
) {

    const container =
        document.getElementById(
            "purchaseHistoryList"
        );

    if (!container) return;


    if (!purchases.length) {

        container.innerHTML = `
            <div class="purchase-empty">
                No purchases recorded yet.
            </div>
        `;

        return;
    }


    container.innerHTML =
        purchases.map(purchase => {

            const itemCount =
                Array.isArray(
                    purchase.items
                )
                    ? purchase.items.length
                    : 0;


            const status =
                purchase.paymentStatus ||
                "pending";


            return `
                <div class="purchase-history-card">

                    <div class="purchase-history-top">

                        <div>

                            <strong>
                                ${escapeHTML(
                                    purchase.supplierName ||
                                    "Unknown Supplier"
                                )}
                            </strong>

                            <small>
                                ${escapeHTML(
                                    purchase.purchaseDate ||
                                    "N/A"
                                )}
                            </small>

                        </div>


                        <span
                            class="purchase-status ${escapeHTML(
                                status
                            )}"
                        >
                            ${escapeHTML(
                                status.toUpperCase()
                            )}
                        </span>

                    </div>


                    <div class="purchase-history-info">

                        <span>
                            Items:
                            <strong>
                                ${itemCount}
                            </strong>
                        </span>

                        <span>
                            Payment:
                            <strong>
                                ${escapeHTML(
                                    purchase.paymentMethod ||
                                    "N/A"
                                )}
                            </strong>
                        </span>

                        <span>
                            Total:
                            <strong>
                                ${money(
                                    purchase.grandTotal
                                )}
                            </strong>
                        </span>

                        <span>
                            Balance:
                            <strong>
                                ${money(
                                    purchase.balance
                                )}
                            </strong>
                        </span>

                    </div>


                    ${
                        purchase.reference
                            ? `
                                <small>
                                    Reference:
                                    ${escapeHTML(
                                        purchase.reference
                                    )}
                                </small>
                            `
                            : ""
                    }

                </div>
            `;

        }).join("");
}


// ============================================================
// PURCHASE SUMMARY
// ============================================================

function updatePurchaseSummary(
    purchases
) {

    const totalPurchases =
        purchases.length;


    const totalAmount =
        purchases.reduce(
            (sum, purchase) =>
                sum +
                Number(
                    purchase.grandTotal || 0
                ),
            0
        );


    const pendingAmount =
        purchases.reduce(
            (sum, purchase) =>
                sum +
                Number(
                    purchase.balance || 0
                ),
            0
        );


    const totalItems =
        purchases.reduce(
            (sum, purchase) => {

                const items =
                    Array.isArray(
                        purchase.items
                    )
                        ? purchase.items
                        : [];

                return sum +
                    items.reduce(
                        (
                            itemSum,
                            item
                        ) =>
                            itemSum +
                            Number(
                                item.quantity || 0
                            ),
                        0
                    );

            },
            0
        );


    const countElement =
        document.getElementById(
            "totalPurchases"
        );

    const amountElement =
        document.getElementById(
            "totalPurchaseAmount"
        );

    const pendingElement =
        document.getElementById(
            "totalPurchasePending"
        );

    const itemsElement =
        document.getElementById(
            "totalPurchasedUnits"
        );


    if (countElement) {

        countElement.textContent =
            totalPurchases;

    }

    if (amountElement) {

        amountElement.textContent =
            money(totalAmount);

    }

    if (pendingElement) {

        pendingElement.textContent =
            money(pendingAmount);

    }

    if (itemsElement) {

        itemsElement.textContent =
            totalItems;

    }

}


// ============================================================
// OPEN PURCHASE PAGE
// ============================================================

function openPurchases() {

    document
        .querySelectorAll(".app-page")
        .forEach(page => {

            page.style.display = "none";

        });


    const page =
        document.getElementById(
            "purchasesPage"
        );


    if (page) {

        page.style.display = "block";

        initPurchases();

    }

}


// ============================================================
// EXPORT
// ============================================================

window.MedZoneXPurchases = {

    initPurchases,

    openPurchases,

    loadSuppliers,

    loadPurchaseHistory,

    addPurchaseItem,

    savePurchase,

    clearPurchaseForm,

    calculatePurchaseTotal,

    getPurchaseItems: () =>
        [...purchaseItems]

};


// ============================================================
// GLOBAL PAGE FUNCTION
// ============================================================

window.MedZoneX = {

    ...(window.MedZoneX || {}),

    openPurchases

};