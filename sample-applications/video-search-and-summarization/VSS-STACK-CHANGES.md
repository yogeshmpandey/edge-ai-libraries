<!--
SPDX-FileCopyrightText: (C) 2026 Intel Corporation
SPDX-License-Identifier: Apache-2.0
-->

# VSS stack changes: moving the heavy lifting out of the agent

The Vision Agent works. It also carries a surprising amount of the deployment
on its back — scoping, verification, deduplication, progress inference, and the
one piece of human-in-the-loop the product has. Every one of those is a place
where accuracy leaks, because each is the agent reconstructing something the
stack knows but does not expose.

This document lists what the agent is compensating for, what the stack should
provide instead, and what that buys in end-to-end accuracy.

**How to read it.** Findings marked **[observed]** were measured against a
running deployment (2026.2.0.ww29, Docker Compose, GPU/int4 Qwen3-VL-4B) and
carry a file reference or a command. Everything else is **[proposed]** — a
design position, not a measurement. Do not treat the two the same.

---

## 1. The thesis

> The agent should decide *what* to do and explain *what happened*. The stack
> should do the work and remember it.

Today the boundary is in the wrong place in six areas. The consequence is not
just architectural tidiness: three of the six produce *wrong answers* to an
operator, and two produce work the deployment silently repeats.

---

## 2. What the agent is compensating for today

| # | Symptom an operator sees | Compensated in | What the stack should own |
|---|---|---|---|
| 1 | "0 of 8 indexed" after a restart, though search works | `mcp/src/tools/_deps.py:63` | A durable, queryable "is this searchable" fact |
| 2 | "Ask about this video" finds nothing while the library finds plenty | `mcp/src/tools/search.py:36,319` | Scoping as part of the retrieval contract |
| 3 | Confident wrong clips | `vss-agent/src/vss_agent/critic.py` | Verification inside the retrieval pipeline |
| 4 | The same alert raised over and over | `vss-agent/src/vss_agent/alerts.py` | Watched queries that return the *difference* |
| 5 | Indexing costs minutes of VLM captioning | `mcp/src/tools/ingest.py:174` | Ingest that prepares for search only |
| 6 | Nobody is asked what the footage is about | `vss-agent/src/vss_agent/brief.py` | The brief as a stored property of the video |

### 2.1 Searchability is inferred, not recorded **[observed]**

`indexed` is not stored anywhere. It is recomputed per request from Pipeline
Manager's summary-pipeline state: fetch `/summary/ui`, keep videos where
chunking finished and every caption is done.

That state does not survive a restart. Every `state` row in Postgres:

```
status     | {"chunking":"na","summarizing":"na","videoChunking":"na","dataStoreUpload":"na"}
chunks     | {}
createdAt  | 2026-08-07 12:30:15.772
updatedAt  | 2026-08-07 12:30:15.773     <-- 1 ms later, never touched again
```

Progress lived in the Pipeline Manager process. Before its restart the API
reported `indexed: 8`; after, `indexed: 0` — with no re-indexing in between and
the embeddings entirely intact (`POST /search/query "person"` → 20 hits carrying
those videos' `vss:<uuid>` tags).

The agent then tells the operator nothing is indexed, and `index_video` reads
the same signal to decide whether to redo the work — so the deployment will
happily re-caption a library it already captioned.

**Stack change.** Record searchability where the embeddings are, at the moment
they are written: a video is indexed when the index contains segments for it.
Expose it as a field on the video, not as something to be derived from pipeline
telemetry. Pipeline *progress* is a legitimate thing to lose on restart;
*whether the work was done* is not.

### 2.2 Scoping is reconstructed by the client **[observed]**

Restricting a search to one video should be a parameter. Instead:

- `PATCH /videos/{id}/tags` does not exist in every Pipeline Manager — it 404s
  on 2026.2.0.ww29, and that 404 used to abort indexing entirely
  (`mcp/src/tools/ingest.py:38`).
- The tag filter applies to *embedding* metadata, written at index time. A video
  indexed through the VSS UI carries `tags: ""` there, so filtering by its UUID
  matches nothing.
- The fallback is to search unscoped, ask for `limit * 4` hits, and drop other
  videos' results client-side (`UNTAGGED_FANOUT`, `search.py:36`). It is a
  heuristic: if five other videos rank above the one you asked about, you get
  nothing, and nobody can tell that apart from "not in this video".

**Stack change.** `video_ids: [...]` as a first-class filter on
`POST /search/query`, applied in the retrieval backend. Tags stay for what tags
are good at — operator labels, cameras, zones — and stop being load-bearing
infrastructure.

### 2.3 Verification is a second model pass bolted on afterwards **[observed]**

Embedding search returns plausible wrong answers with high confidence. The agent
runs the deployment's own VLM over the frame nearest each hit and labels each
clip confirmed / rejected / unverified (`critic.py`). In a live run just now,
`show me a car` returned 12 candidates of which the critic confirmed 1 and
rejected 2 of the 3 it had budget to check.

That is a ~66% false-positive rate in the top 3, corrected by the client. It
works, but it is serialized against the same model server the agent needs for
conversation, so it is bounded by `CRITIC_MAX_CLIPS` and most hits go unchecked.

**Stack change.** Make verification a retrieval option
(`verify: true, verify_top_k: n`) executed inside the search service, where it
can batch, cache per (segment, criterion), and run on hardware sized for it.
A confirmed/rejected verdict then becomes part of the result contract that every
client benefits from.

### 2.4 "What's new" is computed by polling **[observed]**

VSS stores watched queries and re-runs them, but a watched query returns
everything it has ever matched. The difference — the only part an operator
cares about — is computed in `alerts.py` by comparing each pass against
`(query_id, video_id, start_s)` triples already seen, in the agent's own
Postgres database.

**Stack change.** Watched queries emit *new matches* as events, over a
subscription (webhook / message queue / SSE). The agent should not be a poller,
and a second client should not have to reimplement deduplication to get the same
alerts.

### 2.5 Ingest does the most expensive thing available **[observed]**

Because the deployment's embedding model is text-only
(`qwen3-embedding-0.6b`, `supports_image: false`), the only path to a searchable
video is the captioning pipeline. So "index this video" runs a VLM over every
chunk — minutes of inference — before anything is searchable at all.

This is the item the idea dump targets, and it is the right target.

**Stack change**, matching the dump directly:

- **Upload prepares for search only.** Decode, chunk, extract frames, compute
  embeddings, persist frames and metadata. No captioning, no summary.
- **Summaries are produced on request**, for the whole video or a chosen range.
- **Frames are stored**, not regenerated.
- **Captions and events are written to a queryable store** as they are produced.

---

## 3. The store split **[proposed]**

The dump proposes Elasticsearch alongside Postgres. That split is worth stating
precisely, because "put captions in Elastic" is only half a design:

| | Postgres | Elasticsearch |
|---|---|---|
| Owns | the system's own records: videos, pipelines, jobs, users, saved queries | the searchable history of what happened: captions, detections, events, summaries |
| Shape | normalized, transactional, small | denormalized documents, time-stamped, large |
| Read by | the services, for control flow | anyone answering a question about footage |
| Truth about | *what exists and what state it is in* | *what was observed and when* |

The rule that keeps it honest: **Postgres is authoritative for control state,
Elasticsearch is authoritative for observations.** If a question can be answered
by reading observations, it must not require reading pipeline state. That single
rule would have prevented §2.1.

What this unlocks that VDMS alone does not:

- **Text search over captions**, not just vector similarity — an operator
  looking for "forklift" finds captions containing it even when the embedding
  ranks them poorly.
- **Aggregations**: counts per hour, per camera, per object class. Charts.
  "How many people entered between 2 and 4pm" is an aggregation, not a search,
  and today nothing in the stack can answer it.
- **Filtering before ranking**: time window, camera, object class as index-level
  filters rather than post-hoc client-side trimming (§2.2).
- **Retention**: observations age out on their own schedule, independent of
  the videos they describe.

**Open question to settle before building.** VDMS already holds segment
embeddings. Either Elasticsearch becomes the vector store too (one query path,
one place to filter, one thing to operate) or it sits beside VDMS (two stores to
keep consistent, and every scoped search becomes a join). The first is
simpler; the second avoids re-embedding an existing corpus. This needs a
decision, not a default.

---

## 4. Human-in-the-loop belongs to the video, not the turn

The agent already implements the brief in the dump — situation, events to track,
objects that matter — as three fields collected before any expensive work
(`vss-agent/src/vss_agent/brief.py`):

| Field | Question | Example |
|---|---|---|
| `setting` | what is this footage of? | a warehouse loading bay |
| `watch_for` | what should be called out? | forklift near a person, a spill |
| `subjects` | what to keep eyes on? | forklifts, pallets, high-vis vests |

It steers captioning by overriding `framePrompt` on `POST /summary`.

**The problem** is that it lives entirely in one conversation turn. It is not
stored, so the second person to ask about the same video is asked again; and
because it travels outside the conversation, the model cannot see that it was
answered — which produced a real bug this week where a submitted brief was
answered with *"I need you to specify which video"*. That took two fixes: the
question now carries the message and attachments that produced it, and the
turn that asked is excluded from the history the model reads, because a small
model reading its own question back asks it a second time.

**Stack change.** The brief becomes a stored property of a video (or of a
camera, or of a deployment, with the narrower winning):

```
GET  /videos/{id}/brief     -> {setting, watch_for, subjects, source, updated_at}
PUT  /videos/{id}/brief
```

Consequences worth having:

- Asked once per subject, not once per conversation.
- A camera-level default means footage from a known camera never needs asking.
- Captioning, detection gating, and alerting all read the same declaration of
  what matters, instead of three subsystems guessing separately.
- It becomes reviewable — an operator can see and correct what the system
  believes it is watching, which is the actual HITL requirement.

---

## 5. End-to-end use cases, and what each needs

The dump lists these. Here is what each requires from the stack, and what the
agent contributes once the stack has it.

### 5.1 Summarize on demand, whole or partial

- **Stack**: `POST /summary {video_id, start_s, end_s, brief}` returning a job;
  captions written to Elasticsearch as produced; the summary itself stored and
  retrievable. Sub-chunk granularity so "summarize 2:00–4:00" costs two minutes
  of footage, not the whole file.
- **Agent**: chooses the range from what the operator said, shows progress,
  and cites the segments the summary was built from.
- **Why it matters**: today the only granularity is "the whole video", so any
  question about a moment costs a full pass.

### 5.2 Ask about a video (single- and multi-video RAG)

- **Stack**: retrieval over captions + detections scoped to a video set, with
  time filters; `video_ids` as a real parameter (§2.2).
- **Agent**: turns a question into a retrieval, cites timestamps, and refuses to
  answer beyond what came back.
- **Blocked today** by scoping being a client-side heuristic.

### 5.3 Object-gated summary

- **Stack**: summarize only the chunks where a detector saw the named objects.
  This needs detections stored per frame with class and confidence — which now
  exists only because the pipeline config was fixed to include
  `gvametaconvert`; without it, `frame.messages()` is empty and every detection
  is silently discarded.
- **Agent**: maps "summarize the parts with forklifts" onto that gate.
- **Why it matters**: this is the cheapest large win available. Most footage is
  empty; captioning all of it is the dominant cost.

### 5.4 Person / incident finding across cameras

- **Stack**: a unified identity store. This is the hardest item in the dump and
  should not be started until 5.1–5.3 land.
- **Agent**: presents candidate matches with evidence and lets a person confirm.

**On "how to tag a person?"** — the honest answer is that automatic
re-identification across cameras is a research-grade problem with real
false-match consequences, and the deployment currently has no tracker at all
(the pipeline has no `gvatrack`, so detections carry `region_id` but no track
id). A defensible first step:

1. **Within one camera**, add tracking (`gvatrack`) so detections gain a track
   id and a person becomes a trajectory rather than a series of unrelated boxes.
2. **Across cameras**, treat identity as *operator-asserted*: a person confirms
   "this is the same individual", and the system stores that assertion with its
   evidence. The system proposes, a human disposes.
3. **Only then** consider automatic re-identification, scored and always
   reviewable, never silently authoritative.

Step 2 is genuinely useful on its own and carries none of step 3's risk.

### 5.5 Live video summarization, and lifecycle CRUD

- **Stack**: summaries as addressable resources — create, read, update, delete,
  **delete many**. Bulk delete is listed twice in the dump, which suggests it
  hurts; it is also the smallest item here.
- **Agent**: nothing special, once the API exists.

---

## 6. Agent behaviour and accuracy: what to fix regardless

These are independent of the stack work and were measured this week.

### 6.1 Tool-calling was being sampled **[observed, fixed]**

Whether a turn called a tool at all was a sampled decision. Identical requests,
default temperature:

| Query | default T | T = 0 |
|---|---|---|
| `show me a car` | **5/8** searched | **8/8** |
| `find a person in a red jacket` | 8/8 | 8/8 |

Fixed by `temperature=0.0` on the model (`adk_engine.py`). An operator tool
must decide the same way every time; the variety temperature buys belongs in
prose, not in whether the work happens.

**Caveat, honestly stated:** temperature 0 makes behaviour consistent *within* a
deployment, not across restarts. A borderline query (`find a person`) returned
12 clips before an OVMS restart and, deterministically, no tool call after it.
Prompt rules reduce how many queries sit near that line; they do not remove the
line.

### 6.2 The model refused to search **[observed, partly fixed]**

The model would answer "which camera?", "be more specific", or "I can't search
for that" instead of searching. Four rules now cover the shapes it refused —
vague descriptions, named places, yes/no questions, outright refusals — each
chosen by measuring candidates rather than by wording preference. Two candidate
rules were discarded for scoring *worse* than the baseline.

**This is the wrong layer and should be treated as temporary.** Prompt rules
that fix one phrasing and break another are a symptom of the decision being
made by a 4B model with no fallback. The durable fix is a cheap deterministic
router in front of the model for the unambiguous cases: a message that names a
capability's verb goes straight to that capability. Reserve the model for
genuine ambiguity.

### 6.3 Accuracy improvements the stack unlocks

| Change | Effect on the agent |
|---|---|
| `video_ids` filter (§2.2) | "Ask about this video" stops silently returning other videos' clips |
| Verification in retrieval (§2.3) | Every hit carries a verdict, not just the first three |
| Durable indexed flag (§2.1) | The agent stops reporting an empty library and stops re-indexing |
| Stored brief (§4) | Captions describe the operator's actual concern, so retrieval matches it |
| Captions in Elasticsearch (§3) | Keyword and aggregate questions become answerable at all |
| Object-gated summary (§5.3) | Less footage captioned, so more of it can be captioned well |

---

## 7. Sequencing

Ordered by (value ÷ risk), not by ambition:

**First — correctness of what already exists.** Cheap, each removes a wrong
answer.
1. Durable `indexed` (§2.1)
2. `video_ids` filter on search (§2.2)
3. Bulk delete for summaries (§5.5)

**Second — the ingest/summarize split (§2.5).** The dump's core idea, and the
one that changes the cost curve. Upload prepares for search; summaries happen
on request, over a range.

**Third — the observation store (§3).** Captions, detections and summaries into
Elasticsearch. Settle the VDMS question before starting.

**Fourth — the brief as stored state (§4)**, then object-gated summary (§5.3),
which depends on both.

**Fifth — verification in retrieval (§2.3)** and watched-query events (§2.4).
Both remove agent-side machinery entirely.

**Last — identity across cameras (§5.4)**, starting with per-camera tracking and
operator-asserted identity.

---

## 8. How to tell it worked

Acceptance criteria, so this is falsifiable:

- Restarting Pipeline Manager does not change any video's `indexed` value.
- A search scoped to one video returns that video's best segments, and returns
  nothing only when the video genuinely has none — verifiable by comparing
  against an unscoped search.
- Uploading a video makes it searchable without any VLM captioning pass; time to
  searchable drops from minutes to seconds.
- "Summarize 2:00–4:00" costs roughly two minutes of footage.
- The same brief is never asked twice for the same video.
- An alert fires once per distinct moment, with no client-side deduplication.
- "How many people between 2 and 4pm" is answerable.
- The agent's own database holds conversations and nothing else — no alert
  bookkeeping, no inferred index state.

That last one is the real test. **The amount of state the agent has to keep is
the measure of how much the stack is not doing.**

---

## Appendix — evidence log

Commands and files behind the **[observed]** claims, so they can be re-checked
rather than believed.

| Claim | How to reproduce |
|---|---|
| `indexed` lost on restart | `psql -d video_summary_db -c "select \"updatedAt\"=\"createdAt\", status from state"` — every row unchanged since insert |
| Embeddings survive | `curl -XPOST :3001/search/query -d '{"query":"person","top_k":5}'` → hits with `vss:<uuid>` tags |
| Tags endpoint 404s | `curl -XPATCH :3001/videos/<id>/tags` on 2026.2.0.ww29 |
| Untagged scoping heuristic | `mcp/src/tools/search.py:36`, `:319` |
| Critic false-positive rate | agent step log: `critic_verify — VLM checked 3 clips → 1 confirmed, 2 rejected` |
| Embedding model is text-only | `curl :9777/model/capabilities` → `"supports_image": false` |
| Alert deduplication | `vss-agent/src/vss_agent/alerts.py`, identity `(query_id, video_id, start_s)` |
| Tool calling sampled | 8 identical `POST /v1/chat/completions`, default T vs `temperature: 0` |
| Detections need `gvametaconvert` | `video-ingestion/resources/conf/config.json`; without it `frame.messages()` is empty |

Further deployment-specific failure modes are catalogued in
`.github/skills/vss-agent/references/field-notes.md`.
