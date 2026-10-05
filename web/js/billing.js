// ============================================================
// MEDZONEX - BILLING.JS
// Sales / Billing Management
// ============================================================

import {
    auth,
    db
} from "./firebase.js";

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

let billingInventory = [];

let selectedMedicine = null;

let billItems = [];

let billingInitialized = false;


// ============================================================
// HELPERS
// ============================================================

function $(id) {
    return document.getElementById(id);
}


function money(value) {

    const number =
        Number(value) || 0;

    return `₹${number.toFixed(2)}`;

}


function escapeHtml(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


function getCurrentUser() {

    return auth.currentUser;

}


function showBillingMessage(
    message,
    type = "error"
) {

    const element =
        $("billingMessage");

    if (!element) {
        return;
    }

    element.textContent =
        message;

    element.className =
        `inventory-message ${type}`;

    element.style.display =
        "block";

}


function hideBillingMessage() {

    const element =
        $("billingMessage");

    if (!element) {
        return;
    }

    element.textContent =
        "";

    element.style.display =
        "none";

}


// ============================================================
// FIRESTORE REFERENCES
// ============================================================

function getStockCollection() {

    const user =
        getCurrentUser();

    if (!user) {
        return null;
    }

    return collection(
        db,
        "users",
        user.uid,
        "stock"
    );

}


function getBillsCollection() {

    const user =
        getCurrentUser();

    if (!user) {
        return null;
    }

    return collection(
        db,
        "users",
        user.uid,
        "bills"
    );

}


function getStockDocument(
    medicineId
) {

    const user =
        getCurrentUser();

    if (!user) {
        return null;
    }

    return doc(
        db,
        "users",
        user.uid,
        "stock",
        medicineId
    );

}


// ============================================================
// LOAD INVENTORY FOR BILLING
// ============================================================

async function loadBillingInventory() {

    const user =
        getCurrentUser();

    if (!user) {

        showBillingMessage(
            "Please login first."
        );

        return;

    }


    try {

        const stockCollection =
            getStockCollection();

        const snapshot =
            await getDocs(
                stockCollection
            );

        billingInventory = [];

        snapshot.forEach(
            (documentSnapshot) => {

                const data =
                    documentSnapshot.data();

                billingInventory.push({

                    id:
                        documentSnapshot.id,

                    ...data

                });

            }
        );


        billingInventory.sort(
            (a, b) => {

                const nameA =
                    String(
                        a.name || ""
                    ).toLowerCase();

                const nameB =
                    String(
                        b.name || ""
                    ).toLowerCase();

                return nameA.localeCompare(
                    nameB
                );

            }
        );


        console.log(
            `Billing inventory loaded: ${billingInventory.length}`
        );


    } catch (error) {

        console.error(
            "Billing inventory loading error:",
            error
        );

        showBillingMessage(
            "Unable to load medicines for billing."
        );

    }

}


// ============================================================
// SEARCH MEDICINES
// ============================================================

function searchBillingMedicines(
    searchText
) {

    const container =
        $("billingMedicineResults");

    if (!container) {
        return;
    }


    const query =
        String(
            searchText || ""
        )
        .trim()
        .toLowerCase();


    if (!query) {

        container.innerHTML =
            "";

        return;

    }


    const results =
        billingInventory.filter(
            (item) => {

                const name =
                    String(
                        item.name || ""
                    ).toLowerCase();

                const salt =
                    String(
                        item.salt || ""
                    ).toLowerCase();

                const manufacturer =
                    String(
                        item.manufacturer || ""
                    ).toLowerCase();

                const batch =
                    String(
                        item.batch || ""
                    ).toLowerCase();

                return (
                    name.includes(query) ||
                    salt.includes(query) ||
                    manufacturer.includes(query) ||
                    batch.includes(query)
                );

            }
        )
        .slice(0, 10);


    container.innerHTML =
        "";


    if (!results.length) {

        container.innerHTML = `

            <div class="inventory-empty">

                <div class="inventory-empty-icon">
                    🔍
                </div>

                <h3>
                    No medicine found
                </h3>

                <p>
                    Try another medicine name, salt or batch.
                </p>

            </div>

        `;

        return;

    }


    results.forEach(
        (medicine) => {

            const quantity =
                Number(
                    medicine.quantity || 0
                );

            const price =
                Number(
                    medicine.sellingPrice || 0
                );


            const card =
                document.createElement(
                    "div"
                );

            card.className =
                "inventory-item";


            card.innerHTML = `

                <div class="inventory-item-main">

                    <div class="inventory-medicine-icon">
                        💊
                    </div>

                    <div class="inventory-medicine-info">

                        <h3>
                            ${escapeHtml(
                                medicine.name ||
                                "Unnamed Medicine"
                            )}
                        </h3>

                        <p>
                            ${escapeHtml(
                                medicine.salt ||
                                "Salt not added"
                            )}
                        </p>

                        <small>
                            ${escapeHtml(
                                medicine.manufacturer ||
                                "Manufacturer not added"
                            )}
                        </small>

                    </div>

                </div>


                <div class="inventory-item-details">

                    <div class="inventory-detail">

                        <span>
                            Batch
                        </span>

                        <strong>
                            ${escapeHtml(
                                medicine.batch ||
                                "-"
                            )}
                        </strong>

                    </div>


                    <div class="inventory-detail">

                        <span>
                            Stock
                        </span>

                        <strong>
                            ${quantity}
                        </strong>

                    </div>


                    <div class="inventory-detail">

                        <span>
                            Selling Price
                        </span>

                        <strong>
                            ${money(price)}
                        </strong>

                    </div>

                </div>


                <div class="inventory-item-actions">

                    <button
                            type="button"
                            class="billing-select-medicine-btn"
                            data-id="${escapeHtml(
                                medicine.id
                            )}"
                    >
                        Select
                    </button>

                </div>

            `;


            container.appendChild(
                card
            );

        }
    );


    container
        .querySelectorAll(
            ".billing-select-medicine-btn"
        )
        .forEach(
            (button) => {

                button.addEventListener(
                    "click",
                    () => {

                        selectMedicineForBilling(
                            button.dataset.id
                        );

                    }
                );

            }
        );

}


// ============================================================
// SELECT MEDICINE
// ============================================================

function selectMedicineForBilling(
    medicineId
) {

    const medicine =
        billingInventory.find(
            (item) =>
                item.id === medicineId
        );


    if (!medicine) {

        showBillingMessage(
            "Medicine not found."
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


    selectedMedicine =
        medicine;


    const selectedBox =
        $("billingSelectedMedicine");

    if (selectedBox) {

        selectedBox.style.display =
            "block";

    }


    if ($("billingSelectedMedicineName")) {

        $("billingSelectedMedicineName")
            .textContent =
                medicine.name ||
                "Medicine";

    }


    if ($("billingAvailableStock")) {

        $("billingAvailableStock").value =
            stock;

    }


    if ($("billingMedicinePrice")) {

        $("billingMedicinePrice").value =
            Number(
                medicine.sellingPrice || 0
            ).toFixed(2);

    }


    if ($("billingMedicineQuantity")) {

        $("billingMedicineQuantity").value =
            "1";

        $("billingMedicineQuantity").max =
            String(stock);

    }


    updateSelectedMedicineTotal();


    const results =
        $("billingMedicineResults");

    if (results) {

        results.innerHTML =
            "";

    }

}


// ============================================================
// SELECTED MEDICINE TOTAL
// ============================================================

function updateSelectedMedicineTotal() {

    const price =
        Number(
            $("billingMedicinePrice")?.value
        ) || 0;

    const quantity =
        Number(
            $("billingMedicineQuantity")?.value
        ) || 0;

    const total =
        price * quantity;


    if ($("billingMedicineTotal")) {

        $("billingMedicineTotal").value =
            money(total);

    }

}


// ============================================================
// CANCEL SELECTED MEDICINE
// ============================================================

function cancelSelectedMedicine() {

    selectedMedicine =
        null;


    const selectedBox =
        $("billingSelectedMedicine");

    if (selectedBox) {

        selectedBox.style.display =
            "none";

    }


    if ($("billingMedicineQuantity")) {

        $("billingMedicineQuantity").value =
            "1";

    }


    if ($("billingMedicineTotal")) {

        $("billingMedicineTotal").value =
            money(0);

    }

}


// ============================================================
// ADD MEDICINE TO BILL
// ============================================================

function addMedicineToBill() {

    hideBillingMessage();


    if (!selectedMedicine) {

        showBillingMessage(
            "Please select a medicine first."
        );

        return;

    }


    const quantity =
        Number(
            $("billingMedicineQuantity")?.value
        );


    const availableStock =
        Number(
            selectedMedicine.quantity || 0
        );


    if (
        !Number.isInteger(quantity) ||
        quantity <= 0
    ) {

        showBillingMessage(
            "Enter a valid quantity."
        );

        return;

    }


    if (
        quantity >
        availableStock
    ) {

        showBillingMessage(
            `Only ${availableStock} units are available.`
        );

        return;

    }


    const price =
        Number(
            selectedMedicine.sellingPrice || 0
        );


    const existingIndex =
        billItems.findIndex(
            (item) =>
                item.medicineId ===
                selectedMedicine.id
        );


    if (
        existingIndex !== -1
    ) {

        const newQuantity =
            billItems[existingIndex].quantity +
            quantity;


        if (
            newQuantity >
            availableStock
        ) {

            showBillingMessage(
                `Only ${availableStock} units are available.`
            );

            return;

        }


        billItems[
            existingIndex
        ].quantity =
            newQuantity;


        billItems[
            existingIndex
        ].total =
            newQuantity * price;

    }

    else {

        billItems.push({

            medicineId:
                selectedMedicine.id,

            name:
                selectedMedicine.name || "",

            salt:
                selectedMedicine.salt || "",

            manufacturer:
                selectedMedicine.manufacturer || "",

            batch:
                selectedMedicine.batch || "",

            price,

            quantity,

            total:
                price * quantity

        });

    }


    renderBillItems();

    cancelSelectedMedicine();

    const search =
        $("billingMedicineSearch");

    if (search) {

        search.value =
            "";

    }

}


// ============================================================
// RENDER BILL ITEMS
// ============================================================

function renderBillItems() {

    const container =
        $("billingItemsContainer");

    if (!container) {
        return;
    }


    const count =
        billItems.reduce(
            (
                total,
                item
            ) =>
                total +
                item.quantity,
            0
        );


    if ($("billingItemCount")) {

        $("billingItemCount")
            .textContent =
                `${count} ITEMS`;

    }


    container.innerHTML =
        "";


    if (!billItems.length) {

        container.innerHTML = `

            <div class="inventory-empty">

                <div class="inventory-empty-icon">
                    🧾
                </div>

                <h3>
                    No medicines added
                </h3>

                <p>
                    Search and add medicines to create this bill.
                </p>

            </div>

        `;

        updateBillSummary();

        return;

    }


    billItems.forEach(
        (item, index) => {

            const card =
                document.createElement(
                    "div"
                );

            card.className =
                "inventory-item";


            card.innerHTML = `

                <div class="inventory-item-main">

                    <div class="inventory-medicine-icon">
                        💊
                    </div>

                    <div class="inventory-medicine-info">

                        <h3>
                            ${escapeHtml(
                                item.name
                            )}
                        </h3>

                        <p>
                            ${escapeHtml(
                                item.salt ||
                                "Salt not added"
                            )}
                        </p>

                        <small>
                            Batch:
                            ${escapeHtml(
                                item.batch ||
                                "-"
                            )}
                        </small>

                    </div>

                </div>


                <div class="inventory-item-details">

                    <div class="inventory-detail">

                        <span>
                            Price
                        </span>

                        <strong>
                            ${money(
                                item.price
                            )}
                        </strong>

                    </div>


                    <div class="inventory-detail">

                        <span>
                            Quantity
                        </span>

                        <strong>
                            ${item.quantity}
                        </strong>

                    </div>


                    <div class="inventory-detail">

                        <span>
                            Total
                        </span>

                        <strong>
                            ${money(
                                item.total
                            )}
                        </strong>

                    </div>

                </div>


                <div class="inventory-item-actions">

                    <button
                            type="button"
                            class="billing-remove-item-btn"
                            data-index="${index}"
                    >
                        Remove
                    </button>

                </div>

            `;


            container.appendChild(
                card
            );

        }
    );


    container
        .querySelectorAll(
            ".billing-remove-item-btn"
        )
        .forEach(
            (button) => {

                button.addEventListener(
                    "click",
                    () => {

                        const index =
                            Number(
                                button.dataset.index
                            );

                        removeBillItem(
                            index
                        );

                    }
                );

            }
        );


    updateBillSummary();

}


// ============================================================
// REMOVE BILL ITEM
// ============================================================

function removeBillItem(
    index
) {

    if (
        index < 0 ||
        index >= billItems.length
    ) {
        return;
    }


    billItems.splice(
        index,
        1
    );


    renderBillItems();

}


// ============================================================
// BILL SUMMARY
// ============================================================

function updateBillSummary() {

    const subtotal =
        billItems.reduce(
            (
                total,
                item
            ) =>
                total +
                (
                    Number(
                        item.total
                    ) || 0
                ),
            0
        );


    let discount =
        Number(
            $("billingDiscount")?.value
        ) || 0;


    if (discount < 0) {

        discount =
            0;

    }


    if (discount > subtotal) {

        discount =
            subtotal;

    }


    const grandTotal =
        subtotal -
        discount;


    if ($("billingSubtotal")) {

        $("billingSubtotal")
            .textContent =
                money(subtotal);

    }


    if ($("billingDiscountAmount")) {

        $("billingDiscountAmount")
            .textContent =
                money(discount);

    }


    if ($("billingGrandTotal")) {

        $("billingGrandTotal")
            .textContent =
                money(grandTotal);

    }


    return {

        subtotal,

        discount,

        grandTotal

    };

}


// ============================================================
// BILL NUMBER
// ============================================================

function generateBillNumber() {

    const now =
        new Date();


    const year =
        now.getFullYear();

    const month =
        String(
            now.getMonth() + 1
        ).padStart(
            2,
            "0"
        );

    const day =
        String(
            now.getDate()
        ).padStart(
            2,
            "0"
        );


    const random =
        Math.floor(
            100000 +
            Math.random() *
            900000
        );


    return `MZX-${year}${month}${day}-${random}`;

}


// ============================================================
// SAVE BILL
// ============================================================

async function saveBill() {

    hideBillingMessage();


    const user =
        getCurrentUser();


    if (!user) {

        showBillingMessage(
            "Please login first."
        );

        return;

    }


    if (!billItems.length) {

        showBillingMessage(
            "Please add at least one medicine."
        );

        return;

    }


    const customerName =
        $("billingCustomerName")?.value.trim() ||
        "Walk-in Customer";


    const customerMobile =
        $("billingCustomerMobile")?.value.trim() ||
        "";


    if (
        customerMobile &&
        !/^[0-9]{10}$/.test(
            customerMobile
        )
    ) {

        showBillingMessage(
            "Enter a valid 10-digit mobile number."
        );

        return;

    }


    const summary =
        updateBillSummary();


    if (
        summary.grandTotal < 0
    ) {

        showBillingMessage(
            "Invalid bill total."
        );

        return;

    }


    const button =
        $("saveBillBtn");


    if (button) {

        button.disabled =
            true;

        button.dataset.originalText =
            button.textContent;

        button.textContent =
            "Saving Bill...";

    }


    try {

        const billsCollection =
            getBillsCollection();


        const billNumber =
            generateBillNumber();


        /*
         * Use a Firestore transaction so stock is checked
         * again immediately before deduction.
         */

        await runTransaction(
            db,
            async (transaction) => {

                const stockReferences = [];

                const stockSnapshots = [];


                for (
                    const item
                    of billItems
                ) {

                    const stockRef =
                        getStockDocument(
                            item.medicineId
                        );

                    const stockSnapshot =
                        await transaction.get(
                            stockRef
                        );


                    if (
                        !stockSnapshot.exists()
                    ) {

                        throw new Error(
                            `${item.name} is no longer available in inventory.`
                        );

                    }


                    stockReferences.push(
                        stockRef
                    );

                    stockSnapshots.push(
                        stockSnapshot
                    );

                }


                /*
                 * Validate all stock first.
                 */

                for (
                    let index = 0;
                    index < billItems.length;
                    index++
                ) {

                    const item =
                        billItems[index];

                    const snapshot =
                        stockSnapshots[index];

                    const currentStock =
                        Number(
                            snapshot.data()
                                .quantity || 0
                        );


                    if (
                        item.quantity >
                        currentStock
                    ) {

                        throw new Error(
                            `${item.name}: only ${currentStock} units are available.`
                        );

                    }

                }


                /*
                 * Deduct stock.
                 */

                for (
                    let index = 0;
                    index < billItems.length;
                    index++
                ) {

                    const item =
                        billItems[index];

                    const snapshot =
                        stockSnapshots[index];

                    const currentStock =
                        Number(
                            snapshot.data()
                                .quantity || 0
                        );


                    transaction.update(
                        stockReferences[index],
                        {

                            quantity:
                                currentStock -
                                item.quantity,

                            updatedAt:
                                serverTimestamp()

                        }
                    );

                }


                /*
                 * Create bill document.
                 */

                const billReference =
                    doc(
                        billsCollection
                    );


                transaction.set(
                    billReference,
                    {

                        billNumber,

                        customer: {

                            name:
                                customerName,

                            mobile:
                                customerMobile

                        },


                        items:
                            billItems.map(
                                (item) => ({

                                    medicineId:
                                        item.medicineId,

                                    name:
                                        item.name,

                                    salt:
                                        item.salt,

                                    manufacturer:
                                        item.manufacturer,

                                    batch:
                                        item.batch,

                                    price:
                                        item.price,

                                    quantity:
                                        item.quantity,

                                    total:
                                        item.total

                                })
                            ),


                        subtotal:
                            summary.subtotal,

                        discount:
                            summary.discount,

                        grandTotal:
                            summary.grandTotal,


                        createdAt:
                            serverTimestamp(),

                        updatedAt:
                            serverTimestamp()

                    }
                );

            }
        );


        showBillingMessage(
            `Bill ${billNumber} saved successfully.`,
            "success"
        );


        /*
         * Clear bill after successful save.
         */

        setTimeout(
            () => {

                clearBill();

            },
            1000
        );


    } catch (error) {

        console.error(
            "Save bill error:",
            error
        );


        showBillingMessage(
            error.message ||
            "Unable to save bill."
        );

    } finally {

        if (button) {

            button.disabled =
                false;

            button.textContent =
                button.dataset.originalText ||
                "Save Bill";

        }

    }

}


// ============================================================
// CLEAR BILL
// ============================================================

function clearBill() {

    billItems = [];

    selectedMedicine =
        null;


    if ($("billingCustomerName")) {

        $("billingCustomerName").value =
            "";

    }


    if ($("billingCustomerMobile")) {

        $("billingCustomerMobile").value =
            "";

    }


    if ($("billingMedicineSearch")) {

        $("billingMedicineSearch").value =
            "";

    }


    if ($("billingDiscount")) {

        $("billingDiscount").value =
            "0";

    }


    if ($("billingMedicineQuantity")) {

        $("billingMedicineQuantity").value =
            "1";

    }


    const selectedBox =
        $("billingSelectedMedicine");

    if (selectedBox) {

        selectedBox.style.display =
            "none";

    }


    const results =
        $("billingMedicineResults");

    if (results) {

        results.innerHTML =
            "";

    }


    renderBillItems();

    hideBillingMessage();

}


// ============================================================
// EVENT LISTENERS
// ============================================================

// Medicine search

$("billingMedicineSearch")
    ?.addEventListener(
        "input",
        (event) => {

            searchBillingMedicines(
                event.target.value
            );

        }
    );


// Medicine quantity

$("billingMedicineQuantity")
    ?.addEventListener(
        "input",
        () => {

            if (
                selectedMedicine
            ) {

                const quantity =
                    Number(
                        $("billingMedicineQuantity")
                            ?.value
                    ) || 0;


                const stock =
                    Number(
                        selectedMedicine.quantity ||
                        0
                    );


                if (
                    quantity >
                    stock
                ) {

                    $("billingMedicineQuantity")
                        .value =
                            stock;

                }

            }


            updateSelectedMedicineTotal();

        }
    );


// Add selected medicine

$("addMedicineToBillBtn")
    ?.addEventListener(
        "click",
        () => {

            addMedicineToBill();

        }
    );


// Cancel selected medicine

$("cancelSelectedMedicineBtn")
    ?.addEventListener(
        "click",
        () => {

            cancelSelectedMedicine();

        }
    );


// Discount

$("billingDiscount")
    ?.addEventListener(
        "input",
        () => {

            updateBillSummary();

        }
    );


// Save bill

$("saveBillBtn")
    ?.addEventListener(
        "click",
        () => {

            saveBill();

        }
    );


// Clear bill

$("clearBillBtn")
    ?.addEventListener(
        "click",
        () => {

            const confirmed =
                window.confirm(
                    "Clear this bill?"
                );

            if (
                confirmed
            ) {

                clearBill();

            }

        }
    );


// ============================================================
// PUBLIC API
// ============================================================

window.MedZoneXBilling = {

    loadBillingInventory,

    searchBillingMedicines,

    saveBill,

    clearBill,

    getBillItems() {

        return [
            ...billItems
        ];

    }

};


// ============================================================
// INITIALIZATION
// ============================================================

function initializeBilling() {

    if (
        billingInitialized
    ) {
        return;
    }

    billingInitialized =
        true;


    console.log(
        "MedZoneX Billing initialized."
    );

}


initializeBilling();


console.log(
    "MedZoneX Billing.js loaded successfully."
);