// Fictional teams and drivers. `pace` orders the field (1 = quickest car).
// `livery` drives the car paint in render/carmodel.js: the design, the paint finish, the livery's
// own tones (color / color2 stay the identity colours the HUD uses) and a fictional title partner.
// `font` is a canvas font with {px} where the size goes; `spacing` is letter spacing in em.
export const TEAMS = [
  { name: 'Aurora Racing', color: '#0a8f8a', color2: '#d9dde2', helmet: '#e8f6f5', pace: 1, drivers: [['Elias Varga', 'VAR', 4], ['Rafael Duarte', 'DUA', 17]],
    livery: { style: 'aurora', finish: 'metallic', base: '#0a807c', deep: '#04333a', accent: '#d3dae0', partner: 'SOLVARA', font: '700 {px}px "Avenir Next", "Segoe UI", Arial, sans-serif', spacing: 0.12 } },
  { name: 'Vanta Motorsport', color: '#17171c', color2: '#39ff6a', helmet: '#39ff6a', pace: 2, drivers: [['Kenji Arakawa', 'ARA', 8], ['Noah Sjöberg', 'SJO', 26]],
    livery: { style: 'vanta', finish: 'matte', base: '#141518', deep: '#0b0c0e', accent: '#3cf07d', partner: 'ZENTRIQ', font: '800 {px}px "Avenir Next Condensed", "Arial Narrow", Arial, sans-serif', spacing: 0.2 } },
  { name: 'Fulmine Corse', color: '#ff4d1a', color2: '#111111', helmet: '#ffcc00', pace: 3, drivers: [['Theo Marchetti', 'MAR', 11], ['Julien Fabre', 'FAB', 35]],
    livery: { style: 'fulmine', finish: 'gloss', base: '#e3411a', deep: '#8e2108', accent: '#f3efe6', partner: 'VAMPA', font: 'italic 900 {px}px "Helvetica Neue", Arial, sans-serif', spacing: 0 } },
  { name: 'Halcyon GP', color: '#1f4fff', color2: '#ffd400', helmet: '#ffd400', pace: 4, drivers: [['Oskar Brandt', 'BRA', 6], ['Arjun Mehta', 'MEH', 21]],
    livery: { style: 'halcyon', finish: 'metallic', base: '#173ac2', deep: '#0a1a5c', accent: '#ffd21a', partner: 'HELIQ', font: '700 {px}px Futura, "Century Gothic", "Trebuchet MS", sans-serif', spacing: 0.06 } },
  { name: 'Kestrel Racing Team', color: '#f2f2f2', color2: '#d0103a', helmet: '#d0103a', numColor: '#111111', pace: 5, drivers: [['Diego Salvatierra', 'SAL', 9], ['Finn Callahan', 'CAL', 28]],
    livery: { style: 'kestrel', finish: 'pearl', base: '#eef0f2', deep: '#2a2d33', accent: '#c4102c', partner: 'AVIORA', font: '800 {px}px "Helvetica Neue", Arial, sans-serif', spacing: 0.08 } },
  { name: 'Nordline Racing', color: '#8fd3ff', color2: '#0b1d4a', helmet: '#0b1d4a', numColor: '#0b1d4a', pace: 6, drivers: [['Mikael Rautio', 'RAU', 12], ['Lukas Hartmann', 'HAR', 41]],
    livery: { style: 'nordline', finish: 'satin', base: '#93d2f4', deep: '#0b1d4a', accent: '#ffffff', partner: 'ISVIND', font: '700 {px}px "DIN Alternate", "DIN Condensed", "Arial Narrow", Arial, sans-serif', spacing: 0.1 } },
  { name: 'Solace Motorsport', color: '#6a2cff', color2: '#ffc94a', helmet: '#ffc94a', pace: 7, drivers: [['Samuel Okafor', 'OKA', 19], ['Tomás Ibarra', 'IBA', 52]],
    livery: { style: 'solace', finish: 'metallic', base: '#5a25d2', deep: '#1c0a4c', accent: '#f0bd4c', partner: 'MERAQI', font: 'italic 700 {px}px Didot, "Bodoni 72", Georgia, serif', spacing: 0.04 } },
  { name: 'Ironbark Racing', color: '#5a6b2a', color2: '#ff8a00', helmet: '#ff8a00', pace: 8, drivers: [['Hugo Lemaire', 'LEM', 15], ['Ivan Sokolov', 'SOK', 33]],
    livery: { style: 'ironbark', finish: 'satin', base: '#55652a', deep: '#2c3516', accent: '#ff8a1a', third: '#d9cba3', partner: 'BUNYARA', font: '400 {px}px Impact, "Arial Black", sans-serif', spacing: 0.1 } },
  { name: 'Meridian Racing', color: '#e0157a', color2: '#ffffff', helmet: '#ffffff', pace: 9, drivers: [['Marco Bellandi', 'BEL', 25], ['Jonah Whitaker', 'WHI', 47]],
    livery: { style: 'meridian', finish: 'gloss', base: '#da1473', deep: '#5e0836', accent: '#ffffff', partner: 'OKTAVE', font: 'italic 800 {px}px "Avenir Next", "Segoe UI", Arial, sans-serif', spacing: 0.02 } },
  { name: 'Tundra GP', color: '#4a525a', color2: '#00d4ff', helmet: '#00d4ff', pace: 10, drivers: [['Sebastián Cruz', 'CRU', 3], ['Yuto Nakamura', 'NAK', 70]],
    livery: { style: 'tundra', finish: 'satinmetal', base: '#5a636d', deep: '#22262b', accent: '#19cdf2', partner: 'NOVERA', font: '700 {px}px Menlo, Consolas, "Courier New", monospace', spacing: 0.04 } },
];
