// ========== PASSPORT FUNCTIONS ==========
let currentPassportCustomerId = null;

function openPassportModal(customerId) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    
    currentPassportCustomerId = customerId;
    
    if (!customer.passport) {
        customer.passport = { ...PASSPORT_FIELDS };
    }
    if (!Array.isArray(customer.passport.orders)) customer.passport.orders = [];

    const totalOrderCount = 1 + customer.passport.orders.length;
    const multiOrderBadge = totalOrderCount > 1
        ? `<span class="passport-multi-order-badge"><i class="fas fa-layer-group"></i> ${totalOrderCount} Orders</span>`
        : '';

  // In openPassportModal function, update the customer info display
const infoEl = document.getElementById('passportCustomerInfo');
if (infoEl) {
    let repeatInfo = '';
    if (customer.passport && customer.passport.isRepeatCustomer) {
        repeatInfo = ` | <span style="color: #f59e0b;"><i class="fas fa-star"></i> Repeat Customer (${customer.passport.totalOrdersCount} orders)</span>`;
    }
    
    infoEl.innerHTML = `
        <i class="fas fa-building"></i> <strong>${customer.name}</strong>${multiOrderBadge} | 
        <i class="fas fa-map-marker-alt"></i> ${customer.address.substring(0, 50)}${customer.address.length > 50 ? '...' : ''} | 
        <i class="fas fa-tag"></i> ${customer.zone}
        ${repeatInfo}
    `;
}

    // Render the orders panel (shows "Orders for this customer" + Add Order button)
    if (typeof renderOrdersPanel === 'function') renderOrdersPanel(customer);
    if (typeof hideAddOrderForm === 'function') hideAddOrderForm();

    loadPassportData(customer.passport);
    updatePassportCompletionStatus(customer.passport);
    switchPassportTab('order');
    
    const modal = document.getElementById('customerPassportModal');
    if (modal) {
        modal.classList.add('active');
    } else {
        console.error('Passport modal not found in DOM');
        showNotification('Passport modal not loaded properly', 'error');
    }
}

function closePassportModal() {
    // Auto-save passport data when modal is closed (covers X button, backdrop click, etc.)
    if (currentPassportCustomerId) {
        const customer = customers.find(c => c.id === currentPassportCustomerId);
        if (customer && customer.passport) {
            _persistPassportFromForm(customer);
        }
    }
    const modal = document.getElementById('customerPassportModal');
    if (modal) {
        modal.classList.remove('active');
    }
    currentPassportCustomerId = null;
}

// Reads form fields, updates customer.passport, and emits quick save — shared by
// closePassportModal (auto-save on close) and savePassportData (explicit Save button).
function _persistPassportFromForm(customer) {
    const passport = {
        trolleyCount: parseFloat(getElementValue('passportTrolleyCount')) || 0,
        orderNumber: getElementValue('passportOrderNumber'),
        orderDate: getElementValue('passportOrderDate'),
        requiredByDate: getElementValue('passportRequiredByDate'),
        takenBy: getElementValue('passportTakenBy'),
        customerContact: getElementValue('passportCustomerContact'),
        customerEmail: getElementValue('passportCustomerEmail'),
        accountType: getElementValue('passportAccountType'),
        poNumber: getElementValue('passportPoNumber'),
        invoiceDelivery: getRadioValue('invoiceDelivery'),
        invoiceEmail: getElementValue('passportInvoiceEmail'),
        plantVariety: getElementValue('passportPlantVariety'),
        numberOfPlants: getElementValue('passportNumberOfPlants'),
        potSize: getElementValue('passportPotSize'),
        potColor: getElementValue('passportPotColor'),
        qualityGrade: getElementValue('passportQualityGrade'),
        coloursToAvoid: getElementValue('passportColoursToAvoid'),
        flowerStage: getElementValue('passportFlowerStage'),
        mixedColoursOk: getElementValue('passportMixedColoursOk') === 'Yes',
        preferredHeight: getElementValue('passportPreferredHeight'),
        blemishTolerance: getElementValue('passportBlemishTolerance'),
        specificColours: getElementValue('passportSpecificColours'),
        additionalPlantNotes: getElementValue('passportAdditionalPlantNotes'),
        barcodedLabels: getElementValue('passportBarcodedLabels') === 'Yes',
        prePricedLabels: getElementValue('passportPrePricedLabels') === 'Yes',
        labelInstructions: getElementValue('passportLabelInstructions'),
        fulfilmentMethod: getElementValue('passportFulfilmentMethod'),
        preferredDeliveryDay: getElementValue('passportPreferredDeliveryDay'),
        preferredTimeWindow: getPreferredTimeWindowValue(),
        siteAccessRestrictions: getElementValue('passportSiteAccessRestrictions') === 'Yes',
        siteAccessTimes: getElementValue('passportSiteAccessTimes'),
        onsiteContactName: getElementValue('passportOnsiteContactName'),
        onsiteContactPhone: getElementValue('passportOnsiteContactPhone'),
        fullAddress: getElementValue('passportFullAddress'),
        specialDeliveryInstructions: getElementValue('passportSpecialDeliveryInstructions'),
        paymentTerms: getElementValue('passportPaymentTerms'),
        paymentMethod: getElementValue('passportPaymentMethod'),
        paymentReceived: getElementValue('passportPaymentReceived') === 'Yes',
        amountPaid: parseFloat(getElementValue('passportAmountPaid')) || 0,
        packedBy: getElementValue('passportPackedBy'),
        datePacked: getElementValue('passportDatePacked'),
        flowerStageConfirmed: getElementValue('passportFlowerStageConfirmed'),
        qualityGradeMet: getElementValue('passportQualityGradeMet') === 'Yes',
        qualityNotes: getElementValue('passportQualityNotes'),
        labelsApplied: getElementValue('passportLabelsApplied') === 'Yes',
        barcodeChecked: getElementValue('passportBarcodeChecked'),
        substitutionsMade: getElementValue('passportSubstitutionsMade') === 'Yes',
        substitutionDetails: getElementValue('passportSubstitutionDetails'),
        checkedBy: getElementValue('passportCheckedBy'),
        signOff: getElementValue('passportSignOff'),
        heavyLoad: document.querySelector('input[name="passportHeavyLoad"]:checked')?.value === 'true',
        isRepeatCustomer: customer.passport?.isRepeatCustomer || false,
        totalOrdersCount: customer.passport?.totalOrdersCount || 0,
        previousOrderCount: customer.passport?.previousOrderCount || 0,
        customerSince: customer.passport?.customerSince || new Date().toISOString(),
        potsToReturn: document.getElementById('passportPotsToReturn')?.checked || false,
        numberOfPotsToReturn: parseInt(getElementValue('passportNumberOfPotsToReturn')) || 0,
        potReturnSizes: getElementValue('passportPotReturnSizes'),
        potReturnNotes: getElementValue('passportPotReturnNotes'),
        timestamps: customer.passport?.timestamps || {
            orderCreated: new Date().toISOString(),
            firstPickerAssigned: '',
            pickingStarted: '',
            pickingCompleted: '',
            readyForDelivery: '',
            deliveredAt: ''
        },
        pickingMetrics: customer.passport?.pickingMetrics || {
            timeToFirstPicker: 0,
            pickingDuration: 0,
            totalPickingTime: 0,
            efficiencyScore: 0,
            numberOfPickers: customer.assignedStaff?.length || 0,
            pickerNames: [],
            plantsPerHour: 0,
            plantsPerPicker: {}
        },
        lastUpdated: new Date().toISOString(),
        updatedBy: 'Admin',
        orders: Array.isArray(customer.passport?.orders) ? customer.passport.orders : []
    };
    if (!passport.timestamps.orderCreated) {
        passport.timestamps.orderCreated = new Date().toISOString();
    }
    customer.passport = passport;
    if (typeof quickSavePassport === 'function') {
        quickSavePassport(customer);
    } else {
        saveData();
    }
}

function switchPassportTab(tabName) {
    document.querySelectorAll('.passport-tab').forEach(tab => tab.classList.remove('active'));
    
    const tabs = document.querySelectorAll('.passport-tab');
    for (let tab of tabs) {
        if (tab.textContent.toLowerCase().includes(tabName) || 
            (tabName === 'order' && tab.textContent.includes('1.')) ||
            (tabName === 'plant' && tab.textContent.includes('2.')) ||
            (tabName === 'labelling' && tab.textContent.includes('3.')) ||
            (tabName === 'delivery' && tab.textContent.includes('4.')) ||
            (tabName === 'payment' && tab.textContent.includes('5.')) ||
            (tabName === 'packing' && tab.textContent.includes('6.'))) {
            tab.classList.add('active');
        }
    }
    
    document.querySelectorAll('.passport-tab-content').forEach(content => content.classList.remove('active'));
    const tabContent = document.getElementById(`passport${tabName.charAt(0).toUpperCase() + tabName.slice(1)}Tab`);
    if (tabContent) {
        tabContent.classList.add('active');
    }
}

function toggleSpecificTime() {
    const select = document.getElementById('passportPreferredTimeWindow');
    const group = document.getElementById('specificTimeGroup');
    if (select && group) {
        group.style.display = select.value === 'Specific: ____' ? 'block' : 'none';
    }
}

function toggleAccessTimes() {
    const select = document.getElementById('passportSiteAccessRestrictions');
    const group = document.getElementById('accessTimesGroup');
    if (select && group) {
        group.style.display = select.value === 'Yes' ? 'block' : 'none';
    }
}

function toggleQualityNotes() {
    const select = document.getElementById('passportQualityGradeMet');
    const group = document.getElementById('qualityNotesGroup');
    if (select && group) {
        group.style.display = select.value === 'No' ? 'block' : 'none';
    }
}

function toggleSubstitutionDetails() {
    const select = document.getElementById('passportSubstitutionsMade');
    const group = document.getElementById('substitutionDetailsGroup');
    if (select && group) {
        group.style.display = select.value === 'Yes' ? 'block' : 'none';
    }
}

function togglePotReturnFields() {
    const checkbox = document.getElementById('passportPotsToReturn');
    const fields = document.getElementById('potReturnFields');
    if (checkbox && fields) {
        fields.style.display = checkbox.checked ? 'block' : 'none';
    }
}

function loadPassportData(passport) {
    if (!passport) return;
    
    setElementValue('passportTrolleyCount', passport.trolleyCount || 0);
    setElementValue('passportOrderNumber', passport.orderNumber);
    setElementValue('passportOrderDate', passport.orderDate);
    setElementValue('passportRequiredByDate', passport.requiredByDate);
    setElementValue('passportTakenBy', passport.takenBy);
    setElementValue('passportCustomerContact', passport.customerContact);
    setElementValue('passportCustomerEmail', passport.customerEmail);
    setElementValue('passportAccountType', passport.accountType);
    setElementValue('passportPoNumber', passport.poNumber);
    
    if (passport.invoiceDelivery) {
        const radios = document.querySelectorAll('input[name="invoiceDelivery"]');
        radios.forEach(radio => {
            if (radio.value === passport.invoiceDelivery) {
                radio.checked = true;
            }
        });
        const invoiceGroup = document.getElementById('invoiceEmailGroup');
        if (invoiceGroup) {
            invoiceGroup.style.display = passport.invoiceDelivery === 'Email' ? 'block' : 'none';
        }
    }
    setElementValue('passportInvoiceEmail', passport.invoiceEmail);
    
    setElementValue('passportPlantVariety', passport.plantVariety);
    setElementValue('passportNumberOfPlants', passport.numberOfPlants);
    setElementValue('passportPotSize', passport.potSize);
    setElementValue('passportPotColor', passport.potColor);
    setElementValue('passportQualityGrade', passport.qualityGrade);
    setElementValue('passportColoursToAvoid', passport.coloursToAvoid);
    setElementValue('passportFlowerStage', passport.flowerStage);
    setElementValue('passportMixedColoursOk', passport.mixedColoursOk ? 'Yes' : 'No');
    setElementValue('passportPreferredHeight', passport.preferredHeight);
    setElementValue('passportBlemishTolerance', passport.blemishTolerance);
    setElementValue('passportSpecificColours', passport.specificColours);
    setElementValue('passportAdditionalPlantNotes', passport.additionalPlantNotes);
    
    setElementValue('passportBarcodedLabels', passport.barcodedLabels ? 'Yes' : 'No');
    setElementValue('passportPrePricedLabels', passport.prePricedLabels ? 'Yes' : 'No');
    setElementValue('passportLabelInstructions', passport.labelInstructions);
    
    setElementValue('passportFulfilmentMethod', passport.fulfilmentMethod || 'Delivery');
    setElementValue('passportPreferredDeliveryDay', passport.preferredDeliveryDay);
    setElementValue('passportPreferredTimeWindow', passport.preferredTimeWindow || 'Morning (AM)');
    toggleSpecificTime();
    setElementValue('passportSpecificTime', '');
    setElementValue('passportSiteAccessRestrictions', passport.siteAccessRestrictions ? 'Yes' : 'No');
    toggleAccessTimes();
    setElementValue('passportSiteAccessTimes', passport.siteAccessTimes);
    setElementValue('passportOnsiteContactName', passport.onsiteContactName);
    setElementValue('passportOnsiteContactPhone', passport.onsiteContactPhone);
    setElementValue('passportFullAddress', passport.fullAddress);
    setElementValue('passportSpecialDeliveryInstructions', passport.specialDeliveryInstructions);
    
    setElementValue('passportPaymentTerms', passport.paymentTerms || 'Credit Account');
    setElementValue('passportPaymentMethod', passport.paymentMethod || 'BACS');
    setElementValue('passportPaymentReceived', passport.paymentReceived ? 'Yes' : 'No');
    setElementValue('passportAmountPaid', passport.amountPaid || 0);
    
    setElementValue('passportPackedBy', passport.packedBy);
    setElementValue('passportDatePacked', passport.datePacked);
    setElementValue('passportFlowerStageConfirmed', passport.flowerStageConfirmed);
    setElementValue('passportQualityGradeMet', passport.qualityGradeMet ? 'Yes' : 'No');
    toggleQualityNotes();
    setElementValue('passportQualityNotes', passport.qualityNotes);
    setElementValue('passportLabelsApplied', passport.labelsApplied ? 'Yes' : 'No');
    setElementValue('passportBarcodeChecked', passport.barcodeChecked || 'N/A');
    setElementValue('passportSubstitutionsMade', passport.substitutionsMade ? 'Yes' : 'No');
    toggleSubstitutionDetails();
    setElementValue('passportSubstitutionDetails', passport.substitutionDetails);
    setElementValue('passportCheckedBy', passport.checkedBy);
    setElementValue('passportSignOff', passport.signOff);
    const heavyLoadNo  = document.getElementById('passportHeavyLoadNo');
    const heavyLoadYes = document.getElementById('passportHeavyLoadYes');
    if (heavyLoadNo && heavyLoadYes) {
        heavyLoadNo.checked  = !passport.heavyLoad;
        heavyLoadYes.checked = !!passport.heavyLoad;
    }
    
    // Load repeat customer data
    setElementValue('passportTotalOrdersCount', passport.totalOrdersCount || 0);
    setElementValue('passportCustomerSince', passport.customerSince || '');
    
    // Load pot return data
    const potsToReturnCheckbox = document.getElementById('passportPotsToReturn');
    if (potsToReturnCheckbox) {
        potsToReturnCheckbox.checked = passport.potsToReturn || false;
    }
    setElementValue('passportNumberOfPotsToReturn', passport.numberOfPotsToReturn || 0);
    setElementValue('passportPotReturnSizes', passport.potReturnSizes || '');
    setElementValue('passportPotReturnNotes', passport.potReturnNotes || '');
    togglePotReturnFields();
}

function setElementValue(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
        element.value = value !== null && value !== undefined ? value : '';
    }
}

function savePassportData() {
    if (!currentPassportCustomerId) return;
    const customer = customers.find(c => c.id === currentPassportCustomerId);
    if (!customer) return;
    // Ensure passport object exists so _persistPassportFromForm can preserve metadata
    if (!customer.passport) customer.passport = { ...PASSPORT_FIELDS };
    _persistPassportFromForm(customer);
    updateAllDisplays();
    // Clear ID before closePassportModal so the auto-save in close doesn't duplicate
    currentPassportCustomerId = null;
    closePassportModal();
    showNotification('Customer passport saved successfully');
}

function getElementValue(elementId) {
    const element = document.getElementById(elementId);
    return element ? element.value : '';
}

function getRadioValue(name) {
    const radios = document.getElementsByName(name);
    for (let radio of radios) {
        if (radio.checked) return radio.value;
    }
    return '';
}

function getPreferredTimeWindowValue() {
    const select = document.getElementById('passportPreferredTimeWindow');
    if (!select) return '';
    
    if (select.value === 'Specific: ____') {
        const specific = document.getElementById('passportSpecificTime');
        return `Specific: ${specific ? specific.value : ''}`;
    }
    return select.value;
}

function updatePassportCompletionStatus(passport) {
    const requiredFields = [
        'orderNumber', 'orderDate', 'requiredByDate', 'takenBy',
        'plantVariety', 'numberOfPlants', 'potSize', 'flowerStage'
    ];
    
    const completedFields = requiredFields.filter(field => 
        passport[field] && passport[field].toString().trim() !== ''
    );
    const completionPercent = Math.round((completedFields.length / requiredFields.length) * 100);
    
    const statusEl = document.getElementById('passportCompletionStatus');
    const textEl = document.getElementById('passportCompletionText');
    
    if (statusEl && textEl) {
        statusEl.className = `passport-status ${completionPercent === 100 ? 'complete' : 'incomplete'}`;
        textEl.textContent = completionPercent === 100 
            ? 'All required information complete' 
            : `${completionPercent}% complete - ${requiredFields.length - completedFields.length} fields remaining`;
    }
}

function getPassportDisplayHTML(customer) {
    if (!customer.passport) return '';
    
    const passport = customer.passport;
    let html = '<div class="passport-info-panel">';
    
    if (passport.plantVariety || passport.potSize || passport.flowerStage) {
        html += '<div class="passport-section picking">';
        html += '<div class="passport-section-title"><i class="fas fa-seedling"></i> Picking Requirements</div>';
        html += '<div class="passport-section-grid">';
        
        if (passport.plantVariety) {
            html += `<div class="passport-info-item">
                <span class="info-label">Variety:</span>
                <span class="info-value">${passport.plantVariety}</span>
            </div>`;
        }
        
        if (passport.numberOfPlants) {
            html += `<div class="passport-info-item">
                <span class="info-label">Quantity:</span>
                <span class="info-value">${passport.numberOfPlants}</span>
            </div>`;
        }
        
        if (passport.potSize) {
            html += `<div class="passport-info-item">
                <span class="info-label">Pot Size:</span>
                <span class="info-value">${passport.potSize}</span>
            </div>`;
        }
        
        if (passport.potColor) {
            html += `<div class="passport-info-item">
                <span class="info-label">Pot Colour:</span>
                <span class="info-value">${passport.potColor}</span>
            </div>`;
        }
        
        if (passport.flowerStage) {
            html += `<div class="passport-info-item">
                <span class="info-label">Flower Stage:</span>
                <span class="info-value">${passport.flowerStage}</span>
            </div>`;
        }
        
        if (passport.qualityGrade) {
            html += `<div class="passport-info-item">
                <span class="info-label">Quality:</span>
                <span class="info-value">${passport.qualityGrade}</span>
            </div>`;
        }
        
        if (passport.coloursToAvoid) {
            html += `<div class="passport-info-item warning">
                <span class="info-label"><i class="fas fa-ban"></i> Avoid:</span>
                <span class="info-value">${passport.coloursToAvoid}</span>
            </div>`;
        }
        
        if (passport.specificColours) {
            html += `<div class="passport-info-item">
                <span class="info-label">Colours:</span>
                <span class="info-value">${passport.specificColours}</span>
            </div>`;
        }
        
        if (passport.preferredHeight) {
            html += `<div class="passport-info-item">
                <span class="info-label">Height:</span>
                <span class="info-value">${passport.preferredHeight}</span>
            </div>`;
        }
        
        if (passport.blemishTolerance) {
            html += `<div class="passport-info-item">
                <span class="info-label">Blemishes:</span>
                <span class="info-value">${passport.blemishTolerance}</span>
            </div>`;
        }
        
        if (passport.additionalPlantNotes) {
            html += `<div class="passport-info-item full-width">
                <span class="info-label">Notes:</span>
                <span class="info-value">${passport.additionalPlantNotes}</span>
            </div>`;
        }
        
        html += '</div></div>';
    }
    
    if (passport.barcodedLabels || passport.prePricedLabels || passport.labelInstructions) {
        html += '<div class="passport-section labelling">';
        html += '<div class="passport-section-title"><i class="fas fa-tags"></i> Labelling</div>';
        html += '<div class="passport-section-grid">';
        
        if (passport.barcodedLabels) {
            html += `<div class="passport-info-item">
                <span class="info-label">Barcodes:</span>
                <span class="info-value">Required</span>
            </div>`;
        }
        
        if (passport.prePricedLabels) {
            html += `<div class="passport-info-item">
                <span class="info-label">Pre-Priced:</span>
                <span class="info-value">Yes</span>
            </div>`;
        }
        
        if (passport.labelInstructions) {
            html += `<div class="passport-info-item full-width">
                <span class="info-label">Instructions:</span>
                <span class="info-value">${passport.labelInstructions}</span>
            </div>`;
        }
        
        html += '</div></div>';
    }
    
    if (passport.fulfilmentMethod === 'Delivery' && (passport.specialDeliveryInstructions || passport.siteAccessRestrictions)) {
        html += '<div class="passport-section delivery">';
        html += '<div class="passport-section-title"><i class="fas fa-truck"></i> Delivery Instructions</div>';
        html += '<div class="passport-section-grid">';
        
        if (passport.preferredDeliveryDay) {
            html += `<div class="passport-info-item">
                <span class="info-label">Preferred Day:</span>
                <span class="info-value">${passport.preferredDeliveryDay}</span>
            </div>`;
        }
        
        if (passport.preferredTimeWindow) {
            html += `<div class="passport-info-item">
                <span class="info-label">Time Window:</span>
                <span class="info-value">${passport.preferredTimeWindow}</span>
            </div>`;
        }
        
        if (passport.onsiteContactName) {
            html += `<div class="passport-info-item">
                <span class="info-label">Contact:</span>
                <span class="info-value">${passport.onsiteContactName} ${passport.onsiteContactPhone ? `(${passport.onsiteContactPhone})` : ''}</span>
            </div>`;
        }
        
        if (passport.siteAccessRestrictions) {
            html += `<div class="passport-info-item warning">
                <span class="info-label"><i class="fas fa-exclamation-triangle"></i> Access:</span>
                <span class="info-value">${passport.siteAccessTimes || 'Restricted access'}</span>
            </div>`;
        }
        
        if (passport.specialDeliveryInstructions) {
            html += `<div class="passport-info-item full-width">
                <span class="info-label">Instructions:</span>
                <span class="info-value">${passport.specialDeliveryInstructions}</span>
            </div>`;
        }
        
        html += '</div></div>';
    }
    
    html += '</div>';
    
    return html;
}

function getWeeklyPassportDisplayHTML(customer) {
    if (!customer.passport) return '';
    
    const passport = customer.passport;
    let html = '<div class="weekly-passport-info">';
    
    if (passport.plantVariety) {
        html += `<div><i class="fas fa-seedling"></i> ${passport.plantVariety}</div>`;
    }
    
    if (passport.numberOfPlants) {
        html += `<div><i class="fas fa-box"></i> ${passport.numberOfPlants}</div>`;
    }
    
    if (passport.potSize) {
        html += `<div><i class="fas fa-flask"></i> ${passport.potSize}</div>`;
    }
    
    if (passport.specialDeliveryInstructions) {
        html += `<div class="weekly-delivery-note"><i class="fas fa-info-circle"></i> ${passport.specialDeliveryInstructions.substring(0, 30)}${passport.specialDeliveryInstructions.length > 30 ? '...' : ''}</div>`;
    }
    
    html += '</div>';
    
    return html;
}

function initPassportEventListeners() {
    const radios = document.querySelectorAll('input[name="invoiceDelivery"]');
    radios.forEach(radio => {
        radio.addEventListener('change', function() {
            const group = document.getElementById('invoiceEmailGroup');
            if (group) {
                group.style.display = this.value === 'Email' ? 'block' : 'none';
            }
        });
    });
}

// ===================================================
//  ORDERS PANEL FUNCTIONS
// ===================================================
let _editingOrderIdx = null;

function renderOrdersPanel(customer) {
    if (!customer) return;
    if (!customer.passport) customer.passport = {};
    if (!Array.isArray(customer.passport.orders)) customer.passport.orders = [];

    const orders = customer.passport.orders;
    const total  = 1 + orders.length;
    const badge  = document.getElementById('ordersTotalBadge');
    if (badge) badge.textContent = total;

    const list = document.getElementById('passportOrdersList');
    if (!list) return;

    const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

    const primaryVan      = customer.assignedVan && typeof VANS !== 'undefined' ? VANS.find(v => v.id === customer.assignedVan) : null;
    const primaryDay      = customer.assignedDay ? dayNames[customer.assignedDay - 1] : null;
    const primaryOrderNum = customer.passport.orderNumber || '—';
    const primaryPlant    = customer.passport.plantVariety || '';
    const primaryTrolleys = getTotalTrolleyCount(customer);

    let html = `
        <div class="passport-order-row primary-order">
            <div class="order-row-num primary">1</div>
            <div class="order-row-info">
                <span class="order-row-tag order-num"><i class="fas fa-hashtag"></i> ${primaryOrderNum}</span>
                ${primaryVan ? `<span class="order-row-tag van-tag"><i class="fas fa-truck"></i> ${primaryVan.name}</span>` : '<span class="order-row-tag" style="background:#f3f4f6;color:#9ca3af;font-style:italic;">No van yet</span>'}
                ${primaryDay ? `<span class="order-row-tag day-tag"><i class="fas fa-calendar"></i> ${primaryDay}</span>` : ''}
                ${primaryPlant ? `<span class="order-row-tag plant-tag"><i class="fas fa-leaf"></i> ${primaryPlant}</span>` : ''}
                ${primaryTrolleys > 0 ? `<span class="order-row-tag trolley-tag"><i class="fas fa-dolly"></i> ${primaryTrolleys} trolley${primaryTrolleys !== 1 ? 's' : ''}</span>` : ''}
            </div>
            <span class="order-row-label-primary">Primary</span>
            <div class="order-row-actions">
                <button class="por-btn edit" onclick="switchPassportTab('order')" title="Edit in Order Details tab">
                    <i class="fas fa-edit"></i> Edit
                </button>
            </div>
        </div>`;

    orders.forEach(function(order, idx) {
        var van      = order.vanId && typeof VANS !== 'undefined' ? VANS.find(function(v){ return v.id === parseInt(order.vanId); }) : null;
        var day      = order.dayId ? dayNames[parseInt(order.dayId) - 1] : null;
        var trolleys = parseFloat(order.trolleyCount) || 0;
        html += `
            <div class="passport-order-row">
                <div class="order-row-num">${idx + 2}</div>
                <div class="order-row-info">
                    <span class="order-row-tag order-num"><i class="fas fa-hashtag"></i> ${order.orderNumber || '—'}</span>
                    ${van  ? `<span class="order-row-tag van-tag"><i class="fas fa-truck"></i> ${van.name}</span>` : '<span class="order-row-tag" style="background:#f3f4f6;color:#9ca3af;font-style:italic;">No van</span>'}
                    ${day  ? `<span class="order-row-tag day-tag"><i class="fas fa-calendar"></i> ${day}</span>` : ''}
                    ${order.plantVariety ? `<span class="order-row-tag plant-tag"><i class="fas fa-leaf"></i> ${order.plantVariety}${order.numberOfPlants ? ' &times;' + order.numberOfPlants : ''}</span>` : ''}
                    ${trolleys > 0 ? `<span class="order-row-tag trolley-tag"><i class="fas fa-dolly"></i> ${trolleys} trolley${trolleys !== 1 ? 's' : ''}</span>` : ''}
                    ${order.potSize ? `<span class="order-row-tag" style="background:#f3f4f6;color:#374151;">${order.potSize}</span>` : ''}
                </div>
                <span class="order-row-date">${order.orderDate || ''}</span>
                <div class="order-row-actions">
                    <button class="por-btn edit" onclick="editAdditionalOrder(${idx})"><i class="fas fa-edit"></i></button>
                    <button class="por-btn delete" onclick="removeAdditionalOrder(${idx})"><i class="fas fa-trash"></i></button>
                </div>
            </div>`;
    });

    list.innerHTML = html;
}

function showAddOrderForm(editIdx) {
    _editingOrderIdx = (editIdx !== undefined && editIdx !== null) ? editIdx : null;
    var form    = document.getElementById('addOrderForm');
    var title   = document.getElementById('addOrderFormTitle');
    var saveBtn = document.getElementById('addOrderSaveBtn');
    if (!form) return;

    var vanSel = document.getElementById('newOrderVan');
    if (vanSel && typeof VANS !== 'undefined') {
        vanSel.innerHTML = '<option value="">— Select Van —</option>' +
            VANS.map(function(v){ return '<option value="' + v.id + '">' + v.name + '</option>'; }).join('');
    }

    if (_editingOrderIdx !== null) {
        var customer = customers.find(function(c){ return c.id === currentPassportCustomerId; });
        var order = customer && customer.passport && customer.passport.orders ? customer.passport.orders[_editingOrderIdx] : null;
        if (!order) return;
        title.textContent = 'Edit Order ' + (_editingOrderIdx + 2);
        saveBtn.innerHTML = '<i class="fas fa-check"></i> Save Changes';
        document.getElementById('newOrderNumber').value     = order.orderNumber    || '';
        document.getElementById('newOrderDate').value       = order.orderDate      || '';
        document.getElementById('newOrderRequiredBy').value = order.requiredByDate || '';
        document.getElementById('newOrderVan').value        = order.vanId          || '';
        document.getElementById('newOrderDay').value        = order.dayId          || '';
        document.getElementById('newOrderPlant').value      = order.plantVariety   || '';
        document.getElementById('newOrderPlantCount').value = order.numberOfPlants || '';
        document.getElementById('newOrderPotSize').value    = order.potSize        || '';
        document.getElementById('newOrderTrolleys').value   = order.trolleyCount   || 0;
    } else {
        title.textContent = 'New Additional Order';
        saveBtn.innerHTML = '<i class="fas fa-check"></i> Add Order';
        document.getElementById('newOrderNumber').value     = '';
        document.getElementById('newOrderDate').value       = new Date().toISOString().split('T')[0];
        document.getElementById('newOrderRequiredBy').value = '';
        document.getElementById('newOrderVan').value        = '';
        document.getElementById('newOrderDay').value        = '';
        document.getElementById('newOrderPlant').value      = '';
        document.getElementById('newOrderPlantCount').value = '';
        document.getElementById('newOrderPotSize').value    = '';
        document.getElementById('newOrderTrolleys').value   = '0';
    }

    form.style.display = 'block';
    setTimeout(function(){ form.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 50);
}

function hideAddOrderForm() {
    var form = document.getElementById('addOrderForm');
    if (form) form.style.display = 'none';
    _editingOrderIdx = null;
}

function saveAdditionalOrder() {
    var customer = customers.find(function(c){ return c.id === currentPassportCustomerId; });
    if (!customer) return;
    if (!customer.passport) customer.passport = {};
    if (!Array.isArray(customer.passport.orders)) customer.passport.orders = [];

    var orderData = {
        id:             _editingOrderIdx !== null ? customer.passport.orders[_editingOrderIdx].id : Date.now(),
        orderNumber:    document.getElementById('newOrderNumber').value.trim(),
        orderDate:      document.getElementById('newOrderDate').value,
        requiredByDate: document.getElementById('newOrderRequiredBy').value,
        vanId:          document.getElementById('newOrderVan').value || null,
        dayId:          document.getElementById('newOrderDay').value || null,
        plantVariety:   document.getElementById('newOrderPlant').value.trim(),
        numberOfPlants: parseInt(document.getElementById('newOrderPlantCount').value) || 0,
        potSize:        document.getElementById('newOrderPotSize').value.trim(),
        trolleyCount:   parseFloat(document.getElementById('newOrderTrolleys').value) || 0,
    };

    if (_editingOrderIdx !== null) {
        customer.passport.orders[_editingOrderIdx] = orderData;
        if (typeof showNotification === 'function') showNotification('Order updated ✓', 'success');
    } else {
        customer.passport.orders.push(orderData);
        if (typeof showNotification === 'function') showNotification('Order ' + (orderData.orderNumber || '#' + (customer.passport.orders.length + 1)) + ' added ✓', 'success');
    }

    hideAddOrderForm();
    renderOrdersPanel(customer);
    if (typeof quickSavePassport === 'function') quickSavePassport(customer); else if (typeof saveData === 'function') saveData();
    if (typeof updateAllDisplays === 'function') updateAllDisplays();
}

function editAdditionalOrder(idx) { showAddOrderForm(idx); }

function removeAdditionalOrder(idx) {
    var customer = customers.find(function(c){ return c.id === currentPassportCustomerId; });
    if (!customer || !customer.passport || !customer.passport.orders) return;
    var order = customer.passport.orders[idx];
    if (!confirm('Remove order "' + (order.orderNumber || 'Order ' + (idx + 2)) + '"?')) return;
    customer.passport.orders.splice(idx, 1);
    hideAddOrderForm();
    renderOrdersPanel(customer);
    if (typeof quickSavePassport === 'function') quickSavePassport(customer); else if (typeof saveData === 'function') saveData();
    if (typeof updateAllDisplays === 'function') updateAllDisplays();
    if (typeof showNotification === 'function') showNotification('Order removed', 'info');
}

