---
description: Challenge the claims just made — for each one, run a check that would fail if the claim were false, show the decisive output, and narrow or withdraw whatever the evidence does not support
argument-hint: "[optional: specific claim or task to verify]"
---

For every completion, status or factual claim in the current task, identify the actual reviewed state/target and applicable scope. Discover project-supported commands before running them. This explicit challenge requires fresh evidence, unlike routine reuse of still-valid results.

Keep checks within the authorized safe target. Do not install dependencies, start services or perform mutating requests merely to prove a claim; mark unavailable gates UNVERIFIED. Redact credentials, PII, environment values, auth headers and raw payloads from output.

1. **List every claim**, including the ones made in passing: "tests pass", "bug fixed", "the root cause is X", "nothing else calls this", "the library supports Y".

2. **Choose evidence that fits the kind of claim:**

   | Claim | Evidence | The claim is false if |
   |-------|----------|-----------------------|
   | Tests pass | project test command (`npm test` / `pytest` / `go test ./...`) | any failure, or the changed code is not exercised by the run |
   | Build succeeds | project build command | non-zero exit, or the changed module is not built |
   | Linter clean | project lint command | any error in the changed scope |
   | Bug fixed | original reproduction steps | the symptom still reproduces |
   | Feature works | acceptance test or read-only request | response differs from the acceptance criterion |
   | Root cause is X | a reproduction where only X changes | the failure persists without X |
   | Code fact ("only caller is…") | search plus `path:line` | the search finds a counter-example |
   | External fact (API, flag, version) | installed `--help`/source or primary docs, quoted | the source says otherwise or cannot be found |

3. **Ask of each check: would it have failed if the claim were false?** A test that also passes without the change, a search for the wrong symbol, or a build that skips the changed module proves nothing. Replace the check or narrow the claim. For "bug fixed", cite the failing run observed before the fix; when none was observed, say so — "passes now; pre-fix failure not observed" is the honest claim.

4. **Run each check NOW** — do not reuse a previous run.

5. **Report the decisive output (sensitive contents redacted), exit code and scope:**
   ```
   claim: "tests pass"
   check: npm test
   output: 47 passed, 0 failed (exit 0)
   would fail if false: yes — auth.test.ts covers the changed branch
   result: VERIFIED
   ```
   Results: `VERIFIED` · `NARROWED: <the smaller claim the evidence does support>` · `REFUTED` · `UNVERIFIED: <reason>`.

6. **Correct the record.** For every NARROWED, REFUTED or UNVERIFIED result, restate what is actually known and what remains open. Do not defend the original wording.

$ARGUMENTS
