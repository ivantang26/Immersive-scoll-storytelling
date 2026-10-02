// FR-1: the story is defined as data. Each scene is a tall scroll container (height in vh at
// desktop size) with a sticky full-screen stage; the engine exposes progress 0-1 to scene code.
// Beats are DOM text (never canvas text) shown between `start` and `end` progress.

export const SCENES = [
  {
    id: 'arrival',
    name: 'Arrival',
    type: 'arrival',
    height: 100,
    still: null,
  },
  {
    id: 'assembly',
    name: 'Assembly',
    type: 'sequence',
    height: 400,
    sequence: 'assembly',
    still: 'assembly',
    stillAlt: 'Exploded view of the Vela: frame, wheels, hub motor, battery, belt drive and handlebars separated around the frame.',
    align: 'left',
    focus: { desktop: [0.6, 0.5], tablet: [0.5, 0.42], mobile: [0.5, 0.38] },
    beats: [
      { start: 0.14, end: 0.34, title: 'Built around one frame.', body: 'Hand-finished aluminium, with every cable and wire routed inside it.' },
      { start: 0.44, end: 0.64, title: 'Power you can’t see.', body: 'A 250 W rear hub motor, and a 540 Wh battery sealed into the down tube.' },
      { start: 0.74, end: 0.96, title: 'Nothing to oil. Nothing to snag.', body: 'Carbon belt drive, integrated lights and a cockpit with no loose ends.' },
    ],
  },
  {
    id: 'turntable',
    name: 'Turntable',
    type: 'turntable',
    height: 250,
    sequence: 'turntable',
    still: 'turntable',
    stillAlt: 'The Vela in Obsidian, seen from the front three-quarter angle with its lights on.',
    align: 'right',
    focus: { desktop: [0.42, 0.5], tablet: [0.5, 0.42], mobile: [0.5, 0.36] },
    callouts: [
      { id: 'battery', start: 0.02, end: 0.22, title: 'Hidden battery', body: '540 Wh in the down tube. Removable with a key, charges on or off the bike.' },
      { id: 'lights', start: 0.6, end: 0.8, title: 'Integrated lights', body: 'Front and rear lights wired through the frame, powered by the main battery.' },
      { id: 'belt', start: 0.82, end: 0.99, title: 'Carbon belt drive', body: 'Silent and grease-free. Outlasts a chain several times over.' },
    ],
  },
  {
    id: 'city',
    name: 'City ride',
    type: 'video',
    height: 400,
    video: 'city',
    still: 'city',
    stillAlt: 'A rider on the Vela at dusk, headlight on, passing lit apartment blocks.',
    align: 'right',
    beats: [
      { start: 0.08, end: 0.32, stat: '120 km', title: 'Range on one charge.', body: 'Enough for a week of 10 km commutes, in Eco mode.' },
      { start: 0.4, end: 0.64, stat: '16.8 kg', title: 'Light enough to carry.', body: 'Up the stairs to the flat, or onto the train.' },
      { start: 0.72, end: 0.96, stat: '25 km/h', title: 'Assisted top speed.', body: 'The UK legal limit, reached without breaking a sweat.' },
    ],
  },
  {
    id: 'specs',
    name: 'Specs',
    type: 'specs',
    height: 200,
    stats: [
      { value: 120, decimals: 0, unit: 'km', label: 'Range' },
      { value: 16.8, decimals: 1, unit: 'kg', label: 'Weight' },
      { value: 25, decimals: 0, unit: 'km/h', label: 'Assisted speed' },
      { value: 3.5, decimals: 1, unit: 'h', label: 'Full charge' },
    ],
  },
  {
    id: 'colourways',
    name: 'Colourways',
    type: 'colourways',
    height: 150,
    items: [
      { id: 'obsidian', name: 'Obsidian', swatch: '#2a2b31', body: 'Graphite black with copper detailing.' },
      { id: 'bone', name: 'Bone', swatch: '#d9d3c8', body: 'Warm off-white with copper detailing.' },
      { id: 'tidewater', name: 'Tidewater', swatch: '#3d5561', body: 'Deep blue-grey with copper detailing.' },
    ],
  },
  {
    id: 'cta',
    name: 'Ride it',
    type: 'cta',
    height: 100,
    still: 'cta',
    stillAlt: '',
  },
];

export const PRICE_FROM = 3400;
