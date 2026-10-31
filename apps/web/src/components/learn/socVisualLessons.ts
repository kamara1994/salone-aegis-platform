export type SocVisualCallout = {
  number: string;
  title: string;
  explanation: string;
  beginnerExplanation: string;
  pinX: number;
  pinY: number;
  targetX: number;
  targetY: number;
  targetRadius?: number;
  targetWidth?: number;
  targetHeight?: number;
};

export type SocVisualStep = {
  title: string;
  focus: string;
  location: string;
  image: string;
  source: string;
  sourceLabel?: string;
  licenseLabel?: string;
  licenseUrl?: string;
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
  targetRadius?: number,
  targetWidth?: number,
  targetHeight?: number,
): SocVisualCallout => ({ number, title, explanation, beginnerExplanation, pinX, pinY, targetX, targetY, targetRadius, targetWidth, targetHeight });

// Each frame is calibrated to the complete control, row, or text panel named
// by its teaching note. Shared screenshots use the same screen coordinates.
function calibrateCallouts(image: string, callouts: SocVisualCallout[]): SocVisualCallout[] {
  const file = image.split('/').at(-1) ?? image;
  return callouts.map((item) => {
    const text = `${item.title} ${item.explanation}`.toLowerCase();
    let target: Partial<SocVisualCallout> | undefined;

    if (file === '50_alerts.png') {
      if (/module|source and severity|source and confidence|suricata rule and module|event reference|event details|select the exact event|event row|keep the event/.test(text)) {
        target = { targetX: 840, targetY: 438, targetWidth: 1200, targetHeight: 54 };
      } else if (/rule|summary|detection context|severity|alert lead|alert says/.test(text)) {
        target = { targetX: 1695, targetY: 395, targetWidth: 420, targetHeight: 500 };
      }
    } else if (file === '56_hunt.png') {
      if (/returned evidence|results support|matching events|protocol records|review results|event distribution|success after failures|event with its surrounding evidence|allowed and denied activity|test behavior|results and grouping|compare matching events/.test(text)) {
        target = { targetX: 1240, targetY: 798, targetWidth: 1100, targetHeight: 58 };
      } else if (/time.*query|query.*time|time window|date|interval/.test(text)) {
        target = { targetX: 1010, targetY: 230, targetWidth: 1580, targetHeight: 150 };
      } else if (/time range|time window|date|interval/.test(text)) {
        target = { targetX: 1500, targetY: 188, targetWidth: 570, targetHeight: 62 };
      } else if (/query|filter|search|scope/.test(text)) {
        target = { targetX: 720, targetY: 226, targetWidth: 1020, targetHeight: 132 };
      } else if (/result|event|dataset|protocol|row|evidence|distribution|grouping|counts/.test(text)) {
        target = { targetX: 1240, targetY: 798, targetWidth: 1100, targetHeight: 58 };
      }
    } else if (file === '57_2_cases_create.png') {
      if (/title|name the case|factual title/.test(text)) {
        target = { targetX: 640, targetY: 114, targetWidth: 800, targetHeight: 50 };
      } else if (/comment|update|summari|evidence|finding|next action/.test(text)) {
        target = { targetX: 850, targetY: 500, targetWidth: 1200, targetHeight: 165 };
      } else if (/event/.test(text)) {
        target = { targetX: 1140, targetY: 223, targetWidth: 140, targetHeight: 48 };
      } else if (/owner|status|assignee|severity|priority/.test(text)) {
        target = { targetX: 1550, targetY: 245, targetWidth: 350, targetHeight: 150 };
      }
    } else if (file === '65_pcap_details.png') {
      if (/corroboration|query and response|dns response|exchange only|compare request and response/.test(text)) {
        target = { targetX: 565, targetY: 405, targetWidth: 670, targetHeight: 310 };
      } else if (/endpoint|source and destination|addresses and ports|stream header|verify source/.test(text)) {
        target = { targetX: 1450, targetY: 144, targetWidth: 790, targetHeight: 58 };
      } else if (/handshake|packet sequence|policy outcome|firewall action/.test(text)) {
        target = { targetX: 1060, targetY: 600, targetWidth: 1640, targetHeight: 850 };
      } else if (/payload|content|protocol evidence|packet detail|protocol fields/.test(text)) {
        target = { targetX: 1070, targetY: 805, targetWidth: 1670, targetHeight: 440 };
      } else if (/header|request|response/.test(text)) {
        target = { targetX: 565, targetY: 405, targetWidth: 670, targetHeight: 310 };
      }
    } else if (file === '62_pcap.png') {
      if (/flag|sequence|handshake|packet order|retransmission/.test(text)) {
        target = { targetX: 1720, targetY: 470, targetWidth: 190, targetHeight: 330 };
      } else if (/endpoint|source|destination|port|stream|time/.test(text)) {
        target = { targetX: 1250, targetY: 335, targetWidth: 970, targetHeight: 58 };
      } else if (/packet|exchange|connection/.test(text)) {
        target = { targetX: 1050, targetY: 570, targetWidth: 1660, targetHeight: 520 };
      }
    } else if (file === '51_alerts_play.png') {
      if (/crosshair|open the query|open the search/.test(text)) {
        target = { targetX: 340, targetY: 335, targetWidth: 48, targetHeight: 48 };
      } else if (/alert context|before escalating|production|containment|account reset|service shutdown/.test(text)) {
        target = { targetX: 1695, targetY: 395, targetWidth: 420, targetHeight: 500 };
      } else if (/verify.*answer|source events|timestamped results|returned results/.test(text)) {
        target = { targetX: 885, targetY: 550, targetWidth: 1130, targetHeight: 250 };
      } else if (/question|guided analysis|suggest/.test(text)) {
        target = { targetX: 845, targetY: 239, targetWidth: 1200, targetHeight: 162 };
      } else if (/result|answer|event/.test(text)) {
        target = { targetX: 1100, targetY: 500, targetWidth: 900, targetHeight: 330 };
      }
    } else if (file === '60_detection_nids.png') {
      if (/separate|coverage|attribution|title|summary|context/.test(text)) {
        target = { targetX: 850, targetY: 260, targetWidth: 1190, targetHeight: 350 };
      } else if (/condition|logic|match|signature/.test(text)) {
        target = { targetX: 850, targetY: 750, targetWidth: 1190, targetHeight: 600 };
      }
    } else if (file === '60_detection_nids_3_playbook.png') {
      if (/response guidance|suggested response|playbook/.test(text)) {
        target = { targetX: 850, targetY: 630, targetWidth: 1210, targetHeight: 860 };
      } else if (/rule context|status|detection/.test(text)) {
        target = { targetX: 1680, targetY: 200, targetWidth: 390, targetHeight: 250 };
      }
    } else if (file === '39_grid.png') {
      if (/inspect the collection node|select the relevant node|expand the node/.test(text)) {
        target = { targetX: 1060, targetY: 378, targetWidth: 1650, targetHeight: 58 };
      } else if (/service|health|healthy|collection|status/.test(text)) {
        target = { targetX: 1060, targetY: 720, targetWidth: 560, targetHeight: 640 };
      } else if (/node|sensor/.test(text)) {
        target = { targetX: 1060, targetY: 378, targetWidth: 1650, targetHeight: 58 };
      }
    } else if (file === '40_upload.png') {
      target = /upload button|submit|start the import/.test(text)
        ? { targetX: 1080, targetY: 660, targetWidth: 160, targetHeight: 48 }
        : { targetX: 960, targetY: 505, targetWidth: 450, targetHeight: 90 };
    } else if (file === '45_import.png' || file === '53_dashboards.png') {
      if (/query|import id|source and time|time range|scope/.test(text)) {
        target = { targetX: 1010, targetY: 220, targetWidth: 1580, targetHeight: 160 };
      } else if (/count|dataset|source group|chart|result/.test(text)) {
        target = { targetX: 1050, targetY: 715, targetWidth: 1640, targetHeight: 570 };
      }
    } else if (file === '57_0_cases.png') {
      if (/open an existing|existing record|matching case/.test(text)) {
        target = { targetX: 1050, targetY: 420, targetWidth: 1640, targetHeight: 300 };
      } else if (/plus|create|new case/.test(text)) {
        target = { targetX: 260, targetY: 183, targetWidth: 64, targetHeight: 54 };
      } else if (/filter|queue|status|includes|open cases/.test(text)) {
        target = { targetX: 900, targetY: 270, targetWidth: 1260, targetHeight: 105 };
      }
    } else if (file === '57_detections.png') {
      if (/enabled|coverage/.test(text)) {
        target = { targetX: 1540, targetY: 610, targetWidth: 600, targetHeight: 240 };
      } else if (/category|ruleset|detection/.test(text)) {
        target = { targetX: 1010, targetY: 610, targetWidth: 560, targetHeight: 240 };
      }
    } else if (file === '61_actions.png') {
      if (/choose pcap|action menu|select pcap/.test(text)) {
        target = { targetX: 930, targetY: 715, targetWidth: 310, targetHeight: 48 };
      } else if (/event row|matching event|start from/.test(text)) {
        target = { targetX: 1060, targetY: 906, targetWidth: 1640, targetHeight: 58 };
      }
    } else if (file === '72_jobs.png') {
      if (/open only|completed job|status column/.test(text)) {
        target = { targetX: 1620, targetY: 275, targetWidth: 420, targetHeight: 58 };
      } else if (/job|request|sensor|queued|match/.test(text)) {
        target = { targetX: 1060, targetY: 286, targetWidth: 1660, targetHeight: 58 };
      }
    } else if (file === 'mitre_navigator_enterprise.png') {
      target = { targetX: 91, targetY: 382, targetWidth: 130, targetHeight: 42 };
    }

    return target ? { ...item, ...target, targetRadius: undefined } : item;
  });
}

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
  source: page.startsWith('https://') ? page : `https://docs.securityonion.net/en/2.4/${page}.html`,
  ...(page.startsWith('https://mitre-attack.github.io/') ? { sourceLabel: 'MITRE ATT&CK Navigator · ATT&CK', licenseLabel: 'ATT&CK Terms of Use', licenseUrl: 'https://attack.mitre.org/resources/terms-of-use/' } : {}),
  callouts: calibrateCallouts(image, callouts),
  record,
});

export const SOC_VISUAL_LESSONS: SocVisualLesson[] = [
  {
    topicId: 'soc-roles', minutes: 7,
    learn: ['Recognize how an alert can move from initial review into a tracked case.', 'See where ownership and status live in the case workflow.'],
    focus: ['Who owns the next action?', 'Is the case still new, active, or resolved?', 'Does the next step exceed your authority?'],
    steps: [
      s('Review the alert before handing it off', 'Alert owner · rule · timestamp', 'Security Onion SOC → Alerts', '50_alerts.png', 'alerts', [
        c('1', 'Read the rule and time first', 'The alert is an investigation lead. Confirm the rule and UTC time before deciding which analyst or team should take the next step.', 'Read what the alert noticed and when. It is a clue, not proof.', 1650, 180, 1678, 345),
        c('2', 'Keep the event reference for hand-off', 'Use the event ID, host, and endpoints to route the work. A concise hand-off should say what is observed and what remains to check.', 'Write down which computer and event to check so the next person can find it.', 1420, 770, 850, 440),
      ], 'Carry the event reference, UTC time, host, and open question into case review; do not pass severity alone as a conclusion.'),
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
      s('Open matching network evidence only when it helps', 'Endpoint pair · packet sequence', 'Security Onion SOC → PCAP', '65_pcap_details.png', 'pcap', [
        c('1', 'Match the stream to a result', 'Confirm the endpoints, ports, and time correspond to the event from Hunt. If capture is unavailable, the search result remains the evidence you have.', 'Check that these packets are from the same computers and time as your search. Packets may not have been saved.', 1650, 205, 1270, 135),
        c('2', 'Use packet details to answer one question', 'Inspect only the protocol fields that confirm or weaken the hypothesis. A stream can show an exchange, not intent or attribution.', 'Look for the part that answers your question. A conversation by itself does not explain why it happened.', 870, 650, 930, 700),
      ], 'Keep PCAP references only when needed. State whether the stream confirmed a detail or was unavailable.'),
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
      s('Confirm the import produced the expected dataset', 'Import ID · event module · time range', 'Security Onion SOC → Dashboards → imported dataset', '45_import.png', 'first-time-users', [
        c('1', 'Confirm this is your import', 'Keep the displayed import ID and time interval tied to the lab file. Do not mix these records with unrelated live events.', 'Check that this dashboard is showing the file you just uploaded and its dates.', 990, 135, 700, 220),
        c('2', 'Use counts as a source check', 'Event-module and dataset counts show what was imported. Open the matching rows in Hunt before interpreting a chart as an event finding.', 'The chart tells you what kind of logs arrived. Open a log row to see what it actually says.', 1240, 740, 1120, 625),
      ], 'Carry the import ID and event time into Hunt; missing counts may reflect parser or source limitations rather than absent activity.'),
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
      s('Verify the lead in Hunt', 'OQL query · matching events · time range', 'Security Onion SOC → Hunt', '56_hunt.png', 'hunt', [
        c('1', 'Carry the alert time into the query', 'Constrain the search around the alert and select the dataset that can answer the question. Use the environment’s actual field names.', 'Search the same time as the alert and choose the kind of log that can answer your question.', 715, 150, 550, 183),
        c('2', 'Check whether results support the lead', 'Inspect source events and compare another data source when available. A zero-result query may reflect a narrow filter or missing telemetry.', 'Look at the real event rows. No results can mean your search is too narrow or the logs are missing.', 1600, 700, 1230, 800),
      ], 'Use the verified event reference and observed behavior to choose a disposition. Do not rely on Guided Analysis text alone.'),
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
      s('Corroborate with a matching packet stream when available', 'Endpoints · ports · packet sequence', 'Security Onion SOC → PCAP', '62_pcap.png', 'pcap', [
        c('1', 'Match the stream to the indicator event', 'Compare endpoints, ports, and timestamp with the Hunt result. A packet from another host or time is not corroboration.', 'Make sure these packets belong to the result you found, not a different computer or time.', 1200, 260, 1115, 330),
        c('2', 'Interpret the exchange cautiously', 'Packet metadata can confirm communication and protocol state. It does not prove that an indicator is malicious or that a host was compromised.', 'Packets show a connection happened. They do not prove the computer was attacked.', 1650, 420, 1410, 390),
      ], 'Record the matching stream and the specific supporting field only if the PCAP exists and the exercise asks for corroboration.'),
    ],
  },
  {
    topicId: 'mitre-attack', minutes: 8,
    learn: ['Use ATT&CK to name observed adversary behavior consistently.', 'Keep the difference between tactic, technique, and detection coverage clear.'],
    focus: ['Map what the evidence shows, not what the alert title implies.', 'A technique mapping is not proof of attribution.', 'Use gaps to guide testing, not to claim complete coverage.'],
    steps: [
      s('Start from a behavior supported by evidence', 'Technique matrix · tactic columns', 'MITRE ATT&CK Navigator → Enterprise matrix', 'mitre_navigator_enterprise.png', 'https://mitre-attack.github.io/attack-navigator/v3/enterprise/', [
        c('1', 'Find a candidate technique, then verify it in evidence', 'The matrix groups techniques under tactics. Use the incident behavior and ATT&CK descriptions to identify a candidate; this blank layer shows no organization coverage, and the technique name is not proof that it occurred.', 'Use the map to find a name for behavior you observed. The map does not prove the behavior happened or that your tools can detect it.', 145, 320, 91, 382, 25),
      ], 'Use the behavior you observed to select a candidate technique. Keep the event reference and confidence with the mapping.'),
      s('Understand which detection types are enabled', 'Detection types · rulesets · enabled state', 'Security Onion SOC → Detections', '57_detections.png', 'detections', [
        c('1', 'Review detection categories', 'The table groups detection content such as Suricata, YARA, and Sigma. These are different detection mechanisms and may cover different ATT&CK behavior.', 'These rows show different kinds of security rules. Each kind can notice different things.', 910, 620, 920, 680),
        c('2', 'Check enabled state and coverage limits', 'Enabled rulesets do not demonstrate complete technique coverage. Confirm the relevant rule is active and test the behavior in a controlled lab.', 'A rule being turned on does not mean it can catch every attack. Test the rule safely in the lab.', 1560, 550, 1640, 620),
      ], 'Do not claim a technique is detected from the enabled count alone. Keep the rule or event reference with your mapping.'),
      s('Compare the candidate to a real detection rule', 'Rule behavior · detection logic · limits', 'Security Onion SOC → Detections → rule details', '60_detection_nids.png', 'detections', [
        c('1', 'Read what the rule actually matches', 'The example rule detects a specific HTTP POST pattern. Compare its logic with your observed behavior; a similar title is not enough to claim a match.', 'Read the rule’s actual conditions. A name that sounds similar does not mean it matches your event.', 960, 400, 700, 455),
        c('2', 'Keep coverage separate from attribution', 'This is an example phishing rule, not a mapping for every ATT&CK technique. Record a technique only when the observed behavior fits its definition and the event supports it.', 'This rule is just one example. Only choose a technique if your evidence really matches it.', 1690, 265, 1660, 380),
      ], 'Record the technique ID, exact event, relevant rule logic, confidence, and alternatives. The example phishing rule is illustrative, not a one-to-one mapping.'),
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
      s('Check that the PCAP job completed', 'Job status · sensor · time queued', 'Security Onion SOC → PCAP → job list', '72_jobs.png', 'pcap', [
        c('1', 'Match the job to your request', 'Verify the job ID, sensor, and queued time match the event pivot. A completed job means the stream was retrieved, not that it is malicious.', 'Make sure this is the packet job you just requested. “Completed” only means it loaded.', 520, 260, 700, 275),
        c('2', 'Open only the matching completed job', 'Use the available PCAP action on the matching job. If it failed or returned no stream, continue with event metadata and document the capture gap.', 'Open the packet result for this same event. If it failed, use the logs you do have and note that packets are missing.', 1620, 270, 1650, 275),
      ], 'Carry the matching job/stream reference forward. A missing capture is a visibility limit, not evidence that no traffic occurred.'),
      s('Read endpoints and packet sequence', 'Endpoint pair · packet list · protocol flags', 'Security Onion SOC → PCAP', '62_pcap.png', 'pcap', [
        c('1', 'Verify the endpoint pair and ports', 'Compare source and destination addresses and ports with the original event before interpreting packet flags or volume.', 'Check the from and to computers and ports. Make sure they match the alert you opened.', 1200, 260, 1115, 330),
        c('2', 'Read the packet sequence', 'SYN, ACK, and FIN flags help describe a connection sequence. Retransmissions or a missing handshake can indicate failure, but do not by themselves identify intent.', 'The flags show how the connection started or ended. A failed connection does not tell you why it happened.', 1650, 420, 1410, 390),
      ], 'Carry the matching stream ID, endpoints, protocol, and the specific sequence evidence into packet detail only if it answers the question.'),
      s('Read the stream before reading payload', 'Endpoints · packet detail · protocol data', 'Security Onion SOC → PCAP', '65_pcap_details.png', 'pcap', [
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
      s('Inspect the rule that generated the alert', 'Detection source · rule signature', 'Security Onion SOC → Detections → rule details', '60_detection_nids.png', 'detections', [
        c('1', 'Read the rule logic and scope', 'The detection detail explains which protocol pattern the rule matches. Validate that this is the rule referenced by your alert before using it to interpret behavior.', 'Read what this rule looks for and make sure your alert came from this rule.', 960, 410, 700, 455),
        c('2', 'Separate a signature match from a session story', 'A signature match is an analytic result. Use the event and independent Zeek records to determine whether the connection completed and what else occurred.', 'The rule says a pattern matched. Check the network records to learn what happened around it.', 1690, 265, 1660, 380),
      ], 'Carry the rule ID, event ID, timestamp, and matching Zeek records into the correlation step.'),
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
        c('2', 'Check the collector service status', 'Review the relevant container rows and their status in this Grid view. A healthy service still does not prove a specific host event or data type is arriving; validate that in Hunt afterward.', 'Check that the log-collection services are running. Green means the service is up, but you still need to check Hunt for the computer event.', 720, 160, 550, 182),
      ], 'Record host, expected source, time window, and any missing telemetry in the lab worksheet when required.'),
      s('Use offline Windows evidence in a lab', 'EVTX upload · imported dataset', 'Security Onion SOC → Grid → Import', '40_upload.png', 'grid', [
        c('1', 'Choose the supplied EVTX', 'This import path supports offline EVTX evidence in the appropriate deployment. It is not a live EDR response control and cannot isolate a machine.', 'Upload the event log file the lab gives you. This does not connect to or control the real computer.', 1020, 520, 1000, 470),
        c('2', 'Submit the selected lab file', 'After choosing the supplied EVTX, verify its filename, then use Upload in the approved lab environment. Continue to the imported dataset view to inspect event fields; this screen alone does not show the resulting data.', 'After choosing the lab file, check its name and select Upload. Then open the results on the next screen.', 1120, 620, 1080, 660),
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
      s('Match the DNS event to its packet stream', 'Endpoints · packet list · DNS connection', 'Security Onion SOC → PCAP', '62_pcap.png', 'pcap', [
        c('1', 'Verify the endpoint and time', 'Match the packet job to the DNS event’s host, resolver, and UTC interval. Do not assume a packet list is the same exchange without checking.', 'Check that the packet is from the computer and time in your DNS result.', 1200, 260, 1115, 330),
        c('2', 'Use packets to confirm the exchange only', 'The packet sequence can confirm communication occurred; DNS name and response interpretation still depend on the corresponding DNS fields or decoded payload.', 'Packets can show computers talked. Use the DNS name and answer from the DNS record to know what they said.', 1650, 420, 1410, 390),
      ], 'If the stream matches, carry its ID and time into the detail view. If no capture exists, retain the DNS event and document the limit.'),
      s('Check packet details only when available', 'DNS response · packet data', 'Security Onion SOC → PCAP', '65_pcap_details.png', 'pcap', [
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
      s('Document escalation only if the evidence warrants it', 'Case ID · owner · status', 'Security Onion SOC → Cases', '57_2_cases_create.png', 'cases', [
        c('1', 'Keep the title factual', 'Use a neutral title while investigation is ongoing. The case summary is a tracking field, not a verdict.', 'Name what you are checking without saying it is proven.', 1320, 135, 1020, 111),
        c('2', 'Route the next identity check', 'Set owner and status according to policy. Escalate likely compromise to the identity response owner; do not reset or disable accounts without authority.', 'Assign the next check to the right person. Do not change an account unless you are allowed to.', 1690, 375, 1560, 255),
      ], 'Create or update a case only when required; include failures, any later success, scope, confidence, and the next authorized action.'),
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
      s('Review the matching packet sequence', 'Endpoint pair · ports · TCP flags', 'Security Onion SOC → PCAP', '62_pcap.png', 'pcap', [
        c('1', 'Confirm the source and destination', 'Match the packet endpoints and time to the Hunt record. Do not infer a lateral movement path from a shared port alone.', 'Check that these packets are between the same two computers at the right time.', 1200, 260, 1115, 330),
        c('2', 'Check whether the connection completed', 'Read flags and packet order to distinguish an attempted connection from an established exchange. Authentication and process evidence are still needed to establish use.', 'See if the connection started and exchanged data. You still need computer logs to know who used it.', 1650, 420, 1410, 390),
      ], 'Carry only the matching stream reference and protocol sequence to the detailed view; packet evidence alone does not prove access.'),
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
      s('Review the phishing detection rule', 'Rule title · HTTP request pattern · detection logic', 'Security Onion SOC → Detections → rule details', '60_detection_nids.png', 'detections', [
        c('1', 'Confirm what this example rule detects', 'The rule title and summary describe a specific phishing pattern: an HTTP POST associated with a Telstra lure. It is an example rule, not evidence about the learner’s organization.', 'This example rule looks for one kind of phishing web activity. It is not an alert from your own company.', 1100, -40, 600, 105, undefined, 720, 52),
        c('2', 'Inspect the actual match conditions', 'The rule checks HTTP method, URI, and request-body content. Those conditions explain what can trigger this signature; they do not reveal the email sender, recipients, or whether credentials were submitted.', 'Read the checks in the rule. They can show a web request pattern, but not who got the email or entered a password.', 460, 740, 355, 818, undefined, 250, 52),
      ], 'Carry the rule ID and event reference into Hunt. Verify sender, recipient, delivery, and clicks in the approved mail security system.'),
      s('Search and correlate the indicator', 'Search filters · related events', 'Security Onion SOC → Hunt', '56_hunt.png', 'hunt', [
        c('1', 'Search a safe indicator', 'Search the observed domain, sender, URL, or file hash in the appropriate available dataset. Avoid opening suspicious links on your everyday workstation.', 'Search for the suspicious address or file clue in the logs. Do not click the link on your own computer.', 720, 155, 550, 184),
        c('2', 'Scope recipients and interactions', 'Pivot through email, DNS, proxy, and endpoint sources where connected. Separate delivered, clicked, and credential-entered users.', 'Find who received it, who clicked it, and whether anyone entered a password. Those are different things.', 1640, 865, 1220, 800),
      ], 'This Hunt view only answers questions for sources actually ingested. Use mail telemetry to verify delivery and clicks; use endpoint or identity logs to assess impact.'),
      s('Document and route only when required', 'Case title · owner · status · evidence reference', 'Security Onion SOC → Cases', '57_2_cases_create.png', 'cases', [
        c('1', 'Use a factual case title', 'Identify the message or behavior under investigation without declaring it malicious before evidence supports that conclusion.', 'Name what you are checking. Do not call it malicious until you have proof.', 1320, 135, 1020, 111),
        c('2', 'Summarize evidence and next action', 'Link approved evidence references, separate observation from inference, and route mail or account checks to the authorized owner.', 'Write what you found, what is still unknown, and who should check it next.', 1410, 322, 1120, 493),
      ], 'Create or update a case only if policy or the exercise requires it. Preserve original headers and attachments in approved evidence storage.'),
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
        c('2', 'Use alert context before escalating', 'This alert panel provides rule context, not a containment control. If evidence supports a production change, use the approved response workflow and obtain the right authority.', 'This panel helps explain the alert. It does not disconnect or fix anything. Ask the approved response owner before changing a computer or account.', 1650, 740, 1230, 720),
      ], 'Do not run destructive or production-changing steps from a learning environment.'),
    ],
  },
  {
    topicId: 'case-documentation', minutes: 9,
    learn: ['Write notes another analyst can reproduce.', 'Separate observed facts, hypothesis, confidence, impact, and next action.'],
    focus: ['Use UTC and exact evidence references.', 'Avoid blame and unsupported conclusions.', 'State what remains unknown.'],
    steps: [
      s('Find the correct case in the queue', 'Case filter · matching record · create control', 'Security Onion SOC → Cases', '57_0_cases.png', 'cases', [
        c('1', 'Check filters before searching', 'Confirm the case status and filter scope. An empty queue under one filter does not prove that no case exists.', 'Check the filters first. An empty list may be hiding cases with another status.', 620, 220, 320, 275),
        c('2', 'Open an existing record or create when required', 'Open the matching case if one exists. Create a new one only when the exercise or response workflow calls for it.', 'Open the right case if it is already there. Start a new one only if your lab or team asks.', 245, 200, 270, 183),
      ], 'Carry the correct case ID into the details view. Avoid creating duplicate cases for the same investigation.'),
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
