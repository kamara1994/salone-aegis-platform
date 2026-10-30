export type SocVisualCallout = {
  number: string;
  title: string;
  explanation: string;
  beginnerExplanation: string;
  pinX: number;
  pinY: number;
  targetX: number;
  targetY: number;
};

export type SocVisualStep = {
  title: string;
  focus: string;
  location: string;
  image: string;
  source: string;
  sourceLabel?: string;
  callouts: SocVisualCallout[];
  record: string;
};

export type SocVisualLesson = {
  topicId: string;
  minutes: number;
  learn: string[];
  focus: string[];
  steps: SocVisualStep[];
};

const c = (
  number: string,
  title: string,
  explanation: string,
  beginnerExplanation: string,
  pinX: number,
  pinY: number,
  targetX: number,
  targetY: number,
): SocVisualCallout => ({ number, title, explanation, beginnerExplanation, pinX, pinY, targetX, targetY });

const s = (
  title: string,
  focus: string,
  location: string,
  image: string,
  page: string,
  callouts: SocVisualCallout[],
  record: string,
): SocVisualStep => ({
  title,
  focus,
  location,
  image: ({
    '50_alerts.png': '/learn/visuals/hunting/screenshots/50_alerts.png',
    '51_alerts_play.png': '/learn/visuals/hunting/screenshots/51_alerts_play.png',
    '56_hunt.png': '/learn/visuals/hunting/screenshots/56_hunt.png',
    '57_2_cases_create.png': '/learn/visuals/hunting/screenshots/57_2_cases_create.png',
    '65_pcap_details.png': '/learn/visuals/hunting/screenshots/65_pcap_details.png',
  } as Record<string, string>)[image] ?? `/learn/visuals/soc/${image}`,
  source: `https://docs.securityonion.net/en/2.4/${page}.html`,
  callouts,
  record,
});

export const SOC_VISUAL_LESSONS: SocVisualLesson[] = [
  {
    topicId: 'soc-roles', minutes: 7,
    learn: ['Recognize how an alert can move from initial review into a tracked case.', 'See where ownership and status live in the case workflow.'],
    focus: ['Who owns the next action?', 'Is the case still new, active, or resolved?', 'Does the next step exceed your authority?'],
    steps: [
      s('Check the case queue and its filter', 'Open Cases filter · create control', 'Security Onion SOC → Cases', '57_0_cases.png', 'cases', [
        c('1', 'Confirm which cases the view includes', 'This official example has no rows. Verify the Open Cases filter and time scope before concluding that no case exists.', 'This example list is empty. Check the filter and dates before deciding there are no cases.', 940, 350, 410, 270),
        c('2', 'Create only when the workflow requires it', 'The plus button starts a new case. Use it only when the lab or response process calls for case tracking.', 'The plus button starts a case. Use it only if your exercise or team asks you to make one.', 570, 145, 260, 184),
      ], 'An empty view is not proof that there is no incident. Record the active filter and time scope only when the exercise requires it.'),
      s('Review ownership and status in a case', 'Case title · assignee · status', 'Security Onion SOC → Cases → case details', '57_2_cases_create.png', 'cases', [
        c('1', 'Give the record a factual title', 'The title is editable at the top of the case. Describe the affected asset or question without presenting an unverified hypothesis as fact.', 'Use a short title that says what you are checking. Do not write a guess as if it is proven.', 1320, 135, 1020, 111),
        c('2', 'Check owner and current status', 'The summary panel shows assignee and status; the details panel carries severity and priority. Follow your team’s hand-off and escalation rules.', 'Check who is assigned and whether the case is new or being worked. Use your team’s rules for urgency and hand-off.', 1690, 375, 1560, 255),
      ], 'Record the case ID and hand-off only when required. Do not copy sensitive case data into personal notes.'),
    ],
  },
  {
    topicId: 'siem-basics', minutes: 8,
    learn: ['Read a SIEM dashboard as a starting point, not as a conclusion.', 'Pivot from an overview into a narrower search.'],
    focus: ['What data and time range are included?', 'Which result deserves a closer look?', 'Can the underlying event confirm the chart?'],
    steps: [
      s('Orient yourself in a dashboard', 'Query · time range · grouped results', 'Security Onion SOC → Dashboards', '53_dashboards.png', 'dashboards', [
        c('1', 'Verify query and time range', 'The query and time picker define the evidence represented in every panel. Confirm both before interpreting a count or trend.', 'The search and clock decide what information appears. Check them before deciding what the chart means.', 1050, 150, 870, 180),
        c('2', 'Use charts to find leads', 'A spike or unusual group is a pivot candidate. Open the underlying events and compare them with expected activity before calling them suspicious.', 'A tall bar is a clue, not proof. Open the matching events and see what actually happened.', 1510, 590, 1150, 790),
      ], 'When required, note the query, time range, and event IDs that support your conclusion. A chart alone is not sufficient evidence.'),
      s('Narrow the question in Hunt', 'Search filters · event table', 'Security Onion SOC → Hunt', '56_hunt.png', 'hunt', [
        c('1', 'Read the filters together', 'The OQL query and filter chips narrow the dataset. Replace the example values with a hypothesis-specific host, field, or indicator.', 'The search words and blue tags work together. Change the example to the computer or clue from your exercise.', 715, 150, 560, 182),
        c('2', 'Check the returned evidence', 'Confirm the time range and inspect the matching events. A zero result can mean no activity, missing telemetry, or an overly narrow query.', 'Look at the matching rows. If none appear, check the dates and make sure the right logs are available.', 1690, 870, 1220, 800),
      ], 'Keep the query and time range only if the lab asks for a reproducible search record.'),
    ],
  },
  {
    topicId: 'log-sources', minutes: 9,
    learn: ['Match an investigation question to the log source that can answer it.', 'Check sensor and ingestion health before trusting an empty search.'],
    focus: ['Which system recorded the event?', 'Is that source reporting?', 'Can you map an address to a device at that time?'],
    steps: [
      s('Check the sensor and service view', 'Grid node · service state', 'Security Onion SOC → Grid', '39_grid.png', 'grid', [
        c('1', 'Select the relevant node', 'Grid is the deployment health view. Expand the node that should collect the source and verify that its services are running.', 'Find the sensor that should see the activity. Make sure its services are running.', 900, 280, 430, 375),
        c('2', 'Treat health as a visibility check', 'A healthy sensor does not prove a specific integration is ingesting the needed fields. Validate the source in Hunt or Dashboards as well.', 'A green sensor is good, but still check that the log you need actually arrived.', 1680, 160, 1120, 545),
      ], 'If telemetry is missing, record the source, node, time range, and the visibility gap for the lab or operations ticket.'),
      s('Import evidence when the exercise calls for it', 'Upload control · import type', 'Security Onion SOC → Grid → Import', '40_upload.png', 'grid', [
        c('1', 'Choose the supported evidence file', 'The import flow accepts PCAP or EVTX evidence in supported deployments. Use only the file supplied for the lab and follow the environment’s handling rules.', 'Choose the PCAP or Windows event file supplied for the lab. Do not upload unrelated files.', 1020, 520, 1000, 470),
        c('2', 'Confirm the resulting data', 'After import, pivot to the linked results and check their time range and source. Imported sample data is separate from live production telemetry.', 'After upload, open the results and check the dates. Lab data is not the same as live company data.', 1625, 190, 1200, 183),
      ], 'Import only when the lab directs you to. Note the import job or dataset reference if you need to reproduce the exercise.'),
      s('Verify the imported source and time range', 'Import ID · source groups · timeline', 'Security Onion SOC → Dashboards → imported dataset', '45_import.png', 'first-time-users', [
        c('1', 'Keep the import ID in the query', 'The import ID filter scopes the view to that evidence job. Check the timestamp range before comparing events with another source.', 'The import ID keeps this view tied to the file you uploaded. Check the dates before comparing it with other logs.', 990, 135, 700, 220),
        c('2', 'Check which source groups arrived', 'Review event module and dataset counts to confirm what telemetry the import produced. These charts summarize the import; open individual events for evidence.', 'Check which kinds of logs arrived. The chart is only a summary, so open the actual event before making a decision.', 1240, 740, 1120, 625),
      ], 'Record the import ID, source, and time span only when needed to reproduce the exercise.'),
    ],
  },
  {
    topicId: 'windows-events', minutes: 9,
    learn: ['Use Security Onion to find imported Windows event evidence.', 'Interpret event IDs with account, host, logon type, source address, and time.'],
    focus: ['4624 means a successful logon; it is not automatically malicious.', '4625 means a failed logon; patterns matter more than one failure.', 'Check for a success after a burst and verify the source host.'],
    steps: [
      s('Bring the lab EVTX into the SOC', 'EVTX import · supported evidence', 'Security Onion SOC → Grid → Import', '40_upload.png', 'grid', [
        c('1', 'Select the lab EVTX file', 'Use the supplied event log file only. The import option is for offline evidence and does not enroll the host or enable live endpoint collection.', 'Choose the Windows event file from the exercise. Uploading it does not connect to the real computer.', 1010, 505, 1005, 468),
        c('2', 'Keep the source and time context', 'Preserve the source file’s exercise context and query the imported interval. Do not mix the sample events with unrelated production searches.', 'Remember which lab file you used and search the time covered by that file.', 1480, 225, 1200, 185),
      ], 'Record the exercise file and import reference only if the workbook asks for them.'),
      s('Search around the event, then validate its context', 'Hunt query · time range · returned event', 'Security Onion SOC → Hunt', '56_hunt.png', 'hunt', [
        c('1', 'Search the event field and time window', 'In the query bar, filter the imported Windows dataset for the event code (for example, 4624 or 4625) and constrain the relevant time. Field names depend on the parser and dataset.', 'Search for the event number your lab asks about and set the time. The field name may depend on how the log was imported.', 720, 150, 540, 180),
        c('2', 'Read the event with its surrounding evidence', 'Compare account, host, logon type, source address, and nearby failures or successes. A 4624 alone only records a successful logon; it does not establish compromise.', 'Check who logged in, which computer they used, how they connected, and what happened just before and after. A successful login by itself is not proof of an attack.', 1680, 865, 1230, 800),
      ], 'For a finding, retain the event reference, UTC timestamp, host, account, logon type, source address, and the evidence that supports your conclusion.'),
    ],
  },
  {
    topicId: 'alert-triage', minutes: 8,
    learn: ['Read the alert rule and evidence before deciding what happened.', 'Separate severity from confidence and escalate according to impact.'],
    focus: ['What detection fired and why?', 'Which host, time, and network event are involved?', 'Is there a benign explanation or corroborating evidence?'],
    steps: [
      s('Start with the alert summary', 'Rule name · severity · alert evidence', 'Security Onion SOC → Alerts', '50_alerts.png', 'alerts', [
        c('1', 'Read the rule and its summary', 'The selected detection describes the behavior it looks for. Treat its rule name and severity as a lead; validate the underlying event and local context.', 'Read what the alarm says it detected. The alarm is a clue, so check the evidence before deciding.', 1670, 180, 1678, 345),
        c('2', 'Compare event source and severity', 'Check the event module and severity alongside count and rule. A high severity does not replace evidence of impact or confidence.', 'Check which tool raised the alarm and how serious it is marked. That still does not prove the computer is infected.', 1420, 440, 1180, 438),
      ], 'If required, record alert ID, rule, UTC time, host, observed behavior, confidence, and disposition.'),
      s('Use guided analysis as a lead', 'Guided question · suggested investigation', 'Security Onion SOC → Alerts → Guided Analysis', '51_alerts_play.png', 'alerts', [
        c('1', 'Read the proposed question', 'Guided Analysis suggests pivots based on the selected alert. Check the question and available data before running it.', 'Read the suggested question. Make sure it fits the alert you are checking.', 1050, 150, 805, 184),
        c('2', 'Verify the answer in source events', 'A suggested answer is not a verdict. Inspect the timestamped results and confirm or refute the lead with another source where possible.', 'Use the suggestion to decide what to check next. Confirm it in the event rows before deciding it is true.', 1450, 900, 830, 500),
      ], 'Guided Analysis is optional. Skip it if it is unavailable or the exercise does not require it.'),
    ],
  },
  {
    topicId: 'ioc-ioa', minutes: 8,
    learn: ['Search concrete indicators without confusing a match with proof.', 'Pivot from an indicator to the behavior and surrounding event.'],
    focus: ['Where and when was the indicator observed?', 'Is it current, reliable, and specific?', 'What behavior accompanies the match?'],
    steps: [
      s('Pivot from an alert to its event evidence', 'Detection context · observed event', 'Security Onion SOC → Alerts', '50_alerts.png', 'alerts', [
        c('1', 'Read the detection context', 'The alert summary describes the analytic and the event context. Extract the exact domain, address, hash, or behavior to test; do not copy an entire alert description as an IOC.', 'Find the exact clue, like a domain, address, file hash, or action. Do not treat the alarm name as the clue itself.', 1670, 360, 1675, 400),
        c('2', 'Note source and confidence clues', 'The event module, severity, and rule fields help assess provenance. Validate an indicator against time, ownership, reputation, and neighboring activity.', 'Check which tool saw it and when. Then look for other activity that makes the clue more or less suspicious.', 1510, 175, 1180, 440),
      ], 'Store indicators only in the case or lab worksheet when needed, with source, first/last seen, context, and confidence.'),
      s('Search for the indicator across the selected window', 'Exact filter · matching event', 'Security Onion SOC → Hunt', '56_hunt.png', 'hunt', [
        c('1', 'Search the exact field and value', 'Use the field appropriate to the indicator type and quote exact values where required by OQL. Scope by time and relevant sensor or host.', 'Search for the exact domain, address, or hash. Choose the right kind of field and the right dates.', 725, 155, 550, 183),
        c('2', 'Test behavior, not just reputation', 'Review matching rows and pivot to related DNS, connection, or endpoint events. A shared or stale IP can match benign activity; behavior and asset context matter.', 'A match is just a match. Check what the computer did before and after it, because good websites can share an address.', 1660, 865, 1220, 800),
      ], 'Record the search, time range, matching event reference, and evidence that confirms or weakens the hypothesis.'),
    ],
  },
  {
    topicId: 'mitre-attack', minutes: 8,
    learn: ['Use ATT&CK to name observed adversary behavior consistently.', 'Keep the difference between tactic, technique, and detection coverage clear.'],
    focus: ['Map what the evidence shows, not what the alert title implies.', 'A technique mapping is not proof of attribution.', 'Use gaps to guide testing, not to claim complete coverage.'],
    steps: [
      s('Open the analysis tools from SOC', 'Navigator link · analysis tools', 'Security Onion SOC → left navigation', '39_grid.png', 'soc', [
        c('1', 'Open ATT&CK Navigator', 'Navigator is an external tool linked from SOC. It helps organize technique coverage; it does not automatically prove that a technique occurred.', 'Choose Navigator from the SOC menu when you need to view or organize ATT&CK techniques. The map is a planning tool.', 205, 760, 80, 735),
        c('2', 'Keep the evidence in the SOC', 'Return to the source event in Alerts or Hunt before assigning a technique. Capture the event and the behavior that supports the mapping.', 'Use the event in Alerts or Hunt as your proof. The ATT&CK map only helps name the behavior.', 1680, 160, 1520, 290),
      ], 'When the exercise requests a mapping, note the technique ID, supporting event, confidence, and any alternative explanation.'),
      s('Understand which detection types are enabled', 'Detection types · rulesets · enabled state', 'Security Onion SOC → Detections', '57_detections.png', 'detections', [
        c('1', 'Review detection categories', 'The table groups detection content such as Suricata, YARA, and Sigma. These are different detection mechanisms and may cover different ATT&CK behavior.', 'These rows show different kinds of security rules. Each kind can notice different things.', 910, 620, 920, 680),
        c('2', 'Check enabled state and coverage limits', 'Enabled rulesets do not demonstrate complete technique coverage. Confirm the relevant rule is active and test the behavior in a controlled lab.', 'A rule being turned on does not mean it can catch every attack. Test the rule safely in the lab.', 1560, 550, 1640, 620),
      ], 'Do not claim a technique is detected from the enabled count alone. Keep the rule or event reference with your mapping.'),
    ],
  },
  {
    topicId: 'traffic-analysis', minutes: 10,
    learn: ['Pivot from an event into the matching full packet stream.', 'Compare endpoints, protocol details, and payload safely.'],
    focus: ['Do both endpoints and timestamps match?', 'What does the packet sequence show?', 'Inspect payload only when the lab requires it.'],
    steps: [
      s('Open the packet evidence view', 'Event pivot · packet action', 'Security Onion SOC → Alerts or Hunt → PCAP action', '61_actions.png', 'pcap', [
        c('1', 'Start from the matching event row', 'Pivot from the individual event so the PCAP request carries its time and endpoint context. Aggregated rows may not have enough detail.', 'Open the exact event you are investigating before asking for its packets. A summary row may not have enough details.', 420, 780, 480, 905),
        c('2', 'Choose PCAP from the action menu', 'Use the event action menu to retrieve a stream, if packet capture exists and retention covers the interval.', 'Choose the PCAP item from the action menu if the lab saved traffic for that time.', 1290, 760, 930, 715),
      ], 'PCAP availability depends on capture configuration and retention. If no stream is found, document that visibility limit rather than inferring packet contents.'),
      s('Read the stream before reading payload', 'Endpoints · packet list · protocol data', 'Security Onion SOC → PCAP', '65_pcap_details.png', 'pcap', [
        c('1', 'Verify source and destination', 'Read the source and destination address-and-port fields in the stream header, then compare them with the event that triggered the pivot.', 'Check the from and to addresses and ports in the header. Make sure they match the event you opened.', 1700, 245, 1200, 135),
        c('2', 'Inspect protocol evidence carefully', 'Expand packet details only as needed. Do not execute extracted files; use an isolated analysis environment for suspicious payloads.', 'Open the packet details only if you need them. Never run a file you found inside the traffic.', 1650, 835, 1030, 570),
      ], 'Record the stream reference, endpoints, time, and the specific packet or protocol evidence that answers the lab question.'),
    ],
  },
  {
    topicId: 'ids-zeek-suricata', minutes: 9,
    learn: ['Use a Suricata alert as a detection lead and Zeek records for protocol context.', 'Correlate the same host and time across sources.'],
    focus: ['Which sensor and rule generated the alert?', 'What do connection or DNS records add?', 'Did the request complete or only get attempted?'],
    steps: [
      s('Identify the detection source', 'Alert rule · event module · severity', 'Security Onion SOC → Alerts', '50_alerts.png', 'alerts', [
        c('1', 'Confirm the Suricata rule and module', 'This documented alert view shows Suricata rule names and `event.module`. Verify the analytic and inspect the event rather than inferring from its label.', 'Check that the event came from Suricata and read the rule that fired. The rule name alone is not enough.', 1530, 180, 1300, 435),
        c('2', 'Select the exact event to pivot', 'Open the individual alert and preserve its event time and endpoints for correlation with Zeek data.', 'Open the exact alert so you can compare it with the network logs from the same time.', 1420, 770, 850, 440),
      ], 'If the exercise asks for correlation, retain the Suricata alert reference and the matching Zeek connection or protocol event.'),
      s('Compare the related Hunt records', 'Query time · event module · dataset', 'Security Onion SOC → Hunt', '56_hunt.png', 'hunt', [
        c('1', 'Keep the same host and time context', 'Search the relevant Zeek datasets around the alert’s timestamp. A matching `conn`, `dns`, or `http` record adds context but has its own limits.', 'Search the network records for the same computer and time. Different logs show different parts of the story.', 740, 155, 560, 183),
        c('2', 'Compare the protocol records', 'Use the returned dataset and event details to distinguish connection metadata from a Suricata signature match.', 'Compare what Zeek recorded with what Suricata detected. One tells you about the conversation; the other tells you a rule matched.', 1650, 860, 1220, 800),
      ], 'A Suricata alert and a Zeek record are independent evidence sources. State what each supports and what remains unknown.'),
    ],
  },
  {
    topicId: 'edr', minutes: 9,
    learn: ['Check whether endpoint telemetry is available before drawing conclusions.', 'Use the SOC evidence import workflow for offline Windows event exercises.'],
    focus: ['Is the endpoint sensor present and healthy?', 'Are process and log sources enabled?', 'A missing event is not proof that the action did not happen.'],
    steps: [
      s('Check the collection node and service health', 'Grid node · collection health', 'Security Onion SOC → Grid', '39_grid.png', 'grid', [
        c('1', 'Inspect the collection node', 'Expand the node expected to receive endpoint telemetry. Confirm services are running, then validate the expected host events in the data view.', 'Find the node that should collect the computer logs and check that its services are running.', 900, 280, 420, 310),
        c('2', 'Check the host evidence in Hunt', 'Search for a host and time-specific process or authentication event. Sensor health alone cannot confirm endpoint coverage for every data type.', 'Search for the computer and time you care about. A green sensor does not guarantee every kind of log is arriving.', 720, 160, 550, 182),
      ], 'Record host, expected source, time window, and any missing telemetry in the lab worksheet when required.'),
      s('Use offline Windows evidence in a lab', 'EVTX upload · imported dataset', 'Security Onion SOC → Grid → Import', '40_upload.png', 'grid', [
        c('1', 'Choose the supplied EVTX', 'This import path supports offline EVTX evidence in the appropriate deployment. It is not a live EDR response control and cannot isolate a machine.', 'Upload the event log file the lab gives you. This does not connect to or control the real computer.', 1020, 520, 1000, 470),
        c('2', 'Search the imported interval', 'Pivot into the import results and examine event fields for process or logon activity. Do not claim process-tree visibility unless the dataset contains it.', 'Open the imported results and look for the activity the exercise asks about. Only report details that the file actually contains.', 725, 145, 550, 180),
      ], 'Use a sandbox or approved endpoint console for live containment. This SOC screenshot documents offline evidence import only.'),
    ],
  },
  {
    topicId: 'dns-threats', minutes: 9,
    learn: ['Search DNS telemetry for unusual query patterns.', 'Validate a suspicious domain across time, host, and other protocol evidence.'],
    focus: ['Which host made the query?', 'Are labels unusually long or numerous?', 'Does another source corroborate the behavior?'],
    steps: [
      s('Scope a DNS hunt', 'Query filters · time window', 'Security Onion SOC → Hunt', '56_hunt.png', 'hunt', [
        c('1', 'Set a focused DNS query', 'Filter the DNS dataset for the domain, resolver, or behavior in the hypothesis. Start with a bounded time window and expand only as evidence requires.', 'Search the DNS logs for the domain or computer you are checking. Start with a small time range.', 715, 150, 550, 183),
        c('2', 'Review results and grouping', 'Look for repeat counts, distinct hosts, and time patterns. One long label can be benign; validate entropy and uniqueness against normal activity.', 'Check how many times it appears, which computers asked, and when. One strange-looking name may still be normal.', 1600, 660, 1240, 800),
      ], 'Capture the exact query, resolver, host, interval, and the pattern that supports or weakens tunneling.'),
      s('Check a network stream only when available', 'DNS response · packet data', 'Security Onion SOC → PCAP', '65_pcap_details.png', 'pcap', [
        c('1', 'Match the stream to the DNS event', 'Validate the endpoints and timestamps before interpreting the packet payload. The stream must correspond to the event you selected.', 'Make sure these packets belong to the DNS event you found and happened at the same time.', 1550, 165, 400, 205),
        c('2', 'Look for corroboration, not just volume', 'Compare query and response behavior with endpoint or resolver telemetry. Do not label a domain malicious based only on long labels or high query count.', 'Compare the DNS request and answer with other logs. Lots of queries by itself does not prove an attack.', 1650, 835, 1030, 575),
      ], 'PCAP is optional and available only when captured. Note missing packet visibility instead of assuming what the payload contained.'),
    ],
  },
  {
    topicId: 'brute-force-detection', minutes: 9,
    learn: ['Distinguish repeated password guessing from password spraying.', 'Check whether failures were followed by a successful logon.'],
    focus: ['One account or many accounts?', 'One source or distributed sources?', 'Was there a later success or MFA change?'],
    steps: [
      s('Triage the detection lead', 'Rule context · observed source · event time', 'Security Onion SOC → Alerts', '50_alerts.png', 'alerts', [
        c('1', 'Read the alert’s rule and timestamp', 'Confirm which behavior the rule detects and the exact interval. Do not infer a password attack from an alert title alone.', 'Read what triggered the alert and when. The title is only a clue.', 1650, 175, 1680, 350),
        c('2', 'Open the event details', 'Capture account, source, target, and result fields where available. Check whether the rule is detecting failures, a success, or a threshold.', 'Check which account and computer were involved, where the attempt came from, and whether it failed or worked.', 1420, 760, 860, 440),
      ], 'If confirmed or escalated, record the time window, source, affected accounts, failures, any subsequent success, and the escalation path.'),
      s('Test the sequence in Hunt', 'Time range · related log events', 'Security Onion SOC → Hunt', '56_hunt.png', 'hunt', [
        c('1', 'Search the shared source and window', 'Filter authentication telemetry by source and interval. Compare distinct accounts and failure counts to distinguish brute force from spraying.', 'Search around the same time and source. Check whether many tries target one person or a few tries target many people.', 730, 150, 555, 180),
        c('2', 'Look for success after failures', 'Pivot to successful logons and review account, logon type, source address, and session context. Then check identity-provider or MFA activity if available.', 'After the failed tries, look for a successful login. Check whether it came from the same place and whether the account changed its sign-in settings.', 1660, 865, 1220, 800),
      ], 'Escalate confirmed compromise through the identity response process. Do not lock accounts or reset credentials unless authorized.'),
    ],
  },
  {
    topicId: 'lateral-movement', minutes: 9,
    learn: ['Look for unusual host-to-host administration patterns.', 'Correlate authentication, service, and network events before deciding it is lateral movement.'],
    focus: ['Was the source host expected to administer the destination?', 'Did a service or remote task appear?', 'Is this a known management window or tool?'],
    steps: [
      s('Scope the host-to-host activity', 'Source · destination · query window', 'Security Onion SOC → Hunt', '56_hunt.png', 'hunt', [
        c('1', 'Filter by the suspected source', 'Search the source host and relevant destination or protocol over a bounded interval. Compare the pattern with normal admin routes.', 'Search for the computer making connections and the computers it contacted. Check a short time window first.', 730, 155, 550, 184),
        c('2', 'Review event distribution', 'Look for unusual fan-out, new destinations, and repeated protocol activity. A scan or management job can look similar; validate authorization.', 'See whether one computer suddenly contacted many others. It could also be an approved update or admin job, so check first.', 1650, 690, 1230, 800),
      ], 'When the lab requires it, document the source, destination set, protocol, interval, and the baseline or change record checked.'),
      s('Inspect packets for the selected connection', 'Endpoint pair · protocol sequence', 'Security Onion SOC → PCAP', '65_pcap_details.png', 'pcap', [
        c('1', 'Verify the endpoint pair', 'Match the packet endpoints and time to the Hunt event. Do not analyze an unrelated stream just because it has the same port.', 'Make sure the packet stream is for the same computers and time as your search result.', 1560, 170, 400, 205),
        c('2', 'Use packet details to test the hypothesis', 'Inspect protocol behavior and session completion. Packet evidence can show an attempt; it does not alone prove an interactive compromise.', 'Check what the connection did. A connection attempt does not prove someone got inside.', 1660, 840, 1020, 580),
      ], 'Record only the packet details that support or refute the movement hypothesis.'),
    ],
  },
  {
    topicId: 'phishing-analysis', minutes: 10,
    learn: ['Move from a reported message to a scoped, evidence-based investigation.', 'Track recipient, click, and account impact without opening suspicious content on a normal workstation.'],
    focus: ['Preserve original headers and timestamps.', 'Search for other recipients and clicks.', 'Use approved sandboxing and response steps.'],
    steps: [
      s('Create a case only when response requires tracking', 'Case title · comments · observables', 'Security Onion SOC → Cases', '57_2_cases_create.png', 'cases', [
        c('1', 'Describe the reported message factually', 'Use a title that identifies the investigation, not a conclusion. Keep the original email and header evidence in approved storage.', 'Name what you are checking, such as a reported message. Do not call it malicious before confirming.', 1020, 150, 800, 110),
        c('2', 'Keep evidence references in the case', 'Use comments and observables to preserve relevant sender, domain, URL, hash, and event references when policy permits.', 'Put the important clues in the approved case so another analyst can follow them.', 1400, 400, 1160, 400),
      ], 'Cases are optional for a practice exercise. Do not upload a live suspicious attachment unless policy explicitly permits it.'),
      s('Search and correlate the indicator', 'Search filters · related events', 'Security Onion SOC → Hunt', '56_hunt.png', 'hunt', [
        c('1', 'Search a safe indicator', 'Search the observed domain, sender, URL, or file hash in the appropriate available dataset. Avoid opening suspicious links on your everyday workstation.', 'Search for the suspicious address or file clue in the logs. Do not click the link on your own computer.', 720, 155, 550, 184),
        c('2', 'Scope recipients and interactions', 'Pivot through email, DNS, proxy, and endpoint sources where connected. Separate delivered, clicked, and credential-entered users.', 'Find who received it, who clicked it, and whether anyone entered a password. Those are different things.', 1640, 865, 1220, 800),
      ], 'Preserve original headers and evidence identifiers. Use the organization’s approved sandbox and account response workflow.'),
    ],
  },
  {
    topicId: 'playbooks', minutes: 8,
    learn: ['Read a detection’s response guidance before taking action.', 'Separate safe automation from decisions that require human approval.'],
    focus: ['What evidence triggers the playbook?', 'Which steps are advisory versus automatic?', 'Where is approval or escalation required?'],
    steps: [
      s('Open the detection guidance', 'Detection · response panel · playbook', 'Security Onion SOC → Detections', '60_detection_nids_3_playbook.png', 'detections', [
        c('1', 'Read the response guidance', 'Review the rule-specific response text and map each action to evidence and authority. A playbook is guidance; it does not authorize every action for every analyst.', 'Read the suggested response steps. You still need permission for actions that affect a user or computer.', 1100, 180, 940, 430),
        c('2', 'Check rule context before using it', 'Confirm the detection, status, and event context match this case. A playbook attached to a rule can be outdated or environment-specific.', 'Make sure these instructions fit the alert you are handling. Instructions can be old or meant for a different setup.', 1640, 240, 1630, 180),
      ], 'Use your approved incident playbook and record the version or owner if the lab asks. Escalate actions outside your access.'),
      s('Use a guided alert question as a decision aid', 'Suggested question · event pivot', 'Security Onion SOC → Alerts → Guided Analysis', '51_alerts_play.png', 'alerts', [
        c('1', 'Choose the next evidence check', 'A suggested question can help an analyst decide which source to inspect next. It is not a response command.', 'Use the question to decide what evidence to check next. It does not fix or contain anything.', 1050, 150, 810, 235),
        c('2', 'Escalate decisions that change production', 'Containment, account resets, and service shutdowns require the appropriate authority and impact review.', 'Ask the right person before disconnecting computers, changing accounts, or stopping services.', 1650, 740, 1230, 720),
      ], 'Do not run destructive or production-changing steps from a learning environment.'),
    ],
  },
  {
    topicId: 'case-documentation', minutes: 9,
    learn: ['Write notes another analyst can reproduce.', 'Separate observed facts, hypothesis, confidence, impact, and next action.'],
    focus: ['Use UTC and exact evidence references.', 'Avoid blame and unsupported conclusions.', 'State what remains unknown.'],
    steps: [
      s('Create a concise case record when required', 'Case title · description · severity', 'Security Onion SOC → Cases → New case', '57_2_cases_create.png', 'cases', [
        c('1', 'Write a factual case title', 'Identify the host or behavior under investigation. Use neutral terms such as “suspected” until corroborated.', 'Say what computer or activity you are checking. Use “suspected” when you are not certain yet.', 1030, 150, 800, 110),
        c('2', 'Set tracking fields consistently', 'Set severity, priority, status, and assignee according to the response policy. These fields track work; they do not establish a finding.', 'Use your team’s rules to set urgency and ownership. These labels do not prove what happened.', 1680, 390, 1730, 350),
      ], 'Create the case only if the exercise or response process calls for it.'),
      s('Write a reproducible evidence update', 'Comment · evidence reference · status', 'Security Onion SOC → Cases → Comments', '57_2_cases_create.png', 'cases', [
        c('1', 'Summarize query and evidence', 'State the UTC window, source, query or pivot, exact event references, observed facts, and confidence. Distinguish “observed” from “inferred.”', 'Write when you looked, where you looked, what you found, and how sure you are. Keep facts separate from guesses.', 1380, 565, 1100, 455),
        c('2', 'State the next action', 'Name the owner and next check or escalation. If evidence is incomplete, say what data is missing.', 'Write what should happen next and who should do it. Say if a log or other information is missing.', 1650, 200, 1620, 320),
      ], 'A useful note lets the next analyst reproduce your reasoning without exposing unnecessary personal or customer data.'),
    ],
  },
  {
    topicId: 'firewall-log-analysis', minutes: 9,
    learn: ['Read allow and deny events in network context.', 'Tell a scan, expected service, and policy misconfiguration apart.'],
    focus: ['Which rule and interface matched?', 'Did the connection pass or get blocked?', 'Did a similar connection succeed elsewhere?'],
    steps: [
      s('Find the firewall telemetry in Hunt', 'Query · time range · network event', 'Security Onion SOC → Hunt', '56_hunt.png', 'hunt', [
        c('1', 'Filter for the firewall source', 'Use the dataset and source fields available in your environment. Scope to the firewall and interval before looking for action, interface, and rule fields.', 'Search for the firewall logs and set the time. Then check which rule or interface handled the connection.', 720, 155, 550, 183),
        c('2', 'Compare allowed and denied activity', 'Review source, destination, port, action, bytes, and rule ID when present. A deny can indicate a blocked attempt or a legitimate service issue.', 'Check who connected, where they went, which port they used, and whether it was allowed or blocked.', 1660, 865, 1220, 800),
      ], 'The exact fields depend on the firewall parser. If a field is absent, note the telemetry gap rather than guessing.'),
      s('Check packet context for a selected connection', 'Source · destination · packet sequence', 'Security Onion SOC → PCAP', '65_pcap_details.png', 'pcap', [
        c('1', 'Match endpoints and timestamp', 'Confirm the PCAP stream corresponds to the same firewall event and time window before using it as corroboration.', 'Make sure the packet stream is from the same connection and time as the firewall log.', 1560, 170, 400, 205),
        c('2', 'Use the stream to test the policy outcome', 'Inspect handshake and packet sequence to see whether traffic completed. Packet evidence complements the firewall action; it does not replace the rule log.', 'Check whether the connection actually got through. Use the firewall rule log and packets together.', 1660, 835, 1030, 580),
      ], 'Packet capture is optional and depends on retention. Record a missing capture as a limitation.'),
    ],
  },
];
