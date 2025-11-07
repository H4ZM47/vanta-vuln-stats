# User Journey Maps - Vanta Vulnerability Management

## Journey Map 1: Daily Vulnerability Triage (Sam - Security Analyst)

### Scenario
Sam starts his workday and needs to triage new critical and high vulnerabilities discovered overnight, assign them to appropriate teams, and track status of ongoing remediation efforts.

---

### Phases

#### Phase 1: Morning Check-In (15-20 minutes)
**Goal:** Understand what changed overnight

| Step | Action | Tool | Time | Emotion | Pain Points |
|------|--------|------|------|---------|-------------|
| 1 | Receive Slack alert about new critical vulnerabilities | Slack | 1 min | 😟 Anxious | Alerts lack context |
| 2 | Open Vanta web UI in browser | Browser | 30 sec | 😐 Neutral | Slow page load |
| 3 | Check dashboard for new critical/high count | Vanta | 2 min | 😟 Concerned | No "what changed" view |
| 4 | Manually note current counts in notebook | Notebook | 2 min | 😤 Frustrated | Manual tracking |
| 5 | Navigate to vulnerability list, apply Critical filter | Vanta | 1 min | 😐 Neutral | Page reload for each filter |
| 6 | Scan through list, identify new ones (no easy way to see "new since yesterday") | Vanta | 5 min | 😤 Frustrated | No change tracking |
| 7 | Open separate tab for each new critical to review | Vanta | 5 min | 😤 Frustrated | Slow page loads, back/forth navigation |

**Emotional State:** 😟 → 😤 (Anxiety turning to frustration)
**Current Time Spent:** 15-20 minutes
**Ideal Time:** 3-5 minutes
**Opportunity:** Activity timeline showing "what changed" would eliminate steps 4-6

---

#### Phase 2: Detailed Triage (45-60 minutes for 10 vulnerabilities)
**Goal:** Assess each vulnerability and determine priority & ownership

| Step | Action | Tool | Time | Emotion | Pain Points |
|------|--------|------|---------|-------------|
| 1 | Click into first critical vulnerability | Vanta | 10 sec | 😐 Neutral | Slow load (2-3 sec each) |
| 2 | Read CVE description | Vanta | 1 min | 🤔 Thinking | Generic description, not contextual |
| 3 | Copy CVE number, Google it | Google | 30 sec | 😐 Neutral | Context switching |
| 4 | Check NVD for details | NVD website | 2 min | 🤔 Analyzing | Manual research required |
| 5 | Check ExploitDB for public exploits | ExploitDB | 1 min | 😟 Anxious if found | Another tool |
| 6 | Check Twitter/security blogs for discussion | Twitter | 2 min | 🤔 Assessing | Time-consuming |
| 7 | Determine which asset/service is affected | Vanta | 1 min | 🤔 Thinking | Asset ID, not name |
| 8 | Cross-reference with internal asset inventory | Confluence | 1 min | 😤 Frustrated | Another tool |
| 9 | Assess: Production vs dev? Internet-facing? | Architecture docs | 2 min | 🤔 Analyzing | Manual correlation |
| 10 | Decide severity override (if CVSS doesn't match reality) | Spreadsheet | 1 min | 😤 Frustrated | Can't override in Vanta |
| 11 | Determine owning team | Mental model | 1 min | 🤔 Thinking | Not documented |
| 12 | Navigate back to vulnerability list | Vanta | 5 sec | 😐 Neutral | Lost place in list |
| 13 | **Repeat for next 9 vulnerabilities** | All tools | 45 min | 😫 Exhausted | Repetitive, manual |

**Emotional State:** 😐 → 🤔 → 😤 → 😫 (Engaged thinking deteriorating to exhaustion)
**Current Time Spent:** 45-60 minutes for 10 vulnerabilities
**Ideal Time:** 15-20 minutes
**Opportunity:** Integrated research panel + asset context + smart recommendations would eliminate steps 3-9

---

#### Phase 3: Assignment & Ticket Creation (30-45 minutes for 10 vulnerabilities)
**Goal:** Create Jira tickets and assign to appropriate teams

| Step | Action | Tool | Time | Emotion | Pain Points |
|------|--------|------|---------|-------------|
| 1 | Open Jira in new tab | Jira | 10 sec | 😐 Neutral | Context switching |
| 2 | Click "Create Issue" | Jira | 5 sec | 😐 Neutral | - |
| 3 | Select project and issue type | Jira | 10 sec | 😐 Neutral | Have to remember which project |
| 4 | Copy vulnerability title from Vanta | Vanta | 5 sec | 😐 Neutral | Manual copy-paste |
| 5 | Paste into Jira title | Jira | 5 sec | 😐 Neutral | - |
| 6 | Copy description, CVE, CVSS, affected asset | Vanta | 30 sec | 😐 Neutral | No "copy all" |
| 7 | Paste and format in Jira description | Jira | 1 min | 😤 Frustrated | Manual formatting |
| 8 | Add remediation guidance | Jira | 1 min | 🤔 Writing | Have to write it out |
| 9 | Set priority, assign to team | Jira | 30 sec | 😐 Neutral | - |
| 10 | Add labels (security, vulnerability, severity) | Jira | 20 sec | 😐 Neutral | - |
| 11 | Set due date based on SLA | Jira | 20 sec | 🤔 Calculating | Manual date calculation |
| 12 | Save Jira ticket | Jira | 5 sec | 😐 Neutral | - |
| 13 | Copy Jira ticket URL | Jira | 5 sec | 😐 Neutral | - |
| 14 | Go back to Vanta vulnerability | Vanta | 5 sec | 😐 Neutral | - |
| 15 | Find field to add Jira link (if exists) | Vanta | 10 sec | 😤 Frustrated | No good place for it |
| 16 | Navigate to Slack, find team channel | Slack | 15 sec | 😐 Neutral | Another tool |
| 17 | @ mention team, paste Jira link, add context | Slack | 1 min | 😐 Neutral | Manual notification |
| 18 | **Repeat for next 9 vulnerabilities** | All tools | 40 min | 😫 Exhausted | Repetitive clicking |

**Emotional State:** 😐 → 😤 → 😫 (Steady frustration building to burnout)
**Current Time Spent:** 30-45 minutes for 10 tickets
**Ideal Time:** 5 minutes (bulk operation)
**Opportunity:** Bulk ticket creation + template system + auto-notification would eliminate repetition

---

#### Phase 4: Status Tracking (30-40 minutes, throughout day)
**Goal:** Check on progress of assigned vulnerabilities

| Step | Action | Tool | Time | Emotion | Pain Points |
|------|--------|------|---------|-------------|
| 1 | Open list of 20-30 "In Progress" vulnerabilities | Vanta | 1 min | 😐 Neutral | Have to apply filter again |
| 2 | Click into first one | Vanta | 5 sec | 😐 Neutral | Slow load |
| 3 | Check Jira link (if saved) | Vanta → Jira | 15 sec | 😐 Neutral | May not be linked |
| 4 | Check Jira ticket for updates | Jira | 1 min | 🤔 Checking | May have no updates |
| 5 | Check Slack for messages from engineer | Slack | 30 sec | 🤔 Checking | Threads lost in noise |
| 6 | No update? Send Slack ping | Slack | 1 min | 😤 Frustrated | Feels like nagging |
| 7 | If fixed, verify in Vanta | Vanta | 1 min | 😐 Neutral | Manual verification |
| 8 | Update vulnerability status (if possible) | Vanta | 30 sec | 😐 Neutral | May need to wait for scan |
| 9 | Close Jira ticket | Jira | 30 sec | 😐 Neutral | - |
| 10 | **Repeat for 20-30 vulnerabilities** | All tools | 30 min | 😫 Exhausted | Repetitive, manual |

**Emotional State:** 😐 → 😤 → 😫 (Neutral to frustrated to exhausted)
**Current Time Spent:** 30-40 minutes daily
**Ideal Time:** 5 minutes (with automatic status sync)
**Opportunity:** Integrated status view + automatic sync + smart alerts would eliminate most manual checking

---

### Overall Journey Summary

**Total Daily Time:** 2-3 hours
**Emotional Arc:** 😟 → 😐 → 🤔 → 😤 → 😫 (Anxiety → Engaged → Frustrated → Exhausted)
**Main Bottlenecks:**
1. Manual research and context gathering (45 min)
2. Repetitive ticket creation (40 min)
3. Status checking across systems (35 min)

**Ideal State:**
- **Total Time:** 30-45 minutes
- **Emotional Arc:** 😐 → 🤔 → 😊 (Neutral → Engaged → Satisfied)
- **Key Improvements:**
  - Activity timeline (eliminate manual change tracking)
  - Integrated research panel (eliminate manual Googling)
  - Bulk operations (create 10 tickets in one action)
  - Automatic status sync (eliminate manual checking)

---

## Journey Map 2: Weekly Executive Reporting (Jessica - Security Manager)

### Scenario
Every Monday morning, Jessica needs to prepare a vulnerability summary report for the CISO, who presents it to the executive team at 10 AM.

---

### Phases

#### Phase 1: Data Export (20-30 minutes)
**Goal:** Get raw vulnerability data out of Vanta

| Step | Action | Tool | Time | Emotion | Pain Points |
|------|--------|------|---------|-------------|
| 1 | Log into Vanta | Vanta | 30 sec | 😐 Neutral | - |
| 2 | Navigate to vulnerability list | Vanta | 10 sec | 😐 Neutral | - |
| 3 | Export all vulnerabilities to CSV | Vanta | 2 min | 😐 Neutral | Exports EVERYTHING (50+ columns) |
| 4 | Download completes, open in Excel | Excel | 1 min | 😐 Neutral | Large file, slow |
| 5 | Realize she needs last week's export for comparison | Excel | 5 sec | 😤 Frustrated | Should have saved it |
| 6 | Try to remember where she saved last week's file | Finder | 2 min | 😤 Frustrated | No standardized naming |
| 7 | Can't find it, have to recreate from memory | Google Drive | 5 min | 😠 Angry | Lost work |
| 8 | Find another export from 2 weeks ago, use that | Google Drive | 3 min | 😤 Frustrated | Suboptimal |

**Emotional State:** 😐 → 😤 → 😠 (Neutral to frustrated to angry)
**Current Time Spent:** 20-30 minutes
**Ideal Time:** 0 minutes (automatic export with historical comparison)
**Opportunity:** Scheduled exports with version history

---

#### Phase 2: Data Cleaning & Calculation (45-60 minutes)
**Goal:** Transform raw data into usable metrics

| Step | Action | Tool | Time | Emotion | Pain Points |
|------|--------|------|---------|-------------|
| 1 | Delete 40+ columns she doesn't need | Excel | 5 min | 😤 Frustrated | Manual column deletion |
| 2 | Fix date formatting (ISO8601 → readable) | Excel | 3 min | 😐 Neutral | Inconsistent formats |
| 3 | Add "Days Open" calculated column | Excel | 2 min | 🤔 Working | Formula: =TODAY()-discovery_date |
| 4 | Add "Status" column (deactivated vs active) | Excel | 3 min | 🤔 Working | Not clear in export |
| 5 | Create pivot table for severity breakdown | Excel | 5 min | 🤔 Working | - |
| 6 | Calculate week-over-week change | Excel | 5 min | 🤔 Working | Comparing to old export |
| 7 | Calculate mean time to remediate | Excel | 10 min | 😤 Frustrated | Complex formula, breaks often |
| 8 | Filter to only production environments | Excel | 2 min | 😐 Neutral | Asset tags inconsistent |
| 9 | Create summary statistics | Excel | 5 min | 🤔 Working | - |
| 10 | Find errors in data (duplicate IDs, nulls) | Excel | 5 min | 😠 Angry | Data quality issues |
| 11 | Manually fix data errors | Excel | 10 min | 😠 Angry | Shouldn't be needed |
| 12 | Re-run calculations after fixing | Excel | 5 min | 😤 Frustrated | - |

**Emotional State:** 🤔 → 😤 → 😠 (Engaged work turning to frustration and anger)
**Current Time Spent:** 45-60 minutes
**Ideal Time:** 5 minutes (pre-calculated metrics)
**Opportunity:** Built-in metrics calculator with validation

---

#### Phase 3: Chart Creation (30-40 minutes)
**Goal:** Create visualizations for executive consumption

| Step | Action | Tool | Time | Emotion | Pain Points |
|------|--------|------|---------|-------------|
| 1 | Select data for severity pie chart | Excel | 1 min | 😐 Neutral | - |
| 2 | Insert chart, format colors | Excel | 5 min | 😐 Neutral | Excel defaults are ugly |
| 3 | Manually set colors (red=critical, orange=high, etc.) | Excel | 3 min | 😤 Frustrated | Have to do this every week |
| 4 | Adjust label sizes for readability | Excel | 2 min | 😐 Neutral | - |
| 5 | Create trend line chart (last 4 weeks) | Excel | 8 min | 🤔 Working | Need to manually structure data |
| 6 | Create bar chart for integration sources | Excel | 5 min | 😐 Neutral | - |
| 7 | Export charts as images | Excel | 2 min | 😐 Neutral | - |
| 8 | Realize chart labels are cut off | Excel | 1 min | 😤 Frustrated | - |
| 9 | Resize and re-export | Excel | 2 min | 😤 Frustrated | - |
| 10 | Open Google Slides | Google Slides | 30 sec | 😐 Neutral | - |
| 11 | Find last week's presentation template | Google Drive | 2 min | 😐 Neutral | - |
| 12 | Replace images with new charts | Google Slides | 5 min | 😐 Neutral | Manual replacement |
| 13 | Update numbers on slides | Google Slides | 3 min | 😐 Neutral | Manual typing |

**Emotional State:** 😐 → 🤔 → 😤 (Neutral work with spikes of frustration)
**Current Time Spent:** 30-40 minutes
**Ideal Time:** 2 minutes (one-click export to slides)
**Opportunity:** Template-based chart generation with auto-export

---

#### Phase 4: Narrative & Review (15-20 minutes)
**Goal:** Add context and executive summary

| Step | Action | Tool | Time | Emotion | Pain Points |
|------|--------|------|---------|-------------|
| 1 | Write executive summary paragraph | Google Slides | 5 min | 🤔 Writing | What's the story? |
| 2 | Add annotations to explain spike in March | Google Slides | 2 min | 🤔 Explaining | Have to remember why |
| 3 | Highlight key metrics (critical count down 30%) | Google Slides | 2 min | 😊 Positive | Good news to share |
| 4 | Add "action items" slide | Google Slides | 3 min | 🤔 Writing | - |
| 5 | Proofread for errors | Google Slides | 2 min | 😐 Neutral | - |
| 6 | Realize MTTR calculation was wrong | Google Slides | 10 sec | 😱 Panic | - |
| 7 | Go back to Excel, fix formula | Excel | 5 min | 😤 Frustrated | Breaking changes |
| 8 | Re-export chart, replace in slides | Google Slides | 3 min | 😤 Frustrated | Rework |
| 9 | Final review | Google Slides | 2 min | 😐 Neutral | - |
| 10 | Send to CISO via email | Gmail | 1 min | 😊 Satisfied | Done! |

**Emotional State:** 🤔 → 😊 → 😱 → 😤 → 😊 (Engaged work, brief satisfaction, panic, frustration, relief)
**Current Time Spent:** 15-20 minutes (or 25-30 if errors found)
**Ideal Time:** 5 minutes (review only, auto-generated)
**Opportunity:** AI-generated insights + narrative suggestions

---

### Overall Journey Summary

**Total Weekly Time:** 2-3 hours every Monday morning
**Emotional Arc:** 😐 → 🤔 → 😤 → 😠 → 😱 → 😊 (Complex emotional journey with multiple pain points)
**Main Bottlenecks:**
1. Data cleaning and calculation (60 min)
2. Chart creation and formatting (35 min)
3. Finding and fixing data errors (15 min)

**Ideal State:**
- **Total Time:** 15-20 minutes (just narrative and review)
- **Emotional Arc:** 😐 → 🤔 → 😊 (Neutral → Engaged → Satisfied)
- **Key Improvements:**
  - Automatic weekly export with calculations
  - Pre-formatted charts in executive template
  - Historical comparison built-in
  - Data validation and error checking

---

## Journey Map 3: SOC 2 Audit Preparation (Marcus - Compliance Officer)

### Scenario
Marcus has 2 weeks to prepare for the annual SOC 2 Type II audit. Auditors will review vulnerability management as part of the CC7.1 control (threat identification and management).

---

### Phases

#### Phase 1: Evidence Gathering (20-30 hours over 2 weeks)
**Goal:** Compile all vulnerability data for 12-month audit period

| Step | Action | Tool | Time | Emotion | Pain Points |
|------|--------|------|---------|-------------|
| 1 | Review audit request list | Email | 30 min | 😟 Anxious | Long list of requirements |
| 2 | Find monthly Vanta exports (hopefully saved) | Google Drive | 1 hour | 😤 Frustrated | Inconsistent file naming |
| 3 | Realize March and August exports are missing | Google Drive | 5 min | 😱 Panic | Major gap |
| 4 | Try to reconstruct from Slack history | Slack | 3 hours | 😠 Angry | Time-consuming |
| 5 | Export current Vanta data (only has last 90 days) | Vanta | 30 min | 😤 Frustrated | Historical data purged |
| 6 | Create master spreadsheet | Excel | 2 hours | 🤔 Working | Manual data aggregation |
| 7 | For each month, list all critical/high vulnerabilities | Excel | 8 hours | 😫 Exhausted | 12 months × 40 min each |
| 8 | Find corresponding Jira tickets for each vulnerability | Jira | 6 hours | 😤 Frustrated | Search is slow |
| 9 | Download Jira ticket details and attachments | Jira | 2 hours | 😐 Neutral | - |
| 10 | Link vulnerability ID to Jira ticket ID | Excel | 1 hour | 😐 Neutral | Manual correlation |
| 11 | For SLA misses, find exception approval emails | Gmail | 3 hours | 😤 Frustrated | Email search is painful |
| 12 | Calculate SLA compliance for each month | Excel | 2 hours | 🤔 Working | Complex formula |
| 13 | Create trend charts | Excel | 1 hour | 😐 Neutral | - |

**Emotional State:** 😟 → 😤 → 😱 → 😠 → 😫 (Anxiety escalating to panic and anger)
**Current Time Spent:** 20-30 hours
**Ideal Time:** 2-3 hours (automated evidence compilation)
**Opportunity:** Historical data warehouse with queryable audit trail

---

#### Phase 2: Sample Selection & Evidence Packets (12-15 hours)
**Goal:** For 25 auditor-selected samples, compile complete evidence

| Step | Action | Tool | Time | Emotion | Pain Points |
|------|--------|------|---------|-------------|
| 1 | Receive auditor sample list (25 vulnerabilities) | Email | 10 min | 😟 Anxious | Short timeline |
| 2 | For each sample, find original scan result | Old exports | 30 min each | 😤 Frustrated | 12+ hours for 25 samples |
| 3 | Find Jira ticket for each | Jira | 15 min each | 😐 Neutral | - |
| 4 | Export Jira ticket to PDF | Jira | 5 min each | 😐 Neutral | - |
| 5 | Find remediation validation (re-scan or test) | Various | 20 min each | 😤 Frustrated | Multiple sources |
| 6 | If SLA miss, find exception documentation | Email/Drive | 30 min each | 😱 Panic | Often missing |
| 7 | Compile into folder per sample | Finder | 5 min each | 😐 Neutral | Manual organization |
| 8 | Write narrative for each sample | Word | 10 min each | 🤔 Writing | - |
| 9 | Review for completeness | - | 1 hour | 😟 Anxious | Did I miss anything? |

**Emotional State:** 😟 → 😤 → 😱 (Constant anxiety and frustration)
**Current Time Spent:** 12-15 hours
**Ideal Time:** 1-2 hours (auto-generated evidence packets)
**Opportunity:** Evidence packet generator with complete audit trail

---

#### Phase 3: Auditor Questions & Follow-ups (4-8 hours during audit)
**Goal:** Answer real-time questions during audit fieldwork

| Step | Action | Tool | Time | Emotion | Pain Points |
|------|--------|------|---------|-------------|
| 1 | Auditor: "What was MTTR in June vs December?" | - | 10 sec | 😱 Panic | Don't have this |
| 2 | Go back to Excel, calculate | Excel | 20 min | 😤 Frustrated | Manual calculation |
| 3 | Auditor: "Why did critical count spike in April?" | - | 10 sec | 🤔 Thinking | Need to recall |
| 4 | Check Slack, email, meeting notes | Multiple | 30 min | 😤 Frustrated | Searching history |
| 5 | Auditor: "Show me SLA exceptions approved by CISO" | - | 10 sec | 😱 Panic | Need to filter |
| 6 | Search emails for CISO approvals | Gmail | 45 min | 😠 Angry | Tedious search |
| 7 | Auditor questions date: "Was this remediated on 3/15 or 3/18?" | - | 10 sec | 🤔 Thinking | - |
| 8 | Check change management system | ServiceNow | 15 min | 😐 Neutral | - |
| 9 | Cross-reference with deployment logs | DataDog | 15 min | 😐 Neutral | - |
| 10 | Auditor: "Can you export this filtered view?" | - | 10 sec | 😤 Frustrated | - |
| 11 | Manually create filtered export | Excel | 30 min | 😤 Frustrated | No quick export |

**Emotional State:** 😱 → 😤 → 😠 (Panic and frustration throughout)
**Current Time Spent:** 4-8 hours during 3-day audit
**Ideal Time:** <1 hour (instant query responses)
**Opportunity:** Natural language query interface with instant answers

---

### Overall Journey Summary

**Total Audit Prep Time:** 40+ hours over 2 weeks
**Emotional Arc:** 😟 → 😤 → 😱 → 😠 → 😫 (Sustained high stress and negative emotions)
**Main Bottlenecks:**
1. Finding historical data (30 hours)
2. Creating evidence packets (15 hours)
3. Answering ad-hoc questions (8 hours)

**Business Impact:**
- Audit fees increase when auditors spend more time (inefficiency costs money)
- Risk of audit findings if evidence is incomplete
- Massive opportunity cost (40 hours = $8,000+ in compliance officer time)

**Ideal State:**
- **Total Time:** 4-6 hours (mostly review and narrative)
- **Emotional Arc:** 😐 → 🤔 → 😊 (Calm, professional, confident)
- **Key Improvements:**
  - Automated evidence compilation ("Generate SOC 2 package for Jan-Dec 2024")
  - Historical query engine (answer any question in seconds)
  - Immutable audit trail (no reconstruction needed)
  - Pre-formatted compliance reports

---

## Key Patterns Across All Journeys

### Common Pain Points
1. **Manual data aggregation** across multiple systems
2. **Lack of historical data** or point-in-time reconstruction
3. **Repetitive tasks** without bulk operations
4. **Context switching** between 3-5 tools
5. **Slow UI performance** compounding time waste
6. **Missing automation** for predictable workflows

### Emotional Trajectory
- All journeys start 😐 Neutral or 😟 Anxious
- Build to 😤 Frustration and 😠 Anger
- End with 😫 Exhaustion or 😊 Satisfaction (if completed)

### Time Waste Analysis
| Activity | Current Time | Ideal Time | Savings | Frequency |
|----------|-------------|-----------|---------|-----------|
| Daily triage | 2-3 hours | 30-45 min | 1.5-2 hours | Daily |
| Weekly reporting | 2-3 hours | 15-20 min | 2+ hours | Weekly |
| Audit prep | 40 hours | 4-6 hours | 34 hours | Annual |

### ROI Calculation
**For a 3-person security team:**
- Sam (Analyst): Saves 8 hours/week × $50/hr = $400/week
- Jessica (Manager): Saves 2 hours/week × $100/hr = $200/week
- Marcus (Compliance): Saves 34 hours/year × $120/hr = $4,080/year

**Annual value:** ~$31,000 for 3-person team

**Tool investment threshold:** $200-500/month ($2,400-6,000/year) leaves $25,000+ net value

---

## Design Implications

### Must-Have Features (Based on Journey Analysis)
1. **Activity timeline** - "What changed since I last checked?"
2. **Bulk operations** - Multi-select, batch actions
3. **Integrated research** - CVE details, exploit info in-app
4. **Historical queries** - Point-in-time reconstruction
5. **Automatic status sync** - No manual updates
6. **Template-based reporting** - One-click executive summaries
7. **Evidence compilation** - Auto-generate audit packets
8. **Persistent filters** - Save and recall common views

### User Experience Priorities
1. **Speed** - Sub-second loads, local caching
2. **Keyboard shortcuts** - Power user efficiency
3. **Smart notifications** - Context-aware alerts
4. **Offline capability** - Work anywhere
5. **Single source of truth** - Eliminate context switching
