Night Watch Autonomous SRE Agent
================================

## 1. Problem Recap & Objective
- **Context**: Continuous multi-stage ETL workflows (AWS Step Functions, Glue, S3, Snowflake) operate 24×7 across regions/vendors; failures cause delays and manual toil.
- **Objective**: Build "Night Watch"—an autonomous SRE agent that monitors, diagnoses, remediates, and reports on pipeline health inside a safe playground environment mirroring production.

## 2. Operating Principles (OODA Loop)
- **Observe**: Collect high-fidelity telemetry in near real time.
- **Orient**: Fuse signals with topology, SLAs, and incident history to determine impact and root cause.
- **Decide**: Choose safe automation or human-in-loop escalation based on confidence and blast radius.
- **Act**: Execute remediation, verify recovery, and learn from outcomes.

## 3. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              Night Watch                                 │
│                                                                          │
│  ┌─────────────┐   ┌────────────┐   ┌─────────────┐   ┌──────────────┐   │
│  │ Observers   │→→ │ Event Bus  │→→│ Incident     │→→│ Action Engine │→→│
│  │ (StepFn,    │   │ (Kinesis/  │   │ Brain       │   │ & Approvals  │  │
│  │ Glue, S3,   │   │ SNS, SQS)  │   │ (RCA, Rules │   │ (Human loop) │  │
│  │ Snowflake…) │   └────┬───────┘   │  ML, History)│   └─────┬────────┘  │
│  └──────┬──────┘        │           └──────┬────────┘         │           │
│         │                │                 │                  │           │
│  ┌──────▼──────┐   ┌─────▼─────┐    ┌──────▼──────┐   ┌───────▼────────┐ │
│  │ State &     │←──│ Telemetry  │    │ Knowledge   │   │ Reporting &    │ │
│  │ Runbook DB  │   │ Lake (S3 / │    │ Graph       │   │ Digests        │ │
│  │ (DynamoDB)  │   │ Snowflake) │    │             │   │ (Teams/Email)  │ │
│  └─────────────┘   └───────────┘    └─────────────┘   └────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Observers**: Pull/push telemetry from AWS Step Functions, Glue jobs, S3 events, Snowflake tasks, CloudWatch metrics, AWS Health, synthetic canaries.
- **Event Bus**: Normalize events via Kinesis/SNS/SQS (or Kafka) for decoupled processing.
- **Telemetry Lake**: Persist raw signals, metrics, and log excerpts for replay and ML training.
- **State & Runbook DB**: Store topology, SLAs, playbooks, automation policies, and approval history.
- **Incident Brain**: Classifier + rules engine + knowledge graph to score root cause hypothesis.
- **Action Engine**: Executes retries/resumes, dispatches approval cards, and enforces guardrails.
- **Reporting**: Generates operational digest, dashboards, and integrates with Slack/Teams.

## 4. Core Capabilities (Expanded Scenario Coverage)
- **Health Monitoring**: Detect failed Step Function states, Glue errors, missing S3 files, late Snowflake tasks, CloudWatch alarm breaches, synthetic canary failures, quota throttling, IAM drifts, cost anomalies.
- **RCA Analysis**: Correlate upstream file arrivals, schema versions, infrastructure changes, and metric drifts; leverage embeddings to match historical incidents.
- **Auto Remediation**: Safe retries with exponential backoff, resume state machines from failed state, trigger Glue reruns with validation, reload S3 manifests, resize Snowflake warehouses temporarily, quarantine bad data with staging tables.
- **Human-in-Loop**: Adaptive Cards listing context, blast radius, and proposed fix; approvals stored with full audit trail.
- **Operational Digest**: Hourly ticker, daily summary, weekly trend report including MTTA/MTTR, automation coverage, open risks.

## 5. Detection & Signal Collection
- **API Pollers**: Periodic Step Functions and Glue status polls with jitter; incremental fetch using execution timestamps.
- **Event Subscriptions**: CloudWatch Events / EventBridge for state changes, S3 notifications, Snowflake task webhooks, AWS Health events.
- **Metric Streams**: CloudWatch Metric Streams -> Firehose -> Kinesis for low-latency anomaly detection.
- **Synthetic Heartbeats**: Scheduled canary workflows pushing predictable artifacts; failures flag silent breakage.
- **Contract Validators**: Schema diff jobs compare incoming data to expected contracts; violations emit high-priority incidents.

## 6. Incident Brain (Orient Phase)
- **Knowledge Graph**: Nodes = workflows, steps, datasets, dependencies, owners, SLAs; edges capture lineage and blast radius.
- **Feature Extraction**: For each incident candidate, collect features (error codes, duration deltas, recent deployments, data-volume changes).
- **Decision Stack**:
  1. Deterministic rules for known signatures (e.g., `AccessDenied` → IAM issue).
  2. Probabilistic classifier (XGBoost or fine-tuned LLM) for ambiguous cases.
  3. Confidence scoring with fallback to "Needs human triage" when low.
- **Historical Matching**: Vectorize incident narratives; retrieve similar incidents to suggest playbooks.

## 7. Action Engine (Decide & Act)
- **Policy Matrix**:
  - Severity (Critical, High, Medium, Low) × Risk (Low, Medium, High) × Confidence (0-1).
  - Maps to `AUTO`, `AUTO_WITH_APPROVAL`, `NOTIFY_ONLY` decisions.
- **Guardrails**:
  - Idempotency checks (e.g., ensure state machine not already running).
  - Rate-limited retries, circuit breakers per workflow.
  - Pre-flight simulations in playground (dry run Step Function, Glue job `--job-run-type=TEST`, Snowflake `VALIDATE` statements).
- **Execution**:
  - Uses AWS SDK, Step Functions API, Glue `start_job_run`, Snowflake Python Connector.
  - Post-action verification: targeted smoke tests, metric validation, ensure DAG catches up.
- **Audit**: Every action logged to DynamoDB + CloudWatch Logs with timestamp, actor, outcome.

## 8. Human-in-Loop & Collaboration
- **Approval Cards**: Teams/Slack Adaptive Cards summarizing incident, proposed action, rollback plan, time-to-SLA breach, links to dashboards.
- **Escalation Ladder**: On-call schedules, paging via PagerDuty if no response within SLA.
- **ChatOps**: Command interface (`/nightwatch status inbound-844`) for ad-hoc queries and manual overrides.

## 9. Operational Digest & Analytics
- **Streams**: Incidents → Operational datastore (e.g., Snowflake or OpenSearch) for analytics.
- **Dashboards**: MTTA/MTTR trends, automation coverage %, top failing workflows, cost impacts.
- **Reports**: Automated summaries via email/Teams; weekly executive view includes recommendations (e.g., "increase timeout on TransformJob").

## 10. Implementation Plan (Hackathon Scope)
1. **Sprint 0 – Playground Setup**: Mock AWS services with LocalStack/SAM, seed sample workflows, load historical incidents.
2. **Sprint 1 – Observe**: Implement observers for Step Functions, Glue, S3; wire into Kinesis; persist to DynamoDB + S3 lake.
3. **Sprint 2 – Incident Brain v1**: Rules-based classification, knowledge graph schema, initial runbooks.
4. **Sprint 3 – Action Engine v1**: Implement low-risk auto remediation (retries, resume state); integrate Teams approvals for high-risk.
5. **Sprint 4 – Digest & UX**: Build digest service, ChatOps bot, dashboards.
6. **Sprint 5 – Learn Loop**: Capture outcomes, add anomaly detection, expand scenario coverage.

## 11. Reference Implementation Sketch (Python Microservices)

```python
# observer.py
class StepFunctionObserver:
    def poll(self):
        events = []
        for execution in self.client.list_executions():
            if execution['status'] != 'SUCCEEDED':
                events.append(self._to_event(execution))
        self.bus.publish(events)

# incident_brain.py
class IncidentBrain:
    def handle(self, event):
        features = self.feature_extractor(event)
        rule_hit = self.rule_engine.match(features)
        if rule_hit:
            return Incident(rule_hit, confidence=0.95)
        prediction = self.classifier.predict(features)
        return Incident(prediction.label, prediction.confidence)

# action_engine.py
class ActionEngine:
    def execute(self, incident):
        policy = self.policy_matrix.resolve(incident)
        if policy.requires_approval:
            self.notify_human(incident, policy)
        elif policy.auto:
            self._apply_runbook(policy.runbook, incident)
```

## 12. Testing & Validation Strategy
- **Unit Tests**: Mock AWS SDK interactions; verify rule/classifier decisions.
- **Integration Tests**: Replay captured incidents through the pipeline in sandbox; validate actions triggered correctly.
- **Chaos Drills**: Introduce faults (missing file, IAM denial) in playground; ensure detection and remediation flow end-to-end.
- **Canary Monitoring**: Ensure Night Watch's own components are instrumented (self-health dashboards).

## 13. Security, Compliance, and Governance
- Least-privilege IAM roles per component; scoped action policies.
- Signed approval logs, immutable storage (AWS Audit Manager integration).
- Secrets managed via AWS Secrets Manager with rotation.
- Provide "observe-only" mode toggle and kill switch.

## 14. Future Enhancements
- Multi-cloud ingestion (Azure Data Factory, GCP Dataflow).
- ML-driven anomaly detection (Prophet/ADTK) for metric drift.
- Reinforcement learning to tune action policies based on success metrics.
- Automated runbook synthesis using LLMs with guardrails (prompt logs, evaluation harness).

Night Watch transforms reactive operations into a proactive, self-improving control loop—cutting MTTR, reducing human toil, and scaling resilient data pipelines.
