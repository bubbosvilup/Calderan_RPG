# Archived evaluations

Superseded reports from Phase 1, the early Calderan authoring/regression passes, NPC+ Passes 1–9 and Hardening H1–H4.
Current reports stay in [`docs/evaluations/`](..). The reports here are kept unedited, except that their Markdown links were updated to the new paths.

Raw run output (per-case JSON, live JSONL, generated audit snapshots, phase logs) was removed from the tracked tree in the
[repository cleanup](../CALDREVAN_REPOSITORY_CLEANUP.md). Markdown links to removed files point to GitHub permalinks at commit `9faa6b8`.
Plain-text paths in these reports that no longer exist can be read with:

```
git show 9faa6b8:<path>
```

The five `phase-1m*/1n*` JSON files here are kept because `npm run eval:evidence` and `npm run eval:shadow-evidence` read them.
