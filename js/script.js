/* =============================================
   PLUNGE, A PLUMBING CO. — Main JavaScript
   -----------------------------------------------
   Sections:
     1. CONFIGURATION      — update API keys & IDs here
     2. NAVIGATION         — menu drawer open/close
     3. BOOKING FORM       — ServiceTitan API submission
     4. GOOGLE REVIEWS     — Places API review cards + map embed
     5. PHOTO GALLERY      — config array, render, filter
     6. LIGHTBOX           — full-screen photo viewer
     7. UTILITIES          — XSS helpers, date helpers
     8. PAGE INIT          — runs on DOMContentLoaded
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

// Close on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeMenu();
        closeLightbox();
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
        statusEl.textContent = '✓ Your booking request was received! We\'ll call to confirm within 1 hour during business hours.';
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
    const serviceSelect = document.getElementById('service-type');
    const step2         = document.getElementById('booking-step-2');
    const form          = document.getElementById('booking-form');
    if (!serviceSelect || !step2) return;

    let wasOpen = false;

    function syncStep2() {
        const chosen = !!serviceSelect.value;
        step2.classList.toggle('open', chosen);
        step2.setAttribute('aria-hidden', String(!chosen));

        /* Scroll the revealed fields into view, but only on the
           first open (avoids jumping when changing the service). */
        if (chosen && !wasOpen) {
            requestAnimationFrame(() => {
                step2.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
        }
        wasOpen = chosen;
    }

    serviceSelect.addEventListener('change', syncStep2);

    /* On reset (e.g. after a successful submit) the service
       clears, so collapse Step 2 again on the next tick. */
    form?.addEventListener('reset', () => setTimeout(syncStep2, 0));

    /* Sync on load in case the browser restored a value. */
    syncStep2();
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

            console.log('Places API status:', status);

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

function initGoogleMaps() {
    loadGoogleReviews();
}


/* =============================================
   5. PHOTO GALLERY — Configuration & Rendering
   -----------------------------------------------
   HOW TO ADD A PHOTO:
   1. Copy the image file into images/gallery/
   2. Add a new object to GALLERY_PHOTOS below:
      {
        src:      "images/gallery/filename.jpg",   ← file path
        alt:      "Descriptive sentence for screen readers and SEO",
        title:    "Short display title",
        caption:  "Caption shown on hover",
        keywords: "keyword1, keyword2, keyword3",   ← written to data-keywords for SEO
        category: "drain|pipes|water-heater|remodel|emergency",
      }

   GOOD alt text example:
     "Plunge plumber replacing corroded galvanized pipe under kitchen
      sink in a Los Angeles residential home"
   POOR alt text example:
     "plumbing photo"

   HOW TO ADD A NEW FILTER CATEGORY:
   1. Add a <button class="filter-btn"> in index.html with a new data-filter value
   2. Use that same value as the category in GALLERY_PHOTOS entries
   ============================================= */
const GALLERY_PHOTOS = [

    /* =============================================
       ADD YOUR PHOTOS HERE
       The entries below are placeholder examples.
       Replace src paths with real image files in
       the images/gallery/ folder.
       ============================================= */

    {
        src:      'images/gallery/drain-cleaning-1.jpg',
        alt:      'Plunge plumber performing professional drain cleaning on a blocked kitchen sink in a residential home',
        title:    'Kitchen Drain Cleaning',
        caption:  'Professional drain clearing service',
        keywords: 'drain cleaning, kitchen drain, blocked sink, plumbing',
        category: 'drain',
    },
    {
        src:      'images/gallery/sewer-jetting-1.jpg',
        alt:      'Hydro-jetting equipment clearing grease buildup from main sewer line at a commercial property',
        title:    'Sewer Hydro-Jetting',
        caption:  'High-pressure sewer line cleaning',
        keywords: 'hydro jetting, sewer cleaning, main line, commercial plumbing',
        category: 'drain',
    },
    {
        src:      'images/gallery/pipe-replacement-1.jpg',
        alt:      'New copper pipe installation replacing corroded galvanized pipe under a kitchen sink',
        title:    'Copper Pipe Replacement',
        caption:  'Galvanized to copper upgrade',
        keywords: 'pipe repair, copper pipe, galvanized pipe, pipe replacement, plumbing',
        category: 'pipes',
    },
    {
        src:      'images/gallery/leak-repair-1.jpg',
        alt:      'Technician repairing a pinhole leak in a water supply line behind a bathroom wall',
        title:    'Pinhole Leak Repair',
        caption:  'Expert leak detection and repair',
        keywords: 'leak repair, pipe leak, water damage, plumbing repair',
        category: 'pipes',
    },
    {
        src:      'images/gallery/water-heater-install-1.jpg',
        alt:      'New tankless water heater mounted on wall and installed by Plunge plumbing technician',
        title:    'Tankless Water Heater Install',
        caption:  'Energy-efficient hot water upgrade',
        keywords: 'water heater installation, tankless water heater, hot water, energy efficient',
        category: 'water-heater',
    },
    {
        src:      'images/gallery/water-heater-repair-1.jpg',
        alt:      'Technician servicing and flushing a 50-gallon tank water heater to remove sediment buildup',
        title:    'Water Heater Maintenance',
        caption:  'Tank flush and inspection service',
        keywords: 'water heater repair, water heater maintenance, sediment flush, plumbing service',
        category: 'water-heater',
    },
    {
        src:      'images/gallery/bathroom-remodel-1.jpg',
        alt:      'Complete bathroom rough-in plumbing with new supply lines and drain pipes for a full remodel',
        title:    'Bathroom Remodel Rough-In',
        caption:  'Full bathroom plumbing rough-in',
        keywords: 'bathroom remodel, plumbing rough-in, new construction, bathroom plumbing',
        category: 'remodel',
    },
    {
        src:      'images/gallery/kitchen-remodel-1.jpg',
        alt:      'New kitchen plumbing layout including island drain and disposal connection during remodel',
        title:    'Kitchen Remodel Plumbing',
        caption:  'Island plumbing and disposal install',
        keywords: 'kitchen remodel, plumbing remodel, kitchen island plumbing, garbage disposal',
        category: 'remodel',
    },
    {
        src:      'images/gallery/emergency-burst-1.jpg',
        alt:      'Emergency pipe burst repair — burst pipe in utility room repaired within hours of customer call',
        title:    'Emergency Pipe Burst Repair',
        caption:  '24/7 emergency response',
        keywords: 'emergency plumbing, pipe burst, water damage, emergency repair, 24 hour plumber',
        category: 'emergency',
    },

    /* Add more photos here — copy and paste a block above */

];


/* ---- Gallery state ---- */
let activeGalleryPhotos = [...GALLERY_PHOTOS];   // currently visible photos (after filter)
let lightboxIndex       = 0;                     // index of currently open lightbox photo


/**
 * Renders the gallery grid from GALLERY_PHOTOS (or the filtered subset).
 */
function renderGallery(filter = 'all') {

    const grid = document.getElementById('gallery-grid');
    if (!grid) return;

    activeGalleryPhotos = filter === 'all'
        ? [...GALLERY_PHOTOS]
        : GALLERY_PHOTOS.filter(p => p.category === filter);

    if (activeGalleryPhotos.length === 0) {
        grid.innerHTML = '<p class="gallery-empty">No photos in this category yet.</p>';
        return;
    }

    /* Build each gallery item as a <figure> for semantic HTML */
    grid.innerHTML = activeGalleryPhotos.map((photo, index) => `
        <figure
            class="gallery-item"
            role="listitem"
            tabindex="0"
            onclick="openLightbox(${index})"
            onkeydown="if(event.key==='Enter'||event.key===' ')openLightbox(${index})"
            aria-label="${escapeHTMLAttr(photo.alt)}"
            data-keywords="${escapeHTMLAttr(photo.keywords)}"
            data-category="${escapeHTMLAttr(photo.category)}"
        >
            <img
                src="${escapeHTMLAttr(photo.src)}"
                alt="${escapeHTMLAttr(photo.alt)}"
                title="${escapeHTMLAttr(photo.title)}"
                loading="lazy"
                decoding="async"
                onerror="this.closest('.gallery-item').style.display='none'"
            >
            <figcaption class="gallery-item-overlay" aria-hidden="true">
                <span class="gallery-item-title">${escapeHTML(photo.title)}</span>
                <span class="gallery-item-caption">${escapeHTML(photo.caption)}</span>
            </figcaption>
        </figure>
    `).join('');
}

/**
 * Filters the gallery by category and updates the active filter button.
 * Called by the filter <button> elements above the gallery grid.
 */
function filterGallery(category) {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === category);
    });
    renderGallery(category);
}


/* =============================================
   6. LIGHTBOX — Full-Screen Photo Viewer
   ============================================= */

/** Opens the lightbox to the photo at the given index. */
function openLightbox(index) {
    lightboxIndex = index;
    const photo   = activeGalleryPhotos[index];
    const lb      = document.getElementById('lightbox');

    document.getElementById('lightbox-img').src            = photo.src;
    document.getElementById('lightbox-img').alt            = photo.alt;
    document.getElementById('lightbox-caption').textContent = photo.caption || photo.title;

    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
}

/** Closes the lightbox. */
function closeLightbox() {
    document.getElementById('lightbox')?.classList.remove('open');
    document.body.style.overflow = '';
}

/**
 * Navigates to the previous (-1) or next (+1) photo while lightbox is open.
 * Wraps around at the ends of the gallery.
 */
function lightboxNav(direction, event) {
    event?.stopPropagation();

    const count   = activeGalleryPhotos.length;
    lightboxIndex = (lightboxIndex + direction + count) % count;
    const photo   = activeGalleryPhotos[lightboxIndex];

    document.getElementById('lightbox-img').src            = photo.src;
    document.getElementById('lightbox-img').alt            = photo.alt;
    document.getElementById('lightbox-caption').textContent = photo.caption || photo.title;
}

/* Arrow key navigation inside an open lightbox */
document.addEventListener('keydown', (e) => {
    const lb = document.getElementById('lightbox');
    if (!lb?.classList.contains('open')) return;

    if (e.key === 'ArrowLeft')  lightboxNav(-1, null);
    if (e.key === 'ArrowRight') lightboxNav(1,  null);
});


/* =============================================
   7. UTILITIES
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
   8. PAGE INITIALIZATION
   Runs once the DOM is fully loaded.
   ============================================= */
document.addEventListener('DOMContentLoaded', () => {

    /* Set current year in footer copyright notice */
    const yearEl = document.getElementById('footer-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    /* Initialize the booking date minimum to today */
    setMinDate();

    /* Render the photo gallery (all categories) */
    renderGallery();

    /* Load Google Reviews — falls back to placeholders if API not yet loaded */
    if (typeof google === 'undefined') {
        loadGoogleReviews();
    }

});
