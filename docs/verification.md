# Verification record

Verified locally on 25 September 2026.

| Check | Result |
| --- | --- |
| Node deterministic tests | 8 tests passed on Node 20.10.0 |
| Live source integration | Passed; source snapshot `2026-09-25T22:52:36+08:00`, 2,423 normalized records, 3 excluded |
| Local server | Running successfully on port 3000 in live mode |
| Browser interaction | Confirmed code search, empty results, intersecting availability filters, reset, summary updates, and Next/Previous pagination |
| Browser error recovery | An initial source timeout displayed an explicit unavailable state; refresh recovered to live results |
| Responsive layout | Inspected at default narrow width and a 1,280-pixel desktop viewport |
| Browser console | No errors/warnings in the final inspected log |
| CSV | Serialization covered by deterministic tests; browser download-event detection timed out in the in-app browser, so saved-file delivery was not verified |
| Terraform | `fmt -check` and `validate` passed using Terraform 1.9.8 / AWS provider 5.100.0 |
| Docker image / Compose | Not run locally: Docker is not installed; build check included in CI |
| AWS deployment / plan | Not run; no AWS resources provisioned and no account-level permissions or quotas validated |
| GitHub Actions | Workflow supplied, not remotely executed |

Node execution and Terraform provider installation required running outside this environment's filesystem sandbox because path resolution/checksum access was blocked. These were environment-specific failures; local verification then succeeded. Normal development machines do not require those agent sandbox steps.

The test suite is deterministic and independent of the public endpoint. The live integration command is intentionally separate so a data.gov.sg outage does not make CI flaky. Browser checks were performed interactively through browser automation; no claim of a full cross-browser or WCAG certification is made.
