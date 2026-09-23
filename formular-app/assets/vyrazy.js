// Výrazy bota ZandaVisuals — převzaté 1:1 z reakcí Samolepka 06
// (znacka/ikony-a-reakce/catalog.json, R01–R30, mřížka 64 × 64).
//
// Každý výraz je rozdělený na části obličeje, aby se daly plynule přelévat:
//   eyeL / eyeR  — až 2 tahy (hlavní tah vždy první, morfuje se s ostatními očima)
//   browL / browR, cheekL / cheekR, bridge — 1 tah
//   mouth        — až 5 tahů (hlavní tah první)
//   decor        — doplňky mimo obličej; nemorfují se, mají vlastní animaci
//
// Tah je buď SVG path `d` s jednou podcestou, nebo kruh { c: [cx, cy, r] }.
// Geometrie odpovídá katalogu; relativní příkazy mezi podcestami jsou jen
// přepsané na absolutní začátky.

const V_L = 'M23 27v4'
const V_R = 'M41 27v4'
const HAPPY_L = 'M19 29l5-4 5 4'
const HAPPY_R = 'M35 29l5-4 5 4'
const CLOSED_L = 'M20 29q4 4 8 0'
const CLOSED_R = 'M36 29q4 4 8 0'
const DOT_L = { c: [24, 28, 3] }
const DOT_R = { c: [40, 28, 3] }
const LID_L = ['M24 28v3', 'M19 27h10']
const LID_R = ['M40 28v3', 'M35 27h10']
const LOW_L = 'M24 29v3'
const LOW_R = 'M40 29v3'
const WINK_R = 'M35 29q5-5 10 0'
const SMILE = 'M23 40q9 10 18 0'
const GRIN = 'M21 39h22q-2 14-11 14T21 39Z'
const FLAT = 'M25 43h14'
const WAVE = 'M22 43q3-4 6 0t6 0 6 0'
const FROWN = 'M24 45q8-9 16 0'
const SAD_BL = 'M19 24l9-3'
const SAD_BR = 'M36 21l9 3'
const ANGRY_BL = 'M19 23l10 4'
const ANGRY_BR = 'M35 27l10-4'

export const VYRAZY = [
  { id: 'R01', name: 'Soustředím se', use: 'Práce bez vyrušování',
    eyeL: V_L, eyeR: V_R, browL: 'M17 19h12', browR: 'M35 19h12', mouth: FLAT,
    motion: 'focus' },
  { id: 'R02', name: 'To sedí', use: 'Souhlas s návrhem',
    eyeL: HAPPY_L, eyeR: HAPPY_R, mouth: SMILE, blink: false, motion: 'nod', energy: 0.6 },
  { id: 'R03', name: 'Přemýšlím', use: 'Zvažování řešení',
    eyeL: LID_L, eyeR: LID_R, mouth: WAVE, motion: 'think',
    decor: [{ type: 'bubbles', d: [{ c: [51, 12, 3] }, { c: [57, 7, 2] }], at: [52, 12] }] },
  { id: 'R04', name: 'Ještě jednou', use: 'Další pokus, revize',
    eyeL: V_L, eyeR: V_R, mouth: WAVE, motion: 'retry', energy: 0.5,
    decor: [{ type: 'retry', d: ['M9 19q2-12 16-13M9 19l-3-8m3 8 8-3'], at: [15, 13] }] },
  { id: 'R05', name: 'Hotovo', use: 'Dokončená práce',
    eyeL: 'M18 28l5 5 8-10', eyeR: 'M34 28l5 5 8-10', mouth: GRIN, blink: false,
    motion: 'nod2', energy: 0.8 },
  { id: 'R06', name: 'Mám nápad', use: 'Nový námět',
    eyeL: DOT_L, eyeR: DOT_R, mouth: SMILE, motion: 'idea', energy: 1,
    decor: [{ type: 'idea', d: ['M32 2v5M13 8l4 4M51 8l-4 4'], at: [32, 14] }] },
  { id: 'R07', name: 'Nadšení', use: 'Radost z výsledku',
    eyeL: 'M24 19l2 5 6 1-5 4 1 6-4-3-5 3 2-6-5-4 6-1Z',
    eyeR: 'M40 19l2 5 6 1-5 4 1 6-4-3-5 3 2-6-5-4 6-1Z',
    mouth: GRIN, blink: false, motion: 'bounce', energy: 1, eyeFx: 'twinkle' },
  { id: 'R08', name: 'Díky', use: 'Poděkování',
    eyeL: CLOSED_L, eyeR: CLOSED_R, mouth: SMILE, blink: false, motion: 'bow',
    decor: [{ type: 'sparkle', d: ['M52 15l2-3 2 3-2 4Z'], at: [54, 15] }] },
  { id: 'R09', name: 'Směju se', use: 'Vtip a odlehčení',
    eyeL: HAPPY_L, eyeR: HAPPY_R, mouth: GRIN, cheekL: 'M14 32q-6 8 0 9', cheekR: 'M50 32q6 8 0 9',
    blink: false, motion: 'laugh', energy: 0.9 },
  { id: 'R10', name: 'Mrknutí', use: 'Drobný vtípek',
    eyeL: 'M23 27v4', eyeR: WINK_R, mouth: SMILE, blink: false, motion: 'wink', energy: 0.4 },
  { id: 'R11', name: 'Miluju to', use: 'Silný souhlas',
    eyeL: 'M24 32l-6-6q-2-6 4-4l2 2 2-2q6-2 4 4Z',
    eyeR: 'M40 32l-6-6q-2-6 4-4l2 2 2-2q6-2 4 4Z',
    mouth: SMILE, blink: false, motion: 'heartbeat', energy: 0.7, eyeFx: 'beat' },
  { id: 'R12', name: 'Wow', use: 'Překvapení',
    eyeL: DOT_L, eyeR: DOT_R, browL: 'M20 18h8', browR: 'M36 18h8', mouth: { c: [32, 43, 5] },
    motion: 'wow', energy: 1 },
  { id: 'R13', name: 'V klidu', use: 'Pohoda, jistota',
    eyeL: 'M17 25h13v9H19Z', eyeR: 'M34 25h13l-2 9H34Z', bridge: 'M30 27h4', mouth: SMILE,
    blink: false, motion: 'groove', energy: 0.5 },
  { id: 'R14', name: 'Čekám', use: 'Čekání na podklady',
    eyeL: LID_L, eyeR: LID_R, mouth: FLAT, motion: 'wait' },
  { id: 'R15', name: 'Nestíhám', use: 'Pocit časového tlaku',
    eyeL: DOT_L, eyeR: DOT_R, mouth: WAVE, motion: 'rush', energy: 0.6,
    decor: [{ type: 'sweat', d: ['M51 16q-7 8 0 8t0-8Z'], at: [51, 20] }] },
  { id: 'R16', name: 'Potřebuju pauzu', use: 'Odpočinek',
    eyeL: CLOSED_L, eyeR: CLOSED_R, mouth: { c: [32, 43, 2] }, blink: false, motion: 'sleep',
    decor: [{ type: 'zzz', d: ['M46 9h8l-8 7h8'], at: [50, 12] }] },
  { id: 'R17', name: 'Nevím', use: 'Chybějící odpověď',
    eyeL: LOW_L, eyeR: LOW_R, browL: SAD_BL, browR: SAD_BR, mouth: WAVE, motion: 'shrug',
    decor: [{ type: 'question', d: ['M50 7q7-3 7 2 0 3-4 4m0 4v.2'], at: [53, 17] }] },
  { id: 'R18', name: 'Nesedí mi to', use: 'Nesouhlas s řešením',
    eyeL: LID_L, eyeR: LID_R, mouth: FROWN, motion: 'shake', energy: 0.3 },
  { id: 'R19', name: 'Tohle bolí', use: 'Zklamání',
    eyeL: LOW_L, eyeR: LOW_R, browL: SAD_BL, browR: SAD_BR, mouth: FROWN, motion: 'sag',
    decor: [{ type: 'tear', d: ['M46 34q-5 7 0 7t0-7Z'], at: [46, 38], face: true }] },
  { id: 'R20', name: 'Frustrace', use: 'Překážka při práci',
    eyeL: LOW_L, eyeR: LOW_R, browL: ANGRY_BL, browR: ANGRY_BR, mouth: FLAT, motion: 'tremble' },
  { id: 'R21', name: 'Přetížení', use: 'Příliš mnoho podnětů',
    eyeL: ['M20 25l8 8', 'M28 25l-8 8'], eyeR: ['M36 25l8 8', 'M44 25l-8 8'], mouth: WAVE,
    blink: false, motion: 'dizzy', energy: 0.5, eyeFx: 'spin' },
  { id: 'R22', name: 'Oslava', use: 'Milník a úspěch',
    eyeL: HAPPY_L, eyeR: HAPPY_R, mouth: GRIN, blink: false, motion: 'party', energy: 1,
    decor: [
      { type: 'hat', d: ['M19 16L32 2l13 14Z'], at: [32, 16] },
      { type: 'burst', d: ['M9 12v4M55 12v4M3 24h4M57 24h4'], at: [32, 20] }
    ] },
  { id: 'R23', name: 'Jdeme na to', use: 'Energie do práce',
    eyeL: LOW_L, eyeR: LOW_R, browL: ANGRY_BL, browR: ANGRY_BR, mouth: SMILE, motion: 'charge', energy: 1,
    decor: [{ type: 'bolt', d: ['M51 5l-5 10h6l-3 10 12-15h-7l3-5'], at: [53, 15] }] },
  { id: 'R24', name: 'Vidím tě', use: 'Všímám si detailu',
    eyeL: DOT_L, eyeR: DOT_R, mouth: FLAT, motion: 'watch' },
  { id: 'R25', name: 'Potichu', use: 'Důvěrnost, soustředění',
    eyeL: V_L, eyeR: V_R, mouth: ['M22 43h20', 'M25 40v6', 'M30 40v6', 'M35 40v6', 'M40 40v6'],
    motion: 'hush' },
  { id: 'R26', name: 'Trapas', use: 'Rozpaky',
    eyeL: DOT_L, eyeR: DOT_R, mouth: WAVE, cheekL: 'M16 35h6', cheekR: 'M42 35h6',
    motion: 'shy', cheekFx: 'blush' },
  { id: 'R27', name: 'Zvědavost', use: 'Chci zjistit víc',
    eyeL: 'M23 27v4', eyeR: WINK_R, browR: 'M34 19q7-4 12 0', mouth: { c: [32, 43, 2] },
    motion: 'curious' },
  { id: 'R28', name: 'Hrdost', use: 'Spokojenost s prací',
    eyeL: CLOSED_L, eyeR: CLOSED_R, mouth: GRIN, blink: false, motion: 'proud', energy: 0.5 },
  { id: 'R29', name: 'Hravost', use: 'Lehkost a experiment',
    eyeL: 'M23 27v4', eyeR: WINK_R, mouth: ['M23 39h18', 'M30 39v7a4 4 0 0 0 8 0v-7'],
    blink: false, motion: 'playful', energy: 0.7, mouthFx: 'tongue' },
  { id: 'R30', name: 'Úleva', use: 'Povedlo se to vyřešit',
    eyeL: CLOSED_L, eyeR: CLOSED_R, mouth: SMILE, blink: false, motion: 'relief', energy: 0.3,
    decor: [{ type: 'whoosh', d: ['M49 39q9-2 11 3m-9 3q7-1 10 3'], at: [54, 42] }] }
]

export const VYRAZY_PODLE_ID = Object.fromEntries(VYRAZY.map((v) => [v.id, v]))
