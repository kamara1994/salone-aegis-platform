# Individual lab visual assets

Each image in this directory is a separate asset for the lab designer. Device, cable, and port files are intentionally kept independent so the canvas can attach the correct visual to one object at a time and scale it during hover/zoom.

Labels, arrows, link lights, port state, VLAN, speed, duplex, PoE, and fault indicators should be rendered as interactive overlays by the lab UI. This keeps them synchronized with the simulated state instead of baking stale values into an image.

## Current assets

- `devices/`: Cisco 1941, Cisco ISR 4331, Cisco Catalyst 2960-X, OPNsense DEC2750, Dell PowerEdge R650
- `cables/`: blue Cat6 Ethernet, aqua duplex LC fiber, light-blue rollover console cable
- `ports/`: RJ45 Ethernet port with link LEDs, SFP/LC transceiver
