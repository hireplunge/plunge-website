/* =============================================
   BOOK-SERVICETITAN — Netlify Function
   -----------------------------------------------
   The booking form's backend. The form (docs/index.html + docs/js/script.js)
   POSTs JSON to /api/book-servicetitan; netlify.toml routes that address to
   this function. This function:

     1. Rejects anything that isn't a small JSON POST.
     2. Silently swallows spam (the form's hidden "website" trap field).
     3. Checks the required fields are present.
     4. Logs into ServiceTitan (OAuth client-credentials) and caches the
        15-minute access token between warm invocations.
     5. Files the booking with ServiceTitan's CRM API. It lands on the
        Bookings tab of the Call Booking screen for the office to confirm
        by phone — the "request, then we confirm" flow. No live time slots
        on purpose (owner decision, July 20 2026): the customer's preferred
        date/window travel inside the booking summary as a PREFERENCE.

   CREDENTIALS — the one rule that matters most:
   All five values below live ONLY in Netlify's environment variables
   (Site configuration > Environment variables). Never in this file, never
   in the repo, never in chat/email/text.

     ST_TENANT_ID           ServiceTitan account number
     ST_APP_KEY             from creating the app at developer.servicetitan.io
     ST_CLIENT_ID           from authorizing the app in ServiceTitan
     ST_CLIENT_SECRET       shown ONCE at authorization — paste straight here
     ST_BOOKING_PROVIDER_ID the "booking provider" record our bookings file
                            under (pending — see the playbook follow-ups;
                            created in ServiceTitan settings or by ST support)

   FAILURE BEHAVIOR (catalog A1/A3, _generator/failure-modes.md): any error
   here returns a JSON message and a non-200 status; the form's catch block
   then shows the polite "please call us" fallback. Customers are never
   left hanging.

   TO VERIFY DURING PHASE 4.6 TESTING (first run with real credentials):
     - the exact create-booking body ServiceTitan accepts (the shape below
       follows the documented schema; "start" is deliberately omitted since
       this is a request, not a scheduled appointment)
     - whether isSendConfirmationEmail should be on (owner decision)
   ============================================= */

'use strict';

const AUTH_URL = 'https://auth.servicetitan.io/connect/token';
const API_BASE = 'https://api.servicetitan.io';
const FETCH_TIMEOUT_MS = 8000;   // per upstream call; form aborts at 15s total
const MAX_BODY_BYTES = 20000;

/* Mirrors the form's service-type <option> values. Anything unknown falls
   through as-is so a form edit can never make bookings silently fail. */
const SERVICE_LABELS = {
    'drain-cleaning':   'Drain Cleaning',
    'leak-repair':      'Leak Detection & Repair',
    'water-heater':     'Water Heater Service',
    'toilet-repair':    'Toilet Repair / Replacement',
    'pipe-repair':      'Pipe Repair / Replacement',
    'sewer-line':       'Sewer Line Service',
    'garbage-disposal': 'Garbage Disposal',
    'faucet':           'Faucet Repair / Replacement',
    'remodel':          'Plumbing Remodel',
    'emergency':        'PLUMBING EMERGENCY',
    'other':            'Other',
};

const TIME_LABELS = {
    morning:   'morning (8am–12pm)',
    afternoon: 'afternoon (12pm–4pm)',
    evening:   'evening (4pm–7pm)',
};

/* Access token cache — survives between requests while the function stays
   warm, so ServiceTitan's login desk isn't bothered on every booking. */
let tokenCache = { value: null, expiresAt: 0 };

exports.handler = async function (event) {
    if (event.httpMethod !== 'POST') {
        return json(405, { message: 'method not allowed' });
    }
    if ((event.body || '').length > MAX_BODY_BYTES) {
        return json(413, { message: 'request too large' });
    }

    let payload;
    try {
        payload = JSON.parse(event.body || '');
    } catch (err) {
        return json(400, { message: 'the request could not be read' });
    }

    /* Spam trap: humans never see the "website" field, so a value there
       means a bot. Answer with a convincing success and file nothing. */
    if (payload && typeof payload.website === 'string' && payload.website.trim() !== '') {
        return json(200, { success: true });
    }

    const booking = normalize(payload);
    if (!booking) {
        return json(400, { message: 'some required information was missing' });
    }

    const env = readEnv();
    if (!env) {
        /* Credentials not in Netlify yet (or a variable name typo). The
           form shows its call-us fallback; the log says which var is absent. */
        return json(503, { message: 'online booking is not available right now' });
    }

    try {
        const token = await getAccessToken(env);
        const created = await createBooking(env, token, booking);
        console.log(`Booking created: id ${created && created.id ? created.id : '(no id returned)'}`);
        return json(200, { success: true });
    } catch (err) {
        console.error('Booking failed:', err.message);
        return json(502, { message: 'our scheduling system could not be reached' });
    }
};

/* -----------------------------------------------
   Environment — all five present or nothing runs.
   ----------------------------------------------- */
function readEnv() {
    const names = ['ST_TENANT_ID', 'ST_APP_KEY', 'ST_CLIENT_ID', 'ST_CLIENT_SECRET', 'ST_BOOKING_PROVIDER_ID'];
    const env = {};
    for (const name of names) {
        const value = (process.env[name] || '').trim();
        if (!value) {
            console.error(`Missing environment variable: ${name}`);
            return null;
        }
        env[name] = value;
    }
    return env;
}

/* -----------------------------------------------
   Validation + normalization of the form payload.
   Returns null when a required field is absent; otherwise a
   trimmed, length-capped copy. The office confirms every booking
   by phone, so this stays deliberately lenient beyond presence.
   ----------------------------------------------- */
function normalize(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const customer = payload.customer || {};
    const address  = payload.address  || {};
    const job      = payload.job      || {};

    const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

    const out = {
        firstName:     clean(customer.firstName, 100),
        lastName:      clean(customer.lastName, 100),
        email:         clean(customer.email, 200),
        phone:         clean(customer.phone, 40),
        isNewCustomer: customer.isNewCustomer === true,
        street:        clean(address.street, 200),
        unit:          clean(address.unit, 50),
        city:          clean(address.city, 100),
        state:         clean(address.state, 10) || 'AZ',
        zip:           clean(address.zip, 20),
        serviceType:   clean(job.serviceType, 50),
        preferredDate: clean(job.preferredDate, 20),
        preferredTime: clean(job.preferredTime, 20),
        notes:         clean(job.notes, 2000),
    };

    const required = ['firstName', 'lastName', 'email', 'phone', 'street', 'city', 'zip', 'serviceType', 'preferredDate'];
    for (const field of required) {
        if (!out[field]) return null;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(out.preferredDate)) return null;
    return out;
}

/* -----------------------------------------------
   OAuth — client-credentials exchange, cached ~15 min.
   ----------------------------------------------- */
async function getAccessToken(env) {
    if (tokenCache.value && Date.now() < tokenCache.expiresAt) {
        return tokenCache.value;
    }

    const body = new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     env.ST_CLIENT_ID,
        client_secret: env.ST_CLIENT_SECRET,
    });

    const res = await fetchWithTimeout(AUTH_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    body.toString(),
    });

    if (!res.ok) {
        /* Never log the response body here — auth errors can echo request
           details. Status alone is enough to diagnose. */
        throw new Error(`token endpoint answered ${res.status}`);
    }

    const data = await res.json();
    if (!data.access_token) throw new Error('token endpoint answered without a token');

    tokenCache = {
        value:     data.access_token,
        /* Refresh 60s before ServiceTitan's stated expiry. */
        expiresAt: Date.now() + Math.max(0, (Number(data.expires_in) || 900) - 60) * 1000,
    };
    return tokenCache.value;
}

/* -----------------------------------------------
   The booking itself.
   ----------------------------------------------- */
async function createBooking(env, token, b) {
    const url = `${API_BASE}/crm/v2/tenant/${env.ST_TENANT_ID}` +
                `/booking-provider/${env.ST_BOOKING_PROVIDER_ID}/bookings`;

    const serviceLabel = SERVICE_LABELS[b.serviceType] || b.serviceType;
    const timeLabel    = TIME_LABELS[b.preferredTime] || '';

    const summary =
        `${serviceLabel} — preferred date ${b.preferredDate}` +
        (timeLabel ? `, ${timeLabel}` : '') +
        `. ${b.isNewCustomer ? 'New customer' : 'Returning customer'}.` +
        (b.notes ? ` Notes: ${b.notes}` : '');

    const body = {
        source:                  'Website Online Booking',
        name:                    `${b.firstName} ${b.lastName}`,
        summary:                 summary,
        isFirstTimeClient:       b.isNewCustomer,
        isSendConfirmationEmail: false,
        /* Unique per submission so an accidental double-click can be
           spotted and deduplicated on the ServiceTitan side. */
        externalId:              `plunge-web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        contacts: [
            { type: 'Phone', value: b.phone },
            { type: 'Email', value: b.email },
        ],
        address: {
            street:  b.unit ? `${b.street}, ${b.unit}` : b.street,
            city:    b.city,
            state:   b.state,
            zip:     b.zip,
            country: 'USA',
        },
    };

    const res = await fetchWithTimeout(url, {
        method:  'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'ST-App-Key':    env.ST_APP_KEY,
            'Content-Type':  'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`booking endpoint answered ${res.status}: ${detail.slice(0, 500)}`);
    }
    return res.json().catch(() => ({}));
}

/* -----------------------------------------------
   Helpers.
   ----------------------------------------------- */
async function fetchWithTimeout(url, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

function json(statusCode, data) {
    return {
        statusCode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    };
}
