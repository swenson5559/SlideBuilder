# Deck Builder Skill

You are a specialist in the SlideBuilder project — an AI-powered Google Slides generator built with Node.js + Express + Google Slides API v1 + Anthropic Claude API.

When this skill is invoked, help the user with any deck-building task: writing slide content, refining prompts, adding new layouts, fixing rendering bugs, or designing new visual styles.

---

## Project structure

```
/Users/topochico/Documents/SlideBuilder/
├── server.js          — Express server, OAuth, /generate route, Claude API call
├── slideBuilder.js    — All Google Slides API rendering logic
├── public/
│   ├── index.html     — UI form
│   └── app.js         — Frontend JS
└── .env               — ANTHROPIC_API_KEY, PORT
```

---

## Slide layout schemas (what Claude generates, what the renderers consume)

```json
{ "layout": "title",   "headline": "...",  "tagline": "..." }
{ "layout": "chapter", "title": "...",     "description": "..." }
{ "layout": "content", "title": "...",     "subtopics": [{ "heading": "...", "text": "..." }] }
{ "layout": "closing", "headline": "...",  "subline": "..." }
```

**Deck structure rule:** title → (chapter → 2–3 content slides) × N chapters → closing

---

## Typography approach

Font sizes are chosen per layout — no rigid token system. The rule is: clear hierarchy in every slide (title > subtitle > body). Representative sizes by role:

- **Display headline** (title, closing, big-statement): ~76–96pt bold — maximum impact
- **Chapter title**: ~40pt — commands the room, no header bar to share space with
- **Header bar label**: ~24pt — fits the 52pt-tall header bar without cramping
- **Subtopic / column headings**: ~16–18pt — clearly above body, below header
- **Body / description text**: ~13–15pt — readable, generous line height implied
- **Captions / supporting notes**: ~11–12pt

No italics. All text left-aligned (START) except centered labels in constrained contexts (stat, metrics, timeline circles).

---

## Branding object (B) passed to every renderer

```js
B = {
  primary,    // dark bg color — used on title, chapter, closing slides
  accent,     // highlight color — used on panels, rules, card bars
  bg,         // light bg — used on content slides
  text,       // body text color on light slides
  white,      // { red:1, green:1, blue:1 }
  font,       // font family string (from template or user selection)
  logoUrl,    // public Drive URL of uploaded logo, or null
}
```

Colors are `{ red, green, blue }` objects (0–1 range), sourced from the template URL if provided, otherwise from the UI color pickers.

---

## Renderer designs

### Title (`renderTitle`)
- Full-slide primary-color background
- Right accent panel (x=490, w=230, full height)
- Decorative semi-transparent circle inside panel
- Small 2px accent rule above headline (x=40, y=50)
- H1 headline in left portion (x=40, w=425)
- P1 tagline below (x=40, y=282)
- Logo image in right panel if `B.logoUrl` is set

### Chapter (`renderChapter`)
- Full-slide primary background
- Left accent panel (x=0, w=180, full height)
- Decorative semi-transparent circle overlapping panel
- H2 title right of panel (x=210)
- P1 description below title

### Content (`renderContent`)
- Light (bg-color) background
- Primary-color header bar (full width, h=52) with H2 title
- Thin accent line under header (h=3)
- Subtopic cards below: accent bar cap (3px) → H3 heading → P1 text
- 4 subtopics → 2×2 grid; 1–3 → single column stacked

### Closing (`renderClosing`)
- Mirrors title layout exactly

---

## Key API helpers in slideBuilder.js

```js
rect(sid, oid, l, t, w, h)        // create rectangle shape
ellipse(sid, oid, l, t, w, h)     // create ellipse shape
fill(oid, color)                   // solid fill
ghostFill(oid, color, alpha)       // semi-transparent fill + no outline
noLine(oid)                        // remove outline
tBox(sid, l, t, w, h, text, style, align, vAlign)  // transparent text box
ins(oid, text)                     // insertText
ts(oid, start, end, opts)          // updateTextStyle {bold, size, color, font}
pa(oid, alignment)                 // updateParagraphStyle (START = left)
va(oid, alignment)                 // shape vertical alignment
```

Coordinate units: our 720×405 space → multiply by 12700 to get EMU.
`E(n)` does that conversion.

---

## Common tasks you can help with

- **Add a new layout**: define the JSON schema, write a renderer function following the pattern above, add it to `RENDERERS`, update the Claude prompt in server.js
- **Improve slide content**: rewrite or critique the Claude system/user prompt in server.js to produce better-structured, more compelling decks
- **Fix a rendering bug**: read slideBuilder.js, trace the shape/text request sequence, identify coordinate or API field errors
- **Adjust typography**: change size/weight values in renderer functions — remember no italics, only H1 is bold
- **Template colors**: `extractTemplateColors()` in slideBuilder.js reads the Google Slides master slide color scheme and font; tweak the LIGHT1/DARK2/ACCENT1/ACCENT2 mapping there
- **Test slide JSON**: generate a raw JSON array in the correct schema to paste into a test or to manually call `buildPresentation()`

---

## Presentation design principles to apply

- **One idea per slide** — if a slide needs more than one H3, consider splitting it
- **Headline = the takeaway**, not the topic label (e.g. "Revenue grew 40%" not "Revenue")
- **Chapter slides** should frame a question or tension, not just name a topic
- **Subtopic text** should support the heading, not repeat it
- **Deck arc**: problem → evidence → solution → proof → call to action
- **Vary subtopic count** (2, 3, 4) across content slides for visual rhythm — avoid all-same grids
