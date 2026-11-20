// Spa-Francorchamps GP centerline projected into local east/north metres from bacinger/f1-circuits
// https://github.com/bacinger/f1-circuits/blob/master/circuits/be-1925.geojson
/*
Copyright (c) 2019-2025 Tomislav Bacinger

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
export const SPA_LENGTH = 7004;

export const SPA_PATH = [
  [0, 0], [-114.3, 199.77], [-115.51, 208.74], [-110.44, 216.7],
  [-99.88, 220.4], [-88.1, 217.14], [-50.47, 198.2], [40.84, 154.37],
  [84.74, 127.35], [130.43, 93.49], [171.41, 59.19], [203.89, 23.77],
  [378.44, -184.41], [390.72, -196.07], [411.78, -209.19], [449.41, -233.51],
  [465.9, -249.88], [479.82, -272.08], [488.74, -292.25], [494.67, -314.9],
  [499.74, -356.71], [502.66, -371.51], [507.73, -385.19], [517.44, -403.13],
  [603.68, -541.12], [658.58, -628.79], [673.79, -661.52], [683.5, -685.85],
  [694.92, -724.97], [763.81, -965.44], [869.47, -1330.56], [893.96, -1418.34],
  [895.24, -1432.57], [892.67, -1448.38], [884.25, -1461.05], [871.97, -1471.7],
  [856.33, -1480.11], [847.05, -1489.07], [840.7, -1499.61], [835.63, -1515.53],
  [836.49, -1531.34], [857.62, -1625.95], [857.19, -1642.32], [853.83, -1657.12],
  [842.41, -1673.48], [828.85, -1684.58], [588.05, -1851.06], [572.84, -1857.45],
  [557.63, -1857.9], [541.57, -1853.19], [528.44, -1843.66], [519.15, -1829.98],
  [515.37, -1816.19], [514.51, -1801.39], [519.15, -1787.61], [527.58, -1773.37],
  [539.86, -1763.39], [645.09, -1698.37], [656.51, -1686.71], [662.79, -1675.05],
  [665.36, -1661.38], [664.08, -1644.45], [620.53, -1516.54], [607.04, -1464.3],
  [576.2, -1303.09], [560.99, -1210.61], [557.63, -1194.8], [550, -1177.87],
  [539.86, -1164.09], [524.65, -1149.29], [507.73, -1138.19], [489.17, -1130.79],
  [469.68, -1127.65], [406.71, -1123.39], [382.66, -1126.08], [360.67, -1132.36],
  [338.32, -1141.89], [320.12, -1154.11], [298.98, -1173.61], [285.49, -1193.12],
  [270.71, -1221.15], [211.1, -1370.24], [157.85, -1502.86], [146.42, -1523.49],
  [132.93, -1537.73], [114.37, -1548.26], [95.74, -1553.53], [78.46, -1554.09],
  [61.11, -1550.39], [46.33, -1543.56], [21.77, -1527.64], [5.71, -1520.8],
  [-13.71, -1517.66], [-33.13, -1519.79], [-50.9, -1525.51], [-66.11, -1536.16],
  [-75.82, -1548.26], [-87.67, -1564.63], [-185.26, -1717.88], [-194.97, -1726.85],
  [-206.82, -1733.24], [-221.17, -1736.37], [-237.23, -1735.37], [-251.15, -1728.98],
  [-317.12, -1680.88], [-355.95, -1652.41], [-365.66, -1639.74], [-375.8, -1624.38],
  [-381.73, -1609.59], [-385.94, -1592.1], [-386.8, -1574.16], [-383.87, -1552.52],
  [-377.09, -1534.03], [-368.23, -1510.26], [-355.1, -1474.28], [-332.32, -1433.58],
  [-307.34, -1398.16], [-269.36, -1355.45], [-205.96, -1293.56], [-168.77, -1264.53],
  [-137.07, -1246.03], [26.06, -1160.95], [49.69, -1146.15], [72.1, -1128.66],
  [92.81, -1109.15], [110.51, -1087.97], [127, -1065.77], [148.99, -1025.19],
  [166.77, -986.06], [207.32, -895.71], [214.46, -876.09], [218.74, -855.02],
  [219.53, -828.56], [215.31, -804.79], [191.26, -742.91], [165.06, -674.75],
  [133.36, -589.67], [125.29, -558.05], [117.72, -520.5], [113.08, -485.63],
  [110.08, -456.04], [100.8, -319.16], [102.52, -310.19], [108.01, -303.8],
  [116.44, -301.67], [130.79, -303.8], [145.64, -303.8], [155.77, -301.67],
  [162.49, -294.27], [164.2, -285.86], [159.99, -274.77], [108.01, -189.68],
];

// Surveyed / EU-DEM 25m elevation profile [metres along 7004 m lap, metres ASL].
// Spans 102.2 m from Stavelot valley (368.3 m) to Malmedy ridge (470.5 m),
// with the 40 m Raidillon climb peaking near 17-18% gradient out of Eau Rouge.
export const SPA_ELEV = [
  [0, 415.0],     // Start / Finish line
  [120, 416.8],   // Pit straight climbs gently to La Source
  [210, 417.8],   // La Source braking crest
  [255, 416.8],   // T1 La Source apex
  [330, 413.8],   // La Source exit drops away
  [460, 408.5],   // Downhill past Endurance pits
  [600, 401.5],   // Plunge toward Eau Rouge
  [740, 393.5],   // Approaching Eau Rouge valley
  [850, 388.8],   // Eau Rouge entry compression
  [898, 388.0],   // T2 Eau Rouge stream bridge trough
  [945, 390.2],   // Bottom of Raidillon climb
  [1010, 398.5],  // T3 Raidillon steep uphill
  [1080, 410.5],  // Peak Raidillon gradient (~17.5%)
  [1145, 421.8],  // T4 Raidillon blind crest approach
  [1195, 428.2],  // Raidillon summit crest
  [1270, 433.0],  // Launch onto Kemmel Straight
  [1450, 441.5],  // Lower Kemmel climb
  [1700, 449.5],  // Mid Kemmel Straight
  [1950, 456.8],  // Upper Kemmel Straight
  [2170, 462.5],  // Les Combes braking zone
  [2280, 464.2],  // T5 Les Combes right
  [2365, 465.0],  // T6 Les Combes left
  [2470, 469.2],  // Climbing into Malmedy
  [2535, 470.5],  // T7 Malmedy crest (highest point, 470.5 m)
  [2650, 467.8],  // Descent toward Bruxelles
  [2800, 460.0],  // Downhill braking for Bruxelles
  [2905, 452.0],  // T8 Bruxelles (Rivage) downhill hairpin
  [2990, 446.5],  // Bruxelles exit
  [3140, 441.5],  // T9 Speaker's Corner / No Name
  [3290, 428.0],  // Steep forest drop to Pouhon
  [3480, 413.0],  // Pouhon approach
  [3650, 403.0],  // T10 Pouhon first apex
  [3780, 393.0],  // Pouhon mid-corner drop
  [3920, 383.5],  // T11 Pouhon second apex
  [4080, 378.8],  // Valley floor before Campus
  [4260, 382.2],  // Slight rise into Campus braking
  [4360, 383.5],  // T12 Campus / Fagnes right
  [4460, 379.5],  // Campus switchback drop
  [4560, 375.5],  // T13 Campus exit
  [4740, 374.5],  // Stavelot 1 approach
  [4830, 373.2],  // T14 Stavelot 1
  [4985, 368.3],  // T15 Stavelot 2 / Paul Frere trough (lowest point, 368.3 m)
  [5110, 372.5],  // Climbing out of Paul Frere (Sector 2 split)
  [5320, 381.0],  // Back flat-out run climbing through forest
  [5580, 388.5],  // Approaching Blanchimont
  [5800, 394.5],  // T16 Blanchimont 1
  [6030, 400.5],  // T17 Blanchimont 2
  [6280, 407.8],  // Climb to Bus Stop braking
  [6480, 412.8],  // Bus Stop braking zone
  [6590, 413.2],  // T18 Bus Stop right
  [6665, 413.0],  // T19 Bus Stop left
  [6820, 413.8],  // Pit straight
].map(([m, h]) => [m / SPA_LENGTH, h - 415.0]);

// Cross-slope / banking keyframes [lapFraction, degrees].
// Positive = left edge higher (banks into right turns); negative = right edge higher (banks into left turns).
export const SPA_CAMBER = [
  [0, 0],
  [215, 0],
  [245, 0.8],     // La Source inside slight bank
  [290, -1.2],    // La Source off-camber exit drop
  [360, 0],
  [845, 0],
  [904, -2.6],    // Eau Rouge left banked into compression
  [945, 0],
  [1005, 3.4],    // Raidillon right banked uphill
  [1075, 2.2],
  [1135, -1.8],   // Raidillon crest slight left bank
  [1200, 0],
  [2220, 0],
  [2285, 1.4],    // Les Combes T5
  [2345, -1.2],   // Les Combes T6
  [2515, 1.2],    // Malmedy T7
  [2600, 0],
  [2815, 0],
  [2895, 3.2],    // Bruxelles positive banking on entry/mid
  [2955, 2.4],
  [3005, -1.0],   // Bruxelles off-camber exit
  [3070, 0],
  [3152, -2.0],   // No Name left bank
  [3230, 0],
  [3600, 0],
  [3675, -3.5],   // Pouhon T10 strong positive banking
  [3785, -2.0],   // Pouhon mid
  [3925, -3.6],   // Pouhon T11 strong positive banking
  [4035, 0],
  [4345, 1.5],    // Campus T12
  [4545, -1.6],   // Campus T13
  [4640, 0],
  [4830, 1.6],    // Stavelot 1
  [4985, 2.4],    // Stavelot 2 / Paul Frere banked right
  [5120, 0],
  [5960, 0],
  [6065, -2.3],   // Blanchimont 2 positive banking
  [6165, 0],
  [6575, 0],
  [6612, 0.8],    // Bus Stop T18
  [6668, -0.8],   // Bus Stop T19
  [6740, 0],
].map(([m, deg]) => [m / SPA_LENGTH, deg]);

// Hand-authored kerbs around every corner and chicane: [side (+1 left, -1 right), startM, endM, type]
//   1: Standard Spa Red/Yellow sawtooth apex kerb
//   2: Tall stepped high-load kerb (Eau Rouge / Raidillon / Pouhon T11 / Blanchimont) + green verge strip
//   3: Chicane apex kerb + 3D raised yellow/orange anti-cut sausage kerb (baguette)
//   4: Wide fluted exit kerb + dark-green astroturf / painted strip
//   5: Low-profile flush braking turn-in kerb
export const SPA_KERBS = [
  // T1 La Source hairpin
  [1, 165, 212, 5],
  [-1, 218, 264, 3],
  [1, 262, 342, 4],

  // T2-T4 Eau Rouge / Raidillon complex
  [-1, 830, 876, 5],
  [1, 872, 932, 2],     // Eau Rouge tall stepped inside left
  [-1, 956, 1068, 2],   // Raidillon tall stepped inside right
  [1, 1090, 1166, 2],   // Raidillon crest tall stepped left
  [-1, 1152, 1258, 4],  // Raidillon crest wide exit kerb + green astroturf

  // T5-T7 Les Combes & Malmedy chicane
  [1, 2165, 2245, 5],
  [-1, 2252, 2312, 3],  // T5 apex + sausage kerb
  [1, 2316, 2394, 3],   // T6 apex + sausage kerb
  [-1, 2386, 2448, 1],
  [-1, 2478, 2550, 3],  // T7 Malmedy apex + sausage kerb
  [1, 2540, 2648, 4],   // Malmedy wide exit + astroturf

  // T8 Bruxelles (Rivage) hairpin
  [1, 2775, 2844, 5],
  [-1, 2848, 2996, 1],  // Long inside apex kerb
  [1, 2986, 3074, 4],   // Exit wide kerb + astroturf

  // T9 Speaker's Corner / No Name
  [1, 3112, 3190, 2],
  [-1, 3166, 3260, 4],

  // T10-T11 Pouhon double-left
  [-1, 3565, 3630, 5],
  [1, 3630, 3748, 1],   // T10 inside apex
  [-1, 3745, 3826, 4],  // Mid-corner exit relief + astroturf
  [1, 3838, 3966, 2],   // T11 tall stepped inside apex
  [-1, 3940, 4082, 4],  // Pouhon wide exit kerb + astroturf

  // T12-T13 Campus / Fagnes chicane
  [1, 4255, 4310, 5],
  [-1, 4312, 4416, 3],  // T12 apex + sausage kerb
  [1, 4410, 4464, 1],
  [1, 4468, 4576, 3],   // T13 apex + sausage kerb
  [-1, 4556, 4668, 4],  // Campus wide exit + astroturf

  // T14-T15 Stavelot & Courbe Paul Frere
  [1, 4725, 4778, 5],
  [-1, 4780, 4862, 1],  // Stavelot 1 apex
  [1, 4846, 4936, 4],   // Stavelot 1 exit + astroturf
  [-1, 4954, 5082, 2],  // Stavelot 2 / Paul Frere stepped apex
  [1, 5060, 5190, 4],   // Paul Frere full-throttle exit + astroturf

  // T16-T17 Blanchimont
  [1, 5774, 5856, 1],   // Blanchimont 1 inside
  [1, 6004, 6106, 2],   // Blanchimont 2 tall inside
  [-1, 6080, 6200, 4],  // Blanchimont 2 wide exit + astroturf

  // T18-T19 Bus Stop chicane
  [1, 6515, 6582, 5],
  [-1, 6586, 6628, 3],  // Bus Stop T18 right apex + sausage kerb
  [1, 6638, 6688, 3],   // Bus Stop T19 left apex + sausage kerb
  [-1, 6680, 6714, 4],  // Bus Stop exit kerb (meets pit entry cleanly)
];

// Authentic per-corner runoff & barrier zones: [side, startM, endM, style, wallDist]
//   style 1: asphalt apron + modern Spa gravel trap
//   style 2: iconic Spa Red/Yellow striped high-friction tarmac + gravel trap
//   style 3: wide Spa Red/Yellow striped paved escape runoff (full tarmac to wall)
export const SPA_RUNOFF = [
  // La Source outside: iconic red/yellow striped runoff + gravel bed
  [1, 185, 355, 2, 29],
  // Eau Rouge right shoulder & Raidillon huge outside left red/yellow runoff + gravel
  [-1, 855, 950, 3, 18],
  [1, 945, 1140, 2, 34],
  [-1, 1135, 1270, 2, 23],
  // Les Combes & Malmedy gravel traps
  [1, 2210, 2340, 2, 32],
  [-1, 2325, 2435, 1, 24],
  [1, 2470, 2630, 1, 28],
  // Bruxelles massive gravel trap
  [1, 2825, 3055, 1, 32],
  // Speaker's Corner / No Name gravel trap
  [-1, 3110, 3270, 1, 29],
  // Pouhon iconic huge sweeping red/yellow striped + gravel runoff
  [-1, 3620, 4100, 2, 36],
  // Campus / Fagnes gravel traps
  [1, 4295, 4450, 1, 30],
  [-1, 4485, 4660, 1, 28],
  // Stavelot 1 & Paul Frere gravel traps
  [1, 4770, 4930, 1, 30],
  [1, 4960, 5185, 2, 30],
  // Blanchimont 2 deep runoff + gravel
  [-1, 5990, 6200, 1, 34],
  // Bus Stop chicane wide red/yellow paved escape runoff straight ahead of T18
  [1, 6540, 6634, 3, 30],
];

// Classic Ardennes galvanized Armco guardrail stretches (forest corridors)
export const SPA_ARMCO = [
  [1, 370, 845],
  [1, 1255, 2145],
  [-1, 1280, 2200],
  [1, 2650, 2790],
  [-1, 2575, 2835],
  [1, 3220, 3610],
  [-1, 3290, 3590],
  [1, 4010, 4265],
  [-1, 4110, 4305],
  [-1, 4675, 4775],
  [1, 5210, 5970],
  [-1, 5150, 5965],
  [1, 6135, 6510],
  [-1, 6215, 6550],
];
