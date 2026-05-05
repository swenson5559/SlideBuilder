
function hexToRgb(hex) {
  const h = (hex || '#ffffff').replace('#', '');
  return {
    red:   parseInt(h.substring(0, 2), 16) / 255,
    green: parseInt(h.substring(2, 4), 16) / 255,
    blue:  parseInt(h.substring(4, 6), 16) / 255,
  };
}

const E = n => Math.round(n * 12700);
let _c = 0;
const uid = () => `el_${String(++_c).padStart(5, '0')}`;

// ── Request builders ──────────────────────────────────────────────────────────
const delObj = id => ({ deleteObject: { objectId: id } });
const addSlide = id => ({ createSlide: { objectId: id, slideLayoutReference: { predefinedLayout: 'BLANK' } } });

const pageBg = (sid, color) => ({
  updatePageProperties: {
    objectId: sid,
    pageProperties: { pageBackgroundFill: { solidFill: { color: { rgbColor: color } } } },
    fields: 'pageBackgroundFill',
  },
});

const rect = (sid, oid, l, t, w, h) => ({
  createShape: {
    objectId: oid, shapeType: 'RECTANGLE',
    elementProperties: {
      pageObjectId: sid,
      size: { width: { magnitude: E(w), unit: 'EMU' }, height: { magnitude: E(h), unit: 'EMU' } },
      transform: { scaleX: 1, scaleY: 1, translateX: E(l), translateY: E(t), unit: 'EMU' },
    },
  },
});

const ellipse = (sid, oid, l, t, w, h) => ({
  createShape: {
    objectId: oid, shapeType: 'ELLIPSE',
    elementProperties: {
      pageObjectId: sid,
      size: { width: { magnitude: E(w), unit: 'EMU' }, height: { magnitude: E(h), unit: 'EMU' } },
      transform: { scaleX: 1, scaleY: 1, translateX: E(l), translateY: E(t), unit: 'EMU' },
    },
  },
});

// Semi-transparent fill + no outline in one request
const ghostFill = (oid, color, alpha = 0.12) => ({
  updateShapeProperties: {
    objectId: oid,
    shapeProperties: {
      shapeBackgroundFill: { solidFill: { color: { rgbColor: color }, alpha } },
      outline: { propertyState: 'NOT_RENDERED' },
    },
    fields: 'shapeBackgroundFill,outline',
  },
});

const fill   = (oid, color) => ({ updateShapeProperties: { objectId: oid, shapeProperties: { shapeBackgroundFill: { solidFill: { color: { rgbColor: color } } } }, fields: 'shapeBackgroundFill' } });
const noLine = oid => ({ updateShapeProperties: { objectId: oid, shapeProperties: { outline: { propertyState: 'NOT_RENDERED' } }, fields: 'outline' } });
const ins    = (oid, text) => ({ insertText: { objectId: oid, text } });

const ts = (oid, s, e, opts) => {
  const style = {};
  if (opts.bold   != null) style.bold   = opts.bold;
  if (opts.italic != null) style.italic = opts.italic;
  if (opts.size   != null) style.fontSize = { magnitude: opts.size, unit: 'PT' };
  if (opts.color  != null) style.foregroundColor = { opaqueColor: { rgbColor: opts.color } };
  if (opts.font   != null) style.fontFamily = opts.font;
  return { updateTextStyle: { objectId: oid, textRange: { type: 'FIXED_RANGE', startIndex: s, endIndex: e }, style, fields: Object.keys(style).join(',') } };
};

const pa = (oid, alignment, s, e) => ({
  updateParagraphStyle: {
    objectId: oid,
    textRange: (s != null) ? { type: 'FIXED_RANGE', startIndex: s, endIndex: e } : { type: 'ALL' },
    style: { alignment }, fields: 'alignment',
  },
});

const va = (oid, alignment) => ({ updateShapeProperties: { objectId: oid, shapeProperties: { contentAlignment: alignment }, fields: 'contentAlignment' } });

function box(sid, l, t, w, h, text, style, bg, textAlign = 'START', vAlign = 'MIDDLE') {
  const oid = uid();
  return [rect(sid, oid, l, t, w, h), fill(oid, bg), noLine(oid), ins(oid, text),
          ts(oid, 0, text.length, style), pa(oid, textAlign), va(oid, vAlign)];
}

// Transparent-background text box — lets template slide design show through
function tBox(sid, l, t, w, h, text, style, textAlign = 'CENTER', vAlign = 'MIDDLE') {
  if (!text) return [];
  const oid = uid();
  return [
    rect(sid, oid, l, t, w, h),
    { updateShapeProperties: { objectId: oid, shapeProperties: {
        shapeBackgroundFill: { propertyState: 'NOT_RENDERED' },
        outline:             { propertyState: 'NOT_RENDERED' },
    }, fields: 'shapeBackgroundFill,outline' } },
    ins(oid, text),
    ts(oid, 0, text.length, style),
    pa(oid, textAlign),
    va(oid, vAlign),
  ];
}

function header(sid, text, B) {
  const oid = uid();
  return [rect(sid, oid, 0, 0, 720, 54), fill(oid, B.primary), noLine(oid), ins(oid, text),
          ts(oid, 0, text.length, { font: B.font, size: 20, color: B.white }),
          pa(oid, 'CENTER'), va(oid, 'MIDDLE')];
}

function accentLine(sid, y, B) {
  const oid = uid();
  return [rect(sid, oid, 36, y, 648, 3), fill(oid, B.accent), noLine(oid)];
}

// ── Chart URL builder (QuickChart.io) ────────────────────────────────────────
function buildChartUrl(slide, B) {
  const toHex = rgb => {
    const h = v => Math.round((v || 0) * 255).toString(16).padStart(2, '0');
    return `#${h(rgb?.red || 0)}${h(rgb?.green || 0)}${h(rgb?.blue || 0)}`;
  };

  const palette = [
    toHex(B.primary), toHex(B.accent),
    '#4a9eed', '#e85d4a', '#6abf69', '#f5a623',
  ];

  const type     = slide.chartType || 'bar';
  const isPolar  = type === 'pie' || type === 'doughnut';

  const datasets = (slide.datasets || []).map((d, i) => {
    const color = palette[i % palette.length];
    return {
      label: d.label || '',
      data: d.data || [],
      backgroundColor: isPolar
        ? (slide.labels || []).map((_, j) => palette[j % palette.length])
        : color,
      borderColor: isPolar ? '#fff' : color,
      borderWidth: isPolar ? 2 : 0,
      fill: type === 'line' ? false : undefined,
      tension: type === 'line' ? 0.4 : undefined,
    };
  });

  const config = {
    type,
    data: { labels: slide.labels || [], datasets },
    options: {
      plugins: {
        legend: { display: datasets.length > 1 || isPolar },
        datalabels: {
          display: true,
          color: isPolar ? '#fff' : '#333',
          font: { weight: 'bold', size: 13 },
          anchor: isPolar ? 'center' : 'end',
          align: isPolar ? 'center' : 'top',
          formatter: (value) => value,
        },
      },
      ...(isPolar ? {} : { scales: { y: { beginAtZero: true } } }),
    },
  };

  return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(config))}&w=620&h=280&bkg=white`;
}

// ── Non-template renderers ────────────────────────────────────────────────────
// Typography is chosen per layout — clear hierarchy in every slide: title > subtitle > body

// ── Title slide — right accent panel, decorative circle, logo slot ────────────
function renderTitle(sid, slide, B) {
  const reqs = [pageBg(sid, B.primary)];

  // Right accent panel
  const panelId = uid();
  reqs.push(rect(sid, panelId, 490, 0, 230, 405), fill(panelId, B.accent), noLine(panelId));

  // Decorative circle inside panel (semi-transparent white)
  const circId = uid();
  reqs.push(ellipse(sid, circId, 500, -55, 295, 295), ghostFill(circId, B.white, 0.1));

  // Small rule above headline
  const ruleId = uid();
  reqs.push(rect(sid, ruleId, 40, 50, 56, 2), fill(ruleId, B.accent), noLine(ruleId));

  // Headline — bold, white, left portion
  reqs.push(...tBox(sid, 40, 60, 425, 210, slide.headline || '', { font: B.font, size: 76, bold: true, color: B.white }, 'START', 'MIDDLE'));

  // Tagline
  if (slide.tagline) {
    reqs.push(...tBox(sid, 40, 282, 425, 90, slide.tagline, { font: B.font, size: 16, color: B.white }, 'START', 'TOP'));
  }

  // Logo in right panel (requires B.logoUrl set by buildPresentation)
  if (B.logoUrl) {
    const logoId = uid();
    reqs.push({
      createImage: {
        objectId: logoId, url: B.logoUrl,
        elementProperties: {
          pageObjectId: sid,
          size: { width: { magnitude: E(160), unit: 'EMU' }, height: { magnitude: E(90), unit: 'EMU' } },
          transform: { scaleX: 1, scaleY: 1, translateX: E(525), translateY: E(158), unit: 'EMU' },
        },
      },
    });
  }

  return reqs;
}

// ── Chapter slide — left accent panel, H2 title + P1 description ─────────────
function renderChapter(sid, slide, B) {
  const reqs = [pageBg(sid, B.primary)];

  // Left accent panel
  const panelId = uid();
  reqs.push(rect(sid, panelId, 0, 0, 180, 405), fill(panelId, B.accent), noLine(panelId));

  // Decorative circle overlapping panel edge
  const circId = uid();
  reqs.push(ellipse(sid, circId, -65, 110, 250, 250), ghostFill(circId, B.white, 0.1));

  // Chapter title — 40pt gives it the presence a chapter opener deserves
  reqs.push(...tBox(sid, 210, 120, 480, 100, slide.title || '', { font: B.font, size: 40, color: B.white }, 'START', 'MIDDLE'));

  // Description
  if (slide.description) {
    reqs.push(...tBox(sid, 210, 232, 480, 130, slide.description, { font: B.font, size: 15, color: B.white }, 'START', 'TOP'));
  }

  return reqs;
}

// ── Content slide — header bar + card-layout subtopics ───────────────────────
function renderContent(sid, slide, B) {
  const reqs = [pageBg(sid, B.bg)];

  // Header: full-width primary strip + title
  const bgId = uid();
  reqs.push(rect(sid, bgId, 0, 0, 720, 52), fill(bgId, B.primary), noLine(bgId));
  reqs.push(...tBox(sid, 30, 0, 680, 52, slide.title || '', { font: B.font, size: 24, color: B.white }, 'START', 'MIDDLE'));
  const lineId = uid();
  reqs.push(rect(sid, lineId, 0, 52, 720, 3), fill(lineId, B.accent), noLine(lineId));

  const subtopics = slide.subtopics || [];
  const xL = 40; const totalW = 640;
  const yStart = 64; const contentH = 390 - yStart;

  if (subtopics.length === 4) {
    // 2×2 card grid
    const colW = (totalW - 20) / 2;
    const rowH = (contentH - 10) / 2;
    subtopics.forEach((sub, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = xL + col * (colW + 20);
      const y = yStart + row * (rowH + 10);
      const barId = uid();
      reqs.push(rect(sid, barId, x, y, colW, 3), fill(barId, B.accent), noLine(barId));
      reqs.push(...tBox(sid, x, y + 7, colW, 26, sub.heading || '', { font: B.font, size: 16, color: B.primary }, 'START', 'MIDDLE'));
      if (sub.text) reqs.push(...tBox(sid, x, y + 37, colW, rowH - 42, sub.text, { font: B.font, size: 13, color: B.text }, 'START', 'TOP'));
    });
  } else if (subtopics.length > 0) {
    // Single-column stacked cards
    const gap = 10;
    const cardH = Math.floor((contentH - (subtopics.length - 1) * gap) / subtopics.length);
    subtopics.forEach((sub, i) => {
      const y = yStart + i * (cardH + gap);
      const barId = uid();
      reqs.push(rect(sid, barId, xL, y, totalW, 3), fill(barId, B.accent), noLine(barId));
      reqs.push(...tBox(sid, xL, y + 7, totalW, 26, sub.heading || '', { font: B.font, size: 16, color: B.primary }, 'START', 'MIDDLE'));
      if (sub.text) reqs.push(...tBox(sid, xL, y + 37, totalW, cardH - 42, sub.text, { font: B.font, size: 13, color: B.text }, 'START', 'TOP'));
    });
  }

  return reqs;
}

// ── Big-statement — editorial moment, full-slide, accent-framed ───────────────
function renderBigStatement(sid, slide, B) {
  const reqs = [pageBg(sid, B.primary)];

  // Top + bottom accent rules framing the statement
  const t = uid(); const b = uid();
  reqs.push(rect(sid, t, 50, 68, 620, 2), fill(t, B.accent), noLine(t));
  reqs.push(rect(sid, b, 50, 330, 620, 2), fill(b, B.accent), noLine(b));

  // Large centered statement — accent color on dark bg
  reqs.push(...tBox(sid, 50, 74, 620, 250, slide.statement || '', { font: B.font, size: 50, bold: true, color: B.accent }, 'CENTER', 'MIDDLE'));

  // Optional context line below bottom rule
  if (slide.context) {
    reqs.push(...tBox(sid, 50, 340, 620, 50, slide.context, { font: B.font, size: 14, color: B.white }, 'CENTER', 'MIDDLE'));
  }

  return reqs;
}

// ── Timeline — horizontal process flow with numbered circles ──────────────────
function renderTimeline(sid, slide, B) {
  const reqs = [pageBg(sid, B.bg)];

  // Header bar
  const bgId = uid();
  reqs.push(rect(sid, bgId, 0, 0, 720, 52), fill(bgId, B.primary), noLine(bgId));
  reqs.push(...tBox(sid, 30, 0, 680, 52, slide.title || '', { font: B.font, size: 24, color: B.white }, 'START', 'MIDDLE'));
  const hLine = uid();
  reqs.push(rect(sid, hLine, 0, 52, 720, 3), fill(hLine, B.accent), noLine(hLine));

  const steps   = (slide.steps || []).slice(0, 5);
  const n       = steps.length;
  if (!n) return reqs;

  const lineY   = 155;
  const xStart  = 80;
  const xEnd    = 640;
  const r       = 22;
  const labelW  = Math.min(128, Math.floor((xEnd - xStart) / Math.max(n - 0.4, 1)) - 8);

  // Horizontal connecting line
  const tl = uid();
  reqs.push(rect(sid, tl, xStart, lineY, xEnd - xStart, 2), fill(tl, B.primary), noLine(tl));

  steps.forEach((step, i) => {
    const cx = n === 1 ? 360 : Math.round(xStart + i * (xEnd - xStart) / (n - 1));

    // Filled circle
    const cId = uid();
    reqs.push(ellipse(sid, cId, cx - r, lineY - r, r * 2, r * 2), fill(cId, B.accent), noLine(cId));

    // Step number inside circle
    reqs.push(...tBox(sid, cx - r, lineY - r, r * 2, r * 2, String(i + 1), { font: B.font, size: 14, bold: true, color: B.white }, 'CENTER', 'MIDDLE'));

    const lx = cx - Math.floor(labelW / 2);
    reqs.push(...tBox(sid, lx, lineY + r + 8, labelW, 26, step.label || '', { font: B.font, size: 15, color: B.primary }, 'CENTER', 'TOP'));

    if (step.text) {
      reqs.push(...tBox(sid, lx, lineY + r + 38, labelW, 170, step.text, { font: B.font, size: 12, color: B.text }, 'CENTER', 'TOP'));
    }
  });

  return reqs;
}

// ── Three-column — three equal pillars ────────────────────────────────────────
function renderThreeColumn(sid, slide, B) {
  const reqs = [pageBg(sid, B.bg)];

  // Header bar
  const bgId = uid();
  reqs.push(rect(sid, bgId, 0, 0, 720, 52), fill(bgId, B.primary), noLine(bgId));
  reqs.push(...tBox(sid, 30, 0, 680, 52, slide.title || '', { font: B.font, size: 24, color: B.white }, 'START', 'MIDDLE'));
  const hLine = uid();
  reqs.push(rect(sid, hLine, 0, 52, 720, 3), fill(hLine, B.accent), noLine(hLine));

  const cols   = (slide.columns || []).slice(0, 3);
  const gap    = 14;
  const colW   = Math.floor((640 - gap * 2) / 3);
  const yStart = 66;

  cols.forEach((col, i) => {
    const x = 40 + i * (colW + gap);

    // Accent cap bar
    const barId = uid();
    reqs.push(rect(sid, barId, x, yStart, colW, 3), fill(barId, B.accent), noLine(barId));

    // Column heading
    reqs.push(...tBox(sid, x, yStart + 8, colW, 28, col.heading || '', { font: B.font, size: 17, color: B.primary }, 'START', 'MIDDLE'));

    // Body text
    if (col.text) {
      reqs.push(...tBox(sid, x, yStart + 42, colW, 282, col.text, { font: B.font, size: 13, color: B.text }, 'START', 'TOP'));
    }
  });

  return reqs;
}

// ── Metrics — multiple numbers together ───────────────────────────────────────
function renderMetrics(sid, slide, B) {
  const reqs = [pageBg(sid, B.bg)];

  // Thin top accent line (no full header — different feel from content slides)
  const tLine = uid();
  reqs.push(rect(sid, tLine, 0, 0, 720, 4), fill(tLine, B.accent), noLine(tLine));

  // Small title
  if (slide.title) {
    reqs.push(...tBox(sid, 40, 12, 640, 32, slide.title, { font: B.font, size: 13, color: B.text }, 'START', 'MIDDLE'));
  }

  const items = (slide.items || []).slice(0, 4);
  const n     = items.length;

  if (n <= 2) {
    // Single row — large numbers
    const iW = 290;
    const startX = Math.round((720 - (n * iW + (n - 1) * 40)) / 2);
    items.forEach((item, i) => {
      const x = startX + i * (iW + 40);
      reqs.push(...tBox(sid, x, 60, iW, 210, item.value || '', { font: B.font, size: 96, bold: true, color: B.primary }, 'CENTER', 'MIDDLE'));
      const bId = uid();
      reqs.push(rect(sid, bId, x, 278, iW, 2), fill(bId, B.accent), noLine(bId));
      if (item.label) reqs.push(...tBox(sid, x, 286, iW, 40, item.label, { font: B.font, size: 15, color: B.text }, 'CENTER', 'MIDDLE'));
    });
  } else {
    // 2×2 grid
    const iW = 300; const iH = 165; const gap = 18;
    items.forEach((item, i) => {
      const col = i % 2; const row = Math.floor(i / 2);
      const x = 40 + col * (iW + gap);
      const y = 50 + row * (iH + gap);
      reqs.push(...tBox(sid, x, y, iW, 105, item.value || '', { font: B.font, size: 64, bold: true, color: B.primary }, 'START', 'MIDDLE'));
      const bId = uid();
      reqs.push(rect(sid, bId, x, y + 108, iW, 2), fill(bId, B.accent), noLine(bId));
      if (item.label) reqs.push(...tBox(sid, x, y + 114, iW, 38, item.label, { font: B.font, size: 14, color: B.text }, 'START', 'MIDDLE'));
    });
  }

  return reqs;
}

// ── Closing slide — mirrors title layout ──────────────────────────────────────
function renderClosing(sid, slide, B) {
  const reqs = [pageBg(sid, B.primary)];

  const panelId = uid();
  reqs.push(rect(sid, panelId, 490, 0, 230, 405), fill(panelId, B.accent), noLine(panelId));

  const circId = uid();
  reqs.push(ellipse(sid, circId, 500, -55, 295, 295), ghostFill(circId, B.white, 0.1));

  const ruleId = uid();
  reqs.push(rect(sid, ruleId, 40, 50, 56, 2), fill(ruleId, B.accent), noLine(ruleId));

  reqs.push(...tBox(sid, 40, 60, 425, 210, slide.headline || '', { font: B.font, size: 76, bold: true, color: B.white }, 'START', 'MIDDLE'));

  if (slide.subline) {
    reqs.push(...tBox(sid, 40, 282, 425, 90, slide.subline, { font: B.font, size: 16, color: B.white }, 'START', 'TOP'));
  }

  return reqs;
}

function renderSection(sid, slide, B) { return renderChapter(sid, slide, B); }

function renderBullets(sid, slide, B) {
  const reqs = [pageBg(sid, B.bg)];
  const bgId = uid();
  reqs.push(rect(sid, bgId, 0, 0, 720, 52), fill(bgId, B.primary), noLine(bgId));
  reqs.push(...tBox(sid, 30, 0, 680, 52, slide.title || '', { font: B.font, size: 24, color: B.white }, 'START', 'MIDDLE'));
  const lineId = uid();
  reqs.push(rect(sid, lineId, 0, 52, 720, 3), fill(lineId, B.accent), noLine(lineId));
  const items = slide.items || [];
  const itemH = Math.max(38, Math.min(54, Math.floor(330 / Math.max(items.length, 1))));
  items.forEach((item, i) => {
    const dotId = uid();
    reqs.push(rect(sid, dotId, 40, 68 + i * (itemH + 4), 4, itemH), fill(dotId, B.accent), noLine(dotId));
    reqs.push(...tBox(sid, 54, 68 + i * (itemH + 4), 634, itemH, item, { font: B.font, size: 14, color: B.text }, 'START', 'MIDDLE'));
  });
  return reqs;
}

// ── Two-column — dark left panel / light right panel split ───────────────────
function renderTwoColumn(sid, slide, B) {
  const reqs = [pageBg(sid, B.bg)];

  // Dark left panel
  const panelId = uid();
  reqs.push(rect(sid, panelId, 0, 0, 355, 405), fill(panelId, B.primary), noLine(panelId));

  // Thin accent divider between panels
  const divId = uid();
  reqs.push(rect(sid, divId, 354, 0, 3, 405), fill(divId, B.accent), noLine(divId));

  // Slide title — top of dark panel
  reqs.push(...tBox(sid, 28, 20, 312, 46, slide.title || '', { font: B.font, size: 20, color: B.white }, 'START', 'MIDDLE'));

  // Left heading + body (white on dark)
  const lHeading = slide.leftHeading || slide.leftLabel || '';
  const lBody    = slide.leftBody || '';
  if (lHeading) reqs.push(...tBox(sid, 28, 82, 312, 30, lHeading, { font: B.font, size: 18, color: B.accent  }, 'START', 'MIDDLE'));
  if (lBody)    reqs.push(...tBox(sid, 28, 118, 312, 262, lBody,  { font: B.font, size: 13, color: B.white   }, 'START', 'TOP'));

  // Right heading + body (dark on light)
  const rHeading = slide.rightHeading || slide.rightLabel || '';
  const rBody    = slide.rightBody || '';
  if (rHeading) reqs.push(...tBox(sid, 378, 82, 312, 30, rHeading, { font: B.font, size: 18, color: B.primary }, 'START', 'MIDDLE'));
  if (rBody)    reqs.push(...tBox(sid, 378, 118, 312, 262, rBody,  { font: B.font, size: 13, color: B.text    }, 'START', 'TOP'));

  return reqs;
}

// ── Quote — left accent bar, large pull-quote, decorative circle ──────────────
function renderQuote(sid, slide, B) {
  const reqs = [pageBg(sid, B.primary)];

  // Decorative circle (bottom-right, barely visible)
  const circId = uid();
  reqs.push(ellipse(sid, circId, 455, 185, 315, 315), ghostFill(circId, B.white, 0.06));

  // Thick left accent bar
  const barId = uid();
  reqs.push(rect(sid, barId, 40, 62, 5, 250), fill(barId, B.accent), noLine(barId));

  // Quote text — 28pt gives a pull-quote proper weight
  reqs.push(...tBox(sid, 62, 62, 618, 230, slide.text || '', { font: B.font, size: 28, color: B.white }, 'START', 'MIDDLE'));

  // Attribution
  if (slide.attribution) {
    const lineId = uid();
    reqs.push(rect(sid, lineId, 62, 300, 44, 2), fill(lineId, B.accent), noLine(lineId));
    reqs.push(...tBox(sid, 62, 310, 618, 30, slide.attribution, { font: B.font, size: 13, color: B.accent }, 'START', 'MIDDLE'));
  }

  return reqs;
}

// ── Stat — big number as the hero, light bg ───────────────────────────────────
function renderStat(sid, slide, B) {
  const reqs = [pageBg(sid, B.bg)];

  // Bottom anchor bar
  const barId = uid();
  reqs.push(rect(sid, barId, 0, 365, 720, 40), fill(barId, B.primary), noLine(barId));

  // Decorative circle (top-right, faint)
  const circId = uid();
  reqs.push(ellipse(sid, circId, 490, -80, 310, 310), ghostFill(circId, B.primary, 0.07));

  // Giant stat value — left-aligned, primary color on light bg
  reqs.push(...tBox(sid, 40, 20, 580, 220, slide.value || '', { font: B.font, size: 96, bold: true, color: B.primary }, 'START', 'MIDDLE'));

  // Label — what the number means
  if (slide.label) {
    reqs.push(...tBox(sid, 40, 248, 580, 48, slide.label, { font: B.font, size: 20, color: B.text }, 'START', 'MIDDLE'));
  }

  // Context — supporting detail inside the bottom bar
  if (slide.context) {
    reqs.push(...tBox(sid, 28, 365, 664, 40, slide.context, { font: B.font, size: 13, color: B.white }, 'START', 'MIDDLE'));
  }

  return reqs;
}

// ── Numbered list — large number anchors ──────────────────────────────────────
function renderNumberedList(sid, slide, B) {
  const reqs = [pageBg(sid, B.bg)];
  const bgId = uid();
  reqs.push(rect(sid, bgId, 0, 0, 720, 52), fill(bgId, B.primary), noLine(bgId));
  reqs.push(...tBox(sid, 30, 0, 680, 52, slide.title || '', { font: B.font, size: 24, color: B.white }, 'START', 'MIDDLE'));
  const hLine = uid();
  reqs.push(rect(sid, hLine, 0, 52, 720, 3), fill(hLine, B.accent), noLine(hLine));

  const items = (slide.items || []).slice(0, 5);
  const n = items.length;
  const yStart = 64; const contentH = 326;
  const itemH = Math.floor(contentH / Math.max(n, 1));

  items.forEach((item, i) => {
    const y = yStart + i * itemH;
    if (i > 0) {
      const sep = uid();
      reqs.push(rect(sid, sep, 40, y, 640, 1), fill(sep, B.lgray), noLine(sep));
    }
    const heading = typeof item === 'string' ? item : (item.heading || item.text || '');
    const sub     = typeof item === 'object' ? (item.text || '') : '';
    reqs.push(...tBox(sid, 40, y + 4, 76, itemH - 8, String(i + 1).padStart(2, '0'), { font: B.font, size: 40, bold: true, color: B.accent }, 'CENTER', 'MIDDLE'));
    reqs.push(...tBox(sid, 126, y + 4, 554, sub ? Math.floor(itemH * 0.45) : itemH - 8, heading, { font: B.font, size: 16, color: B.primary }, 'START', 'MIDDLE'));
    if (sub) reqs.push(...tBox(sid, 126, y + 4 + Math.floor(itemH * 0.45), 554, Math.floor(itemH * 0.5), sub, { font: B.font, size: 12, color: B.text }, 'START', 'TOP'));
  });
  return reqs;
}

// ── Checklist — tick indicators ───────────────────────────────────────────────
function renderChecklist(sid, slide, B) {
  const reqs = [pageBg(sid, B.bg)];
  const bgId = uid();
  reqs.push(rect(sid, bgId, 0, 0, 720, 52), fill(bgId, B.primary), noLine(bgId));
  reqs.push(...tBox(sid, 30, 0, 680, 52, slide.title || '', { font: B.font, size: 24, color: B.white }, 'START', 'MIDDLE'));
  const hLine = uid();
  reqs.push(rect(sid, hLine, 0, 52, 720, 3), fill(hLine, B.accent), noLine(hLine));

  const items = (slide.items || []).slice(0, 6);
  const n = items.length;
  const yStart = 66; const contentH = 322;
  const itemH = Math.floor(contentH / Math.max(n, 1));

  items.forEach((item, i) => {
    const y = yStart + i * itemH;
    const text = typeof item === 'string' ? item : (item.text || '');
    const note = typeof item === 'object' ? (item.note || '') : '';

    // Accent check box
    const boxId = uid();
    reqs.push(rect(sid, boxId, 40, y + Math.floor((itemH - 26) / 2), 26, 26), fill(boxId, B.accent), noLine(boxId));
    reqs.push(...tBox(sid, 40, y + Math.floor((itemH - 26) / 2), 26, 26, '✓', { font: B.font, size: 13, bold: true, color: B.white }, 'CENTER', 'MIDDLE'));

    reqs.push(...tBox(sid, 78, y + 4, 602, note ? Math.floor(itemH * 0.5) : itemH - 8, text, { font: B.font, size: 15, color: B.primary }, 'START', 'MIDDLE'));
    if (note) reqs.push(...tBox(sid, 78, y + 4 + Math.floor(itemH * 0.5), 602, Math.floor(itemH * 0.45), note, { font: B.font, size: 12, color: B.text }, 'START', 'TOP'));

    if (i > 0) {
      const sep = uid();
      reqs.push(rect(sid, sep, 40, y, 640, 1), fill(sep, B.lgray), noLine(sep));
    }
  });
  return reqs;
}

// ── Comparison table — options × criteria grid ────────────────────────────────
function renderComparisonTable(sid, slide, B) {
  const reqs = [pageBg(sid, B.bg)];
  const bgId = uid();
  reqs.push(rect(sid, bgId, 0, 0, 720, 52), fill(bgId, B.primary), noLine(bgId));
  reqs.push(...tBox(sid, 30, 0, 680, 52, slide.title || '', { font: B.font, size: 24, color: B.white }, 'START', 'MIDDLE'));
  const hLine = uid();
  reqs.push(rect(sid, hLine, 0, 52, 720, 3), fill(hLine, B.accent), noLine(hLine));

  const options = (slide.options || []).slice(0, 3);
  const rows    = (slide.rows    || []).slice(0, 6);
  const nOpts   = options.length;
  if (!nOpts) return reqs;

  const tX = 40; const labelW = 155;
  const optW  = Math.floor((640 - labelW) / nOpts);
  const rowH  = Math.floor(340 / (rows.length + 1));
  const tableY = 58;

  // Option header cells
  options.forEach((opt, j) => {
    const x = tX + labelW + j * optW;
    const hId = uid();
    reqs.push(rect(sid, hId, x + 1, tableY, optW - 2, rowH), fill(hId, B.primary), noLine(hId));
    reqs.push(...tBox(sid, x + 1, tableY, optW - 2, rowH, opt, { font: B.font, size: 13, bold: true, color: B.accent }, 'CENTER', 'MIDDLE'));
  });

  // Data rows
  rows.forEach((row, i) => {
    const y = tableY + (i + 1) * rowH;
    if (i % 2 === 0) {
      const rBg = uid();
      reqs.push(rect(sid, rBg, tX, y, 640, rowH - 1), fill(rBg, B.lgray), noLine(rBg));
    }
    const gId = uid();
    reqs.push(rect(sid, gId, tX, y, 640, 1), fill(gId, B.lgray), noLine(gId));
    reqs.push(...tBox(sid, tX + 6, y, labelW - 6, rowH, row.label || '', { font: B.font, size: 12, color: B.primary }, 'START', 'MIDDLE'));
    (row.values || []).slice(0, nOpts).forEach((val, j) => {
      const x = tX + labelW + j * optW;
      reqs.push(...tBox(sid, x + 2, y, optW - 4, rowH, val, { font: B.font, size: 12, color: B.text }, 'CENTER', 'MIDDLE'));
    });
  });

  // Vertical divider after label col
  const vDiv = uid();
  reqs.push(rect(sid, vDiv, tX + labelW, tableY, 1, rowH * (rows.length + 1)), fill(vDiv, B.white), noLine(vDiv));

  return reqs;
}

// ── Testimonial — structured customer quote ───────────────────────────────────
function renderTestimonial(sid, slide, B) {
  const reqs = [pageBg(sid, B.primary)];

  // Decorative circle
  const circId = uid();
  reqs.push(ellipse(sid, circId, 455, 185, 315, 315), ghostFill(circId, B.white, 0.06));

  // Company badge
  if (slide.company) {
    const badgeId = uid();
    reqs.push(rect(sid, badgeId, 40, 28, 180, 24), fill(badgeId, B.accent), noLine(badgeId));
    reqs.push(...tBox(sid, 40, 28, 180, 24, slide.company, { font: B.font, size: 11, bold: true, color: B.white }, 'CENTER', 'MIDDLE'));
  }

  // Quote text — slightly smaller than quote layout since testimonials tend to be longer
  reqs.push(...tBox(sid, 50, 70, 630, 235, slide.quote || '', { font: B.font, size: 24, color: B.white }, 'START', 'MIDDLE'));

  // Attribution
  const lineId = uid();
  reqs.push(rect(sid, lineId, 50, 316, 44, 2), fill(lineId, B.accent), noLine(lineId));
  if (slide.name) reqs.push(...tBox(sid, 50, 325, 500, 24, slide.name, { font: B.font, size: 15, color: B.accent }, 'START', 'MIDDLE'));
  if (slide.role) reqs.push(...tBox(sid, 50, 350, 500, 22, slide.role, { font: B.font, size: 13, color: B.white }, 'START', 'MIDDLE'));

  return reqs;
}

// ── Agenda — deck outline ─────────────────────────────────────────────────────
function renderAgenda(sid, slide, B) {
  const reqs = [pageBg(sid, B.bg)];

  // Left primary panel
  const panelId = uid();
  reqs.push(rect(sid, panelId, 0, 0, 210, 405), fill(panelId, B.primary), noLine(panelId));
  const divId = uid();
  reqs.push(rect(sid, divId, 210, 0, 3, 405), fill(divId, B.accent), noLine(divId));

  // Title in panel (rotated text isn't possible via API, so just stack it)
  reqs.push(...tBox(sid, 10, 0, 190, 405, (slide.title || 'Agenda').toUpperCase(), { font: B.font, size: 18, bold: true, color: B.white }, 'CENTER', 'MIDDLE'));

  // Agenda items
  const items  = (slide.items || []).slice(0, 7);
  const n      = items.length;
  const yStart = 30;
  const itemH  = Math.floor((405 - yStart * 2) / Math.max(n, 1));

  items.forEach((item, i) => {
    const y = yStart + i * itemH;
    if (i > 0) {
      const sep = uid();
      reqs.push(rect(sid, sep, 228, y, 472, 1), fill(sep, B.lgray), noLine(sep));
    }
    const num   = item.number || String(i + 1).padStart(2, '0');
    const label = item.label || (typeof item === 'string' ? item : '');
    reqs.push(...tBox(sid, 228, y, 52, itemH, num, { font: B.font, size: 22, bold: true, color: B.accent }, 'START', 'MIDDLE'));
    reqs.push(...tBox(sid, 290, y, 400, itemH, label, { font: B.font, size: 16, color: B.primary }, 'START', 'MIDDLE'));
  });

  return reqs;
}

// ── Full-bleed text — minimal, editorial, zero chrome ────────────────────────
function renderFullBleedText(sid, slide, B) {
  const reqs = [pageBg(sid, B.bg)];

  // Thin left accent stripe
  const stripeId = uid();
  reqs.push(rect(sid, stripeId, 0, 0, 4, 405), fill(stripeId, B.accent), noLine(stripeId));

  // Headline — editorial, no header bar so it can be bigger
  reqs.push(...tBox(sid, 60, 50, 610, 110, slide.headline || '', { font: B.font, size: 38, color: B.primary }, 'START', 'MIDDLE'));

  // Thin rule
  const ruleId = uid();
  reqs.push(rect(sid, ruleId, 60, 166, 70, 2), fill(ruleId, B.accent), noLine(ruleId));

  // Body
  if (slide.body) {
    reqs.push(...tBox(sid, 60, 178, 600, 210, slide.body, { font: B.font, size: 14, color: B.text }, 'START', 'TOP'));
  }

  return reqs;
}

// ── Roadmap — vertical milestones ────────────────────────────────────────────
function renderRoadmap(sid, slide, B) {
  const reqs = [pageBg(sid, B.bg)];
  const bgId = uid();
  reqs.push(rect(sid, bgId, 0, 0, 720, 52), fill(bgId, B.primary), noLine(bgId));
  reqs.push(...tBox(sid, 30, 0, 680, 52, slide.title || '', { font: B.font, size: 24, color: B.white }, 'START', 'MIDDLE'));
  const hLine = uid();
  reqs.push(rect(sid, hLine, 0, 52, 720, 3), fill(hLine, B.accent), noLine(hLine));

  const milestones = (slide.milestones || []).slice(0, 5);
  const n = milestones.length;
  if (!n) return reqs;

  const yStart = 68; const yEnd = 392;
  const lineX  = 180; const r = 13;
  const itemH  = Math.floor((yEnd - yStart) / n);

  // Vertical connecting line
  const vLine = uid();
  reqs.push(rect(sid, vLine, lineX, yStart, 2, yEnd - yStart), fill(vLine, B.primary), noLine(vLine));

  milestones.forEach((m, i) => {
    const cy = yStart + Math.floor(itemH * (i + 0.5));

    // Circle
    const cId = uid();
    reqs.push(ellipse(sid, cId, lineX - r + 1, cy - r, r * 2, r * 2), fill(cId, B.accent), noLine(cId));

    // Date (left of line, right-aligned)
    if (m.date) {
      reqs.push(...tBox(sid, 20, cy - 13, 148, 26, m.date, { font: B.font, size: 11, color: B.text }, 'END', 'MIDDLE'));
    }

    // Label
    reqs.push(...tBox(sid, lineX + r + 12, cy - 13, 494, 26, m.label || '', { font: B.font, size: 15, color: B.primary }, 'START', 'MIDDLE'));

    if (m.text && itemH > 40) {
      reqs.push(...tBox(sid, lineX + r + 12, cy + 16, 494, itemH - 32, m.text, { font: B.font, size: 12, color: B.text }, 'START', 'TOP'));
    }
  });

  return reqs;
}

// ── Chart — QuickChart.io image embedded in slide ─────────────────────────────
function renderChart(sid, slide, B) {
  const reqs = [pageBg(sid, B.bg)];

  // Header bar
  const bgId = uid();
  reqs.push(rect(sid, bgId, 0, 0, 720, 52), fill(bgId, B.primary), noLine(bgId));
  reqs.push(...tBox(sid, 30, 0, 680, 52, slide.title || '', { font: B.font, size: 24, color: B.white }, 'START', 'MIDDLE'));
  const hLine = uid();
  reqs.push(rect(sid, hLine, 0, 52, 720, 3), fill(hLine, B.accent), noLine(hLine));

  // Chart image via QuickChart
  const chartUrl = buildChartUrl(slide, B);
  const imgId = uid();
  reqs.push({
    createImage: {
      objectId: imgId,
      url: chartUrl,
      elementProperties: {
        pageObjectId: sid,
        size: {
          width:  { magnitude: E(620), unit: 'EMU' },
          height: { magnitude: E(285), unit: 'EMU' },
        },
        transform: { scaleX: 1, scaleY: 1, translateX: E(50), translateY: E(60), unit: 'EMU' },
      },
    },
  });

  // Caption / placeholder note
  if (slide.caption) {
    reqs.push(...tBox(sid, 50, 352, 620, 30, slide.caption, { font: B.font, size: 11, color: B.text }, 'CENTER', 'MIDDLE'));
  }

  return reqs;
}

const RENDERERS = {
  title: renderTitle, chapter: renderChapter, section: renderChapter,
  content: renderContent, stat: renderStat, quote: renderQuote,
  'big-statement': renderBigStatement, timeline: renderTimeline,
  'three-column': renderThreeColumn, metrics: renderMetrics,
  'numbered-list': renderNumberedList, checklist: renderChecklist,
  'comparison-table': renderComparisonTable, testimonial: renderTestimonial,
  agenda: renderAgenda, 'full-bleed-text': renderFullBleedText,
  roadmap: renderRoadmap, chart: renderChart,
  'two-column': renderTwoColumn, bullets: renderBullets, closing: renderClosing,
};

// ── Typography spec ───────────────────────────────────────────────────────────
// H1 96pt · H2 30pt · H3 18pt · P1 12pt · P2 8pt — all left-aligned
const SLIDE_STYLES = {
  title:        [{ size: 72, bold: true }, { size: 30 }, { size: 18, italic: true }],
  section:      [{ size: 18 }, { size: 30, bold: true }],
  content:      [{ size: 30, bold: true }, { size: 12 }],
  bullets:      [{ size: 30, bold: true }, { size: 12 }],
  'two-column': [{ size: 30, bold: true }, { size: 18, bold: true }, { size: 12 }, { size: 18, bold: true }, { size: 12 }],
  quote:        [{ size: 18, italic: true }, { size: 12 }],
  closing:      [{ size: 72, bold: true }, { size: 30 }],
};

// ── Template slide text helpers ───────────────────────────────────────────────

// Map layout display names → our slide types
const LAYOUT_TO_TYPE = {
  'Title slide':                  'title',
  'Media.Monks - dark':           'section',
  'Dark':                         'section',
  'Black':                        'closing',
  'Section header':               'section',
  'Section title and description':'section',
  'Title and body':               'content',
  'One column text':              'content',
  'Title only':                   'content',
  'Light-':                       'content',
  'white 1':                      'content',
  'white 1 1':                    'content',
  'Caption':                      'content',
  'Big number':                   'content',
  'Blank 5':                      'content',
  'Title and two columns':        'two-column',
  'Main point':                   'quote',
};

function getTitleText(slide) {
  switch (slide.layout) {
    case 'title':   return slide.headline || '';
    case 'closing': return slide.headline || '';
    case 'quote':   return '';
    default:        return slide.title || '';
  }
}

function getBodyText(slide) {
  switch (slide.layout) {
    case 'title':       return [slide.subtitle, slide.tagline ? `"${slide.tagline}"` : ''].filter(Boolean).join('\n');
    case 'section':     return slide.label || '';
    case 'content':     return slide.body || '';
    case 'bullets':     return (slide.items || []).map(it => `• ${it}`).join('\n');
    case 'two-column':  return `${slide.leftLabel || ''}\n${slide.leftBody || ''}\n\n${slide.rightLabel || ''}\n${slide.rightBody || ''}`;
    case 'quote':       return `"${slide.text || ''}"\n— ${slide.attribution || ''}`;
    case 'closing':     return slide.subline || '';
    default:            return '';
  }
}

// ── Template color + font extraction ─────────────────────────────────────────
async function extractTemplateColors(api, presentationId) {
  const { data: pres } = await api.presentations.get({ presentationId });
  const master = pres.masters?.[0];
  const schemeColors = master?.pageProperties?.colorScheme?.colors || [];
  const bgFill = master?.pageProperties?.pageBackgroundFill;

  const scheme = {};
  schemeColors.forEach(c => {
    if (c.type && c.color?.rgbColor) scheme[c.type] = c.color.rgbColor;
  });

  let masterBgRgb = bgFill?.solidFill?.color?.rgbColor;
  if (!masterBgRgb && bgFill?.solidFill?.color?.themeColor) {
    masterBgRgb = scheme[bgFill.solidFill.color.themeColor] || null;
  }

  const bright = masterBgRgb ? (masterBgRgb.red + masterBgRgb.green + masterBgRgb.blue) / 3 : 0;

  // Extract primary font by scanning master → layout → slide text elements
  let font = null;
  const fontSources = [
    ...(master?.pageElements || []),
    ...(pres.layouts?.[0]?.pageElements || []),
    ...(pres.slides?.[0]?.pageElements || []),
  ];
  for (const el of fontSources) {
    for (const t of (el.shape?.text?.textElements || [])) {
      const ff = t.textRun?.style?.fontFamily;
      if (ff) { font = ff; break; }
    }
    if (font) break;
  }

  const colors = bright > 0.5 ? {
    primary:   scheme['ACCENT2'] || scheme['DARK2'] || { red: 0.1, green: 0.1, blue: 0.1 },
    secondary: scheme['DARK2']   || scheme['ACCENT2'] || null,
    accent:    scheme['ACCENT1'] || null,
    bg:        masterBgRgb || { red: 1, green: 1, blue: 1 },
    text:      scheme['ACCENT2'] || scheme['DARK2'] || { red: 0.13, green: 0.13, blue: 0.13 },
  } : {
    primary:   masterBgRgb || scheme['DARK2'] || null,
    secondary: scheme['ACCENT2'] || scheme['DARK2'] || null,
    accent:    scheme['ACCENT1'] || null,
    bg:        scheme['LIGHT1']  || { red: 1, green: 1, blue: 1 },
    text:      scheme['DARK2']   || { red: 0.2, green: 0.2, blue: 0.2 },
  };

  return { ...colors, font };
}

// ── Template mode: reuse actual template slides ───────────────────────────────
async function buildFromTemplateCopy(api, drive, templateId, slides, branding, title) {
  console.log('[template] copying templateId:', templateId);
  const { data: copy } = await drive.files.copy({
    fileId: templateId,
    requestBody: { name: title || 'Presentation' },
  });
  const pid = copy.id;
  console.log('[template] copied → pid:', pid);

  const { data: pres } = await api.presentations.get({ presentationId: pid });

  // Build layoutId → type map
  const layoutIdToType = {};
  (pres.layouts || []).forEach(l => {
    const name = l.layoutProperties?.displayName || '';
    const type = LAYOUT_TO_TYPE[name];
    if (type) layoutIdToType[l.objectId] = type;
  });

  const tColors = await extractTemplateColors(api, pid);
  console.log('[template] tColors extracted, layoutIdToType:', layoutIdToType);

  // Pool template slides by type — layout name first, background brightness as fallback
  function slideBrightness(s) {
    const rgb = s.pageProperties?.pageBackgroundFill?.solidFill?.color?.rgbColor;
    return rgb ? (rgb.red + rgb.green + rgb.blue) / 3 : null;
  }

  const poolByType = {};
  function addToPool(type, s) {
    if (!poolByType[type]) poolByType[type] = [];
    poolByType[type].push(s);
  }

  pres.slides.forEach(s => {
    const type = layoutIdToType[s.slideProperties?.layoutObjectId];
    if (type) {
      addToPool(type, s);
    } else {
      const b = slideBrightness(s);
      if (b !== null) addToPool(b < 0.5 ? 'section' : 'content', s);
    }
  });
  console.log('[template] pool sizes:', Object.fromEntries(Object.entries(poolByType).map(([k, v]) => [k, v.length])));

  // Assign a template slide to each AI slide — each template slide used at most once
  const usedIds = new Set();
  const assignments = slides.map(aiSlide => {
    const type = aiSlide.layout;
    const pool = poolByType[type] || poolByType['content'] || [];
    const pick = pool.find(s => !usedIds.has(s.objectId));
    if (pick) { usedIds.add(pick.objectId); return { aiSlide, templateSlide: pick }; }
    return { aiSlide, templateSlide: null };
  });

  const keptIds = new Set(assignments.filter(a => a.templateSlide).map(a => a.templateSlide.objectId));

  // Helper: text shapes on a slide sorted top-to-bottom by Y position
  function textShapesOf(slide) {
    return (slide.pageElements || [])
      .filter(el => el.shape?.text?.textElements?.some(te => te.textRun?.content?.trim()))
      .sort((a, b) => (a.transform?.translateY || 0) - (b.transform?.translateY || 0));
  }

  // AI content parts for a slide, ordered title-first
  function contentParts(aiSlide) {
    switch (aiSlide.layout) {
      case 'title':
        return [aiSlide.headline, aiSlide.subtitle, aiSlide.tagline ? `"${aiSlide.tagline}"` : ''].filter(Boolean);
      case 'section':
        return [aiSlide.label, aiSlide.title].filter(Boolean);
      case 'content':
        return [aiSlide.title, aiSlide.body].filter(Boolean);
      case 'bullets':
        return [aiSlide.title, (aiSlide.items || []).join('\n')].filter(Boolean);
      case 'two-column':
        return [aiSlide.title, aiSlide.leftLabel, aiSlide.leftBody, aiSlide.rightLabel, aiSlide.rightBody].filter(Boolean);
      case 'quote':
        return [`"${aiSlide.text || ''}"`, aiSlide.attribution ? `— ${aiSlide.attribution}` : ''].filter(Boolean);
      case 'closing':
        return [aiSlide.headline, aiSlide.subline].filter(Boolean);
      default:
        return [aiSlide.title || aiSlide.headline, aiSlide.body].filter(Boolean);
    }
  }

  // Pass 1: delete unused slides; on kept slides delete images + clear text boxes
  const pass1 = [];
  pres.slides.forEach(s => {
    if (!keptIds.has(s.objectId)) {
      pass1.push(delObj(s.objectId));
    } else {
      (s.pageElements || []).forEach(el => {
        if (el.image) pass1.push(delObj(el.objectId)); // remove images
      });
      textShapesOf(s).forEach(el => {
        pass1.push({ deleteText: { objectId: el.objectId, textRange: { type: 'ALL' } } });
      });
    }
  });

  if (pass1.length) {
    await api.presentations.batchUpdate({ presentationId: pid, requestBody: { requests: pass1 } });
  }

  // Pass 2: insert AI content + apply typography into the same text boxes
  const pass2 = [];
  assignments.forEach(({ aiSlide, templateSlide }) => {
    if (!templateSlide) return;
    const shapes = textShapesOf(templateSlide); // original order, IDs still valid
    const parts  = contentParts(aiSlide);
    const styles = SLIDE_STYLES[aiSlide.layout] || [];
    shapes.forEach((shape, i) => {
      if (i < parts.length && parts[i]) {
        const text      = parts[i];
        const styleSpec = styles[i] || {};
        pass2.push({ insertText: { objectId: shape.objectId, text } });
        if (Object.keys(styleSpec).length) {
          pass2.push(ts(shape.objectId, 0, text.length, styleSpec));
        }
        pass2.push(pa(shape.objectId, 'START')); // always left-align
      }
    });
  });

  if (pass2.length) {
    await api.presentations.batchUpdate({ presentationId: pid, requestBody: { requests: pass2 } });
  }

  // Pass 3: reorder slides one at a time (API requires IDs in current order for bulk moves)
  const orderedIds = assignments.filter(a => a.templateSlide).map(a => a.templateSlide.objectId);
  for (let i = 0; i < orderedIds.length; i++) {
    await api.presentations.batchUpdate({
      presentationId: pid,
      requestBody: { requests: [{ updateSlidesPosition: { slideObjectIds: [orderedIds[i]], insertionIndex: i } }] },
    });
  }

  return { pid, tColors };
}

// ── Main export ───────────────────────────────────────────────────────────────
async function buildPresentation(auth, slides, branding, title, existingId = null, templateId = null, logoPath = null, logoMime = null) {
  _c = 0;
  const { google } = require('googleapis');
  const api = google.slides({ version: 'v1', auth });

  // Extract template colors + font if provided
  let tColors = null;
  if (templateId) {
    try {
      tColors = await extractTemplateColors(api, templateId);
      console.log('[template] extracted — font:', tColors.font);
    } catch (e) {
      console.error('[template] extraction failed, using branding defaults:', e.message);
    }
  }

  // Upload logo to Drive so Google Slides can fetch it via public URL
  let logoUrl = null;
  if (logoPath) {
    try {
      const drive = google.drive({ version: 'v3', auth });
      const { data: file } = await drive.files.create({
        requestBody: { name: 'slide_logo', mimeType: logoMime || 'image/png' },
        media: { mimeType: logoMime || 'image/png', body: require('fs').createReadStream(logoPath) },
      });
      await drive.permissions.create({
        fileId: file.id,
        requestBody: { role: 'reader', type: 'anyone' },
      });
      logoUrl = `https://drive.google.com/uc?export=view&id=${file.id}`;
      console.log('[logo] uploaded, url:', logoUrl);
    } catch (e) {
      console.error('[logo] upload failed (logo skipped):', e.message);
    }
  }

  // Create a fresh presentation (or open an existing one)
  let pid, existingSlideIds;
  if (existingId) {
    const { data: pres } = await api.presentations.get({ presentationId: existingId });
    pid = existingId;
    existingSlideIds = pres.slides.map(s => s.objectId);
  } else {
    const { data: pres } = await api.presentations.create({ requestBody: { title: title || 'Presentation' } });
    pid = pres.presentationId;
    existingSlideIds = pres.slides.map(s => s.objectId);
  }

  const B = {
    primary:   tColors?.primary   || hexToRgb(branding.primaryColor   || '#0F2240'),
    secondary: tColors?.secondary || hexToRgb(branding.secondaryColor || '#1a3a6a'),
    accent:    tColors?.accent    || hexToRgb(branding.accentColor    || '#C9973A'),
    bg:        tColors?.bg        || hexToRgb(branding.bgColor        || '#FFFFFF'),
    text:      tColors?.text      || hexToRgb(branding.textColor      || '#222222'),
    white:     { red: 1, green: 1, blue: 1 },
    lgray:     { red: 0.961, green: 0.961, blue: 0.961 },
    font:      tColors?.font      || branding.font || 'Arial',
    logoUrl,
  };

  const reqs = [];
  existingSlideIds.forEach(id => reqs.push(delObj(id)));
  slides.forEach((slide, i) => {
    const sid = `slide_${i}_${Date.now() + i}`;
    reqs.push(addSlide(sid));
    const renderer = RENDERERS[slide.layout] || renderContent;
    reqs.push(...renderer(sid, slide, B));
  });
  await api.presentations.batchUpdate({ presentationId: pid, requestBody: { requests: reqs } });
  return `https://docs.google.com/presentation/d/${pid}/edit`;
}

// ── Template-in-place mode ────────────────────────────────────────────────────
// Reads the template's per-slide box structure first, then has Claude write copy
// shaped exactly to the number of boxes each slide has — no boxes left as placeholders.
async function buildFromTemplateInPlace(auth, templateId, title, clientName, description, tone, audience) {
  const { google } = require('googleapis');
  const slidesApi = google.slides({ version: 'v1', auth });
  const drive     = google.drive({ version: 'v3', auth });

  // 1. Copy the template so the original is never touched
  const { data: copy } = await drive.files.copy({
    fileId: templateId,
    requestBody: { name: title || 'Presentation' },
  });
  const pid = copy.id;
  console.log('[template-inplace] copied →', pid);

  // 2. Read all slides — extract every text box with font size and position
  const { data: pres } = await slidesApi.presentations.get({ presentationId: pid });

  const slideBoxes = pres.slides.map((slide, slideIndex) => {
    const boxes = (slide.pageElements || [])
      .map(el => {
        if (!el.shape?.text?.textElements) return null;
        const runs = el.shape.text.textElements.filter(te => te.textRun?.content);
        const text = runs.map(te => te.textRun.content).join('').replace(/\n$/, '').trim();
        if (!text) return null;
        // Skip purely decorative elements: numbers, symbols, single characters
        if (/^[\d\s.,\-+%$€£¥\/\\|@#&*^~`!?]+$/.test(text)) return null;
        if (text.length < 2) return null;
        const wordCount = text.split(/\s+/).filter(Boolean).length;
        // Font size signals role: large = headline, medium = subheading, small = body
        const fontSize = runs.find(r => r.textRun?.style?.fontSize?.magnitude)
          ?.textRun?.style?.fontSize?.magnitude || 12;
        const y = el.transform?.translateY || 0;
        return { objectId: el.objectId, text, wordCount, fontSize, y };
      })
      .filter(Boolean)
      .sort((a, b) => a.y - b.y); // top-to-bottom reading order
    return { slideIndex, boxes };
  }).filter(s => s.boxes.length > 0);

  const totalBoxes = slideBoxes.reduce((n, s) => n + s.boxes.length, 0);
  console.log('[template-inplace] slides with content:', slideBoxes.length, '| total boxes:', totalBoxes);
  if (!totalBoxes) return `https://docs.google.com/presentation/d/${pid}/edit`;

  // 3. Build structured template description for Claude
  // Font size thresholds → role hints so Claude knows what each box is for
  const roleHint = (fontSize, wordCount) => {
    if (fontSize >= 28 || (wordCount <= 4 && fontSize >= 20)) return 'headline';
    if (fontSize >= 18) return 'subheading';
    return 'body';
  };

  const templateDesc = slideBoxes.map(({ slideIndex, boxes }) => {
    const lines = boxes.map((b, i) =>
      `  Box ${i + 1} [id:${b.objectId}] max ${b.wordCount} words (${roleHint(b.fontSize, b.wordCount)}): "${b.text}"`
    ).join('\n');
    return `Slide ${slideIndex + 1} — ${boxes.length} box${boxes.length !== 1 ? 'es' : ''}:\n${lines}`;
  }).join('\n\n');

  // 4. Batch Claude calls — 6 slides per batch so output stays within token limits
  const Anthropic = require('@anthropic-ai/sdk');
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const BATCH_SIZE = 4;
  const totalSlides = slideBoxes.length;
  const allReplacements = [];

  for (let i = 0; i < slideBoxes.length; i += BATCH_SIZE) {
    const batch = slideBoxes.slice(i, i + BATCH_SIZE);
    const firstSlide = batch[0].slideIndex + 1;
    const lastSlide  = batch[batch.length - 1].slideIndex + 1;
    const position   = firstSlide === 1 ? 'opening' : lastSlide === totalSlides ? 'closing' : 'middle';

    const batchDesc = batch.map(({ slideIndex, boxes }) => {
      const lines = boxes.map((b, j) =>
        `  Box ${j + 1} [id:${b.objectId}] max ${b.wordCount} words (${roleHint(b.fontSize, b.wordCount)}): "${b.text}"`
      ).join('\n');
      return `Slide ${slideIndex + 1}:\n${lines}`;
    }).join('\n\n');

    console.log(`[template-inplace] batch ${Math.floor(i / BATCH_SIZE) + 1}: slides ${firstSlide}–${lastSlide}`);

    const claudeRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: `You are a presentation copywriter writing slides ${firstSlide}–${lastSlide} of a ${totalSlides}-slide deck (${position} section).

Output: a valid JSON array only — no markdown, no explanation, nothing else.
Each item: { "objectId": "...", "text": "..." }

Rules:
- The number of boxes on each slide = the number of points to make on that slide. Match it exactly.
- Box roles: headline = punchy insight-led copy; subheading = supporting context; body = detail and evidence.
- Never exceed the word count limit for any box.
- Fill every box — no placeholder text left behind.
- Write for the ${position} of the presentation — calibrate energy and depth accordingly.`,
      messages: [{
        role: 'user',
        content: `Write copy for slides ${firstSlide}–${lastSlide} of ${totalSlides}.

Client: ${clientName || 'Client'}
Title: ${title || 'Presentation'}
Tone: ${tone || 'Professional'}
Audience: ${audience || 'General'}

Brief:
${description}

Slides to fill (number of boxes = number of points needed):
${batchDesc}

Return JSON: [{ "objectId": "...", "text": "..." }, ...]`,
      }],
    });

    try {
      const raw = claudeRes.content[0].text.trim().replace(/^```[\w]*\r?\n?/, '').replace(/\r?\n?```$/, '').trim();
      const batchResult = JSON.parse(raw);
      allReplacements.push(...batchResult);
    } catch {
      console.error(`[template-inplace] batch ${Math.floor(i / BATCH_SIZE) + 1} parse failed:`, claudeRes.content[0].text.slice(0, 300));
      throw new Error('Failed to parse AI-generated copy for template.');
    }
  }

  const replacements = allReplacements;

  // 5. Delete existing text + insert new copy for each box
  const requests = [];
  replacements.forEach(({ objectId, text }) => {
    if (!text) return;
    requests.push({ deleteText: { objectId, textRange: { type: 'ALL' } } });
    requests.push({ insertText: { objectId, insertionIndex: 0, text: String(text).trim() } });
  });

  if (requests.length) {
    await slidesApi.presentations.batchUpdate({ presentationId: pid, requestBody: { requests } });
    console.log('[template-inplace] applied', requests.length / 2, 'replacements');
  }

  return `https://docs.google.com/presentation/d/${pid}/edit`;
}

module.exports = { buildPresentation, extractTemplateColors, buildFromTemplateInPlace };
