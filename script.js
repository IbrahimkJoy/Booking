/* ═══════════════════════════════════════════════════════
   AIPSC Booking System — script.js
   For: index.html (Public Booking Page)
═══════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────
   CONFIG
   ⚠️  Replace with your Google Apps Script
   Web App URL after deployment.
───────────────────────────────────────── */
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwntdOSw_dGRFvUEIyUuyAyKwjC8ZyF_nQfYOQyD8pTis9x9L-06M9NOwVti0KFKnKraw/exec";

/* ─────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────── */
// Available slots in GMT+6 (Bangladesh Standard Time)
const BASE_SLOTS_GMT6 = ['13:00', '13:30', '14:00', '14:30', '15:00', '15:30'];

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

/* ─────────────────────────────────────────
   APPLICATION STATE
───────────────────────────────────────── */
const STATE = {
  selectedDate:  null,
  selectedSlot:  null,   // { gmt6, local, gmt6Display }
  bookedSlots:   {},     // { "2025-04-10": ["13:00","14:30"], ... }
  calYear:       0,
  calMonth:      0,
  userTzOffset:  0,      // hours offset from UTC, e.g. 6 for GMT+6
  userTzLabel:   '',     // display string e.g. "GMT+6"
};

/* ═══════════════════════════════════════════════════════
   TIMEZONE DETECTION
═══════════════════════════════════════════════════════ */
function initTimezone() {
  const offsetMin  = -new Date().getTimezoneOffset(); // e.g. 360 for GMT+6
  STATE.userTzOffset = offsetMin / 60;

  const absH = Math.abs(STATE.userTzOffset);
  const hh   = Math.floor(absH);
  const mm   = Math.round((absH - hh) * 60);
  const sign = STATE.userTzOffset >= 0 ? '+' : '-';

  STATE.userTzLabel = `GMT${sign}${hh}${mm ? ':' + String(mm).padStart(2, '0') : ''}`;
}

/** Convert a "HH:MM" GMT+6 time string to user's local 12-hour display. */
function convertGMT6ToLocal(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const totalMinGMT6 = h * 60 + m;
  const diffMin      = (STATE.userTzOffset - 6) * 60;
  let   localMin     = ((totalMinGMT6 + diffMin) % 1440 + 1440) % 1440;

  const lh    = Math.floor(localMin / 60);
  const lm    = localMin % 60;
  const ampm  = lh >= 12 ? 'PM' : 'AM';
  const dispH = lh % 12 === 0 ? 12 : lh % 12;

  return `${dispH}:${String(lm).padStart(2, '0')} ${ampm}`;
}

/** Format a GMT+6 "HH:MM" string as 12-hour AM/PM. */
function formatGMT6(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm  = h >= 12 ? 'PM' : 'AM';
  const dispH = h % 12 === 0 ? 12 : h % 12;
  return `${dispH}:${String(m).padStart(2, '0')} ${ampm}`;
}

/* ═══════════════════════════════════════════════════════
   STEP NAVIGATION
═══════════════════════════════════════════════════════ */
function goToStep(n) {
  // Show/hide sections
  ['service', 'datetime', 'form', 'confirm'].forEach((s, i) => {
    document.getElementById(`section-${s}`).classList.toggle('active', i + 1 === n);
  });

  // Update step indicators
  for (let i = 1; i <= 4; i++) {
    const ind = document.getElementById(`step${i}-indicator`);
    ind.classList.remove('active', 'done');
    if (i < n)      ind.classList.add('done');
    else if (i === n) ind.classList.add('active');
  }

  // Update connector lines
  for (let i = 1; i <= 3; i++) {
    document.getElementById(`line${i}`).classList.toggle('done', i < n);
  }

  // Page-specific initialisation
  if (n === 2) renderCalendar();
  if (n === 3) renderSummary();
}

/* ═══════════════════════════════════════════════════════
   CALENDAR
═══════════════════════════════════════════════════════ */
function initCalendar() {
  const now       = new Date();
  STATE.calYear  = now.getFullYear();
  STATE.calMonth = now.getMonth();
}

function changeMonth(delta) {
  STATE.calMonth += delta;
  if (STATE.calMonth > 11) { STATE.calMonth = 0;  STATE.calYear++; }
  if (STATE.calMonth < 0)  { STATE.calMonth = 11; STATE.calYear--; }
  STATE.selectedDate = null;
  STATE.selectedSlot = null;
  renderCalendar();
  document.getElementById('slots-wrap').innerHTML =
    '<div class="slots-empty">← Select a date to see available slots</div>';
}

function renderCalendar() {
  const grid = document.getElementById('cal-grid');

  // Remove all day cells (keep the 7 DOW header divs)
  while (grid.children.length > 7) grid.removeChild(grid.lastChild);

  document.getElementById('cal-month-label').textContent =
    `${MONTHS[STATE.calMonth]} ${STATE.calYear}`;

  const today     = new Date(); today.setHours(0, 0, 0, 0);
  const firstDay  = new Date(STATE.calYear, STATE.calMonth, 1).getDay();
  const daysInMo  = new Date(STATE.calYear, STATE.calMonth + 1, 0).getDate();

  // Empty leading cells
  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day empty';
    grid.appendChild(el);
  }

  // Day cells
  for (let day = 1; day <= daysInMo; day++) {
    const el   = document.createElement('div');
    el.className = 'cal-day';
    el.textContent = day;

    const date    = new Date(STATE.calYear, STATE.calMonth, day);
    date.setHours(0, 0, 0, 0);
    const dow     = date.getDay();               // 0=Sun … 6=Sat
    const dateKey = formatDateKey(date);
    const isPast  = date < today;
    const isHoliday = dow === 5 || dow === 6;    // Fri/Sat blocked

    if (isHoliday || isPast) {
      el.classList.add(isHoliday ? 'disabled' : 'past');
      el.title = isHoliday ? 'Holiday – unavailable' : 'Past date';
    } else {
      const booked = STATE.bookedSlots[dateKey] || [];
      if (booked.length < BASE_SLOTS_GMT6.length) el.classList.add('has-slots');
      el.addEventListener('click', () => selectDate(date));
    }

    if (date.getTime() === today.getTime()) el.classList.add('today');

    if (STATE.selectedDate && date.getTime() === STATE.selectedDate.getTime()) {
      el.classList.add('selected');
    }

    grid.appendChild(el);
  }
}

function selectDate(date) {
  STATE.selectedDate = date;
  STATE.selectedSlot = null;
  renderCalendar();
  renderSlots();
}

/* ─────────────────────────────────────────
   DATE UTILITIES
───────────────────────────────────────── */
function formatDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateDisplay(date) {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return `${days[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/* ═══════════════════════════════════════════════════════
   TIME SLOTS
═══════════════════════════════════════════════════════ */
function renderSlots() {
  const wrap = document.getElementById('slots-wrap');
  if (!STATE.selectedDate) {
    wrap.innerHTML = '<div class="slots-empty">← Select a date</div>';
    return;
  }

  const dateKey      = formatDateKey(STATE.selectedDate);
  const booked       = STATE.bookedSlots[dateKey] || [];
  const isSameTz     = Math.abs(STATE.userTzOffset - 6) < 0.01;

  let html = `<div class="slots-date-label">${formatDateDisplay(STATE.selectedDate)}</div>`;

  if (!isSameTz) {
    html += `<div class="slots-tz-note">
      Times shown in <strong>${STATE.userTzLabel}</strong> (your local time)<br>
      <small>Original: GMT+6 / BST (Bangladesh Standard Time)</small>
    </div>`;
  } else {
    html += `<div class="slots-tz-note">Times in <strong>GMT+6 / BST</strong></div>`;
  }

  html += `<div class="slots-grid">`;

  BASE_SLOTS_GMT6.forEach(slot => {
    const isBooked   = booked.includes(slot);
    const localTime  = convertGMT6ToLocal(slot);
    const gmt6Time   = formatGMT6(slot);
    const isSelected = STATE.selectedSlot && STATE.selectedSlot.gmt6 === slot;

    if (isBooked) {
      html += `<div class="slot-btn booked">Booked</div>`;
    } else {
      const cls         = isSelected ? 'slot-btn selected-slot' : 'slot-btn';
      const displayTime = isSameTz ? gmt6Time : localTime;
      const subLabel    = isSameTz
        ? ''
        : `<br><small style="font-weight:400;opacity:0.75">${gmt6Time} GMT+6</small>`;
      html += `<button class="${cls}" onclick="selectSlot('${slot}')">${displayTime}${subLabel}</button>`;
    }
  });

  html += `</div>`;
  wrap.innerHTML = html;
}

function selectSlot(gmt6) {
  if (!STATE.selectedDate) return;

  const dateKey = formatDateKey(STATE.selectedDate);
  const booked  = STATE.bookedSlots[dateKey] || [];

  if (booked.includes(gmt6)) {
    showToast('This slot is no longer available.');
    return;
  }

  STATE.selectedSlot = {
    gmt6,
    local:       convertGMT6ToLocal(gmt6),
    gmt6Display: formatGMT6(gmt6),
  };

  renderSlots();
  // Auto-advance to form after brief highlight
  setTimeout(() => { if (STATE.selectedSlot) goToStep(3); }, 350);
}

/* ═══════════════════════════════════════════════════════
   FORM & SUMMARY
═══════════════════════════════════════════════════════ */
function renderSummary() {
  const el = document.getElementById('booking-summary');
  if (!STATE.selectedDate || !STATE.selectedSlot) { el.innerHTML = ''; return; }

  const isSame = Math.abs(STATE.userTzOffset - 6) < 0.01;
  const timeStr = isSame
    ? STATE.selectedSlot.gmt6Display + ' GMT+6'
    : `${STATE.selectedSlot.local} (${STATE.userTzLabel}) · ${STATE.selectedSlot.gmt6Display} GMT+6`;

  el.innerHTML = `
    <div class="summary-item">
      <div class="summary-label">Meeting</div>
      <div class="summary-val">Ibrahim Joy · 30 min · Google Meet</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">Date</div>
      <div class="summary-val">${formatDateDisplay(STATE.selectedDate)}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">Time</div>
      <div class="summary-val">${timeStr}</div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════
   FORM SUBMISSION
═══════════════════════════════════════════════════════ */
async function submitBooking() {
  const name  = document.getElementById('f-name').value.trim();
  const phone = document.getElementById('f-phone').value.trim();
  const email = document.getElementById('f-email').value.trim();
  const notes = document.getElementById('f-notes').value.trim();

  // Validation
  if (!name)  { showToast('Please enter your full name.');          document.getElementById('f-name').focus();  return; }
  if (!phone) { showToast('Please enter your phone number.');       document.getElementById('f-phone').focus(); return; }
  if (!email || !email.includes('@')) {
    showToast('Please enter a valid email address.');
    document.getElementById('f-email').focus();
    return;
  }
  if (!STATE.selectedDate || !STATE.selectedSlot) {
    showToast('Please select a date and time.');
    return;
  }

  const dateKey = formatDateKey(STATE.selectedDate);

  // Race-condition guard: re-check availability
  const booked = STATE.bookedSlots[dateKey] || [];
  if (booked.includes(STATE.selectedSlot.gmt6)) {
    showToast('⚠️ This slot was just booked. Please choose another.');
    goToStep(2);
    return;
  }

  // Disable button & show spinner
  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Confirming…';

  const payload = {
    name, phone, email, notes,
    date:        formatDateDisplay(STATE.selectedDate),
    dateKey,
    timeGMT6:    STATE.selectedSlot.gmt6Display + ' GMT+6',
    timeLocal:   STATE.selectedSlot.local + ' ' + STATE.userTzLabel,
    slotKey:     STATE.selectedSlot.gmt6,
    meetingType: 'Google Meet',
    submittedAt: new Date().toISOString(),
  };

  let submitted = false;

  if (APPS_SCRIPT_URL !== 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE') {
    // ── Live mode: send to Google Sheets ──
    try {
      await fetch(APPS_SCRIPT_URL, {
        method:  'POST',
        mode:    'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      submitted = true;
    } catch (e) {
      console.warn('Google Sheets submission failed:', e);
    }
  } else {
    // ── Demo mode: simulate network delay ──
    await new Promise(r => setTimeout(r, 900));
    submitted = true;
  }

  if (submitted) {
    // Mark slot booked locally (prevents re-booking in same session)
    if (!STATE.bookedSlots[dateKey]) STATE.bookedSlots[dateKey] = [];
    STATE.bookedSlots[dateKey].push(STATE.selectedSlot.gmt6);

    showConfirmation(payload);
    goToStep(4);
  } else {
    showToast('Something went wrong. Please try again.');
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
      </svg> Confirm Booking`;
  }
}

/* ═══════════════════════════════════════════════════════
   CONFIRMATION SCREEN
═══════════════════════════════════════════════════════ */
function showConfirmation(p) {
  const isSame      = Math.abs(STATE.userTzOffset - 6) < 0.01;
  const timeDisplay = isSame
    ? `<div class="confirm-row-main">${p.timeGMT6}</div>`
    : `<div class="confirm-row-main">${p.timeLocal}</div>
       <div class="confirm-row-label">${p.timeGMT6} · Original timezone</div>`;

  document.getElementById('confirm-details').innerHTML = `
    <div class="confirm-row">
      <svg viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/></svg>
      <div class="confirm-row-val">
        <div class="confirm-row-label">Meeting with</div>
        <div class="confirm-row-main">Ibrahim Joy – Advance Institute for P&amp;SC</div>
      </div>
    </div>
    <div class="confirm-row">
      <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"/></svg>
      <div class="confirm-row-val">
        <div class="confirm-row-label">Date</div>
        <div class="confirm-row-main">${p.date}</div>
      </div>
    </div>
    <div class="confirm-row">
      <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/></svg>
      <div class="confirm-row-val">
        <div class="confirm-row-label">Time</div>
        ${timeDisplay}
      </div>
    </div>
    <div class="confirm-row">
      <svg viewBox="0 0 20 20" fill="currentColor"><path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z"/></svg>
      <div class="confirm-row-val">
        <div class="confirm-row-label">Meeting Type</div>
        <div class="confirm-row-main">Google Meet (link sent via email)</div>
      </div>
    </div>
    <div class="confirm-row">
      <svg viewBox="0 0 20 20" fill="currentColor"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg>
      <div class="confirm-row-val">
        <div class="confirm-row-label">Confirmation sent to</div>
        <div class="confirm-row-main">${p.email}</div>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════
   RESET
═══════════════════════════════════════════════════════ */
function resetAll() {
  STATE.selectedDate = null;
  STATE.selectedSlot = null;

  ['f-name','f-phone','f-email','f-notes'].forEach(id => {
    document.getElementById(id).value = '';
  });

  const btn = document.getElementById('submit-btn');
  btn.disabled = false;
  btn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
    </svg> Confirm Booking`;

  goToStep(1);
}

/* ═══════════════════════════════════════════════════════
   TOAST NOTIFICATION
═══════════════════════════════════════════════════════ */
let toastTimeout;

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ═══════════════════════════════════════════════════════
   INITIALISE
═══════════════════════════════════════════════════════ */
initTimezone();
initCalendar();

/*
=======================================================================
  GOOGLE SHEETS INTEGRATION — SETUP INSTRUCTIONS
=======================================================================
  1. Create a Google Sheet with these column headers (Row 1):
     Name | Email | Phone | Date | Time (GMT+6) | Time (Local) | Notes | Slot Key | Submitted At

  2. Open Extensions → Apps Script, paste the code below, and save:
  ───────────────────────────────────────────────────────────────────
  function doPost(e) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const data  = JSON.parse(e.postData.contents);

    // Double-booking guard
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][3] === data.date && rows[i][7] === data.slotKey) {
        return ContentService
          .createTextOutput(JSON.stringify({ success: false, error: 'Slot taken' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    sheet.appendRow([
      data.name, data.email, data.phone,
      data.date, data.timeGMT6, data.timeLocal,
      data.notes, data.slotKey, data.submittedAt
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  ───────────────────────────────────────────────────────────────────
  3. Click Deploy → New Deployment → Web App
       Execute as : Me
       Who has access : Anyone
  4. Copy the generated Web App URL
  5. Paste it as the value of APPS_SCRIPT_URL at the top of this file
=======================================================================
*/
