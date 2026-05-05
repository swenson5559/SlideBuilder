// ── Auth status ───────────────────────────────────────────────────────────────
async function checkAuth() {
  const res  = await fetch('/auth/status');
  const data = await res.json();
  const bar  = document.getElementById('auth-bar');
  const txt  = document.getElementById('auth-status-text');
  const btn  = document.getElementById('auth-btn');
  const genBtn = document.getElementById('generate-btn');

  if (data.connected) {
    bar.className = 'auth-bar connected';
    txt.textContent = '✓ Connected to Google';
    btn.textContent = 'Reconnect';
    genBtn.disabled = false;
  } else {
    bar.className = 'auth-bar disconnected';
    txt.textContent = 'Not connected to Google';
    btn.textContent = 'Connect Google Account';
    genBtn.disabled = true;
  }
}

// ── Color pickers ─────────────────────────────────────────────────────────────
const colorPairs = [
  ['primaryColorPicker',   'primaryColor'],
  ['secondaryColorPicker', 'secondaryColor'],
  ['accentColorPicker',    'accentColor'],
  ['bgColorPicker',        'bgColor'],
  ['textColorPicker',      'textColor'],
];

colorPairs.forEach(([pickerId, textId]) => {
  const picker = document.getElementById(pickerId);
  const text   = document.getElementById(textId);

  picker.addEventListener('input', () => { text.value = picker.value; });
  text.addEventListener('input', () => {
    if (/^#[0-9a-fA-F]{6}$/.test(text.value)) picker.value = text.value;
  });
});

// ── Slide count slider ────────────────────────────────────────────────────────
const slider = document.getElementById('slideCount');
const label  = document.getElementById('slideCountLabel');
slider.addEventListener('input', () => { label.textContent = `${slider.value} slides`; });

// ── Slide size toggle ─────────────────────────────────────────────────────────
document.querySelectorAll('.toggle-opt').forEach(opt => {
  opt.querySelector('input').addEventListener('change', () => {
    document.querySelectorAll('.toggle-opt').forEach(o => o.classList.remove('active'));
    opt.classList.add('active');
  });
});

// ── Logo filename display ─────────────────────────────────────────────────────
document.getElementById('logo').addEventListener('change', e => {
  const name = e.target.files[0]?.name || '';
  document.getElementById('logo-name').textContent = name;
});

// ── Paste presentation URL → extract ID ──────────────────────────────────────
// Only auto-trim the existing presentation field; template field keeps the full URL
document.getElementById('presentationId').addEventListener('blur', e => {
  const val = e.target.value.trim();
  const match = val.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) e.target.value = match[1];
});

// ── Form submit ───────────────────────────────────────────────────────────────
document.getElementById('slide-form').addEventListener('submit', async e => {
  e.preventDefault();

  const btn     = document.getElementById('generate-btn');
  const btnText = document.getElementById('btn-text');
  const result  = document.getElementById('result');
  const errBar  = document.getElementById('error-bar');

  btn.disabled = true;
  btn.classList.add('loading');
  btnText.textContent = 'Generating…';
  result.classList.add('hidden');
  errBar.classList.add('hidden');

  try {
    const form = new FormData(e.target);

    const res  = await fetch('/generate', { method: 'POST', body: form });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Generation failed');

    const link = document.getElementById('result-link');
    link.href = data.url;
    link.textContent = `Open in Google Slides (${data.slideCount} slides) →`;
    result.classList.remove('hidden');
    result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    errBar.textContent = err.message;
    errBar.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
    btnText.textContent = 'GENERATE PRESENTATION';
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
checkAuth();

// Show connected banner if redirected back from OAuth
if (new URLSearchParams(location.search).get('connected') === 'true') {
  history.replaceState(null, '', '/');
}
if (new URLSearchParams(location.search).get('error') === 'auth_failed') {
  document.getElementById('error-bar').textContent = 'Google authentication failed. Please try again.';
  document.getElementById('error-bar').classList.remove('hidden');
  history.replaceState(null, '', '/');
}
