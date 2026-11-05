
import { auth, db } from "./firebase.js";

import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const $ = id => document.getElementById(id);

function message(id, text, type = "success") {
    const element = $(id);
    if (!element) return;

    element.textContent = text;
    element.className = "mz-account-message " + type;
}

function currentUser() {
    return auth.currentUser;
}

const profileFields = {
    storeName: "profileStoreName",
    ownerName: "profileOwnerName",
    phone: "profilePhone",
    address: "profileAddress",
    city: "profileCity",
    state: "profileState",
    pincode: "profilePincode",
    gstin: "profileGSTIN",
    drugLicenceNumber: "profileDrugLicence",
    drugLicenceExpiry: "profileLicenceExpiry"
};


function setProfileMode(editing) {
    $("profileViewPanel").style.display = editing ? "none" : "block";
    $("profileEditPanel").style.display = editing ? "block" : "none";
}

function renderProfileView() {
    const values = {};

    for (const [field, id] of Object.entries(profileFields)) {
        values[field] = $(id)?.value?.trim() || "";
    }

    const display = {
        viewStoreName: values.storeName || "Your Pharmacy",
        viewOwnerName: values.ownerName || "Owner details not added",
        viewProfileEmail: $("profileEmail")?.value || "",
        viewPhone: values.phone,
        viewAddress: values.address,
        viewCity: values.city,
        viewState: values.state,
        viewPincode: values.pincode,
        viewGSTIN: values.gstin,
        viewDrugLicence: values.drugLicenceNumber,
        viewLicenceExpiry: values.drugLicenceExpiry
    };

    for (const [id, value] of Object.entries(display)) {
        const element = $(id);
        if (element) element.textContent = value || "Not added";
    }

    $("mzProfileAvatar").textContent =
        (values.storeName || "M").charAt(0).toUpperCase();
}

async function loadProfile() {
    const user = currentUser();
    if (!user) return;

    try {
        const ref = doc(db, "users", user.uid);
        const snapshot = await getDoc(ref);
        const data = snapshot.exists() ? snapshot.data() : {};

        for (const [field, id] of Object.entries(profileFields)) {
            const element = $(id);
            if (element) element.value = data[field] || "";
        }

        $("profileEmail").value = user.email || data.email || "";
        
renderProfileView();
        setProfileMode(false);
        message("profileMessage", "Profile loaded.", "success");

    } catch (error) {
        console.error("Profile load error:", error);
        message("profileMessage", "Unable to load profile.", "error");
    }
}

async function saveProfile() {
    const user = currentUser();
    if (!user) return;

    const storeName = $("profileStoreName").value.trim();
    if (!storeName) {
        message("profileMessage", "Pharmacy name is required.", "error");
        return;
    }

    const pincode = $("profilePincode").value.trim();
    if (pincode && !/^\d{6}$/.test(pincode)) {
        message("profileMessage", "Enter a valid 6-digit PIN code.", "error");
        return;
    }

    const gstin = $("profileGSTIN").value.trim().toUpperCase();
    if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) {
        message("profileMessage", "GSTIN must contain 15 characters.", "error");
        return;
    }

    const button = $("saveProfileBtn");
    button.disabled = true;
    button.textContent = "Saving...";

    try {
        const data = { storeName, email: user.email || "" };

        for (const [field, id] of Object.entries(profileFields)) {
            const element = $(id);
            data[field] = field === "gstin"
                ? element.value.trim().toUpperCase()
                : element.value.trim();
        }

        await setDoc(
            doc(db, "users", user.uid),
            { ...data, profileUpdatedAt: serverTimestamp() },
            { merge: true }
        );

        const dashboardName = $("dashboardStoreName");
        if (dashboardName) dashboardName.textContent = storeName;

        
renderProfileView();
        setProfileMode(false);
        message("profileMessage", "Profile saved successfully.", "success");

    } catch (error) {
        console.error("Profile save error:", error);
        message("profileMessage", error.message || "Unable to save profile.", "error");
    } finally {
        button.disabled = false;
        button.textContent = "Save Profile";
    }
}

const settingDefaults = {
    lowStockEnabled: true,
    lowStockThreshold: 10,
    expiryEnabled: true,
    expiryDays: 90,
    invoicePrefix: "MZX",
    invoiceStart: 1,
    invoiceAddress: true,
    autoPrint: false,
    defaultGST: 0
};

const settingFields = {
    lowStockEnabled: "settingLowStockEnabled",
    lowStockThreshold: "settingLowStockThreshold",
    expiryEnabled: "settingExpiryEnabled",
    expiryDays: "settingExpiryDays",
    invoicePrefix: "settingInvoicePrefix",
    invoiceStart: "settingInvoiceStart",
    invoiceAddress: "settingInvoiceAddress",
    autoPrint: "settingAutoPrint",
    defaultGST: "settingDefaultGST"
};

async function loadSettings() {
    const user = currentUser();
    if (!user) return;

    try {
        const ref = doc(db, "users", user.uid, "settings", "preferences");
        const snapshot = await getDoc(ref);
        const data = snapshot.exists() ? snapshot.data() : {};

        const profileSnapshot = await getDoc(
            doc(db, "users", user.uid)
        );

        const storeName = profileSnapshot.exists()
            ? profileSnapshot.data().storeName || ""
            : "";

        const automaticPrefix = String(storeName)
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "")
            .slice(0, 3) || "MZX";

        // Automatically migrate old default MZX prefix.
        // Preserve any custom prefix selected by the user.
        if (
            (!data.invoicePrefix || data.invoicePrefix === "MZX") &&
            automaticPrefix !== "MZX"
        ) {
            await setDoc(
                ref,
                { invoicePrefix: automaticPrefix },
                { merge: true }
            );

            data.invoicePrefix = automaticPrefix;
        }

        const values = {
            ...settingDefaults,
            ...data,
            invoicePrefix: data.invoicePrefix || automaticPrefix
        };

        for (const [field, id] of Object.entries(settingFields)) {
            const element = $(id);
            if (!element) continue;

            if (element.type === "checkbox") {
                element.checked = Boolean(values[field]);
            } else {
                element.value = values[field];
            }
        }

        message("settingsMessage", "Settings loaded.", "success");
    } catch (error) {
        console.error("Settings load error:", error);
        message("settingsMessage", "Unable to load settings.", "error");
    }
}

async function saveSettings() {
    const user = currentUser();
    if (!user) return;

    const values = {};

    for (const [field, id] of Object.entries(settingFields)) {
        const element = $(id);
        values[field] = element.type === "checkbox"
            ? element.checked
            : element.value;
    }

    values.lowStockThreshold = Number(values.lowStockThreshold);
    values.expiryDays = Number(values.expiryDays);
    values.invoiceStart = Number(values.invoiceStart);
    values.defaultGST = Number(values.defaultGST);
    values.invoicePrefix = String(values.invoicePrefix).trim();

    if (
        values.lowStockThreshold < 0 ||
        values.expiryDays < 1 ||
        values.invoiceStart < 1 ||
        !values.invoicePrefix
    ) {
        message("settingsMessage", "Please check the settings values.", "error");
        return;
    }

    const button = $("saveSettingsBtn");
    button.disabled = true;
    button.textContent = "Saving...";

    try {
        await setDoc(
            doc(db, "users", user.uid, "settings", "preferences"),
            { ...values, updatedAt: serverTimestamp() },
            { merge: true }
        );

        message("settingsMessage", "Settings saved successfully.", "success");
    } catch (error) {
        console.error("Settings save error:", error);
        message("settingsMessage", error.message || "Unable to save settings.", "error");
    } finally {
        button.disabled = false;
        button.textContent = "Save Settings";
    }
}

$("saveProfileBtn")?.addEventListener("click", saveProfile);
$("saveSettingsBtn")?.addEventListener("click", saveSettings);


$("editProfileBtn")?.addEventListener("click", () => {
    setProfileMode(true);
});

$("cancelProfileBtn")?.addEventListener("click", async () => {
    await loadProfile();
});

window.MedZoneXProfileSettings = {

    loadProfile,
    saveProfile,
    loadSettings,
    saveSettings
};
