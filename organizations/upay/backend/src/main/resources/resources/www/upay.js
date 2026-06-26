const ICON_SUCCESS =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="10"/><path d="m8 12 2.5 2.5L16 9"/></svg>';

const ICON_ERROR =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="10"/><path d="M12 8v4.5M12 16h.01"/></svg>';

async function run() {
    clearStatus();

    const account = document.getElementById("account").value.trim();
    const amountRaw = document.getElementById("amount").value.trim();
    const description = document.getElementById("description").value;
    const protocols = [];
    if (document.getElementById("protocol_iso").checked) {
        protocols.push("org-iso-mdoc")
    }
    if (document.getElementById("protocol_openid4vp").checked) {
        protocols.push("openid4vp-v1")
    }

    const errors = validateInputs(account, amountRaw, protocols);
    if (errors.length > 0) {
        showValidationErrors(errors);
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
        if (response.error) {
            showError(response.error, response.error_description);
        } else {
            showSuccess(response);
        }
    } catch (e) {
        showError("network_error", (e && e.message) ? e.message : String(e));
    } finally {
        btn.disabled = false;
    }
}

function validateInputs(account, amountRaw, protocols) {
    const errors = [];

    if (account === "") {
        errors.push({field: "account", message: "Payee account number is required."});
    } else if (!/^\d+$/.test(account)) {
        errors.push({field: "account", message: "Payee account number must contain digits only."});
    }

    if (amountRaw === "") {
        errors.push({field: "amount", message: "Payment amount is required."});
    } else {
        const amount = Number(amountRaw);
        if (!isFinite(amount)) {
            errors.push({field: "amount", message: "Payment amount must be a valid number."});
        } else if (amount <= 0) {
            errors.push({field: "amount", message: "Payment amount must be greater than zero."});
        }
    }

    return errors;
}

function showValidationErrors(errors) {
    for (const err of errors) {
        if (err.field === "account" || err.field === "amount") {
            document.getElementById(err.field).classList.add("invalid");
        }
    }
    const lines = errors.map(function (err) {
        return err.message;
    });
    renderBanner("error", ICON_ERROR, "Please fix the following", lines);
}

function clearStatus() {
    const banner = document.getElementById("banner");
    banner.hidden = true;
    banner.innerHTML = "";
    const marked = document.querySelectorAll("input.invalid");
    for (const el of marked) {
        el.classList.remove("invalid");
    }
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
    const code = document.createElement("strong");
    code.textContent = "Error Code: " + error + " ";
    line.appendChild(code);
    line.appendChild(document.createTextNode("- " + detail));
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
