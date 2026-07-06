/* =============================================
   PLUNGE, A PLUMBING CO. — Main JavaScript
   -----------------------------------------------
   Sections:
     1. CONFIGURATION      — update API keys & IDs here
     2. NAVIGATION         — menu drawer open/close
     3. BOOKING FORM       — ServiceTitan API submission
     4. GOOGLE REVIEWS     — Places API review cards + map embed
     5. BEFORE/AFTER       — rotating before & after carousel
     6. UTILITIES          — XSS helpers, date helpers
     7. PAGE INIT          — runs on DOMContentLoaded
   ============================================= */


/* =============================================
   1. CONFIGURATION
   -----------------------------------------------
   Update all values in this section before launch.
   ============================================= */
const CONFIG = {

    /* -- Your business phone number -- */
    PHONE:         '+14808780808',      // used in tel: links (digits only)
    PHONE_DISPLAY: '(480) 878-0808',   // shown to visitors

    /* -----------------------------------------------
       SERVICETITAN — Online Booking API
       -----------------------------------------------
       Where to get these values:
         Tenant ID  → ServiceTitan > Settings > Company
         App Key    → developer.servicetitan.io > My Apps
         Client ID / Secret → developer.servicetitan.io > My Apps > OAuth

       IMPORTANT: Never put CLIENT_SECRET in frontend code.
       Use Option A (backend proxy) so the secret stays server-side.
       ----------------------------------------------- */
    SERVICETITAN: {
        TENANT_ID:     'YOUR_TENANT_ID',     // e.g. "1234567"
        APP_KEY:       'YOUR_APP_KEY',       // e.g. "ak1ab2cd3ef4..."
        CLIENT_ID:     'YOUR_CLIENT_ID',
        CLIENT_SECRET: 'YOUR_CLIENT_SECRET', // ← keep on server, never exposed here
        API_BASE:      'https://api.servicetitan.io',
        AUTH_BASE:     'https://auth.servicetitan.io',

        /* Your backend proxy endpoint for booking submissions.
           Set this up as a serverless function or server route that
           exchanges the form data for a ServiceTitan access token
           and POSTs to the ServiceTitan Booking API on your behalf.
           See the comment block in submitBooking() below for details. */
        PROXY_ENDPOINT: '/api/book-servicetitan',
    },

    /* -----------------------------------------------
       GOOGLE PLACES API — Reviews
       -----------------------------------------------
       Where to get these values:
         API Key  → console.cloud.google.com > Credentials
                    Enable: Maps JavaScript API + Places API
                    Restrict the key to your domain!
         Place ID → https://developers.google.com/maps/documentation/
                    javascript/examples/places-placeid-finder
                    Search your business name to find the Place ID.

       Then uncomment the Google Maps <script> tag at the
       bottom of index.html and replace YOUR_GOOGLE_API_KEY.
       ----------------------------------------------- */
    GOOGLE: {
        API_KEY:     'AIzaSyAMOyEzDv-RHkxIYqwHRYvQP9s7luszvLc',
        PLACE_ID:    'ChIJM_t8bEGnK4cRQPN1UACaRtA',
        REVIEW_LINK: 'https://search.google.com/local/writereview?placeid=ChIJM_t8bEGnK4cRQPN1UACaRtA',
    },

};


/* =============================================
   2. NAVIGATION — City Services Drawer
   ============================================= */

/**
 * Toggles the city services slide-in navigation drawer.
 * Called by the hamburger/Menu button in the site header.
 */
function toggleMenu() {
    const nav     = document.getElementById('city-nav');
    const overlay = document.getElementById('nav-overlay');
    const btn     = document.getElementById('menu-toggle');

    const isOpen = nav.classList.contains('open');
    if (isOpen) {
        closeMenu();
    } else {
        nav.classList.add('open');
        overlay.classList.add('active');
        btn.setAttribute('aria-expanded', 'true');
        document.body.style.overflow = 'hidden';  // prevent background scroll
    }
}

/**
 * Closes the city services drawer.
 * Called by the X button, overlay click, or Escape key.
 */
function closeMenu() {
    const nav     = document.getElementById('city-nav');
    const overlay = document.getElementById('nav-overlay');
    const btn     = document.getElementById('menu-toggle');

    nav.classList.remove('open');
    overlay.classList.remove('active');
    btn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
}

// Close menu on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeMenu();
    }
});


/* =============================================
   3. BOOKING FORM — ServiceTitan API
   -----------------------------------------------
   The form submits to your backend proxy (Option A),
   which handles the ServiceTitan OAuth token exchange
   and forwards the booking to ServiceTitan's API.

   Option B (direct ServiceTitan widget embed) can be
   used instead — see the commented block in index.html.
   ============================================= */

document.getElementById('booking-form')?.addEventListener('submit', async function (e) {
    e.preventDefault();

    const form      = e.target;
    const statusEl  = document.getElementById('booking-status');
    const submitBtn = form.querySelector('[type="submit"]');

    /* Client-side validation */
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    /* Show loading state */
    submitBtn.disabled   = true;
    submitBtn.innerHTML  = '<i class="fa fa-spinner fa-spin" aria-hidden="true"></i> Submitting&hellip;';
    statusEl.className   = 'booking-status';
    statusEl.textContent = '';

    /* Collect and structure form data */
    const payload = {
        customer: {
            firstName:     form.firstName.value.trim(),
            lastName:      form.lastName.value.trim(),
            email:         form.email.value.trim(),
            phone:         form.phone.value.trim(),
            isNewCustomer: form.isNewCustomer.value === 'true',
        },
        address: {
            street:  form.street.value.trim(),
            unit:    form.unit.value.trim(),
            city:    form.city.value.trim(),
            state:   form.state.value.trim().toUpperCase(),
            zip:     form.zip.value.trim(),
            country: 'USA',
        },
        job: {
            serviceType:   form.serviceType.value,
            preferredDate: form.preferredDate.value,
            preferredTime: form.preferredTime.value,
            notes:         form.notes.value.trim(),
            source:        'Website Online Booking',
        },
    };

    try {

        /* -----------------------------------------------
           OPTION A (Recommended): Backend Proxy
           -----------------------------------------------
           Your server receives this request, obtains a
           ServiceTitan access token using your client
           credentials (kept secret server-side), then
           calls the ServiceTitan Booking API:

           POST https://api.servicetitan.io/crm/v2/tenant/{tenantId}/booking-provider/booking
           Headers:
             Authorization: Bearer {access_token}
             ST-App-Key: {app_key}
             Content-Type: application/json
           Body:
           {
             "start": "2025-01-15T09:00:00",
             "end":   "2025-01-15T11:00:00",
             "summary": "{notes or service type}",
             "source": "Website Online Booking",
             "name": "{firstName} {lastName}",
             "isSendConfirmationEmail": true,
             "isFirstTimeClient": {isNewCustomer},
             "contacts": [{ "type": "Phone", "value": "{phone}", "doNotText": false }],
             "address": { "street": "...", "city": "...", "state": "...", "zip": "..." }
           }

           OAuth token endpoint:
           POST https://auth.servicetitan.io/connect/token
           Body (x-www-form-urlencoded):
             grant_type=client_credentials
             &client_id={CLIENT_ID}
             &client_secret={CLIENT_SECRET}
             &scope=openid offline_access app.servicetitan.io

           ServiceTitan API docs: https://developer.servicetitan.io/apis/
           ----------------------------------------------- */
        const response = await fetch(CONFIG.SERVICETITAN.PROXY_ENDPOINT, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload),
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.message || `Server returned ${response.status}`);
        }

        /* Success */
        statusEl.className   = 'booking-status success';
        statusEl.textContent = '✓ Your booking request was received! We\'ll call to confirm within 1 hour, any time of day.';
        form.reset();
        setMinDate();

    } catch (err) {

        console.error('Booking submission error:', err);
        statusEl.className   = 'booking-status error';
        statusEl.textContent =
            `There was a problem submitting your request: ${err.message}.` +
            ` Please call us directly at ${CONFIG.PHONE_DISPLAY}.`;

    } finally {

        submitBtn.disabled  = false;
        submitBtn.innerHTML = '<i class="fa fa-calendar-check" aria-hidden="true"></i> Request Booking';
        statusEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    }
});

/* -----------------------------------------------
   BOOKING — Step 2 progressive reveal
   -----------------------------------------------
   First-time visitors see only Step 1 ("What do you
   need?"). As soon as a service is chosen, the customer
   detail fields slide down into view. This keeps the
   form from looking like an overwhelming wall of inputs.
   ----------------------------------------------- */
(function initBookingReveal() {
    const continueBtn     = document.getElementById('booking-continue-btn');
    const serviceSelect   = document.getElementById('service-type');
    const dateInput       = document.getElementById('preferred-date');
    const step2           = document.getElementById('booking-step-2');
    const step1Disclaimer = document.getElementById('step1-disclaimer');
    const form            = document.getElementById('booking-form');
    if (!continueBtn || !step2) return;

    function openStep2() {
        step2.classList.add('open');
        step2.setAttribute('aria-hidden', 'false');
        /* Step 2 carries its own "Required fields" line, so hide the Step 1 one */
        if (step1Disclaimer) step1Disclaimer.hidden = true;
        requestAnimationFrame(() => {
            step2.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    }

    function closeStep2() {
        step2.classList.remove('open');
        step2.setAttribute('aria-hidden', 'true');
        /* Back to Step 1 only — show its disclaimer again */
        if (step1Disclaimer) step1Disclaimer.hidden = false;
    }

    continueBtn.addEventListener('click', function () {
        /* Validate Step 1 required fields before revealing Step 2 */
        const serviceOk = serviceSelect.reportValidity();
        const dateOk    = dateInput.reportValidity();
        if (serviceOk && dateOk) openStep2();
    });

    /* Collapse Step 2 after a successful submit/reset */
    form?.addEventListener('reset', () => setTimeout(closeStep2, 0));
})();


/* -----------------------------------------------
   BOOKING — bold fields once they hold a value
   -----------------------------------------------
   Adds/removes the .is-filled class on each field so
   empty fields render in normal weight and filled ones
   (typed text, picked date, chosen dropdown option) render
   bold. Works uniformly across inputs, selects, and the
   textarea — including the date picker, which has no
   text placeholder for CSS to key off of.
   ----------------------------------------------- */
(function initBookingBold() {
    const form = document.getElementById('booking-form');
    if (!form) return;

    const fields = form.querySelectorAll('input, select, textarea');
    const sync = (el) => el.classList.toggle('is-filled', el.value.trim() !== '');

    fields.forEach((el) => {
        sync(el);                                  // initial state (e.g. the locked AZ field)
        el.addEventListener('input',  () => sync(el));
        el.addEventListener('change', () => sync(el));
    });

    /* Re-sync after a reset (e.g. following a successful submit) */
    form.addEventListener('reset', () => setTimeout(() => fields.forEach(sync), 0));
})();


/* -----------------------------------------------
   BOOKING — custom desktop calendar (date picker)
   -----------------------------------------------
   PROGRESSIVE ENHANCEMENT — read this before editing.

   The real <input type="date"> is never removed. It stays the
   single source of truth: it holds the value, gets submitted to
   the CRM, and enforces "required" + the today minimum. This code
   only adds a styled calendar popup *on top of* that input, on
   desktop, and writes the chosen date back into it.

   Safety guarantees:
     • The whole setup is wrapped in try/catch. If anything throws,
       it bails out and the NATIVE browser picker keeps working —
       the field can never end up dead.
     • The native icon is hidden (via the .date-enhanced class)
       ONLY after the calendar is successfully built, so a failure
       leaves the native picker fully intact.
     • Mobile (≤ 620px) is untouched: the trigger icon is hidden in
       CSS and every interaction below is gated behind a desktop
       width check, so phones use their native picker as before.
   ----------------------------------------------- */
(function initCustomDatePicker() {
    const input = document.getElementById('preferred-date');
    if (!input) return;
    const group = input.closest('.form-group');
    if (!group) return;

    /* Only enhance on desktop widths — matches the 620px CSS breakpoint */
    const isDesktop = () => window.matchMedia('(min-width: 621px)').matches;

    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];
    const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

    let popup, viewYear, viewMonth, isOpen = false;

    try {
        build();
    } catch (err) {
        /* Native picker remains fully functional — see safety notes above */
        console.error('Custom date picker could not initialize; native date input is still active.', err);
        return;
    }

    /* ---- Build the popup + trigger icon and wire up events ---- */
    function build() {
        const icon = document.createElement('button');
        icon.type = 'button';
        icon.className = 'date-trigger-icon';
        icon.setAttribute('aria-label', 'Open calendar');
        icon.tabIndex = -1;
        group.appendChild(icon);

        popup = document.createElement('div');
        popup.className = 'date-popup';
        popup.setAttribute('role', 'dialog');
        popup.setAttribute('aria-label', 'Choose a preferred date');
        popup.hidden = true;
        group.appendChild(popup);

        /* Open on click of the field or our icon (desktop only) */
        input.addEventListener('click', () => { if (isDesktop()) openCal(); });
        icon.addEventListener('click', (e) => {
            e.preventDefault();
            if (isDesktop()) toggleCal();
        });

        /* Keyboard: open with Enter / Space / Down arrow (desktop only) */
        input.addEventListener('keydown', (e) => {
            if (isDesktop() && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
                e.preventDefault();
                openCal();
            }
        });

        /* Close on outside click or Escape */
        document.addEventListener('click', (e) => {
            if (isOpen && !group.contains(e.target)) closeCal();
        });
        document.addEventListener('keydown', (e) => {
            if (isOpen && e.key === 'Escape') closeCal();
        });

        /* Keep the calendar in sync if the user types into the field */
        input.addEventListener('change', () => { if (isOpen) render(); });

        /* Mark enhanced LAST — only now do we hide the native icon (desktop).
           If any step above had thrown, this line is never reached and the
           native picker stays fully intact (see safety notes at the top). */
        group.classList.add('date-enhanced');
    }

    /* ---- Open / close ---- */
    function openCal() {
        const base = parseValue(input.value) || todayParts();
        viewYear = base.y;
        viewMonth = base.m;
        render();
        popup.hidden = false;
        isOpen = true;
    }
    function closeCal() {
        popup.hidden = true;
        isOpen = false;
    }
    function toggleCal() {
        isOpen ? closeCal() : openCal();
    }

    /* ---- Render the current month ---- */
    function render() {
        const min    = minParts();
        const today  = todayParts();
        const sel    = parseValue(input.value);
        const minNum = num(min);

        /* Disable the prev arrow once we reach the minimum month */
        const atMinMonth = (viewYear * 12 + viewMonth) <= (min.y * 12 + min.m);

        const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
        const daysInMonth  = new Date(viewYear, viewMonth + 1, 0).getDate();

        let html = '';

        /* Header */
        html += '<div class="date-popup-header">';
        html += `<button type="button" class="date-popup-nav" data-nav="-1" aria-label="Previous month"${atMinMonth ? ' disabled' : ''}>&#8249;</button>`;
        html += `<span class="date-popup-title">${MONTHS[viewMonth]} ${viewYear}</span>`;
        html += '<button type="button" class="date-popup-nav" data-nav="1" aria-label="Next month">&#8250;</button>';
        html += '</div>';

        /* Weekday labels */
        html += '<div class="date-popup-weekdays">';
        WEEKDAYS.forEach(d => { html += `<span class="date-popup-weekday">${d}</span>`; });
        html += '</div>';

        /* Day grid */
        html += '<div class="date-popup-grid">';
        for (let i = 0; i < firstWeekday; i++) {
            html += '<span class="date-popup-day is-empty"></span>';
        }
        for (let day = 1; day <= daysInMonth; day++) {
            const cell      = { y: viewYear, m: viewMonth, d: day };
            const disabled  = num(cell) < minNum;
            const isToday   = today.y === viewYear && today.m === viewMonth && today.d === day;
            const isSel     = sel && sel.y === viewYear && sel.m === viewMonth && sel.d === day;
            const classes   = ['date-popup-day'];
            if (isToday) classes.push('is-today');
            if (isSel)   classes.push('is-selected');
            html += `<button type="button" class="${classes.join(' ')}" data-day="${day}"${disabled ? ' disabled' : ''}>${day}</button>`;
        }
        html += '</div>';

        popup.innerHTML = html;

        /* Month navigation */
        popup.querySelectorAll('[data-nav]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                shiftMonth(parseInt(btn.dataset.nav, 10));
            });
        });

        /* Day selection */
        popup.querySelectorAll('[data-day]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                selectDay(parseInt(btn.dataset.day, 10));
            });
        });
    }

    function shiftMonth(delta) {
        viewMonth += delta;
        if (viewMonth < 0)  { viewMonth = 11; viewYear--; }
        if (viewMonth > 11) { viewMonth = 0;  viewYear++; }
        render();
    }

    function selectDay(day) {
        /* Write the value into the real input in the native YYYY-MM-DD
           format, then fire input + change so the bold "is-filled"
           styling and any validation listeners react exactly as if the
           native picker had been used. */
        input.value = ymd(viewYear, viewMonth, day);
        input.dispatchEvent(new Event('input',  { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        closeCal();
    }

    /* ---- Date helpers (built from local parts to avoid timezone drift) ---- */
    function parseValue(s) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
        return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
    }
    function todayParts() {
        const n = new Date();
        return { y: n.getFullYear(), m: n.getMonth(), d: n.getDate() };
    }
    function minParts() {
        return parseValue(input.min) || todayParts();
    }
    function num(p) {
        return p.y * 10000 + p.m * 100 + p.d;
    }
    function ymd(y, m, d) {
        return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
})();


/** Sets the minimum selectable date to today on the date input. */
function setMinDate() {
    const dateInput = document.getElementById('preferred-date');
    if (dateInput) {
        dateInput.min = new Date().toISOString().split('T')[0];
    }
}


/* =============================================
   4. GOOGLE REVIEWS — Places API
   -----------------------------------------------
   Loads live Google Business reviews using the
   Google Maps JavaScript API Places library.
   Falls back to placeholder reviews if API is
   unavailable.
   ============================================= */

function loadGoogleReviews() {

    const reviewBtn = document.getElementById('leave-review-btn');
    if (reviewBtn && CONFIG.GOOGLE.REVIEW_LINK) {
        reviewBtn.href = CONFIG.GOOGLE.REVIEW_LINK;
    }

    if (typeof google === 'undefined' || !google.maps || !google.maps.places) {
        displayPlaceholderReviews();
        return;
    }

    const container = document.getElementById('reviews-container');
    const ratingEl  = document.getElementById('overall-rating');
    const starsEl   = document.getElementById('overall-stars');
    const countEl   = document.getElementById('review-count');

    const service = new google.maps.places.PlacesService(
        document.createElement('div')
    );

    service.getDetails(
        {
            placeId: CONFIG.GOOGLE.PLACE_ID,
            fields:  ['name', 'rating', 'user_ratings_total', 'reviews'],
        },
        (place, status) => {

            if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
                container.innerHTML =
                    '<p class="reviews-loading">Unable to load reviews right now. ' +
                    '<a href="' + escapeHTMLAttr(CONFIG.GOOGLE.REVIEW_LINK) +
                    '" target="_blank" rel="noopener">View reviews on Google</a>.</p>';
                return;
            }

            if (place.rating) {
                ratingEl.textContent = place.rating.toFixed(1);
                starsEl.innerHTML    = generateStars(place.rating);
                starsEl.setAttribute('aria-label', `${place.rating} out of 5 stars`);
            }
            if (place.user_ratings_total) {
                countEl.textContent = `${place.user_ratings_total.toLocaleString()} Google reviews`;
            }

            if (place.reviews && place.reviews.length > 0) {
                container.innerHTML = '';
                place.reviews
                    .sort((a, b) => b.time - a.time)
                    .forEach(review => container.appendChild(buildReviewCard(review)));
                container.appendChild(buildReviewCTACard());
            } else {
                container.innerHTML = '<p class="reviews-loading">No reviews yet.</p>';
            }
        }
    );
}

function buildReviewCard(review) {
    const article = document.createElement('article');
    article.className = 'review-card';
    article.setAttribute('role', 'listitem');

    const initial = review.author_name ? review.author_name.charAt(0).toUpperCase() : '?';
    const date    = new Date(review.time * 1000).toLocaleDateString('en-US', {
        year:  'numeric',
        month: 'long',
    });

    const LIMIT   = 280;
    const full    = review.text || '';
    const isLong  = full.length > LIMIT;
    const preview = isLong ? full.substring(0, LIMIT) + '…' : full;

    const avatar = review.profile_photo_url
        ? `<img src="${escapeHTMLAttr(review.profile_photo_url)}" alt="${escapeHTMLAttr(review.author_name)}" class="reviewer-avatar">`
        : `<div class="reviewer-avatar-placeholder" aria-hidden="true">${initial}</div>`;

    article.innerHTML = `
        <div class="review-header">
            ${avatar}
            <div class="reviewer-info">
                <strong>${escapeHTML(review.author_name)}</strong>
                <span>${date}</span>
            </div>
        </div>
        <div class="review-stars" aria-label="${review.rating} out of 5 stars">
            ${generateStars(review.rating)}
        </div>
        <p class="review-text">${escapeHTML(preview)}</p>
        ${isLong
            ? `<button class="review-read-more" onclick="expandReview(this, ${JSON.stringify(full)})">Read more</button>`
            : ''}
    `;

    return article;
}

function buildReviewCTACard() {
    const article = document.createElement('article');
    article.className = 'review-card review-card-cta';
    article.setAttribute('role', 'listitem');
    article.innerHTML = `
        <p>Had a great experience with Plunge? We'd love to hear about it!</p>
        <a href="${escapeHTMLAttr(CONFIG.GOOGLE.REVIEW_LINK)}"
           class="btn btn-review"
           target="_blank" rel="noopener noreferrer">
            <i class="fab fa-google" aria-hidden="true"></i>
            Leave a Review
        </a>
    `;
    return article;
}

function expandReview(btn, fullText) {
    btn.previousElementSibling.textContent = fullText;
    btn.remove();
}

function generateStars(rating) {
    let html = '';
    for (let i = 1; i <= 5; i++) {
        if (rating >= i) {
            html += '<i class="fa fa-star" aria-hidden="true"></i>';
        } else if (rating >= i - 0.5) {
            html += '<i class="fa fa-star-half-alt" aria-hidden="true"></i>';
        } else {
            html += '<i class="far fa-star" aria-hidden="true"></i>';
        }
    }
    return html;
}

function displayPlaceholderReviews() {
    const container = document.getElementById('reviews-container');
    const ratingEl  = document.getElementById('overall-rating');
    const starsEl   = document.getElementById('overall-stars');
    const countEl   = document.getElementById('review-count');

    /* Only the homepage has the reviews section — on every other page
       (city pages, service landing pages) there is nothing to fill in,
       so bail out quietly instead of throwing a console error. */
    if (!container || !ratingEl || !starsEl || !countEl) return;

    const samples = [
        { name: 'Sarah M.',  rating: 5, date: 'January 2025',   text: 'Plunge came out the same day and fixed our leaking pipe quickly and cleanly. Very professional and fair pricing. Highly recommend!' },
        { name: 'James R.',  rating: 5, date: 'December 2024',  text: 'Our water heater stopped working on a Friday evening. Plunge had someone out within 2 hours. Incredible service!' },
        { name: 'Linda K.',  rating: 5, date: 'November 2024',  text: 'Used them for a full bathroom remodel plumbing job. Everything was done perfectly and on schedule. Will absolutely use again.' },
        { name: 'David T.',  rating: 4, date: 'October 2024',   text: 'Very knowledgeable team. Fixed a stubborn clog that two other plumbers couldn\'t solve. Great work.' },
        { name: 'Maria G.',  rating: 5, date: 'September 2024', text: 'Affordable, reliable, and honest. What more can you ask for? My go-to plumbers from now on.' },
        { name: 'Carlos V.', rating: 5, date: 'August 2024',    text: 'Fast response, thorough work, and very friendly. They explained everything before starting. Couldn\'t be happier.' },
    ];

    ratingEl.textContent = '4.9';
    starsEl.innerHTML    = generateStars(5);
    starsEl.setAttribute('aria-label', '4.9 out of 5 stars');
    countEl.textContent  = '200+ Google reviews';

    container.innerHTML = '';
    samples.forEach(s => {
        const article = document.createElement('article');
        article.className = 'review-card';
        article.setAttribute('role', 'listitem');
        article.innerHTML = `
            <div class="review-header">
                <div class="reviewer-avatar-placeholder" aria-hidden="true">${s.name.charAt(0)}</div>
                <div class="reviewer-info">
                    <strong>${escapeHTML(s.name)}</strong>
                    <span>${s.date}</span>
                </div>
            </div>
            <div class="review-stars" aria-label="${s.rating} out of 5 stars">
                ${generateStars(s.rating)}
            </div>
            <p class="review-text">${escapeHTML(s.text)}</p>
        `;
        container.appendChild(article);
    });
}


/* =============================================
   5. BEFORE / AFTER CAROUSEL
   -----------------------------------------------
   A rotating carousel of before-and-after project
   photos. Each step shows a Before and an After
   image side by side and slides in from the right.

   HOW TO ADD PHOTOS:
   Fill in the before/after src paths in the
   BEFORE_AFTER_PROJECTS array below. Any slot left
   with an empty src ('') shows an "Add photo here"
   placeholder until a real image is added.

      {
        before: { src: 'images/gallery/job1-before.jpg', alt: 'Describe the before photo' },
        after:  { src: 'images/gallery/job1-after.jpg',  alt: 'Describe the after photo' },
      }

   GOOD alt text example:
     "Corroded galvanized pipe under a kitchen sink before replacement"
   POOR alt text example:
     "plumbing photo"
   ============================================= */
const BEFORE_AFTER_PROJECTS = [

    /* =============================================
       PLACEHOLDER STEPS
       Each step needs a `before`, an `after`, and a `caption`.
       Leave src empty ('') to show an "Add photo here" placeholder.
       Fill in src + alt + caption when the real photos are ready.

       When you add a real photo, write the `alt` as a natural sentence
       describing what the photo actually shows — that one description
       doubles as the image's accessibility text (for screen readers)
       and its SEO text (for Google).
       Caption example: 'Burst pipe repair — Mesa, AZ'
       ============================================= */

    {
        before:  { src: '', alt: 'Before photo of plumbing project' },
        after:   { src: '', alt: 'After photo of plumbing project' },
        caption: 'Project caption goes here',
    },
    {
        before:  { src: '', alt: 'Before photo of plumbing project' },
        after:   { src: '', alt: 'After photo of plumbing project' },
        caption: 'Project caption goes here',
    },
    {
        before:  { src: '', alt: 'Before photo of plumbing project' },
        after:   { src: '', alt: 'After photo of plumbing project' },
        caption: 'Project caption goes here',
    },
    {
        before:  { src: '', alt: 'Before photo of plumbing project' },
        after:   { src: '', alt: 'After photo of plumbing project' },
        caption: 'Project caption goes here',
    },
    {
        before:  { src: '', alt: 'Before photo of plumbing project' },
        after:   { src: '', alt: 'After photo of plumbing project' },
        caption: 'Project caption goes here',
    },
    {
        before:  { src: '', alt: 'Before photo of plumbing project' },
        after:   { src: '', alt: 'After photo of plumbing project' },
        caption: 'Project caption goes here',
    },

    /* Add more steps here — copy and paste a block above */

];


/* ---- Carousel state ---- */
let carouselIndex = 0;          // index of the currently visible step
const CAROUSEL_INTERVAL = 5000; // ms each step stays before auto-advancing


/**
 * Builds one Before/After photo slot. Shows the real image
 * when a src is provided, otherwise an "Add photo here" placeholder.
 */
function buildPhotoSlot(photo, label) {
    if (photo && photo.src) {
        return `
            <div class="ba-photo">
                <span class="ba-badge">${label}</span>
                <img src="${escapeHTMLAttr(photo.src)}" alt="${escapeHTMLAttr(photo.alt || label + ' photo')}" loading="lazy" decoding="async">
            </div>`;
    }
    return `
        <div class="ba-photo ba-photo--placeholder">
            <span class="ba-badge">${label}</span>
            <i class="fa fa-image ba-placeholder-icon" aria-hidden="true"></i>
            <span class="ba-placeholder-text">Add photo here</span>
        </div>`;
}

/**
 * Renders the before/after carousel slides and progress dots.
 * Auto-advance is driven by the active dot's progress-bar
 * animation finishing (see the animationend handler below),
 * which keeps the bar and the slide change perfectly in sync.
 */
function initCarousel() {
    const track    = document.getElementById('ba-track');
    const dots     = document.getElementById('ba-dots');
    const carousel = document.getElementById('ba-carousel');
    if (!track || !dots || !carousel) return;

    /* Keep the progress-bar duration in sync with one source of truth */
    carousel.style.setProperty('--ba-interval', `${CAROUSEL_INTERVAL}ms`);

    /* Build each step: just the Before + After photo pair. The caption
       lives outside the viewport (see updateCarousel()) so its text
       doesn't add to the viewport's height — otherwise the prev/next
       arrows, which center on the viewport, would sit off-center from
       the photos whenever a caption was present. */
    track.innerHTML = BEFORE_AFTER_PROJECTS.map(step => `
        <div class="ba-slide">
            <div class="ba-pair">
                ${buildPhotoSlot(step.before, 'Before')}
                ${buildPhotoSlot(step.after,  'After')}
            </div>
        </div>
    `).join('');

    /* Build a progress dot for each step (pill + fill bar) */
    dots.innerHTML = BEFORE_AFTER_PROJECTS.map((_, i) => `
        <button type="button" class="ba-dot${i === 0 ? ' active' : ''}" role="tab"
            aria-label="Go to example ${i + 1}" onclick="goToSlide(${i})">
            <span class="ba-dot-fill"></span>
        </button>
    `).join('');

    /* Wire up the prev/next arrows */
    document.getElementById('ba-prev')?.addEventListener('click', () => moveCarousel(-1));
    document.getElementById('ba-next')?.addEventListener('click', () => moveCarousel(1));

    /* When the active progress bar finishes filling, advance a step */
    dots.addEventListener('animationend', (e) => {
        if (e.animationName === 'ba-fill' && BEFORE_AFTER_PROJECTS.length > 1) {
            moveCarousel(1);
        }
    });

    /* Pause the progress bar (and thus auto-advance) on hover */
    carousel.addEventListener('mouseenter', () => carousel.classList.add('is-paused'));
    carousel.addEventListener('mouseleave', () => carousel.classList.remove('is-paused'));

    updateCarousel();
}

/** Moves the track to the current step, syncs the dots and caption,
    and restarts the active step's progress bar from zero. */
function updateCarousel() {
    const track = document.getElementById('ba-track');
    if (track) track.style.transform = `translateX(-${carouselIndex * 100}%)`;

    document.querySelectorAll('.ba-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === carouselIndex);
    });

    /* Caption lives outside the sliding track (see initCarousel()) —
       swap its text to match the current step. */
    const captionEl = document.getElementById('ba-caption');
    if (captionEl) {
        const caption = BEFORE_AFTER_PROJECTS[carouselIndex]?.caption || '';
        captionEl.textContent = caption;
        captionEl.style.display = caption ? '' : 'none';
    }

    restartActiveFill();
}

/** Restarts the progress-bar animation on the currently active dot. */
function restartActiveFill() {
    const fill = document.querySelector('.ba-dot.active .ba-dot-fill');
    if (!fill) return;
    fill.style.animation = 'none';   // cancel any running animation
    void fill.offsetWidth;           // force reflow so it restarts
    fill.style.animation = '';       // hand back to the stylesheet rule
}

/** Advances the carousel by `direction` (+1 next, -1 prev), wrapping around. */
function moveCarousel(direction) {
    const count = BEFORE_AFTER_PROJECTS.length;
    carouselIndex = (carouselIndex + direction + count) % count;
    updateCarousel();
}

/** Jumps directly to a specific step (used by the dots). */
function goToSlide(index) {
    carouselIndex = index;
    updateCarousel();
}


/* =============================================
   6. UTILITIES
   ============================================= */

/**
 * Escapes HTML special characters in a string to prevent XSS
 * when injecting content into the DOM as HTML.
 */
function escapeHTML(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str || '')));
    return div.innerHTML;
}

/**
 * Escapes a string for safe use inside an HTML attribute value.
 */
function escapeHTMLAttr(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}


/* =============================================
   7. PAGE INITIALIZATION
   Runs once the DOM is fully loaded.
   ============================================= */
document.addEventListener('DOMContentLoaded', () => {

    /* Set current year in footer copyright notice */
    const yearEl = document.getElementById('footer-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    /* Initialize the booking date minimum to today */
    setMinDate();

    /* Build the before/after carousel */
    initCarousel();

    /* Load Google Reviews — falls back to placeholders if API not yet loaded */
    if (typeof google === 'undefined') {
        loadGoogleReviews();
    }

});
