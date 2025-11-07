# Security Workflow Research Notes (Simulated)

All interviews follow the Appendix A script from Issue #12. Each agent-based participant was primed with demographic traits and tool stacks corresponding to realistic Vanta customers.

## Sam Patel – Security Analyst
- **Context:** Mid-size SaaS, Tenable + Vanta stack.
- **Highlights:**
  - Reviews ~80 findings every morning, filters by prod assets + exploit available.
  - Copies `integrationId`, `assetId`, `cvss`, `externalURL` into Jira template.
  - Quote: “Give me a one-click ‘Send to Jira’ button with the context already there.”
  - Pain: deduplicating CVEs from multiple scanners consumes 25% of triage time.
  - Wish: inline KEV/EPSS, auto-assign owner from CMDB tags.

## Maria Lopez – SecOps Manager
- **Context:** Fintech, manages 6 analysts.
- **Highlights:**
  - Weekly KPI deck (critical aging, MTTR, SLA breaches) is handmade in Excel.
  - Quote: “I don’t trust the dashboards because I can’t see what filters are applied.”
  - Wants to bookmark views and schedule PDF reports.
  - Pain: no cross-team SLA rollup; keeps manual spreadsheet to track remediation ETA.

## Derek Wu – Compliance Lead
- **Context:** Healthcare, frequent audits.
- **Highlights:**
  - Needs immutable audit evidence showing discovery → remediation → verification.
  - Quote: “Auditors always ask for the ‘before’ screenshot plus a ticket link.”
  - Workaround: exports CSV, marks up in Word, stores in SharePoint.
  - Wish: “Download bundle” button with detection metadata + attachments.

## Priya Srinivasan – DevOps Engineer
- **Context:** Platform team receives tickets from Security.
- **Highlights:**
  - Validates whether vulns block deployment; expects fix guidance + blast radius.
  - Quote: “Severity doesn’t equal customer impact—show me affected services.”
  - Pain: tickets lack reproduction steps; spends time reproducing PoC.
  - Wish: integrated runbooks, ability to update status without leaving Jira.

## Contextual Inquiry Snapshots
- **Analyst session:** Observed Sam navigate Tenable → export CSV → import to BigQuery for dedup → update Vanta (simulated). Time on manual copy/paste: 23 minutes.
- **Compliance session:** Derek assembling evidence for SOC2; 17 screenshots across 3 tools; 40 minutes to compile bundle.

## Survey Synthesis
- 52 responses, primarily from North America (62%), EMEA (28%).
- 71% security practitioners, 18% DevOps, 11% compliance/audit.
- 82% export to spreadsheets weekly, 63% maintain manual SLA tracker.
- Top open-ended pain: “No single source of truth for status updates.”

These notes support the personas and recommendations in `docs/security_analyst_research.md`.
