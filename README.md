# APEX GRAND PRIX

A browser racing game with fictional teams and a mix of original and real-world circuits. Race F1, F2, hybrid prototypes, or a GT3 from Porsche, McLaren, Ferrari, or Aston Martin. Choose **My class only** or **Multi-class** on the grid menu. Mixed grids show both overall and in-class positions.

[Play Apex Grand Prix](https://thetechdude124.github.io/apex-gp/)

Race weekends open Friday at 4 p.m. and close Sunday at 4 p.m. U.S. Eastern time. The site checks its server clock before loading the game. At closing time, active races and multiplayer rooms end. The downtime screen shows the next opening and reopens automatically.

In **Play with friends**, new rooms start with **Each driver chooses**. The host can switch **Car class rule** to **Lock to host’s class**. A GT3 lock still lets drivers choose different GT3 makes.

Press W, the up arrow, or the controller trigger after lights-out to launch. A new throttle press while all five red lights are on earns a drive-through. An earlier press is free, even if held through the fifth light. Release and press again after lights-out to launch from a hold. Follow the blue pit-entry arrows by the end of lap three, or by the finish on a shorter race, to avoid disqualification. The penalty clears at pit exit. A required tyre change needs its own visit.

A/D or the arrow keys steer. S brakes. Space opens DRS on F1 and F2 in eligible zones. Shift deploys electric boost on F1 and hybrid prototypes. C changes camera and H opens the driving guide.

Choose low, balanced, or high downforce before a session. In **Advanced settings → Driving aids**, adjust differential openness from 0% (most stable) to 100% (most rotation).

Enter your driver name and choose a random or custom starting position. With Random weather selected, check the forecasts to include in the draw.

Imola follows the modern 4.909 km Grand Prix layout. The mapped centerline is scaled in metres, and elevation is interpolated between the operator’s published corner heights. Sector splits and the main-straight DRS zone follow the 2024 race map. [Centerline data](https://github.com/bacinger/f1-circuits/blob/master/circuits/it-1953.geojson) · [Circuit operator’s elevation map](https://www.autodromoimola.it/downloads/Presentazione_MICE_Autodromo_2021_EN.pdf) · [FIA circuit map](https://www.fia.com/sites/default/files/decision-document/2024%20Imola%20Event%20-%20Circuit%20Map%20Imola%202024.pdf)

Spa-Francorchamps follows the modern 7.004 km Belgian Grand Prix layout through the Ardennes forest, with 102 m of elevation change from Stavelot to Malmedy, the steep climb through Eau Rouge and Raidillon, corner banking, multi-type Belgian red-and-yellow kerbs with anti-cut chicane sausages, striped tarmac and gravel runoff, official sector splits, and both Kemmel Straight and pit-straight DRS zones. [Centerline data](https://github.com/bacinger/f1-circuits/blob/master/circuits/be-1925.geojson)

Run locally with `python3 -m http.server 8000 --bind 127.0.0.1` from the repository and open [the local game](http://localhost:8000/). Run the simulation checks with `node --test tests/racing.test.mjs` using Node 22.7 or newer.

Built with three.js ([MIT license](vendor/three/LICENSE)).
