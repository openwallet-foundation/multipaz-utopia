const ICON_SUCCESS =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="10"/><path d="m8 12 2.5 2.5L16 9"/></svg>';

const ICON_ERROR =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="10"/><path d="M12 8v4.5M12 16h.01"/></svg>';

// The eligible payee accounts come from the server's /accounts endpoint, which
// derives them from the registry (the System of Record) on every cal
async function loadAccounts() {
    const select = document.getElementById("account-select");
    try {
        const response = await fetch("accounts");
        if (!response.ok) {
            throw new Error("accounts responded " + response.status);
        }
        for (const account of await response.json()) {
            const option = document.createElement("option");
            option.value = account.account_number;
            option.textContent = account.label
                ? account.label + " (" + account.account_number + ")"
                : account.account_number;
            select.appendChild(option);
        }
    } catch (e) {
        // The registry is unreachable, so there are no payees to offer. Say so in
        // the control itself rather than leaving an empty box; its empty value
        // keeps validateInputs() from letting the payment through.
        const failed = document.createElement("option");
        failed.value = "";
        failed.textContent = "Could not load accounts";
        select.appendChild(failed);
    }
}

window.addEventListener("DOMContentLoaded", loadAccounts);

async function run() {
    clearStatus();

    const account = document.getElementById("account-select").value;
    const amountRaw = document.getElementById("amount").value.trim();
    const description = document.getElementById("description").value;
    const protocols = [];
    if (document.getElementById("protocol_iso").checked) {
        protocols.push("org-iso-mdoc")
    }
    if (document.getElementById("protocol_openid4vp").checked) {
        protocols.push("openid4vp-v1")
    }

    // Validate only what is universally true — a payee is selected and the amount
    // is positive. The payee itself needs no format check: it can only be an
    // account the registry just told us about, or the empty value we put there
    // when the list could not be loaded.
    if (!validateInputs(account, amountRaw)) {
        return;
    }

    const req = {
        payee_account: account,
        amount: amountRaw - 0,
        protocols: protocols
    };
    if (description != "") {
        req["description"] = description
    }

    const btn = document.getElementById("pay-btn");
    btn.disabled = true;
    try {
        const response = await multipazVerifyCredentials(req);
        if (response && response.error) {
            // A failure reported after the card was presented (e.g. insufficient
            // funds at commit). The server gives us a code and a description.
            showError(response.error, response.error_description);
        } else {
            showSuccess(response);
        }
    } catch (e) {
        // An unknown/invalid payee account fails in createTransaction, before the
        // wallet is ever invoked, so the verifier client throws instead of
        // returning an {error}. Surface it as a decline rather than freezing.
        showError(null, "The payment could not be initiated. Unknown error occurred.");
    } finally {
        btn.disabled = false;
    }
}

// Required-field / sane-amount checks only. Returns true when the form may be
// submitted; otherwise marks the offending fields and returns false.
function validateInputs(account, amountRaw) {
    let ok = true;

    if (account === "") {
        setFieldError("account", "Please select a payee account.");
        ok = false;
    }

    if (amountRaw === "") {
        setFieldError("amount", "Please enter a payment amount.");
        ok = false;
    } else {
        const amount = Number(amountRaw);
        if (!isFinite(amount)) {
            setFieldError("amount", "Payment amount must be a number.");
            ok = false;
        } else if (amount <= 0) {
            setFieldError("amount", "Payment amount must be greater than zero.");
            ok = false;
        }
    }

    return ok;
}

function setFieldError(field, message) {
    const error = document.getElementById(field + "-error");
    if (error) {
        error.textContent = message;
        error.hidden = false;
    }
    const control = document.getElementById(
        field === "account" ? "account-select" : field
    );
    if (control) {
        control.classList.add("invalid");
    }
}

function clearFieldErrors() {
    for (const error of document.querySelectorAll(".field-error")) {
        error.hidden = true;
        error.textContent = "";
    }
    for (const control of document.querySelectorAll(".invalid")) {
        control.classList.remove("invalid");
    }
}

function clearStatus() {
    const banner = document.getElementById("banner");
    banner.hidden = true;
    banner.innerHTML = "";
    clearFieldErrors();
}

function showSuccess(response) {
    const lines = [];
    if (response.payee && response.payee.name) {
        lines.push("Paid " + formatBalance(response.amount) + " to " + response.payee.name);
    }
    if (response.transaction_id) {
        lines.push("Transaction ID: " + response.transaction_id);
    }
    renderBanner("success", ICON_SUCCESS, "Payment Successful", lines);
}

function showError(error, description) {
    const detail = description || "The payment could not be completed.";
    const line = document.createElement("span");
    if (error) {
        const code = document.createElement("strong");
        code.textContent = "Error Code: " + error + " ";
        line.appendChild(code);
        line.appendChild(document.createTextNode("- " + detail));
    } else {
        line.textContent = detail;
    }
    renderBanner("error", ICON_ERROR, "Transaction Declined", [line]);
}

function renderBanner(kind, icon, title, lines) {
    const banner = document.getElementById("banner");
    banner.className = "banner " + kind;

    const titleEl = document.createElement("div");
    titleEl.className = "banner-title";
    titleEl.innerHTML = icon;
    titleEl.appendChild(document.createTextNode(title));
    banner.appendChild(titleEl);

    for (const line of lines) {
        const lineEl = document.createElement("div");
        lineEl.className = "banner-line";
        if (typeof line === "string") {
            lineEl.textContent = line;
        } else {
            lineEl.appendChild(line);
        }
        banner.appendChild(lineEl);
    }
    banner.hidden = false;
}

function formatBalance(balance) {
    return balance.toLocaleString('en-US', {
        minimumFractionDigits: 2,
    });
}
