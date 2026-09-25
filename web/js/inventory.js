// ============================================================
// MEDZONEX - INVENTORY.JS
// Medicine / Stock Management
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
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";


// ============================================================
// STATE
// ============================================================

let inventoryItems = [];

let editingMedicineId = null;

let inventoryInitialized = false;


// ============================================================
// HELPERS
// ============================================================

function $(id) {
    return document.getElementById(id);
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


function money(value) {

    const number =
        Number(value) || 0;

    return `₹${number.toFixed(2)}`;

}


function showInventoryMessage(
    message,
    type = "error"
) {

    const element =
        $("inventoryMessage");

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


function hideInventoryMessage() {

    const element =
        $("inventoryMessage");

    if (!element) {
        return;
    }

    element.textContent =
        "";

    element.style.display =
        "none";

}


function getCurrentUser() {

    return auth.currentUser;

}


// ============================================================
// FIRESTORE STOCK REFERENCE
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
// DATE HELPERS
// ============================================================

function getDateValue(value) {

    if (!value) {
        return null;
    }

    if (
        typeof value.toDate ===
        "function"
    ) {

        return value.toDate();

    }

    if (
        value instanceof Date
    ) {

        return value;

    }

    const date =
        new Date(value);

    if (
        isNaN(
            date.getTime()
        )
    ) {

        return null;

    }

    return date;

}


function formatDate(value) {

    const date =
        getDateValue(value);

    if (!date) {
        return "-";
    }

    return date.toLocaleDateString(
        "en-IN",
        {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }
    );

}


function getDateInputValue(value) {

    const date =
        getDateValue(value);

    if (!date) {
        return "";
    }

    const year =
        date.getFullYear();

    const month =
        String(
            date.getMonth() + 1
        ).padStart(2, "0");

    const day =
        String(
            date.getDate()
        ).padStart(2, "0");

    return `${year}-${month}-${day}`;

}


// ============================================================
// EXPIRY STATUS
// ============================================================

function getExpiryStatus(item) {

    const expiry =
        getDateValue(
            item.expiry
        );

    if (!expiry) {

        return {
            status: "unknown",
            label: "No expiry"
        };

    }

    const now =
        new Date();

    const expiryDate =
        new Date(expiry);

    expiryDate.setHours(
        23,
        59,
        59,
        999
    );

    if (
        expiryDate.getTime() <
        now.getTime()
    ) {

        return {
            status: "expired",
            label: "Expired"
        };

    }

    const difference =
        expiryDate.getTime() -
        now.getTime();

    const days =
        Math.ceil(
            difference /
            (1000 * 60 * 60 * 24)
        );

    if (days <= 30) {

        return {
            status: "warning",
            label: `Expires in ${days} days`
        };

    }

    return {
        status: "valid",
        label: "Valid"
    };

}


// ============================================================
// STOCK STATUS
// ============================================================

function getStockStatus(item) {

    const quantity =
        Number(
            item.quantity || 0
        );

    const minimum =
        Number(
            item.minimumStock || 0
        );

    if (quantity <= 0) {

        return {
            status: "out",
            label: "Out of stock"
        };

    }

    if (
        quantity <= minimum
    ) {

        return {
            status: "low",
            label: "Low stock"
        };

    }

    return {
        status: "normal",
        label: "In stock"
    };

}


// ============================================================
// LOAD INVENTORY
// ============================================================

async function loadInventory() {

    const user =
        getCurrentUser();

    if (!user) {

        showInventoryMessage(
            "Please login first."
        );

        return;

    }

    try {

        hideInventoryMessage();

        const stockCollection =
            getStockCollection();

        const snapshot =
            await getDocs(
                stockCollection
            );

        inventoryItems = [];

        snapshot.forEach(
            (documentSnapshot) => {

                inventoryItems.push({

                    id:
                        documentSnapshot.id,

                    ...documentSnapshot.data()

                });

            }
        );

        // Sort alphabetically
        inventoryItems.sort(
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

        renderInventory(
            inventoryItems
        );

        updateInventorySummary();

        console.log(
            `Loaded ${inventoryItems.length} inventory items.`
        );

    } catch (error) {

        console.error(
            "Inventory loading error:",
            error
        );

        showInventoryMessage(
            "Unable to load inventory."
        );

    }

}


// ============================================================
// RENDER INVENTORY
// ============================================================

function renderInventory(items) {

    const container =
        $("inventoryList");

    if (!container) {
        return;
    }

    container.innerHTML =
        "";

    if (!items.length) {

        container.innerHTML = `
            <div class="inventory-empty">

                <div class="inventory-empty-icon">
                    📦
                </div>

                <h3>
                    No medicines found
                </h3>

                <p>
                    Add your first medicine to start managing stock.
                </p>

            </div>
        `;

        return;

    }

    items.forEach(
        (item) => {

            const stockStatus =
                getStockStatus(item);

            const expiryStatus =
                getExpiryStatus(item);

            const quantity =
                Number(
                    item.quantity || 0
                );

            const sellingPrice =
                Number(
                    item.sellingPrice || 0
                );

            const purchasePrice =
                Number(
                    item.purchasePrice || 0
                );

            const stockValue =
                purchasePrice *
                quantity;

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
                                item.name ||
                                "Unnamed Medicine"
                            )}
                        </h3>

                        <p>
                            ${escapeHtml(
                                item.salt ||
                                "Salt not added"
                            )}
                        </p>

                        <small>
                            ${escapeHtml(
                                item.manufacturer ||
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
                                item.batch ||
                                "-"
                            )}
                        </strong>

                    </div>


                    <div class="inventory-detail">

                        <span>
                            Expiry
                        </span>

                        <strong>
                            ${escapeHtml(
                                formatDate(
                                    item.expiry
                                )
                            )}
                        </strong>

                    </div>


                    <div class="inventory-detail">

                        <span>
                            Quantity
                        </span>

                        <strong>
                            ${quantity}
                        </strong>

                    </div>


                    <div class="inventory-detail">

                        <span>
                            Purchase
                        </span>

                        <strong>
                            ${money(
                                purchasePrice
                            )}
                        </strong>

                    </div>


                    <div class="inventory-detail">

                        <span>
                            Selling
                        </span>

                        <strong>
                            ${money(
                                sellingPrice
                            )}
                        </strong>

                    </div>


                    <div class="inventory-detail">

                        <span>
                            Stock Value
                        </span>

                        <strong>
                            ${money(
                                stockValue
                            )}
                        </strong>

                    </div>

                </div>


                <div class="inventory-item-status">

                    <span
                        class="inventory-status inventory-status-${escapeHtml(
                            stockStatus.status
                        )}"
                    >
                        ${escapeHtml(
                            stockStatus.label
                        )}
                    </span>

                    <span
                        class="inventory-status inventory-expiry-${escapeHtml(
                            expiryStatus.status
                        )}"
                    >
                        ${escapeHtml(
                            expiryStatus.label
                        )}
                    </span>

                </div>


                <div class="inventory-item-actions">

                    <button
                        type="button"
                        class="inventory-edit-btn"
                        data-id="${escapeHtml(
                            item.id
                        )}"
                    >
                        Edit
                    </button>

                    <button
                        type="button"
                        class="inventory-delete-btn"
                        data-id="${escapeHtml(
                            item.id
                        )}"
                    >
                        Delete
                    </button>

                </div>

            `;

            container.appendChild(
                card
            );

        }
    );


    // Edit buttons

    container
        .querySelectorAll(
            ".inventory-edit-btn"
        )
        .forEach(
            (button) => {

                button.addEventListener(
                    "click",
                    () => {

                        editMedicine(
                            button.dataset.id
                        );

                    }
                );

            }
        );


    // Delete buttons

    container
        .querySelectorAll(
            ".inventory-delete-btn"
        )
        .forEach(
            (button) => {

                button.addEventListener(
                    "click",
                    () => {

                        deleteMedicine(
                            button.dataset.id
                        );

                    }
                );

            }
        );

}


// ============================================================
// SEARCH INVENTORY
// ============================================================

function searchInventory(
    searchText
) {

    const query =
        String(
            searchText || ""
        )
        .trim()
        .toLowerCase();

    if (!query) {

        renderInventory(
            inventoryItems
        );

        return;

    }

    const filtered =
        inventoryItems.filter(
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
        );

    renderInventory(
        filtered
    );

}


// ============================================================
// OPEN ADD MEDICINE FORM
// ============================================================

function openAddMedicine() {

    editingMedicineId =
        null;

    clearMedicineForm();

    const title =
        $("inventoryFormTitle");

    if (title) {

        title.textContent =
            "Add Medicine";

    }

    const saveButton =
        $("saveMedicineBtn");

    if (saveButton) {

        saveButton.textContent =
            "Add Medicine";

    }

    showInventoryForm();

}


// ============================================================
// SHOW INVENTORY FORM
// ============================================================

function showInventoryForm() {

    const form =
        $("inventoryForm");

    if (!form) {
        return;
    }

    form.style.display =
        "block";

    form.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

}


// ============================================================
// CLOSE INVENTORY FORM
// ============================================================

function closeInventoryForm() {

    const form =
        $("inventoryForm");

    if (form) {

        form.style.display =
            "none";

    }

    editingMedicineId =
        null;

    clearMedicineForm();

}


// ============================================================
// CLEAR FORM
// ============================================================

function clearMedicineForm() {

    const fields = [

        "medicineName",
        "medicineSalt",
        "medicineManufacturer",
        "medicineBatch",
        "medicineExpiry",
        "medicinePurchasePrice",
        "medicineSellingPrice",
        "medicineQuantity",
        "medicineMinimumStock"

    ];

    fields.forEach(
        (id) => {

            const field =
                $(id);

            if (field) {

                field.value =
                    "";

            }

        }
    );


    if ($("medicineMinimumStock")) {

        $("medicineMinimumStock").value =
            "5";

    }

}


// ============================================================
// GET FORM DATA
// ============================================================

function getMedicineFormData() {

    const name =
        $("medicineName")?.value.trim() ||
        "";

    const salt =
        $("medicineSalt")?.value.trim() ||
        "";

    const manufacturer =
        $("medicineManufacturer")?.value.trim() ||
        "";

    const batch =
        $("medicineBatch")?.value.trim() ||
        "";

    const expiry =
        $("medicineExpiry")?.value ||
        "";

    const purchasePrice =
        Number(
            $("medicinePurchasePrice")?.value
        );

    const sellingPrice =
        Number(
            $("medicineSellingPrice")?.value
        );

    const quantity =
        Number(
            $("medicineQuantity")?.value
        );

    const minimumStock =
        Number(
            $("medicineMinimumStock")?.value
        );


    return {

        name,

        salt,

        manufacturer,

        batch,

        expiry,

        purchasePrice,

        sellingPrice,

        quantity,

        minimumStock

    };

}


// ============================================================
// VALIDATE MEDICINE
// ============================================================

function validateMedicine(
    data
) {

    if (!data.name) {

        return {
            valid: false,
            message:
                "Medicine name is required."
        };

    }

    if (!data.batch) {

        return {
            valid: false,
            message:
                "Batch number is required."
        };

    }

    if (!data.expiry) {

        return {
            valid: false,
            message:
                "Expiry date is required."
        };

    }

    if (
        isNaN(
            data.purchasePrice
        ) ||
        data.purchasePrice < 0
    ) {

        return {
            valid: false,
            message:
                "Enter a valid purchase price."
        };

    }

    if (
        isNaN(
            data.sellingPrice
        ) ||
        data.sellingPrice < 0
    ) {

        return {
            valid: false,
            message:
                "Enter a valid selling price."
        };

    }

    if (
        isNaN(
            data.quantity
        ) ||
        data.quantity < 0
    ) {

        return {
            valid: false,
            message:
                "Enter a valid quantity."
        };

    }

    if (
        isNaN(
            data.minimumStock
        ) ||
        data.minimumStock < 0
    ) {

        return {
            valid: false,
            message:
                "Enter a valid minimum stock."
        };

    }

    const expiryDate =
        new Date(
            data.expiry +
            "T23:59:59"
        );

    if (
        isNaN(
            expiryDate.getTime()
        )
    ) {

        return {
            valid: false,
            message:
                "Invalid expiry date."
        };

    }

    return {
        valid: true
    };

}


// ============================================================
// SAVE MEDICINE
// ============================================================

async function saveMedicine() {

    hideInventoryMessage();

    const user =
        getCurrentUser();

    if (!user) {

        showInventoryMessage(
            "Please login first."
        );

        return;

    }

    const data =
        getMedicineFormData();

    const validation =
        validateMedicine(
            data
        );

    if (!validation.valid) {

        showInventoryMessage(
            validation.message
        );

        return;

    }

    const button =
        $("saveMedicineBtn");

    if (button) {

        button.disabled =
            true;

        button.dataset.originalText =
            button.textContent;

        button.textContent =
            "Saving...";

    }


    try {

        // --------------------------------------------------------
        // EDIT EXISTING MEDICINE
        // --------------------------------------------------------

        if (editingMedicineId) {

            const medicineRef =
                getStockDocument(
                    editingMedicineId
                );

            await updateDoc(
                medicineRef,
                {

                    name:
                        data.name,

                    salt:
                        data.salt,

                    manufacturer:
                        data.manufacturer,

                    batch:
                        data.batch,

                    expiry:
                        data.expiry,

                    purchasePrice:
                        data.purchasePrice,

                    sellingPrice:
                        data.sellingPrice,

                    quantity:
                        data.quantity,

                    minimumStock:
                        data.minimumStock,

                    updatedAt:
                        serverTimestamp()

                }
            );

            showInventoryMessage(
                "Medicine updated successfully.",
                "success"
            );

        }

        // --------------------------------------------------------
        // ADD NEW MEDICINE
        // --------------------------------------------------------

        else {

            const stockCollection =
                getStockCollection();

            const medicineRef =
                await addDoc(
                    stockCollection,
                    {

                        name:
                            data.name,

                        salt:
                            data.salt,

                        manufacturer:
                            data.manufacturer,

                        batch:
                            data.batch,

                        expiry:
                            data.expiry,

                        purchasePrice:
                            data.purchasePrice,

                        sellingPrice:
                            data.sellingPrice,

                        quantity:
                            data.quantity,

                        minimumStock:
                            data.minimumStock,

                        createdAt:
                            serverTimestamp(),

                        updatedAt:
                            serverTimestamp()

                    }
                );

            console.log(
                "Medicine added:",
                medicineRef.id
            );

            showInventoryMessage(
                "Medicine added successfully.",
                "success"
            );

        }


        // Refresh

        await loadInventory();

        // Close form after short delay

        setTimeout(
            () => {

                closeInventoryForm();

            },
            600
        );


    } catch (error) {

        console.error(
            "Save medicine error:",
            error
        );

        showInventoryMessage(
            error.message ||
            "Unable to save medicine."
        );

    } finally {

        if (button) {

            button.disabled =
                false;

            button.textContent =
                button.dataset.originalText ||
                "Save Medicine";

        }

    }

}


// ============================================================
// EDIT MEDICINE
// ============================================================

async function editMedicine(
    medicineId
) {

    const medicine =
        inventoryItems.find(
            (item) =>
                item.id === medicineId
        );

    if (!medicine) {

        showInventoryMessage(
            "Medicine not found."
        );

        return;

    }

    editingMedicineId =
        medicineId;


    const title =
        $("inventoryFormTitle");

    if (title) {

        title.textContent =
            "Edit Medicine";

    }


    const saveButton =
        $("saveMedicineBtn");

    if (saveButton) {

        saveButton.textContent =
            "Update Medicine";

    }


    // Fill form

    if ($("medicineName")) {

        $("medicineName").value =
            medicine.name || "";

    }

    if ($("medicineSalt")) {

        $("medicineSalt").value =
            medicine.salt || "";

    }

    if ($("medicineManufacturer")) {

        $("medicineManufacturer").value =
            medicine.manufacturer || "";

    }

    if ($("medicineBatch")) {

        $("medicineBatch").value =
            medicine.batch || "";

    }

    if ($("medicineExpiry")) {

        $("medicineExpiry").value =
            getDateInputValue(
                medicine.expiry
            );

    }

    if ($("medicinePurchasePrice")) {

        $("medicinePurchasePrice").value =
            medicine.purchasePrice ?? "";

    }

    if ($("medicineSellingPrice")) {

        $("medicineSellingPrice").value =
            medicine.sellingPrice ?? "";

    }

    if ($("medicineQuantity")) {

        $("medicineQuantity").value =
            medicine.quantity ?? "";

    }

    if ($("medicineMinimumStock")) {

        $("medicineMinimumStock").value =
            medicine.minimumStock ?? "5";

    }


    showInventoryForm();

}


// ============================================================
// DELETE MEDICINE
// ============================================================

async function deleteMedicine(
    medicineId
) {

    const medicine =
        inventoryItems.find(
            (item) =>
                item.id === medicineId
        );

    if (!medicine) {

        showInventoryMessage(
            "Medicine not found."
        );

        return;

    }

    const medicineName =
        medicine.name ||
        "this medicine";


    const confirmed =
        window.confirm(
            `Are you sure you want to delete "${medicineName}" from inventory?`
        );

    if (!confirmed) {
        return;
    }


    try {

        hideInventoryMessage();

        const medicineRef =
            getStockDocument(
                medicineId
            );

        await deleteDoc(
            medicineRef
        );

        showInventoryMessage(
            "Medicine deleted successfully.",
            "success"
        );

        await loadInventory();

    } catch (error) {

        console.error(
            "Delete medicine error:",
            error
        );

        showInventoryMessage(
            "Unable to delete medicine."
        );

    }

}


// ============================================================
// INVENTORY SUMMARY
// ============================================================

function updateInventorySummary() {

    let totalProducts =
        inventoryItems.length;

    let totalUnits =
        0;

    let totalStockValue =
        0;

    let lowStockCount =
        0;

    let expiredCount =
        0;

    let expiringSoonCount =
        0;


    inventoryItems.forEach(
        (item) => {

            const quantity =
                Number(
                    item.quantity || 0
                );

            const purchasePrice =
                Number(
                    item.purchasePrice || 0
                );

            totalUnits +=
                quantity;

            totalStockValue +=
                quantity *
                purchasePrice;


            const stockStatus =
                getStockStatus(
                    item
                );

            if (
                stockStatus.status ===
                "low" ||
                stockStatus.status ===
                "out"
            ) {

                lowStockCount += 1;

            }


            const expiryStatus =
                getExpiryStatus(
                    item
                );

            if (
                expiryStatus.status ===
                "expired"
            ) {

                expiredCount += 1;

            }

            if (
                expiryStatus.status ===
                "warning"
            ) {

                expiringSoonCount += 1;

            }

        }
    );


    if ($("totalMedicines")) {

        $("totalMedicines").textContent =
            totalProducts;

    }


    if ($("totalStockUnits")) {

        $("totalStockUnits").textContent =
            totalUnits;

    }


    if ($("totalStockValue")) {

        $("totalStockValue").textContent =
            money(
                totalStockValue
            );

    }


    if ($("lowStockCount")) {

        $("lowStockCount").textContent =
            lowStockCount;

    }


    if ($("expiredStockCount")) {

        $("expiredStockCount").textContent =
            expiredCount;

    }


    if ($("expiringSoonCount")) {

        $("expiringSoonCount").textContent =
            expiringSoonCount;

    }

}


// ============================================================
// FILTER LOW STOCK
// ============================================================

function showLowStock() {

    const filtered =
        inventoryItems.filter(
            (item) => {

                const status =
                    getStockStatus(
                        item
                    );

                return (
                    status.status ===
                    "low" ||
                    status.status ===
                    "out"
                );

            }
        );

    renderInventory(
        filtered
    );

}


// ============================================================
// FILTER EXPIRED
// ============================================================

function showExpiredStock() {

    const filtered =
        inventoryItems.filter(
            (item) => {

                return (
                    getExpiryStatus(
                        item
                    ).status ===
                    "expired"
                );

            }
        );

    renderInventory(
        filtered
    );

}


// ============================================================
// FILTER EXPIRING SOON
// ============================================================

function showExpiringSoon() {

    const filtered =
        inventoryItems.filter(
            (item) => {

                return (
                    getExpiryStatus(
                        item
                    ).status ===
                    "warning"
                );

            }
        );

    renderInventory(
        filtered
    );

}


// ============================================================
// SHOW ALL
// ============================================================

function showAllInventory() {

    const search =
        $("inventorySearch");

    if (search) {

        search.value =
            "";

    }

    renderInventory(
        inventoryItems
    );

}


// ============================================================
// EVENT LISTENERS
// ============================================================

// Search

$("inventorySearch")?.addEventListener(
    "input",
    (event) => {

        searchInventory(
            event.target.value
        );

    }
);


// Add medicine

$("addMedicineBtn")?.addEventListener(
    "click",
    () => {

        openAddMedicine();

    }
);


// Save medicine

$("saveMedicineBtn")?.addEventListener(
    "click",
    () => {

        saveMedicine();

    }
);


// Cancel

$("cancelMedicineBtn")?.addEventListener(
    "click",
    () => {

        closeInventoryForm();

    }
);


// Refresh

$("refreshInventoryBtn")?.addEventListener(
    "click",
    () => {

        loadInventory();

    }
);


// All inventory

$("showAllInventoryBtn")?.addEventListener(
    "click",
    () => {

        showAllInventory();

    }
);


// Low stock

$("showLowStockBtn")?.addEventListener(
    "click",
    () => {

        showLowStock();

    }
);


// Expired

$("showExpiredStockBtn")?.addEventListener(
    "click",
    () => {

        showExpiredStock();

    }
);


// Expiring soon

$("showExpiringSoonBtn")?.addEventListener(
    "click",
    () => {

        showExpiringSoon();

    }
);


// ============================================================
// PUBLIC API
// ============================================================

window.MedZoneXInventory = {

    loadInventory,

    searchInventory,

    openAddMedicine,

    editMedicine,

    deleteMedicine,

    saveMedicine,

    clearMedicineForm,

    showLowStock,

    showExpiredStock,

    showExpiringSoon,

    showAllInventory,

    getInventory() {

        return [
            ...inventoryItems
        ];

    }

};


// ============================================================
// INITIALIZATION
// ============================================================

function initializeInventory() {

    if (
        inventoryInitialized
    ) {
        return;
    }

    inventoryInitialized =
        true;

    console.log(
        "MedZoneX Inventory initialized."
    );

}


initializeInventory();


console.log(
    "MedZoneX Inventory.js loaded successfully."
);