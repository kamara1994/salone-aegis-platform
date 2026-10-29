# Visual and content assets: where they come from

Every asset the web app ships, and its source. Nothing here is a vendor photograph, a vendor logo or an
operating-system image.

| Path | What | Source and licence |
|---|---|---|
| `public/lab/devices/*.svg` | Generic device illustrations (router, switch, firewall, server, VM, PC, laptop, AP, cloud, IoT) | Drawn for this project; project licence. See `public/lab/ATTRIBUTION.md`. |
| `public/lab/generated/**` | Device, cable and port pictures used only inside the hover card | Generated images added on the deployment branch (see `public/lab/generated/README.md`). No vendor logos. **To confirm before public release:** record the generator and its licence terms in that README. |
| `public/lab/backgrounds/*.png` | Built-in canvas backgrounds | Generated images added on the deployment branch. Same note as above. |
| `src/components/learn/Diagrams.tsx` | Lesson diagrams (VLAN split, 802.1Q tag, ARP, priority matrix, SIEM flow, escalation, MAC table, cable trace) | Drawn in code (SVG) for this project. |
| Lesson text, quizzes and game scenarios (`src/content/**`) | Training content | Written for this project. Fictional people, companies and addresses. No certification exam questions are copied. |
| Icons | UI icons | `lucide-react` (ISC licence). |
| User backgrounds | Images a user uploads | Stay in that user's browser storage; never uploaded. |

If a picture fails to load, the hover card falls back to the catalog illustration and then to a labelled
"Picture unavailable" placeholder; it never shows a different device's picture.
