import { auth, db } from "./firebase.js";
import {
    collection,
    getDocs,
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const $ = id => document.getElementById(id);

let allBills = [];
let currentView = "dashboard";
let pharmacyStoreName = "Your Pharmacy";
let pharmacyProfile = {};
let showInvoiceAddress = true;

const money = value => "₹" + (Number(value) || 0).toFixed(2);

const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
}[c]));

function billDate(bill) {
    const value = bill.createdAt;
    if (value?.toDate) return value.toDate();
    if (value?.seconds) return new Date(value.seconds * 1000);
    if (value) {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) return date;
    }
    return null;
}

function sortedBills() {
    return [...allBills].sort((a, b) =>
        (billDate(b)?.getTime() || 0) - (billDate(a)?.getTime() || 0)
    );
}

async function fetchBills() {
    const user = auth.currentUser;
    if (!user) return [];

    const snapshot = await getDocs(
        collection(db, "users", user.uid, "bills")
    );

    allBills = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
    }));

    return sortedBills();
}

function showPage(id) {
    if (typeof window.MedZoneX?.showPage === "function") {
        window.MedZoneX.showPage(id);
    } else {
        document.querySelectorAll(".app-page").forEach(page => {
            page.classList.remove("active");
        });
        $(id)?.classList.add("active");
    }

    currentView = id;
    window.scrollTo({ top: 0, behavior: "instant" });
}

function dateText(bill) {
    const date = billDate(bill);
    return date ? date.toLocaleString("en-IN") : "Date unavailable";
}

function customerName(bill) {
    return bill.customer?.name || "Walk-in Customer";
}

function customerMobile(bill) {
    return String(bill.customer?.mobile || "");
}

function billAmount(bill) {
    return Number(bill.grandTotal ?? bill.total ?? 0);
}

function todayBills() {
    const now = new Date();

    return allBills.filter(bill => {
        const date = billDate(bill);
        return date &&
            date.getFullYear() === now.getFullYear() &&
            date.getMonth() === now.getMonth() &&
            date.getDate() === now.getDate();
    });
}

function renderDashboard() {
    const today = todayBills();

    const salesAmount = $("todaySalesAmount");
    const billCount = $("todayBillsCount");
    const customerCount = $("todayCustomersCount");

    if (salesAmount) salesAmount.textContent = money(
        today.reduce((sum, bill) => sum + billAmount(bill), 0)
    );

    if (billCount) billCount.textContent = String(today.length);

    if (customerCount) {
        customerCount.textContent = String(
            new Set(today.map(customerMobile).filter(Boolean)).size
        );
    }

    const container = $("recentSalesList");
    if (!container) return;

    const recent = sortedBills();

    if (!recent.length) {
        container.innerHTML = `
            <div class="empty-dashboard">
                <span>▤</span>
                <p>No sales yet</p>
                <small>Your recent bills will appear here.</small>
            </div>`;
        return;
    }

    container.innerHTML = recent.map(bill => `
        <button type="button" class="mz-sale-row"
            data-bill-id="${escapeHTML(bill.id)}">
            <span class="mz-sale-main">
                <strong>${escapeHTML(customerName(bill))}</strong>
                <small>${escapeHTML(customerMobile(bill) || "No mobile")} ·
                    ${escapeHTML(bill.billNumber || "")}</small>
                <small>${escapeHTML(dateText(bill))}</small>
            </span>
            <strong>${money(billAmount(bill))}</strong>
        </button>
    `).join("");
}

function ensureSalesPage() {
    if ($("salesHistoryPage")) return;

    const page = document.createElement("section");
    page.id = "salesHistoryPage";
    page.className = "app-page";
    page.innerHTML = `
        <div class="inventory-shell">
            <header class="inventory-header">
                <button class="mz-back" data-back-dashboard aria-label="Back">←</button>
                <div>
                    <p class="dashboard-small-title">SALES</p>
                    <h1>Sales History</h1>
                    <p class="inventory-subtitle">All saved pharmacy bills.</p>
                </div>
            </header>
            <section class="dashboard-panel">
                <div class="mz-sales-search">
                    <input
                        type="search"
                        id="mzSalesSearch"
                        placeholder="Search by customer name or mobile number..."
                        autocomplete="off"
                    >
                </div>
                <div id="mzAllSales" class="mz-record-list"></div>
            </section>
        </div>`;
    document.body.appendChild(page);
}

function renderSalesHistory() {
    const target = $("mzAllSales");
    if (!target) return;

    const searchInput = $("mzSalesSearch");
    const searchText = String(searchInput?.value || "").trim().toLowerCase();
    const searchDigits = searchText.replace(/\D/g, "");

    const allSortedBills = sortedBills();

    const bills = searchText
        ? allSortedBills.filter(bill => {
            const name = customerName(bill).toLowerCase();
            const mobile = customerMobile(bill);

            return name.includes(searchText) ||
                (searchDigits.length > 0 && mobile.includes(searchDigits));
        })
        : allSortedBills;

    target.innerHTML = bills.length ? bills.map(bill => `
        <button type="button" class="mz-record-row"
            data-bill-id="${escapeHTML(bill.id)}">
            <span>
                <strong>${escapeHTML(customerName(bill))}</strong>
                <small>${escapeHTML(customerMobile(bill) || "No mobile")} ·
                    ${escapeHTML(bill.billNumber || "")}</small>
                <small>${escapeHTML(dateText(bill))}</small>
            </span>
            <strong>${money(billAmount(bill))}</strong>
        </button>
    `).join("") : `<p class="mz-empty">${searchText ? "No matching sales found." : "No saved bills found."}</p>`;
}

function ensureInvoicePage() {
    if ($("mzInvoicePage")) return;

    const page = document.createElement("section");
    page.id = "mzInvoicePage";
    page.className = "app-page";
    page.innerHTML = `
        <div class="inventory-shell">
            <header class="inventory-header no-print">
                <button class="mz-back" data-back-sales aria-label="Back">←</button>
                <div><p class="dashboard-small-title">BILL DETAILS</p><h1>Invoice</h1></div>
                <button class="primary-btn" id="mzPrintInvoice">Print Invoice</button>
            </header>
            <div id="mzInvoiceContent" class="print-document"></div>
        </div>`;
    document.body.appendChild(page);

    $("mzPrintInvoice").addEventListener("click", () => window.print());
}

function renderInvoice(id) {
    const bill = allBills.find(item => item.id === id);
    if (!bill) return;

    ensureInvoicePage();

    const items = Array.isArray(bill.items) ? bill.items : [];

    const addressParts = [
        pharmacyProfile.address,
        pharmacyProfile.city,
        pharmacyProfile.state,
        pharmacyProfile.pincode
    ].filter(value => String(value || "").trim());

    const invoiceAddressHTML = showInvoiceAddress
        ? `
            ${addressParts.length
                ? `<p class="mz-pharmacy-address">${escapeHTML(addressParts.join(", "))}</p>`
                : ""}
            ${pharmacyProfile.gstin
                ? `<p class="mz-pharmacy-gstin"><strong>GSTIN:</strong> ${escapeHTML(pharmacyProfile.gstin)}</p>`
                : ""}
          `
        : "";

    $("mzInvoiceContent").innerHTML = `
        <article class="mz-paper">
            <h1>${escapeHTML(pharmacyStoreName)}</h1>
            ${invoiceAddressHTML}
            <h2>Sales Invoice</h2>
            <hr>
            <p><strong>Bill No:</strong> ${escapeHTML(bill.billNumber || "")}</p>
            <p><strong>Date:</strong> ${escapeHTML(dateText(bill))}</p>
            <p><strong>Customer:</strong> ${escapeHTML(customerName(bill))}</p>
            <p><strong>Mobile:</strong> ${escapeHTML(customerMobile(bill) || "—")}</p>
            <table>
                <thead><tr><th>Medicine</th><th>Batch</th><th>Qty</th><th>Rate</th><th>Total</th></tr></thead>
                <tbody>${items.map(item => `
                    <tr>
                        <td>${escapeHTML(item.name)}</td>
                        <td>${escapeHTML(item.batch || "")}</td>
                        <td>${escapeHTML(item.quantity)}</td>
                        <td>${money(item.price)}</td>
                        <td>${money(item.total)}</td>
                    </tr>`).join("")}</tbody>
            </table>
            <div class="mz-invoice-total">
                <p>Subtotal: ${money(bill.subtotal)}</p>
                <p>Discount: ${money(bill.discount)}</p>
                <h2>Grand Total: ${money(billAmount(bill))}</h2>
            </div>
            <p class="mz-thanks">Thank you for your purchase.</p>
        </article>`;

    showPage("mzInvoicePage");
}

function ensureCustomerDetailPage() {
    if ($("mzCustomerDetailPage")) return;

    const page = document.createElement("section");
    page.id = "mzCustomerDetailPage";
    page.className = "app-page";
    page.innerHTML = `
        <div class="inventory-shell">
            <header class="inventory-header no-print">
                <button class="mz-back" data-back-customers aria-label="Back">←</button>
                <div><p class="dashboard-small-title">CUSTOMER ACCOUNT</p><h1>Purchase History</h1></div>
                <button class="primary-btn" id="mzPrintStatement">Print Statement</button>
            </header>
            <div id="mzCustomerStatement" class="print-document"></div>
        </div>`;
    document.body.appendChild(page);
    $("mzPrintStatement").addEventListener("click", () => window.print());
}

function customerGroups() {
    const groups = new Map();

    allBills.forEach(bill => {
        const mobile = customerMobile(bill);
        if (!/^[0-9]{10}$/.test(mobile)) return;

        if (!groups.has(mobile)) {
            groups.set(mobile, {
                mobile,
                name: customerName(bill),
                bills: []
            });
        }

        const group = groups.get(mobile);
        if (bill.customer?.name && bill.customer.name !== "Walk-in Customer") {
            group.name = bill.customer.name;
        }
        group.bills.push(bill);
    });

    return [...groups.values()].sort((a, b) =>
        a.name.localeCompare(b.name)
    );
}

function renderCustomers() {
    const page = $("customersPage");
    if (!page) return;

    page.innerHTML = `
        <div class="inventory-shell">
            <header class="inventory-header">
                <button class="mz-back" data-back-dashboard aria-label="Back">←</button>
                <div>
                    <p class="dashboard-small-title">CUSTOMER DIRECTORY</p>
                    <h1>Customers</h1>
                    <p class="inventory-subtitle">Customers recorded through saved bills.</p>
                </div>
            </header>
            <section class="dashboard-panel">
                <div class="mz-record-list" id="mzCustomerList"></div>
            </section>
        </div>`;

    const groups = customerGroups();
    const target = $("mzCustomerList");

    target.innerHTML = groups.length ? groups.map(group => `
        <button type="button" class="mz-record-row"
            data-customer-mobile="${escapeHTML(group.mobile)}">
            <span>
                <strong>${escapeHTML(group.name)}</strong>
                <small>${escapeHTML(group.mobile)}</small>
                <small>${group.bills.length} purchase(s)</small>
            </span>
            <strong>${money(group.bills.reduce((sum, bill) => sum + billAmount(bill), 0))}</strong>
        </button>
    `).join("") : `<p class="mz-empty">No customers with a valid mobile number yet.</p>`;
}

function renderCustomerStatement(mobile) {
    const group = customerGroups().find(item => item.mobile === mobile);
    if (!group) return;

    const bills = [...group.bills].sort((a, b) =>
        (billDate(b)?.getTime() || 0) - (billDate(a)?.getTime() || 0)
    );

    // Create the A4 statement page before inserting its content.
    ensureCustomerDetailPage();

    const totalSpent = bills.reduce(
        (sum, bill) => sum + billAmount(bill), 0
    );

    $("mzCustomerStatement").innerHTML = `
        <article class="mz-paper">
            <h1>${escapeHTML(pharmacyStoreName)}</h1>
            <h2>Customer Purchase Statement</h2>
            <hr>

            <p><strong>Customer:</strong> ${escapeHTML(group.name)}</p>
            <p><strong>Mobile:</strong> ${escapeHTML(group.mobile)}</p>
            <p><strong>Total Bills:</strong> ${bills.length}</p>
            <p><strong>Total Amount:</strong> ${money(totalSpent)}</p>

            <h3>Purchase History</h3>

            ${bills.map((bill, index) => {
                const items = Array.isArray(bill.items) ? bill.items : [];

                return `
                    <section class="mz-customer-purchase">
                        <div class="mz-purchase-heading">
                            <strong>Purchase ${index + 1}</strong>
                            <strong>${money(billAmount(bill))}</strong>
                        </div>

                        <p><strong>Date:</strong> ${escapeHTML(dateText(bill))}</p>
                        <p><strong>Bill No:</strong> ${escapeHTML(bill.billNumber || "—")}</p>

                        <table>
                            <thead>
                                <tr>
                                    <th>Medicine</th>
                                    <th>Batch</th>
                                    <th>Qty</th>
                                    <th>Rate</th>
                                    <th>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${items.map(item => `
                                    <tr>
                                        <td>${escapeHTML(item.name || "—")}</td>
                                        <td>${escapeHTML(item.batch || "—")}</td>
                                        <td>${escapeHTML(item.quantity ?? 0)}</td>
                                        <td>${money(item.price)}</td>
                                        <td>${money(item.total)}</td>
                                    </tr>
                                `).join("")}
                            </tbody>
                        </table>
                    </section>
                `;
            }).join("")}

            <hr>
            <h2>Total Spending: ${money(totalSpent)}</h2>
            <p class="mz-thanks">MedZoneX Customer Statement</p>
        </article>
    `;

    showPage("mzCustomerDetailPage");
}

async function refresh() {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const userSnapshot = await getDoc(
            doc(db, "users", user.uid)
        );

        if (userSnapshot.exists()) {
            const profile = userSnapshot.data();
            pharmacyProfile = profile || {};
            pharmacyStoreName =
                String(profile.storeName || "").trim() ||
                "Your Pharmacy";
        }

        const settingsSnapshot = await getDoc(
            doc(db, "users", user.uid, "settings", "preferences")
        );

        const invoiceSettings = settingsSnapshot.exists()
            ? settingsSnapshot.data()
            : {};

        showInvoiceAddress = invoiceSettings.invoiceAddress !== false;

        await fetchBills();
        renderDashboard();

        if (currentView === "salesHistoryPage") renderSalesHistory();
        if (currentView === "customersPage") renderCustomers();
    } catch (error) {
        console.error("MedZoneX sales history error:", error);
    }
}

document.addEventListener("input", event => {
    if (event.target.id === "mzSalesSearch") {
        renderSalesHistory();
    }
});

document.addEventListener("click", event => {
    const billButton = event.target.closest("[data-bill-id]");
    if (billButton) {
        renderInvoice(billButton.dataset.billId);
        return;
    }

    const customerButton = event.target.closest("[data-customer-mobile]");
    if (customerButton) {
        renderCustomerStatement(customerButton.dataset.customerMobile);
        return;
    }

    if (
        event.target.closest("[data-back-dashboard]") ||
        event.target.closest("[data-back-sales]") ||
        event.target.closest("[data-back-customers]")
    ) {
        if (typeof window.MedZoneX?.backPage === "function") {
            window.MedZoneX.backPage();
        }
    }
});

$("viewAllSalesBtn")?.addEventListener("click", async () => {
    await refresh();
    ensureSalesPage();
    renderSalesHistory();
    showPage("salesHistoryPage");
});

$("openCustomersBtn")?.addEventListener("click", async () => {
    await refresh();
    renderCustomers();
});

$("billingCustomerMobile")?.addEventListener("input", async event => {
    const mobile = event.target.value.replace(/\D/g, "").slice(0, 10);
    if (event.target.value !== mobile) event.target.value = mobile;
    if (mobile.length !== 10 || !auth.currentUser) return;

    try {
        await refresh();
        const match = customerGroups().find(group => group.mobile === mobile);
        if (match && $("billingCustomerName")) {
            $("billingCustomerName").value = match.name;
        }
    } catch (error) {
        console.warn("Customer lookup failed:", error);
    }
});

window.addEventListener("medzonex:bill-saved", refresh);

window.MedZoneXSales = { refresh };

console.log("MedZoneX Sales module loaded.");
