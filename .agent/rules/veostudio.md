---
trigger: always_on
---

# Antigravity Project Rules: Veo Studio

## 1. Environment & Shell
- **OS**: Windows (but treat as Linux-like via Git Bash).
- **Preferred Shell**: **ALWAYS use `bash`** for terminal commands. Avoid PowerShell/CMD unless absolutely necessary.
- **Path Issues**: `gcloud` might not be in the default PATH for some shells; absolute paths or checking `echo $PATH` helps.

## 2. CI/CD & Deployment (Need-to-Knows)
- **Target**: Google Cloud Run (Service: `veo-studio-app`).
- **Registry**: Google Artifact Registry (`gcr.io/seedance-450813/veo-studio`).
- **Build Process**:
  - Uses `Dockerfile` (Multi-stage: Node build -> Nginx runtime).
  - **Critical**: `API_KEY` is injected at **BUILD TIME** via `--build-arg VITE_GEMINI_API_KEY`. It is NOT a runtime secret for the frontend.
- **Secrets Management**:
  - Keys are managed in **GitHub Secrets** (`GCP_SA_KEY`, `API_KEY`).
  - `gcp-service-account.json` is `.gitignore`d. DO NOT commit it.

## 3. Application Logic & API Constraints
### Veo Video Generation (CRITICAL)
- **Execution Mode**: **MUST BE SEQUENTIAL**.
  - **Rule**: Do NOT run `veo-3.1` requests in parallel. The API has strict quotas (`429 Resource Exhausted`) and concurrency limits.
  - **Delay**: Implement a **5-second delay** between shots to cool down the quota.
- **Safety Filters**: The model is sensitive to certain prompts (e.g., "confused cat"). If safety filters trigger, retry with a slightly different prompt or relax the constraints.

### Model Selection
- **Director Agent**: `gemini-2.0-flash` (Stable) or `gemini-3-pro-preview` (Higher quality but prone to `500 Internal Error`).
- **Artist Agent**: `gemini-3-pro-image-preview` (Required for high-quality character consistency).
- **Video Agent**: `veo-3.1-fast-generate-preview` (Fastest for dailies).

## 4. Testing & Validation
- **Local Dev**: `npm run dev` (Port 3000).
- **Test Assets**: Located in `public/test/` (`Belle.png`, `env.jpg`). Use these for quick validation.
- **Browser Tool**: Use the browser tool to verify UI interactions (e.g., clicking "Test Set").

## 5. Troubleshooting
- **429 Errors**: Immediate signal to switch to sequential execution or increase delays.
- **500 Errors (Director)**: Retry logic is implemented. If persistent, improved prompt engineering or model downgrade is required.