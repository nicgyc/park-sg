# Architecture and decisions

```text
Browser: semantic HTML + CSS + ES modules
  | GET /api/carparks (same origin)
Node HTTP server
  | schema normalization + single-flight refresh + 60-second memory cache
  | HTTPS, 8-second timeout, 30-second failure backoff
data.gov.sg: HDB carpark availability

AWS: Browser --HTTPS--> App Runner --HTTPS--> data.gov.sg
                           | pulls image from ECR using scoped IAM role
                           | emits service metrics / logs to CloudWatch
```

## Scope choices

The application answers a bounded question: which reported carparks have space for a selected vehicle type? It intentionally does not invent locations or recommendations without geographical data. It provides descriptive insights rather than forecasting from a single snapshot. A future address search would join the separate HDB carpark information dataset, with explicit handling of unmatched codes.

Vanilla JavaScript and Node's built-in HTTP server make this small, read-only assessment runnable without a framework, bundler or database. Modules isolate source integration (`server/data.js`), HTTP delivery (`server/app.js`), presentation (`public/app.js`), and pure selection/analysis (`public/model.js`). ES modules run directly in modern browsers. The trade-off is manually implemented routing and rendering; a larger application would benefit from a typed schema layer and component framework. User and source values enter the DOM via textContent rather than HTML interpolation.

The backend is responsible for contacting and validating the government API. It prevents every browser from independently increasing upstream load. A 60-second per-process cache matches the intended refresh cadence. Simultaneous requests share one fetch. On failure, the backend backs off for 30 seconds; a previously fetched result can be served for up to 15 minutes from fetch time, explicitly marked stale. Beyond that, requests fail with 503. A source snapshot older than 15 minutes is also labelled stale, even if freshly fetched. Old individual record timestamps remain visible; the stale flag describes the snapshot/cache rather than every row.

There is no silent switch to fabricated data. Demo mode requires the explicit `--demo` flag. A failed browser refresh retains previous results with an explicit warning. Automatic polling pauses when the tab is hidden. Health checks measure the process, not source availability, to avoid restarting healthy instances during an upstream incident.

All records are transferred to the browser because the live response is small enough for this bounded dataset (about 2,400 normalized rows at verification). Filtering, summaries and pagination remain consistent against one snapshot, and no query race can overwrite a newer filter. Server-side pagination would be preferable for much larger datasets or public API consumers; it would require versioned snapshot identifiers to keep totals and pages consistent.

No authentication or persistent storage is justified by public read-only data. The HTTP server allowlists files, emits a restrictive same-origin CSP, rejects unsupported methods, and never accepts an upstream URL from the client. Normalized codes and fixed type names also avoid spreadsheet formula injection in CSV. There is no CORS wildcard. Public hosting still needs volume-based abuse protection; the memory cache limits upstream calls but is not a substitute for edge rate limiting.

App Runner supplies managed ingress/TLS and container scaling with fewer infrastructure components than ECS plus an ALB. The service needs public internet egress but no private AWS resources, so a VPC connector and NAT gateway would add complexity and cost without benefit. Its execution environment receives no AWS application role. The ECR pull role can only read this repository, apart from the required registry authorization action. Instance count is bounded to reduce uncontrolled scale, but the minimum instance still has ongoing cost.

Trade-offs: no shared cache across replicas; no durable availability history; no automatic API-key management; no map, address lookup or reservation; no image build/push inside Terraform. Building an image is kept separate from infrastructure provisioning so each deployed immutable tag can be reviewed and rolled back.

## Accessibility and UX

Semantic headings, form labels, native controls, table headers, a skip link, keyboard focus indicators, text alongside status colors, accessible meter labels and a live result count are implemented. Horizontal table scrolling preserves readable columns on narrow screens. Loading, empty, error, demo and stale states are explicit. No external fonts, trackers or image CDNs are loaded. This is a practical baseline, not a claim of a formal WCAG audit.
