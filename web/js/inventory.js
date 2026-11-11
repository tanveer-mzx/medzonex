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
// MEDICINE DETAILS VIEW STATE
// ============================================================

let lastRenderedInventoryItems = [];
let currentDetailsMedicineId = null;

function setText(id, value) {
    const element = $(id);
    if (element) {
        element.textContent =
            value === null || value === undefined || value === ''
                ? "—"
                : String(value);
    }
}

function openMedicineDetails(medicineId) {
    const medicine = inventoryItems.find(
        (item) => item.id === medicineId
    );

    if (!medicine) {
        showInventoryMessage("Medicine not found.");
        return;
    }

    currentDetailsMedicineId = medicineId;

    setText("detailsMedicineName", medicine.name || "Unnamed Medicine");
    setText("detailsMedicineSalt", medicine.salt || "Salt / generic name not added");
    setText("detailsMedicineId", medicine.id);
    setText("detailsStrength", medicine.strength);
    setText("detailsDosageForm", medicine.dosageForm);
    setText("detailsPackSize", medicine.packSize);
    setText("detailsManufacturer", medicine.manufacturer);
    setText("detailsBatch", medicine.batch);
    setText("detailsCreatedAt", formatDate(medicine.createdAt));
    setText("detailsExpiry", formatDate(medicine.expiry));
    setText("detailsQuantity", Number(medicine.quantity || 0));
    setText("detailsMinimumStock", Number(medicine.minimumStock ?? 5));
    setText("detailsPurchasePrice", money(Number(medicine.purchasePrice || 0)));
    setText("detailsSellingPrice", money(Number(medicine.sellingPrice || 0)));
    setText(
        "detailsStockValue",
        money(Number(medicine.purchasePrice || 0) * Number(medicine.quantity || 0))
    );
    setText(
        "detailsSalesValue",
        money(Number(medicine.sellingPrice || 0) * Number(medicine.quantity || 0))
    );

    const statuses = $("detailsMedicineStatuses");
    if (statuses) {
        const stock = getStockStatus(medicine);
        const expiry = getExpiryStatus(medicine);

        statuses.innerHTML = `
            <span class="inventory-status inventory-status-${escapeHtml(stock.status)}">
                ${escapeHtml(stock.label)}
            </span>
            <span class="inventory-status inventory-expiry-${escapeHtml(expiry.status)}">
                ${escapeHtml(expiry.label)}
            </span>
        `;
    }

    const hideSelectors = [
        ".inventory-header",
        "#inventoryMessage",
        ".inventory-summary-grid",
        "#inventoryFormSection",
        ".inventory-list-section",
        ".inventory-back-area"
    ];

    hideSelectors.forEach((selector) => {
        const element = document.querySelector(selector);
        if (element) element.style.display = "none";
    });

    const panel = $("medicineDetailsPanel");
    if (panel) {
        panel.hidden = false;
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

function closeMedicineDetails() {
    const panel = $("medicineDetailsPanel");
    if (panel) panel.hidden = true;

    [
        ".inventory-header",
        ".inventory-summary-grid",
        ".inventory-list-section",
        ".inventory-back-area"
    ].forEach((selector) => {
        const element = document.querySelector(selector);
        if (element) element.style.display = "";
    });

    const message = $("inventoryMessage");
    if (message) message.style.display = "";

    currentDetailsMedicineId = null;

    if (Array.isArray(lastRenderedInventoryItems)) {
        renderInventory(lastRenderedInventoryItems);
    }

    const list = $(".inventory-list-section");
    if (list) {
        list.scrollIntoView({ behavior: "smooth", block: "start" });
    }
}


// ============================================================
// RENDER INVENTORY
// ============================================================

function renderInventory(items) {
    const container = $("inventoryList");
    if (!container) return;

    lastRenderedInventoryItems = [...items];
    container.innerHTML = "";

    if (!items.length) {
        container.innerHTML = `
            <div class="inventory-empty">
                <div class="inventory-empty-icon">📦</div>
                <h3>No medicines found</h3>
                <p>Add your first medicine to start managing stock.</p>
            </div>
        `;
        return;
    }

    items.forEach((item, index) => {
        const stockStatus = getStockStatus(item);
        const expiryStatus = getExpiryStatus(item);
        const quantity = Number(item.quantity || 0);
        const sellingPrice = Number(item.sellingPrice || 0);
        const purchasePrice = Number(item.purchasePrice || 0);
        const stockValue = purchasePrice * quantity;

        const card = document.createElement("article");
        card.className = "inventory-item";
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.setAttribute(
            "aria-label",
            `View details for ${item.name || "medicine"}`
        );
        card.dataset.id = item.id;

        card.innerHTML = `
            <div class="inventory-item-main">
                <span class="inventory-serial">${index + 1}</span>
                <div class="inventory-medicine-icon">💊</div>
                <div class="inventory-medicine-info">
                    <h3>${escapeHtml(item.name || "Unnamed Medicine")}</h3>
                    <p>${escapeHtml(item.salt || "Salt not added")}</p>
                    <small>${escapeHtml(item.manufacturer || "Manufacturer not added")}</small>
                    <span class="inventory-added-date">
                        Added: ${escapeHtml(formatDate(item.createdAt))}
                    </span>
                </div>
            </div>

            <div class="inventory-item-details">
                <div class="inventory-detail">
                    <span>Batch</span>
                    <strong>${escapeHtml(item.batch || "-")}</strong>
                </div>
                <div class="inventory-detail">
                    <span>Expiry</span>
                    <strong>${escapeHtml(formatDate(item.expiry))}</strong>
                </div>
                <div class="inventory-detail">
                    <span>Quantity</span>
                    <strong>${quantity}</strong>
                </div>
                <div class="inventory-detail">
                    <span>Purchase</span>
                    <strong>${money(purchasePrice)}</strong>
                </div>
                <div class="inventory-detail">
                    <span>Selling</span>
                    <strong>${money(sellingPrice)}</strong>
                </div>
                <div class="inventory-detail">
                    <span>Stock Value</span>
                    <strong>${money(stockValue)}</strong>
                </div>
            </div>

            <div class="inventory-item-status">
                <span class="inventory-status inventory-status-${escapeHtml(stockStatus.status)}">
                    ${escapeHtml(stockStatus.label)}
                </span>
                <span class="inventory-status inventory-expiry-${escapeHtml(expiryStatus.status)}">
                    ${escapeHtml(expiryStatus.label)}
                </span>
            </div>

            <div class="inventory-item-actions">
                <button type="button" class="inventory-edit-btn" data-id="${escapeHtml(item.id)}">
                    Edit
                </button>
                <button type="button" class="inventory-delete-btn" data-id="${escapeHtml(item.id)}">
                    Delete
                </button>
            </div>
        `;

        card.addEventListener("click", (event) => {
            if (event.target.closest("button")) return;
            openMedicineDetails(item.id);
        });

        card.addEventListener("keydown", (event) => {
            if (event.target !== card) return;
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openMedicineDetails(item.id);
            }
        });

        container.appendChild(card);
    });

    container.querySelectorAll(".inventory-edit-btn").forEach((button) => {
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            editMedicine(button.dataset.id);
        });
    });

    container.querySelectorAll(".inventory-delete-btn").forEach((button) => {
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            deleteMedicine(button.dataset.id);
        });
    });
}

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
        $("inventoryFormSection");

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
        $("inventoryFormSection");

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
        "medicineStrength",
        "medicineDosageForm",
        "medicinePackSize",
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
// OPENAI MEDICINE RECOGNITION
// ============================================================

async function recognizeMedicineFromImage(file) {

    if (!file) {

        showInventoryMessage(
            "Please select a medicine image."
        );

        return;

    }


    const status =
        $("medicineRecognitionStatus");

    const button =
        $("recognizeMedicineBtn");


    try {

        if (status) {

            status.textContent =
                "Reading medicine package...";

            status.className =
                "otp-status";

        }


        if (button) {

            button.disabled =
                true;

            button.dataset.originalText =
                button.textContent;

            button.textContent =
                "🔄 Reading...";

        }


        const formData =
            new FormData();

        formData.append(
            "medicineImage",
            file
        );


                const user = auth.currentUser;

                if (!user) {
                    throw new Error(
                        "Please log in to recognize a medicine."
                    );
                }

                const idToken = await user.getIdToken();

                const response =
                    await fetch(
                        "https://medzonex-backend.onrender.com/api/inventory/recognize-medicine",
                        {
                            method: "POST",
                            headers: {
                                Authorization: `Bearer ${idToken}`
                            },
                            body: formData
                        }
                    );


        const result =
            await response.json();


                if (!response.ok || !result.success) {

                    if (result.code === "AI_CREDITS_UNAVAILABLE") {
                        throw new Error(
                            "AI medicine recognition is temporarily unavailable. Please try again later."
                        );
                    }

                    if (result.code === "SUBSCRIPTION_REQUIRED") {
                        throw new Error(
                            "Your free trial has expired. Please subscribe to continue."
                        );
                    }

                    throw new Error(
                        result.message ||
                        "Medicine recognition failed. Please try again."
                    );
                }


        const medicine =
            result.medicine || {};


        // --------------------------------------------
        // FILL MEDICINE FORM
        // --------------------------------------------

        if ($("medicineName")) {

            $("medicineName").value =
                medicine.name || "";

        }


        if ($("medicineSalt")) {

            $("medicineSalt").value =
                medicine.genericName || "";

        }


        if ($("medicineManufacturer")) {
            $("medicineManufacturer").value =
                medicine.manufacturer || "";
        }

        if ($("medicineStrength")) {
            $("medicineStrength").value =
                medicine.strength || "";
        }

        if ($("medicineDosageForm")) {
            $("medicineDosageForm").value =
                medicine.dosageForm || "";
        }

        if ($("medicinePackSize")) {
            const packSizeSelect = $("medicinePackSize");
            const savedPackSize = String(medicine.packSize || "").trim();

            if (savedPackSize && !Array.from(packSizeSelect.options).some(option => option.value === savedPackSize)) {
                const option = document.createElement("option");
                option.value = savedPackSize;
                option.textContent = savedPackSize;
                packSizeSelect.appendChild(option);
            }

            packSizeSelect.value = savedPackSize;
        }


        if (status) {

            status.textContent =
                "Medicine information detected. Please verify the details before saving.";

            status.className =
                "otp-status success";

        }


    } catch (error) {

        console.error(
            "Medicine recognition error:",
            error
        );


        if (status) {

            status.textContent =
                error.message ||
                "Unable to recognize medicine.";

            status.className =
                "otp-status error";

        }


    } finally {

        if (button) {

            button.disabled =
                false;

            button.textContent =
                button.dataset.originalText ||
                "📷 Scan Medicine";

        }

    }

}


// ============================================================
// GET FORM DATA
// ============================================================

function getMedicineFormData() {
    return {
        name: $("medicineName")?.value.trim() || "",
        salt: $("medicineSalt")?.value.trim() || "",
        strength: $("medicineStrength")?.value.trim() || "",
        manufacturer: $("medicineManufacturer")?.value.trim() || "",
        dosageForm: $("medicineDosageForm")?.value.trim() || "",
        packSize: $("medicinePackSize")?.value.trim() || "",
        batch: $("medicineBatch")?.value.trim() || "",
        expiry: $("medicineExpiry")?.value || "",
        purchasePrice: Number($("medicinePurchasePrice")?.value),
        sellingPrice: Number($("medicineSellingPrice")?.value),
        quantity: Number($("medicineQuantity")?.value),
        minimumStock: Number($("medicineMinimumStock")?.value)
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

                    strength:
                        data.strength,

                    manufacturer:
                        data.manufacturer,

                    dosageForm:
                        data.dosageForm,

                    packSize:
                        data.packSize,

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

                    strength:
                        data.strength,

                    manufacturer:
                        data.manufacturer,

                    dosageForm:
                        data.dosageForm,

                    packSize:
                        data.packSize,

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
        $("medicineSalt").value = medicine.salt || "";
    }

    if ($("medicineStrength")) {
        $("medicineStrength").value = medicine.strength || "";
    }

    if ($("medicineDosageForm")) {
        $("medicineDosageForm").value = medicine.dosageForm || "";
    }

    if ($("medicinePackSize")) {
        const packSizeSelect = $("medicinePackSize");
        const savedPackSize = String(medicine.packSize || "").trim();

        if (savedPackSize && !Array.from(packSizeSelect.options).some(option => option.value === savedPackSize)) {
            const legacyOption = document.createElement("option");
            legacyOption.value = savedPackSize;
            legacyOption.textContent = savedPackSize + " (Existing)";
            packSizeSelect.appendChild(legacyOption);
        }

        packSizeSelect.value = savedPackSize;
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


// MedZoneX medicine image permission manager

window.__medzoneMedicineImagePermission =
    window.__medzoneMedicineImagePermission || "unset";

function getMedicineImagePermission() {
    try {
        if (
            sessionStorage.getItem("medzonexMedicineImagePermission") === "session"
        ) {
            return "session";
        }
    } catch (error) {}

    return window.__medzoneMedicineImagePermission;
}

function showMedicineImagePermissionDialog() {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");

        overlay.style.cssText =
            "position:fixed;inset:0;z-index:999999;" +
            "background:rgba(0,0,0,.75);display:flex;" +
            "align-items:center;justify-content:center;padding:20px;";

        const dialog = document.createElement("div");

        dialog.style.cssText =
            "width:100%;max-width:410px;background:#fff;color:#222;" +
            "border-radius:18px;padding:26px;" +
            "box-shadow:0 15px 50px rgba(0,0,0,.3);" +
            "font-family:Arial,sans-serif;";

        dialog.innerHTML = `
            <h2 style="margin:0 0 14px;font-size:21px;">
                MedZoneX Permission Request
            </h2>

            <p style="font-size:14px;line-height:1.7;margin-bottom:22px;">
                MedZoneX wants permission to access your camera or photo
                gallery to recognize medicine packages and automatically
                fill in medicine details.

                <br><br>
                Your selected image will be processed by AI for medicine
                recognition.
            </p>

            <div style="display:flex;flex-direction:column;gap:10px;">

                <button type="button" data-choice="once"
                    style="padding:13px;border:0;border-radius:9px;
                    background:#2563eb;color:white;font-weight:bold;
                    cursor:pointer;">
                    ALLOW THIS TIME
                </button>

                <button type="button" data-choice="session"
                    style="padding:13px;border:0;border-radius:9px;
                    background:#15803d;color:white;font-weight:bold;
                    cursor:pointer;">
                    ALLOW WHILE USING THE SITE
                </button>

                <button type="button" data-choice="denied"
                    style="padding:13px;border:1px solid #ddd;
                    border-radius:9px;background:#fff;color:#333;
                    font-weight:bold;cursor:pointer;">
                    DON'T ALLOW
                </button>

            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        dialog.querySelectorAll("[data-choice]").forEach(button => {
            button.addEventListener("click", () => {
                const choice = button.dataset.choice;

                window.__medzoneMedicineImagePermission = choice;

                try {
                    if (choice === "session") {
                        sessionStorage.setItem(
                            "medzonexMedicineImagePermission",
                            "session"
                        );
                    } else {
                        sessionStorage.removeItem(
                            "medzonexMedicineImagePermission"
                        );
                    }
                } catch (error) {}

                overlay.remove();
                resolve(choice);
            });
        });
    });
}


// Medicine image recognition button

$("recognizeMedicineBtn")?.addEventListener(
    "click",
    async () => {
        const input = $("medicineImageInput");
        const status = $("medicineRecognitionStatus");

        if (!input) return;

        let permission = getMedicineImagePermission();

        if (permission !== "session") {
            permission = await showMedicineImagePermissionDialog();
        }

        if (permission === "denied") {
            input.value = "";

            if (status) {
                status.textContent =
                    "Permission denied. Camera and gallery access are required for medicine recognition.";
                status.className = "otp-status";
            }

            return;
        }

        input.click();
    }
);


// Medicine image selection

$("medicineImageInput")?.addEventListener(
    "change",
    async (event) => {
        const input = event.target;
        const file = input.files?.[0];

        if (!file) return;

        const permission = getMedicineImagePermission();

        if (permission !== "once" && permission !== "session") {
            input.value = "";
            return;
        }

        if (permission === "once") {
            window.__medzoneMedicineImagePermission = "unset";
        }

        await recognizeMedicineFromImage(file);

        // Allow selecting the same image again
        input.value = "";
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

// ============================================================
// MEDICINE DETAILS BUTTONS
// ============================================================

$("medicineDetailsBackBtn")?.addEventListener(
    "click",
    closeMedicineDetails
);

$("medicineDetailsEditBtn")?.addEventListener("click", () => {
    if (currentDetailsMedicineId) {
        const id = currentDetailsMedicineId;
        closeMedicineDetails();
        editMedicine(id);
    }
});

$("medicineDetailsDeleteBtn")?.addEventListener("click", async () => {
    if (!currentDetailsMedicineId) return;

    const id = currentDetailsMedicineId;
    await deleteMedicine(id);

    if (!inventoryItems.some((item) => item.id === id)) {
        closeMedicineDetails();
    }
});

$("medicineDetailsPrintBtn")?.addEventListener("click", () => {
    document.body.classList.add("medicine-details-printing");

    const cleanup = () => {
        document.body.classList.remove("medicine-details-printing");
        window.removeEventListener("afterprint", cleanup);
    };

    window.addEventListener("afterprint", cleanup);
    window.print();
});

// PUBLIC API
// ============================================================

window.MedZoneXInventory = {

    openMedicineDetails,
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

// AUTO REFRESH INVENTORY AFTER SUCCESSFUL SALE
window.addEventListener("medzonex:bill-saved", () => {
    window.MedZoneXInventory.loadInventory()
        .catch(error => {
            console.error("Automatic inventory refresh failed:", error);
        });
});


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