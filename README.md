# APEX GRAND PRIX

A browser racing game with fictional teams and circuits. Race F1, F2, hybrid prototypes, or a GT3 from Porsche, McLaren, Ferrari, or Aston Martin. Choose **My class only** or **Multi-class** on the grid menu. Mixed grids show both overall and in-class positions.

[Play Apex Grand Prix](https://thetechdude124.github.io/apex-gp/)

Keep the throttle released on the grid. Press W, the up arrow, or the controller trigger when all five lights go out. Jumping the start earns a drive-through. Follow the blue pit-entry arrows by the end of lap three, or by the finish on a shorter race, to avoid disqualification. The penalty clears at pit exit. A required tyre change needs its own visit.

A/D or the arrow keys steer. S brakes. Space opens DRS on F1 and F2 in eligible zones. Shift deploys electric boost on F1 and hybrid prototypes. C changes camera and H opens the driving guide.

Choose low, balanced, or high downforce before a session. In **Advanced settings → Driving aids**, adjust differential openness from 0% (most stable) to 100% (most rotation).

Run locally with `python3 -m http.server 8000 --bind 127.0.0.1` from the repository and open [the local game](http://localhost:8000/). Run the simulation checks with `node --test tests/racing.test.mjs` using Node 22.7 or newer.

Built with three.js ([MIT license](vendor/three/LICENSE)).
