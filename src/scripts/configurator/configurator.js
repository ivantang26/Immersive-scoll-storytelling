// Configurator page logic. The form is the single source of truth; it drives either the
// 3D viewer (capable devices) or pre-rendered stills (no WebGL, static mode, low memory).
import { track } from '../analytics.js';
import { formatGBP } from '../../config/product.js';

// Checked here, not in viewer.js, so low-end devices never download Three.js.
function webglAvailable() {
  try {
    return !!(window.WebGL2RenderingContext && document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

export async function initConfigurator() {
  const form = document.querySelector('[data-form]');
  const fallback = document.querySelector('[data-fallback]');
  const canvas = document.querySelector('[data-canvas]');
  const status = document.querySelector('[data-status]');
  const loading = document.querySelector('[data-loading]');
  const totalEl = document.querySelector('[data-total]');
  const bookLink = document.querySelector('[data-book]');
  const shotBtn = document.querySelector('[data-shot]');
  const hint = document.querySelector('[data-hint]');
  const colourName = document.querySelector('[data-colour-name]');
  let viewer = null;

  // Restore a shared configuration, e.g. /configure?colour=bone&rack=1
  const params = new URLSearchParams(location.search);
  if (params.get('colour')) {
    const r = form.querySelector(`input[name="colour"][value="${CSS.escape(params.get('colour'))}"]`);
    if (r) r.checked = true;
  }
  for (const a of ['rack', 'basket']) if (params.get(a) === '1') form.elements[a].checked = true;

  const state = () => {
    const colour = form.querySelector('input[name="colour"]:checked');
    return {
      colour: colour.value,
      colourName: colour.dataset.name,
      paint: colour.dataset.paint,
      rack: form.elements.rack.checked,
      basket: form.elements.basket.checked,
    };
  };

  function apply({ initial = false } = {}) {
    const s = state();
    colourName.textContent = s.colourName;
    let total = +totalEl.dataset.base;
    for (const a of ['rack', 'basket']) if (s[a]) total += +form.elements[a].dataset.price;
    totalEl.value = formatGBP(total);
    totalEl.textContent = formatGBP(total);
    const extras = [s.rack && 'rear rack', s.basket && 'front basket'].filter(Boolean);
    const desc = `Vela in ${s.colourName}${extras.length ? ', with ' + extras.join(' and ') : ', no accessories'}.`;
    fallback.src = `/media/configure/${s.colour}-${s.rack ? 'rack' : 'norack'}-${s.basket ? 'basket' : 'nobasket'}.webp`;
    fallback.alt = desc;
    canvas.setAttribute('aria-label', `3D view: ${desc} Drag to rotate.`);
    const q = new URLSearchParams({ colour: s.colour, ...(s.rack && { rack: '1' }), ...(s.basket && { basket: '1' }) });
    bookLink.href = `/test-ride?${q}`;
    history.replaceState(null, '', `?${q}`);
    if (viewer) {
      viewer.setColour(s.paint);
      viewer.setAccessory('rack', s.rack);
      viewer.setAccessory('basket', s.basket);
    }
    if (!initial) track('configurator_change', { colour: s.colour, rack: s.rack, basket: s.basket });
  }
  form.addEventListener('change', () => apply());
  form.addEventListener('submit', (e) => e.preventDefault());
  apply({ initial: true });
  track('configurator_session');

  // Decide on 3D: not in static mode (reduced motion keeps 3D but without inertia), not on low-memory devices.
  const root = document.documentElement;
  const reasons = root.dataset.modeReason || '';
  const lowEnd = (navigator.deviceMemory && navigator.deviceMemory < 4) || reasons.includes('save-data') || reasons.includes('low-memory');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (lowEnd || !webglAvailable()) {
    hint.textContent = lowEnd ? 'Showing still images to save data and battery.' : '3D view is not available on this device, so we are showing still images.';
    shotBtn.textContent = 'Download image';
  } else {
    const simplified = matchMedia('(max-width: 767px), (pointer: coarse)').matches;
    loading.hidden = false;
    status.textContent = 'Loading 3D model';
    try {
      const { createViewer } = await import('./viewer.js');
      canvas.hidden = false;
      viewer = await createViewer({
        canvas,
        modelUrl: simplified ? '/models/vela-lite.glb' : '/models/vela.glb',
        simplified,
        reducedMotion,
        onProgress: (p) => loading.style.setProperty('--p', p.toFixed(2)),
      });
      apply({ initial: true });
      fallback.hidden = true;
      status.textContent = '';
      hint.textContent = simplified ? 'Drag the bike to rotate it.' : 'Drag to rotate. Scroll to zoom.';
    } catch (err) {
      canvas.hidden = true;
      status.textContent = 'Could not load the 3D view. Showing still images instead.';
      console.error(err);
    } finally {
      loading.hidden = true;
    }
  }

  // Screenshot to share: Web Share with a file where supported, otherwise download.
  shotBtn.addEventListener('click', async () => {
    const s = state();
    const name = `vela-${s.colour}${s.rack ? '-rack' : ''}${s.basket ? '-basket' : ''}.png`;
    let blob;
    if (viewer) blob = await viewer.screenshot();
    else blob = await (await fetch(fallback.src)).blob();
    const file = new File([blob], viewer ? name : name.replace('.png', '.webp'), { type: blob.type });
    track('configurator_screenshot', { colour: s.colour });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'My Vela', text: `My Vela in ${s.colourName}.` });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    status.textContent = 'Image saved.';
  });
}
