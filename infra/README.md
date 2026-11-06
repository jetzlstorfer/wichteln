# Azure infrastructure

Quick path: `pwsh .\infra\deploy.ps1` runs both phases below (resource group
`rg-wichteln`, `westeurope`, image build/push, digest-pinned release, health
check). Use `-SkipBootstrap` for code-only releases.

These resource-group-scoped Bicep files deploy Wichteln to **Azure Container Apps
Consumption** with **Azure Table Storage**. Adding or compiling them creates
nothing in Azure. **Do not run the provisioning, login, push, deployment or
maintenance commands below until you have explicitly approved Azure changes.**
The GitHub Actions workflow below deploys application releases after its one-time
OIDC setup. Infrastructure bootstrap remains an explicit operator action.

## Resources and boundaries

- StorageV2, Standard_LRS, HTTPS only, TLS 1.2 minimum, shared keys disabled,
  anonymous blob access disabled. Tables: `WichtelnRounds`, `WichtelnLinks`,
  `WichtelnRates`.
- One user-assigned identity for both app and maintenance job. Storage Table Data
  Contributor (`0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3`) is scoped to this storage
  account; AcrPull (`7f951dda-4ed3-4680-a7ca-43fe172d538d`) to this registry.
- ACR Basic, admin user disabled, Entra authentication, ordinary registry RBAC
  permissions (not ABAC repository permissions). ARM-audience token
  authentication is enabled for managed-identity image pulls.
- A Consumption-only managed environment; no dedicated compute, VNet, private
  endpoints, NAT gateway or paid ingress gateway.
- App: external HTTPS ingress, internal target port 8787, single active revision,
  0.25 vCPU / 0.5 GiB per replica, minimum 1, configurable maximum (default 2,
  allowed 1–10), HTTP scaling at 20 concurrent requests per replica.
- Startup and readiness probes use `/api/health` to check Table access.
  Liveness uses `/api/live` so a storage outage does not trigger restart loops.
- Scheduled job: same image/identity/env, `node dist/server/index.js --maintenance`,
  00:00, 06:00, 12:00 and 18:00 **UTC**, parallelism/completion count 1,
  three retries, 1,800-second timeout per replica attempt. It runs independently
  of the app's scale-to-zero state. Table Storage has no automatic entity TTL;
  expiry cleanup depends on the application's maintenance implementation.
- Log Analytics is **off by default** (`destination: none`). Opt-in creates a
  workspace with 30-day retention (configurable 30/60/90) and a 1 GB daily
  ingestion cap (configurable 1–10). The cap is not an immediate hard spending
  limit. No storage access diagnostics, HTTP access/path logging or request
  telemetry are configured by these templates. Opt-in collects console/system
  logs: ensure application logs never contain invitation paths, tokens,
  participant data or request bodies. Azure service/platform operational records
  may still exist even with application logging disabled.

Storage and ACR use public endpoints to avoid premium networking costs. This is
not anonymous storage access: Table data requires Entra authorization. The app
does not use account keys, connection strings or local persistent volumes.
Deploying requires resource creation and `Microsoft.Authorization/roleAssignments/write`
permissions (for example Contributor plus Role Based Access Control Administrator).
The identity cannot deploy resources or push images.

## Parameters and runtime contract

`main.bicepparam` is a secret-free bootstrap example. Keep the same resource group,
region and `namePrefix` in both phases and later releases. The prefix must contain
only lowercase letters/digits/single hyphens, begin with a letter and end with a
letter or digit; length 2–20. Storage/ACR names get deterministic globally unique
suffixes. Name availability and regional quota are checked by Azure only at deployment.

`deployApp=false` creates infrastructure, identity and role assignments, but
**neither the app nor the scheduled job**. `deployApp=true` requires a nonempty
`imageTag` referring to a preexisting image. Prefer a `sha256:<64 hex digits>`
digest; a tag must be unique per release and never overwritten. A digest uses
`registry/repository@sha256:…`; a tag uses `registry/repository:tag`. Empty tags
are rejected by the workload module. No image is built or published by Bicep.

The app and job receive `STORAGE_BACKEND=azure`, `TABLE_ENDPOINT` from the
storage account, the three `TABLE_*` names, `AZURE_CLIENT_ID` of the user-assigned
identity, `TRUST_PROXY=true`, `PORT=8787`, `HOST=0.0.0.0`, and
`NODE_ENV=production`.

With empty `publicUrl`, no `PUBLIC_URL` env is set: the app must derive its HTTPS
base URL at runtime from Azure's automatic `CONTAINER_APP_HOSTNAME`. Bicep does
not reference the app's own hostname inside its properties. The job does not
serve HTTP and must not require that hostname for maintenance. Set `publicUrl`
only to an approved HTTPS base URL; this does **not** provision custom DNS,
certificates or a Container Apps custom-domain binding.

## Local checks only (safe before deployment approval)

Run from the repository root with Azure CLI/Bicep installed:

```powershell
az bicep build --file .\infra\main.bicep --stdout | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Bicep compilation failed' }
az bicep build-params --file .\infra\main.bicepparam --stdout | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Parameter compilation failed' }
```

These compile/lint locally, do not contact ARM for deployment, and leave no
generated JSON in the repository. They are not proof of Azure policy, quota,
image readiness or runtime behavior. No ARM validation or what-if is necessary
for this local check.

## Two-phase deployment — only after explicit approval

Prerequisites: Docker Desktop in Linux-container mode, Azure CLI/Bicep, an
Azure region supporting Container Apps Consumption, and an application image
whose bundled server implements the Azure backend and `--maintenance`.
The chosen subscription is **Visual Studio Enterprise Subscription**.
The following sets shell variables only; it does not change Azure CLI's default
subscription. Every subscription-scoped Azure command explicitly targets it.

```powershell
$Subscription = '3e79bb51-3c95-4b79-b815-1380dfcd3506'
$Tenant = 'eae05f48-5c26-49ee-9b75-c75068e589c0'
$ResourceGroup = 'rg-wichteln'
$Location = 'westeurope' # Confirm region availability/quota before approving.
$Prefix = 'wichteln'
$Repository = 'wichteln'

# Only if authentication is needed, AFTER approval; never use az account set.
az login --tenant $Tenant
az account show --subscription $Subscription --query '{name:name,id:id,tenantId:tenantId}' -o json

# Provider registration is an Azure write. Skip already-registered providers.
az provider register --namespace Microsoft.App --subscription $Subscription --wait
az provider register --namespace Microsoft.Storage --subscription $Subscription --wait
az provider register --namespace Microsoft.ContainerRegistry --subscription $Subscription --wait
az provider register --namespace Microsoft.ManagedIdentity --subscription $Subscription --wait
# Only when opting in to logging:
# az provider register --namespace Microsoft.OperationalInsights --subscription $Subscription --wait
```

### Phase 1: infrastructure bootstrap

```powershell
az group create --name $ResourceGroup --location $Location --subscription $Subscription
if ($LASTEXITCODE -ne 0) { throw 'Resource group creation failed' }
az deployment group create --name wichteln-bootstrap --resource-group $ResourceGroup --subscription $Subscription --template-file .\infra\main.bicep --parameters namePrefix=$Prefix location=$Location deployApp=false
if ($LASTEXITCODE -ne 0) { throw 'Bootstrap deployment failed' }

$Outputs = az deployment group show --name wichteln-bootstrap --resource-group $ResourceGroup --subscription $Subscription --query properties.outputs -o json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Cannot read deployment outputs' }
$Registry = $Outputs.registryName.value
$LoginServer = $Outputs.registryLoginServer.value
```

Role assignments are created before workloads but **RBAC propagation can take
several minutes**. The operator publishing the image needs AcrPush on this
registry (or equivalent existing rights); the template grants the app only
AcrPull. Arrange operator authorization explicitly rather than enabling ACR's
admin account or granting the app push rights. Do not switch the registry to
ABAC mode without also changing the role model.

### Build and push the real Linux image

```powershell
# Choose a unique release tag, never "latest" or an overwritten release tag.
$ImageTag = (git rev-parse --short=12 HEAD).Trim() + '-' + (Get-Date -Format 'yyyyMMddHHmmss')
$Image = "${LoginServer}/${Repository}:${ImageTag}"
az acr login --name $Registry --subscription $Subscription
if ($LASTEXITCODE -ne 0) { throw 'Registry login failed' }
docker build --platform linux/amd64 --build-arg NPM_REGISTRY=https://packagefeedproxy.microsoft.io/npm/ --tag $Image .
if ($LASTEXITCODE -ne 0) { throw 'Docker build failed' }
docker push $Image
if ($LASTEXITCODE -ne 0) { throw 'Image push failed' }

# Read the digest after push so the deployment is immutable.
$Digest = az acr repository show --name $Registry --image "${Repository}:${ImageTag}" --subscription $Subscription --query digest -o tsv
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($Digest)) { throw 'Cannot resolve pushed digest' }
```

The Dockerfile bundles the frontend and server and runs Node 24 Alpine.
There is no separate static website service. Build locally from the approved
application changes; a successful infra compile cannot establish that the image
implements Azure storage.

### Phase 2: app and maintenance job

```powershell
az deployment group create --name wichteln-release --resource-group $ResourceGroup --subscription $Subscription --template-file .\infra\main.bicep --parameters namePrefix=$Prefix location=$Location deployApp=true imageRepository=$Repository imageTag=$Digest maxReplicas=2
if ($LASTEXITCODE -ne 0) { throw 'Workload deployment failed; check image and RBAC propagation' }
$AppUrl = az deployment group show --name wichteln-release --resource-group $ResourceGroup --subscription $Subscription --query properties.outputs.appUrl.value -o tsv
if ($LASTEXITCODE -ne 0) { throw 'Cannot read app URL' }
Invoke-RestMethod "${AppUrl}/api/health"
```

Wait for identity permissions to propagate and retry phase 2 if image pull or
Table authorization fails. For updates, push a new image and rerun phase 2 with
its digest. Keep optional logging/public URL parameters consistent on every
deployment; omitted parameters revert to defaults. Single-revision mode routes
traffic to the new revision after readiness succeeds.

Only after approval, use these reads to inspect revision and job status:

```powershell
az containerapp show --name "${Prefix}-app" --resource-group $ResourceGroup --subscription $Subscription --query '{latestReady:properties.latestReadyRevisionName,state:properties.provisioningState}' -o json
az containerapp job execution list --name "${Prefix}-maintenance" --resource-group $ResourceGroup --subscription $Subscription -o table
# Explicitly approved manual execution is a write, not a health check:
# az containerapp job start --name "${Prefix}-maintenance" --resource-group $ResourceGroup --subscription $Subscription
```

Do not switch a live deployment back to bootstrap as a shutdown mechanism:
incremental deployment omitting a module does not delete its existing resources.
No teardown commands are automated; deleting the resource group destroys tables.

## GitHub Actions: PR checks and releases from main

`.github/workflows/ci.yml` runs on PR creation, new commits, reopening, every
push to `main` (including merges), and manual dispatch. Two checks run without
Azure credentials:

- **Application checks**: Node 24, `npm ci`, `npm run verify` (type checks,
  memory tests, isolated Azurite integration tests, production build and bundled
  HTTP/maintenance smoke tests), and a Linux/amd64 Docker build without pushing.
- **Infrastructure checks**: lint the workflow with actionlint, compile all Bicep
  templates and bootstrap parameters, and parse the PowerShell deployment script.

After both pass on `main`, **Deploy production** signs in using OIDC, builds and
pushes a uniquely tagged image, resolves its digest, and deploys
`workloads.bicep` to update **both** the app and scheduled job. It keeps at least
one replica, preserves the existing runtime identity, environment, public URL,
tags and maximum replica setting, and checks readiness, image digests and HTTP
health. Main runs are serialized without cancelling an in-progress deployment;
up to 100 pending runs are queued rather than replaced (additional runs are
cancelled when the queue is full). PR runs are also queued per PR. Manual runs
deploy only when the selected branch is `main`.

The workflow does not bootstrap storage, change role assignments, migrate data,
or run cleanup manually. Changes to `main.bicep` still require an explicit
infrastructure deployment. On plans that support private-repository branch
protection, configure branch protection/rulesets to require
**Application checks** and **Infrastructure checks** before merging; the
workflow alone cannot prevent merging a failing PR.

`.github/dependabot.yml` groups version updates by ecosystem for npm, GitHub
Actions and the root Dockerfile, and checks quarterly. Dependabot security
updates, when enabled, are not delayed by that schedule. The actionlint image
invoked in a shell command is not detected by Dependabot and must be updated
manually.

### One-time OIDC setup

Use a **separate deployment identity**, not the app's runtime identity.
`github-actions.bicep` grants it Contributor **only on `rg-wichteln`** and
AcrPush only on its registry. Contributor allows managing resources in that
group, including deployment history and runtime identity assignment, but does
not permit role-assignment changes. No subscription-wide role or client secret
is needed. Treat changes to workflow and infrastructure files as privileged code.
The federated subject is restricted directly to the repository's `main` branch,
so no GitHub environment protection is required on a private GitHub Free repo.

With the personal Azure subscription variables from above, create the federation
and roles. This requires role-assignment permission and changes Azure resources;
compilation alone does not configure OIDC.

```powershell
$Registry = az deployment group show --name wichteln-bootstrap --resource-group $ResourceGroup --subscription $Subscription --query properties.outputs.registryName.value -o tsv
if ($LASTEXITCODE -ne 0) { throw 'Cannot read registry name' }
$Oidc = gh api repos/jetzlstorfer/wichteln/actions/oidc/customization/sub | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $Oidc.use_default -or -not $Oidc.sub_claim_prefix) { throw 'Cannot determine default GitHub OIDC subject prefix' }
az deployment group create --name wichteln-github-identity --resource-group $ResourceGroup --subscription $Subscription --template-file .\infra\github-actions.bicep --parameters "registryName=$Registry" "githubSubjectPrefix=$($Oidc.sub_claim_prefix)"
if ($LASTEXITCODE -ne 0) { throw 'GitHub identity setup failed' }
$Ci = az deployment group show --name wichteln-github-identity --resource-group $ResourceGroup --subscription $Subscription --query properties.outputs -o json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Cannot read GitHub identity outputs' }

# Non-secret repository variables.
gh variable set AZURE_CLIENT_ID --repo jetzlstorfer/wichteln --body $Ci.clientId.value
gh variable set AZURE_TENANT_ID --repo jetzlstorfer/wichteln --body $Ci.tenantId.value
gh variable set AZURE_SUBSCRIPTION_ID --repo jetzlstorfer/wichteln --body $Ci.subscriptionId.value
```

The federation issuer is `https://token.actions.githubusercontent.com`,
audience is `api://AzureADTokenExchange`, and subject combines GitHub's exact
repository prefix (including immutable owner and repository IDs) with
`:ref:refs/heads/main`. Re-run setup if the repository's OIDC subject changes.
Role propagation may take a few minutes. Once the files are merged and configuration is complete, use
**Actions > CI > Run workflow > main** for the first release or rerun a failed
deployment after setup. Fork PRs use `pull_request`, never
`pull_request_target`, and cannot run the OIDC deployment job. No Azure access
is necessary for PR checks.

## Costs, persistence and privacy

Scale-to-zero reduces idle app compute, but introduces cold-start latency.
Consumption allowances are subscription-wide and not a promise of zero cost.
ACR Basic has a standing charge; Table transactions/capacity, job attempts,
egress and optional logs can incur charges. Replica caps are not a budget:
requests, retries and stored data still cost money. Configure a separate Azure
Cost Management budget and explicit alert recipients after approval if desired;
budgets send alerts rather than stopping resources. No recipients are committed.

LRS is replication within one region, **not a backup**, cross-region recovery,
or a guarantee against accidental deletion. Azure Blob soft delete/point-in-time
restore does not back up these tables. Establish periodic, access-controlled
Table exports and test restoring entities before relying on the service for
important data. Exports contain personal information and must not enter Git,
public logs or image layers. This template does not create a backup schedule.
Maintenance cleanup can lag until the next six-hour execution and can fail;
monitor executions and use application-level expiry checks.

## References

- [Container Apps Bicep schema](https://learn.microsoft.com/en-us/azure/templates/microsoft.app/2025-01-01/containerapps)
- [Managed environment schema](https://learn.microsoft.com/en-us/azure/templates/microsoft.app/2025-01-01/managedenvironments)
- [Scheduled job schema](https://learn.microsoft.com/en-us/azure/templates/microsoft.app/2025-01-01/jobs)
- [Storage Table Data Contributor](https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles/storage#storage-table-data-contributor)
- [AcrPull](https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles/containers#acrpull)
- [Managed-identity image pulls](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity-image-pull)
- [Container Apps pricing](https://azure.microsoft.com/en-us/pricing/details/container-apps/)
