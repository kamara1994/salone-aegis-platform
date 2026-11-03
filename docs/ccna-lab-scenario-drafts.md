# CCNA Focus Lab: written brief standard

**Stage:** Written scenarios, learner tasks, questions, and expected evidence only. The briefs in the app do not define device placement, cabling, IP plans, commands, solution keys, grading code, or simulator state. Those are deliberately deferred to the later assembly stage.

## Editorial review and rewrite

The first draft had useful scenarios, but it was not ready to serve as a consistent learner-facing lab book. Several prompts were broad (“compare the evidence”) without naming a concrete deliverable; some investigation questions repeated the scenario instead of testing a distinct decision; and expected evidence was not consistently stated. A few briefs also bundled too many unrelated objectives.

The revised catalog at [ccnaFocusBriefs.ts](../apps/web/src/lab/ccnaFocusBriefs.ts) is the source shown in **Lab → CCNA Focus Lab**. It uses a repeatable structure:

1. **Scenario:** a plausible workplace request or symptom, without giving away the answer.
2. **Required tasks:** observable actions and decisions the learner must complete.
3. **Questions to answer:** prompts that require interpreting evidence and explaining why.
4. **What a strong response demonstrates:** visible criteria for checking completeness, without revealing the solution.
5. **Objective references and level:** scope and expected difficulty, tied to the current CCNA outline.

This follows the general task-based shape of Cisco’s published hands-on course activities while keeping every prompt original. It is not copied Cisco exam or NetAcad content and is not represented as an official Cisco activity.

## Coverage map

| Cisco domain | Written coverage in the app |
| --- | --- |
| Network Fundamentals | Components/topology/virtualization; cabling and interface faults; IPv4/IPv6/client parameters and transport; switching and wireless principles |
| Network Access | VLANs and trunks; CDP/LLDP discovery; spanning tree and LACP EtherChannel; wireless architecture and WLAN settings |
| IP Connectivity | Routing-table interpretation and forwarding; IPv4/IPv6 static route selection and failover; single-area OSPF and first-hop redundancy |
| IP Services | DHCP/DNS/relay; NAT/NTP; SNMP, syslog, QoS, and file-transfer services |
| Security Fundamentals | Management access, local credentials and AAA; security awareness and physical controls; ACL/VPN policy; Layer 2 and WLAN security |
| Automation and Programmability | Controllers, control/data planes, APIs, HTTP operations, JSON, configuration management, and safe verification |

The objective identifiers are maintained with each brief in the TypeScript catalog. The reference version is CCNA v1.1, which Cisco lists through February 2, 2027; v2.0 begins February 3, 2027. The catalog should be reviewed against the new outline when that transition occurs.

## Quality bar for later lab assembly

Before a written brief is turned into a runnable activity, the implementation should:

- preserve the scenario’s exact learning objective and difficulty;
- provide enough evidence to distinguish the intended fault from plausible alternatives;
- accept valid equivalent solutions when the objective allows them;
- verify both the requested service and important negative requirements, such as isolation;
- avoid scoring hidden implementation details that the prompt never asked the learner to demonstrate;
- include a safe rollback or containment condition for change and security scenarios; and
- keep the answer key and grading logic separate from learner-facing instructions.

## Research references

- [Cisco 200-301 CCNA v1.1 exam topics](https://learningcontent.cisco.com/documents/marketing/exam-topics/200-301-CCNA-v1.1.pdf) — official domain and objective reference.
- [Cisco CCNA certification and exam refresh](https://www.cisco.com/web/go/ccna/) — v1.1 and v2.0 transition dates.
- [Cisco Implementing and Administering Cisco Solutions course outline](https://www.cisco.com/c/dam/en_us/training-events/training/courses/ccna.pdf) — examples of hands-on activities across switching, routing, services, security, wireless, and management.
- [Cisco CCNA exam overview](https://www.cisco.com/site/us/en/learn/training-certifications/exams/ccna.html) — exam description and six domains.
