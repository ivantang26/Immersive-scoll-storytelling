// Product facts shared by the specs page, configurator, press kit and booking flow.
// Vela is a fictional product; figures are the launch spec agreed in the PRD plus plausible fills.

export const PRODUCT = {
  name: 'Vela',
  price: 3400,
  currency: 'GBP',
};

export const KEY_SPECS = [
  { value: '120', unit: 'km', label: 'Range', note: 'Eco mode, 75 kg rider, mixed urban riding.' },
  { value: '16.8', unit: 'kg', label: 'Weight', note: 'Size M with battery, without accessories.' },
  { value: '25', unit: 'km/h', label: 'Assisted speed', note: 'UK and EU legal limit for e-bikes.' },
  { value: '3.5', unit: 'h', label: 'Full charge', note: 'From empty, with the included 4 A charger.' },
];

export const SPEC_GROUPS = [
  {
    title: 'Motor and battery',
    rows: [
      ['Motor', '250 W rear hub, 45 Nm, torque sensing'],
      ['Battery', '540 Wh lithium-ion, integrated in the down tube, removable with key'],
      ['Assist modes', 'Eco, Tour, Boost, plus walk assist'],
      ['Charger', '4 A, 0 to 100% in 3.5 hours'],
    ],
  },
  {
    title: 'Frame and fit',
    rows: [
      ['Frame', 'Hydroformed 6061 aluminium, internal routing, copper inlay'],
      ['Fork', 'Aluminium, tapered steerer, rack and basket mounts'],
      ['Sizes', 'S (155 to 170 cm), M (168 to 183 cm), L (180 to 195 cm)'],
      ['Max. system weight', '130 kg including rider and luggage'],
    ],
  },
  {
    title: 'Drive and brakes',
    rows: [
      ['Drive', 'Carbon belt drive, 5-speed internal hub'],
      ['Brakes', 'Hydraulic disc, 160 mm rotors'],
      ['Wheels and tyres', '700c, 42 mm puncture-resistant reflective tyres'],
      ['Fenders', 'Full-length aluminium, colour matched'],
    ],
  },
  {
    title: 'Lights and tech',
    rows: [
      ['Front light', '80 lux, integrated in the head tube'],
      ['Rear light', 'Integrated in the seat stay junction, brake-activated'],
      ['Display', 'Top tube status bar with battery level and assist mode'],
      ['App', 'Ride stats, lock, firmware updates over Bluetooth'],
    ],
  },
];

export const GEOMETRY = {
  columns: ['S', 'M', 'L'],
  rows: [
    ['Rider height', '155-170 cm', '168-183 cm', '180-195 cm'],
    ['Seat tube', '470 mm', '520 mm', '570 mm'],
    ['Effective top tube', '545 mm', '575 mm', '605 mm'],
    ['Stack', '590 mm', '620 mm', '650 mm'],
    ['Reach', '375 mm', '390 mm', '405 mm'],
    ['Wheelbase', '1,070 mm', '1,090 mm', '1,115 mm'],
  ],
};

export const COLOURWAYS = [
  { id: 'obsidian', name: 'Obsidian', swatch: '#2a2b31', paint: '#2a2b31' },
  { id: 'bone', name: 'Bone', swatch: '#d9d3c8', paint: '#d9d3c8' },
  { id: 'tidewater', name: 'Tidewater', swatch: '#3d5561', paint: '#3d5561' },
];

export const ACCESSORIES = [
  { id: 'rack', name: 'Rear rack', price: 120, note: '25 kg load, pannier rails' },
  { id: 'basket', name: 'Front basket', price: 85, note: 'Frame-mounted, steers with the bike, not the bars' },
];

export const formatGBP = (n) => '£' + n.toLocaleString('en-GB');
