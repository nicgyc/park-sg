# Park / SG

A full-stack explorer for HDB carpark availability in Singapore. Search by carpark code, filter by vehicle type and availability, sort and paginate results, and export your selection to CSV. Summary cards report available lots, distinct carparks, weighted occupancy, and records with limited capacity.

## Run locally

Requires Node.js 20.10+ (Node 22 recommended) and npm. There are **no third-party runtime or test dependencies** and no API key is needed for the configured endpoint.

```sh
npm ci
npm start
```

Open http://localhost:3000. Live mode needs outbound HTTPS to `api.data.gov.sg`. Set `PORT` to change the listening port. Stop with Ctrl+C.

For an offline walkthrough, stop the live server and run:

```sh
npm run demo
```

Demo mode uses seven deliberately synthetic lot-type records and prominently labels them. It is never an automatic fallback for live data. Alternatively, with Docker installed, `docker compose up --build` runs live mode on port 3000.

## Review in five minutes

1. Run `npm test` and then `npm start`.
2. Search `BM` or another code from the results. Check that all four summary cards update.
3. Select Full or Limited, switch lot types, change sorting, then reset filters.
4. Search a nonexistent code to see the empty state. Clear it and use Next/Previous.
5. Export results: CSV includes every filtered record, not just the visible page.
6. Read `docs/architecture.md` and `infra/main.tf` for the design and AWS deployment.

## Data and interpretation

Source: [HDB Carpark Availability on data.gov.sg](https://data.gov.sg/datasets/d_ca933a644e55d34fe21f28b8052fac63/view), under the [Singapore Open Data Licence](https://data.gov.sg/open-data-licence). The portal describes the dataset as updated every minute. The application calls `GET https://api.data.gov.sg/v1/transport/carpark-availability` through its backend, then refreshes the visible page every 60 seconds. Manual refresh respects the same server cache.

Each record represents a carpark **and lot type**: C = cars, Y = motorcycles, H = heavy vehicles. Searching matches a code substring, not an address. Addresses, rates, coordinates, reservations and forecasts are outside this dataset and are not inferred.

- Available: at least 20% of positive capacity remains. Limited: more than zero but less than 20%. Full: zero available with positive capacity. No capacity: zero total capacity, excluded from the low-capacity count.
- Occupancy = `(sum(capacity) - sum(available)) / sum(capacity)`. This is weighted by capacity, not an average of percentages. Zero total capacity displays a dash.
- Summaries cover the entire filtered selection. “Running low” counts lot-type records; for All lot types, a carpark may contribute more than once.
- Negative counts, available greater than capacity, unsupported lot types, invalid timestamps, unsafe codes, and duplicate carpark/type pairs are excluded. The number excluded is shown. This is a deliberate conservative policy, not an assertion that HDB source records are incorrect.
- Record timestamps without an offset are interpreted as Singapore time (UTC+8). Each row shows its own timestamp, which may lag the overall snapshot. A current snapshot does not guarantee all individual records are current.
- Availability is a point-in-time observation, not a prediction or guaranteed space.

## API

`GET /api/health` returns `200 {"status":"ok"}` if the process is responsive; it intentionally does not call HDB.

`GET /api/carparks` returns:

```json
{
  "timestamp": "2026-09-25T12:00:00+08:00",
  "fetchedAt": "2026-09-25T04:00:02.000Z",
  "mode": "live",
  "stale": false,
  "excluded": 0,
  "rows": [{
    "id": "EXAMPLE", "type": "C", "available": 25, "capacity": 100,
    "availability": 0.25, "updatedAt": "2026-09-25T11:59:00+08:00"
  }]
}
```

The example above illustrates the schema and is not an actual source record. No request parameters are required; filtering runs in the browser. Upstream unavailability without a usable cache returns 503 with a safe error message. Unknown paths return 404 and unsupported methods return 405. Assets are explicitly allowlisted; source files are not served. HEAD requests are supported.

## Testing and verification

```sh
npm test           # deterministic, no external network required
npm run test:live  # optional: calls the actual public endpoint
```

The Node test suite covers normalization, invalid/duplicate records, zero capacity, timezone interpretation, filtering, ordering, weighted summaries, CSV, cache expiry, concurrent-request coalescing, stale fallback, failure backoff, HTTP errors, invalid JSON, timeout, API status codes, static routing and security headers. Tests use a synthetic fixture and an injected clock/fetch function. The HTTP test binds an ephemeral local port.

GitHub Actions runs the suite, builds the Docker image, and checks Terraform formatting and schema validation. `docs/verification.md` records what was actually executed locally; CI configuration is not a claim that a remote workflow has run.

## AWS infrastructure

Terraform provisions ECR, a repository-scoped image-pull IAM role, an App Runner service, autoscaling configuration, and a CloudWatch 5xx alarm. App Runner serves the same container over managed HTTPS and sends service/application logs to CloudWatch. No database, VPC, NAT gateway, or runtime AWS credentials are needed. This keeps the deployment small and the local and cloud application identical.

Deployment is optional and **has not been performed**. Applying Terraform creates billable resources. Use Terraform 1.6+ (CI uses 1.9.8), AWS CLI, Docker, and an AWS account with provisioning permissions.

```sh
cd infra
terraform init
terraform fmt -check
terraform validate
terraform plan
terraform apply
terraform output -raw repository_url
```

The first apply creates supporting infrastructure without the service (`enable_service=false`), allowing an image to be pushed before App Runner references it. Substitute the returned ECR URL below; `<registry-host>` is its hostname, before `/park-sg`.

```sh
# Run from the repository root
aws ecr get-login-password --region ap-southeast-1 | docker login --username AWS --password-stdin <registry-host>
docker build --platform linux/amd64 -t <repository-url>:v1 .
docker push <repository-url>:v1
cd infra
terraform plan -var="enable_service=true" -var="image_tag=v1"
terraform apply -var="enable_service=true" -var="image_tag=v1"
terraform output service_url
```

Persist `enable_service = true` and your chosen `image_tag` in an ignored `infra/terraform.tfvars` after deployment. Otherwise a later default apply would remove the service. Tags are immutable; subsequent releases require a new tag (for example a Git commit SHA). Roll back by setting the previous tag. The alarm is visible in CloudWatch; attach an SNS notification action before production use. Application warnings are structured JSON; upstream failures use `event=upstream_failure`.

Terraform state is local for this assessment and must not be committed. For team operation, configure an encrypted remote state backend with locking. Resource names assume one installation per AWS account/region. Autoscaling caps at two instances; each instance maintains its own cache. App Runner's platform log retention is not managed by this configuration. Before production, set explicit retention and alert routing, review source API quotas, add traffic protection, pin the container base-image digest, and run deployment/load tests. See [AWS App Runner monitoring](https://docs.aws.amazon.com/apprunner/latest/dg/monitor-cw.html).

Cleanup: remove images from the ECR repository when no longer needed, then run `terraform destroy` with the same variable values. ECR intentionally does not force-delete stored images.

## Repository submission

This directory is a standalone Git repository. The app, fixture, tests, infrastructure and documentation belong together. To submit, create an empty repository in your chosen Git host, then:

```sh
git remote add origin <your-repository-url>
git push -u origin main
```

Grant the reviewers access and send them that repository URL. No remote has been created or reviewer access granted because a destination and reviewer identities were not supplied. The code and trade-offs should be reviewed and understood before submission.
