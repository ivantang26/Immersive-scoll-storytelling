// FR-8: test-ride booking. Postcode -> nearest shops -> date + time -> details -> confirmation.
// Each step unlocks the next and moves focus to its heading.
import { track } from './analytics.js';
import { COLOURWAYS, ACCESSORIES } from '../config/product.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function api(path, opts) {
  const res = await fetch(path, opts);
  const body = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error?.message || 'Something went wrong. Please try again.'), { status: res.status, body });
  return body;
}

function prettyDate(iso, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
}

export function initBooking() {
  const form = $('[data-booking]');
  const shopsEl = $('[data-shops]');
  const when = $('[data-when]');
  const details = $('[data-details]');
  const datesEl = $('[data-dates]');
  const timesEl = $('[data-times]');
  const summary = $('[data-summary]');
  const state = { postcode: '', shopId: '', date: '', time: '', config: {} };

  // Bike choice carried over from the configurator.
  const q = new URLSearchParams(location.search);
  const colour = COLOURWAYS.find((c) => c.id === q.get('colour'));
  if (colour) {
    state.config = { colour: colour.id, rack: q.get('rack') === '1', basket: q.get('basket') === '1' };
    const extras = ACCESSORIES.filter((a) => state.config[a.id]).map((a) => a.name.toLowerCase());
    const bike = $('[data-bike]');
    bike.textContent = `You'll ride: Vela in ${colour.name}${extras.length ? ', with ' + extras.join(' and ') : ''}.`;
    bike.hidden = false;
  }

  const setError = (name, msg) => {
    const el = form.querySelector(`[data-error="${name}"]`);
    if (el) el.textContent = msg || '';
    const input = form.elements[name];
    if (input && input.setAttribute) msg ? input.setAttribute('aria-invalid', 'true') : input.removeAttribute('aria-invalid');
  };
  const focusStep = (n) => $(`#s${n}`).focus();

  /* ---- Step 1: shops ---- */
  async function findShops() {
    setError('postcode');
    const value = form.elements.postcode.value.trim();
    if (!value) return setError('postcode', 'Enter your postcode.');
    shopsEl.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
    try {
      const data = await api(`/api/shops?postcode=${encodeURIComponent(value)}`);
      state.postcode = data.postcode;
      form.elements.postcode.value = data.postcode;
      shopsEl.innerHTML = `<fieldset class="step__body"><legend class="sr-only">Nearest shops to ${esc(data.postcode)}</legend>${data.shops
        .map(
          (s) => `<label class="shop"><input type="radio" name="shopId" value="${esc(s.id)}" />
            <span><span class="shop__name">${esc(s.name)}</span><span class="shop__addr">${esc(s.address)}</span></span>
            <span class="shop__dist">${s.distanceKm} km</span></label>`,
        )
        .join('')}</fieldset>`;
      track('booking_step', { step: 'shops' });
    } catch (err) {
      shopsEl.innerHTML = '';
      setError('postcode', err.message);
    }
  }
  $('[data-find]').addEventListener('click', findShops);
  form.elements.postcode.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      findShops();
    }
  });

  shopsEl.addEventListener('change', async (e) => {
    if (e.target.name !== 'shopId') return;
    state.shopId = e.target.value;
    state.date = state.time = '';
    details.disabled = true;
    const { dates } = await api(`/api/slots?shop=${encodeURIComponent(state.shopId)}`);
    datesEl.innerHTML = dates
      .map((d) => `<button type="button" class="chip chip--date" role="radio" aria-checked="false" data-date="${d}"><small>${prettyDate(d, { weekday: 'short' })}</small>${prettyDate(d, { day: 'numeric', month: 'short' })}</button>`)
      .join('');
    timesEl.innerHTML = '<p class="hint">Choose a date to see times.</p>';
    when.disabled = false;
    focusStep(2);
  });

  /* ---- Step 2: date + time (radio-group semantics on buttons) ---- */
  function selectChip(group, btn) {
    group.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-checked', String(c === btn)));
  }
  function arrowNav(group, e) {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const chips = [...group.querySelectorAll('.chip:not(:disabled)')];
    const i = chips.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const next = chips[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + chips.length) % chips.length];
    next.focus();
    next.click();
  }
  datesEl.addEventListener('keydown', (e) => arrowNav(datesEl, e));
  timesEl.addEventListener('keydown', (e) => arrowNav(timesEl, e));

  datesEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-date]');
    if (!btn) return;
    selectChip(datesEl, btn);
    state.date = btn.dataset.date;
    state.time = '';
    setError('date');
    details.disabled = true;
    timesEl.innerHTML = '<div class="skeleton" style="height:44px"></div>';
    try {
      const { slots } = await api(`/api/slots?shop=${encodeURIComponent(state.shopId)}&date=${state.date}`);
      timesEl.innerHTML = slots
        .map((s) => `<button type="button" class="chip" role="radio" aria-checked="false" data-time="${s.time}" ${s.available ? '' : 'disabled aria-disabled="true"'}>${s.time}${s.available ? '' : '<span class="sr-only"> (fully booked)</span>'}</button>`)
        .join('');
      if (!slots.some((s) => s.available)) timesEl.innerHTML = '<p class="hint">This day is fully booked. Try another date.</p>';
    } catch (err) {
      timesEl.innerHTML = `<p class="error">${esc(err.message)}</p>`;
    }
  });

  timesEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-time]');
    if (!btn || btn.disabled) return;
    selectChip(timesEl, btn);
    state.time = btn.dataset.time;
    setError('time');
    const firstTime = details.disabled;
    details.disabled = false;
    if (firstTime) {
      track('booking_step', { step: 'time' });
      focusStep(3);
    }
  });

  /* ---- Step 3: submit ---- */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    ['name', 'email', 'phone', 'consent', 'date', 'time'].forEach((n) => setError(n));
    summary.hidden = true;
    const submit = $('[data-submit]');
    submit.disabled = true;
    submit.textContent = 'Booking';
    try {
      const res = await api('/api/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...state,
          name: form.elements.name.value,
          email: form.elements.email.value,
          phone: form.elements.phone.value,
          consent: form.elements.consent.checked,
          company: form.elements.company.value,
        }),
      });
      track('booking_complete', { shop: state.shopId });
      showDone(res);
    } catch (err) {
      const fields = err.body?.error?.fields;
      if (fields) {
        Object.entries(fields).forEach(([k, v]) => setError(k === 'shopId' ? 'postcode' : k, v));
        $('[data-summary-list]').innerHTML = Object.entries(fields)
          .map(([k, v]) => `<li><a href="#${k === 'shopId' ? 'postcode' : k}">${esc(v)}</a></li>`)
          .join('');
      } else {
        $('[data-summary-list]').innerHTML = `<li>${esc(err.message)}</li>`;
        if (err.status === 409) $('[data-dates] [aria-checked="true"]')?.click();
      }
      summary.hidden = false;
      summary.focus();
    } finally {
      submit.disabled = false;
      submit.textContent = 'Confirm test ride';
    }
  });

  function showDone(res) {
    form.hidden = true;
    const done = $('[data-done]');
    done.hidden = false;
    $('[data-done-ref]').textContent = res.reference;
    $('[data-done-when]').textContent = `${prettyDate(res.date)} at ${res.time}`;
    $('[data-done-where]').textContent = `${res.shop.name}, ${res.shop.address}`;
    $('[data-done-bike]').textContent = `Vela in ${res.bike.colour}${res.bike.extras.length ? ', with ' + res.bike.extras.join(' and ') : ''}`;
    $('[data-done-email]').textContent =
      res.email.status === 'sent'
        ? `We've emailed your confirmation and a calendar invite to ${res.email.to}.`
        : `Your ride is booked, but we couldn't send the email. Keep your reference handy; the shop has your details.`;
    $('#done-title').focus();
    window.scrollTo({ top: 0 });
  }
}
