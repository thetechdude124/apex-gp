// Circuits, defined as filleted polygons: [x, y, cornerRadius] in metres.
// The racing surface is the smooth path that runs straight between vertices and arcs
// around each vertex with the given radius. elev: [lap fraction, metres] keyframes.
import { SKETCH_PATH } from './track_sketch.js';

export const TRACKS = [
  {
    id: 'vallmar',
    name: 'Circuito de Vallmar',
    country: 'Mediterranean coast',
    blurb: 'Fast and flowing. A 1.1 km pit straight into a heavy T1 stop, a tight hairpin, a chicane and high-speed esses.',
    width: 14,
    startOffset: 520,
    poly: [
      [0, 0, 95],
      [1250, 0, 42],
      [1330, -260, 75],
      [1750, -330, 320],
      [2150, -560, 19],
      [1500, -640, 34],
      [1440, -740, 34],
      [1050, -760, 190],
      [800, -640, 165],
      [520, -760, 175],
      [180, -720, 78],
      [-80, -480, 115],
      [-160, -220, 95],
    ],
    elev: [[0, 0], [0.12, 5], [0.25, 12], [0.38, 16], [0.5, 8], [0.62, 2], [0.75, -4], [0.88, -2]],
    scenery: 'med',
    time: 'day',
  },
  {
    id: 'hallberg',
    name: 'Hallberg Waldring',
    country: 'Central-European forest',
    blurb: 'Old-school and narrow. Big elevation, a downhill corkscrew, a slow hairpin and walls close to the road.',
    width: 12.5,
    startOffset: 340,
    wallBase: 14,
    runoff: 24,
    poly: [
      [0, 0, 60],
      [900, 0, 28],
      [980, 250, 130],
      [800, 520, 140],
      [950, 800, 55],
      [700, 1000, 26],
      [620, 900, 30],
      [300, 950, 250],
      [-150, 1100, 24],
      [-100, 700, 90],
      [-300, 450, 85],
      [-250, 180, 70],
    ],
    elev: [[0, 0], [0.1, -4], [0.2, 6], [0.32, 20], [0.42, 30], [0.5, 14], [0.6, 4], [0.72, -8], [0.86, -6]],
    scenery: 'forest',
    time: 'overcast',
  },
  {
    // Layout follows the circuit at Spielberg, Styria (corner positions fitted to a public
    // centreline survey, then scaled 1.1% to the real 4.318 km lap).
    id: 'spielberg',
    name: 'Spielberg Ring',
    country: 'Styria, Austria',
    blurb: 'Short, steep and flat-out. Three long uphill straights into heavy stops, then a rollercoaster of fast downhill sweeps back to the line.',
    width: 13,
    startOffset: 366,
    drsZones: 3,
    poly: [
      [211, 56, 305],     // T10 opens onto the pit straight
      [-437, -118, 41],   // T1: tight uphill right
      [-625, 145, 914],
      [-775, 458, 731],   // T2: flat-out left kink on the climb
      [-996, 682, 25],    // T3: hairpin at the top of the hill
      [-756, 687, 914],
      [-415, 620, 1016],
      [-117, 607, 38],    // T4: downhill right
      [-273, 436, 244],   // T5: long right sweep
      [-694, 513, 78],    // T6: fast left
      [-481, 136, 81],    // T7: fast left
      [-343, 315, 142],   // T8: right kink
      [246, 326, 89],     // T9: fast downhill right
      [309, 111, 63],     // T10: final right
    ],
    // lap fraction of each corner: T1 0.08, T2 0.20, T3 0.30, T4 0.49, T5 0.56, T6 0.61, T7 0.68, T8 0.78, T9 0.85, T10 0.90
    // steep climb into T1, the big climb through T2 to the top at T3, a plunge to T4, back up
    // through T5 and T6, down through T7, a crest at T9 and downhill through T10 to the line
    elev: [[0, 0], [0.045, 4], [0.08, 15], [0.12, 25], [0.20, 49], [0.30, 80], [0.335, 78], [0.40, 60], [0.49, 40],
      [0.53, 39], [0.565, 46], [0.61, 55], [0.685, 35], [0.78, 28], [0.825, 33], [0.855, 32], [0.90, 15], [0.95, 4]],
    scenery: 'alpine',
    time: 'day',
  },
  {
    // Layout follows the circuit at Montmelo, Catalonia, in its current form without the final
    // chicane and with the reprofiled hairpin (fitted to a public centreline survey of the older
    // layout, final sector redrawn; scaled 1.4% to the real 4.657 km lap).
    id: 'montmelo',
    name: 'Circuit de Montmeló',
    country: 'Catalonia, Spain',
    blurb: 'The complete test of a car. A one-kilometre straight, the endless fast right of Turn 3, a blind crest, and a final sector you take almost flat.',
    width: 13,
    startOffset: 400,
    drsZones: 2,
    drsMin: 360, // the back straight into the hairpin is a real DRS zone but only ~440 m long
    poly: [
      [181, 282, 114],    // T14: fast right onto the pit straight
      [-459, -714, 39],   // T1: right
      [-567, -671, 71],   // T2: left
      [-698, -763, 94],   // T3: the long right-hander ...
      [-806, -741, 108],
      [-850, -623, 142],
      [-820, -521, 224],  // ... opening out
      [-641, -242, 54],   // T4: slow right
      [-538, -356, 97],
      [-746, -676, 39],   // T5: downhill left
      [-450, -546, 214],  // T6: left kink
      [-348, -391, 51],   // T7: uphill left
      [-429, -323, 92],   // T8: right
      [-538, -62, 107],   // T9: fast blind right over the crest
      [88, 245, 43],      // T10: wide left hairpin
      [-109, 273, 92],    // T11: left
      [-227, 189, 55],    // T12: long right ...
      [-277, 294, 55],
      [-85, 450, 90],     // T13: right
    ],
    elev: [[0, 0], [0.09, -3], [0.18, -5], [0.25, 0], [0.31, 6], [0.38, 12], [0.455, 4], [0.5, 5], [0.55, 9], [0.62, 20], [0.69, 11], [0.75, 2], [0.82, 14], [0.87, 10], [0.94, 3]],
    scenery: 'catalan',
    time: 'day',
  },
  {
    id: 'sketch',
    name: 'Sketchbook Circuit',
    country: 'Drawn by hand',
    blurb: 'Traced from a pencil sketch. A long pit straight into a sharp hairpin, then a tight, twisting infield where the road doubles back on itself.',
    width: 12,
    startOffset: 385,
    path: SKETCH_PATH,
    smooth: 60,
    pitSide: 1,
    pitScale: 0.82,
    wallBase: 13.5,
    runoff: 22,
    drsZones: 1,
    drsMin: 240,
    drsCurv: 1 / 360,
    elev: [[0, 0], [0.15, 3], [0.3, 8], [0.45, 11], [0.6, 5], [0.75, -2], [0.9, -1]],
    scenery: 'med',
    time: 'day',
  },
];
