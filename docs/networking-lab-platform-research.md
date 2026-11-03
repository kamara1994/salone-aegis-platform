# Networking lab platform research

Researched 2026-10-31. This comparison is a reference for future AEGIS lab and backend planning; it does not prescribe a product integration.

## Summary

No single platform is best for every learner or engineering task. Packet Tracer is approachable for guided introductory practice. Other platforms go further in operating-system realism, topology scale, multi-vendor support, automation, or access to real vendor environments.

| Platform | What it is strongest at | Main trade-off |
| --- | --- | --- |
| Cisco Modeling Labs (CML) | Cisco virtual network operating systems, Cisco-focused realism, multi-vendor modeling, browser UI and API automation. | Requires authorized images and suitable compute; image licensing and resource limits matter. |
| EVE-NG | Large multi-vendor virtual topologies, browser consoles, packet capture, link impairment, and collaboration features. | Requires a capable server and authorized device images; setup and operations are more involved than Packet Tracer. |
| GNS3 | Flexible topologies using virtual network operating systems, VMs, and containers across local or remote compute. | Appliance setup, image licensing, and host resource management are the learner's responsibility. |
| Containerlab | Repeatable, file-defined container-based network topologies, automation workflows, and source-controlled labs. | More engineering-oriented; network OS containers and Linux infrastructure are prerequisites. |
| Cisco DevNet Sandbox | Access to real Cisco product environments and APIs through shared or reserved sandboxes. | Environments are product-specific; shared sandboxes have restrictions, while reserved sessions have time/resource limits. |
| Juniper vLabs | Free, prebuilt Juniper product topologies for hands-on routing, switching, security, and automation practice. | Topologies are provided by Juniper; learners do not get the same freedom as a self-hosted general lab. |
| Boson NetSim | Structured certification-focused Cisco command and troubleshooting practice with a broad lab catalog. | A purpose-built simulator rather than a general real-image or multi-vendor environment. |

## Implications for AEGIS

- Keep the browser designer, guided instruction, grading, and progress tracking as the accessible learning layer.
- Treat an actual device runtime as a separate backend capability. Do not represent simulated CLI behavior as a real vendor operating system.
- Plan for licensed/user-supplied images or integrations with authorized sandbox providers; do not bundle vendor images without the required rights.
- Prioritize an adapter-based runtime contract so simulation can remain the default and real-image providers can be added independently.
- Consider Containerlab-style declarative topology export/import as an interoperability path for engineering users.

## Sources

- [Cisco Modeling Labs](https://www.cisco.com/site/us/en/learn/training-certifications/training/modeling-labs/index.html)
- [Cisco on Packet Tracer and alternative lab solutions](https://learningnetwork.cisco.com/s/article/packet-tracer-and-alternative-lab-solutions)
- [EVE-NG feature comparison](https://www.eve-ng.net/index.php/features-compare/)
- [GNS3 documentation](https://docs.gns3.com/docs)
- [GNS3 emulator selection](https://docs.gns3.com/docs/emulators/which-emulators-should-i-use)
- [Containerlab](https://containerlab.dev/)
- [Containerlab GUI and operations](https://containerlab.dev/manual/gui/)
- [Cisco DevNet Sandbox](https://developer.cisco.com/sandbox)
- [Juniper vLabs](https://jlabs.juniper.net/vlabs/)
- [Boson NetSim](https://netsim.boson.com/)
