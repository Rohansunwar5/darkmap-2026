# Dynamic Scraping Infrastructure & Product Deliverable Summary

**Date:** February 28, 2026  
**Feature:** Dynamic Keyword Searching & Scalable Container Isolation  

## Executive Summary
Over the past week, we successfully engineered and deployed a major upgrade to the channel scraping system. Previously, the scraper (`channels.py`) utilized hardcoded search filters, making it completely rigid and impossible to tweak for different clients or targeted investigations. 

We have now completely transformed this into a **Dynamic Search Engine** that allows users or APIs to supply custom inclusion and exclusion keywords on the fly. Because this new capability requires different resources and scaling metrics than the legacy scrapers, we built a fully isolated AWS deployment pipeline for it. 

This ensures that the massive payload processing of the new dynamic scraper does not interfere with the stability of the existing systems.

---

## Technical Breakdown (What We Did)

The task required an end-to-end overhaul of code, local Docker testing, AWS Cloud infrastructure, and CI/CD routing. Here is the step-by-step breakdown of the execution:

### 1. Application Layer (`channels.py`)
- We rewrote the core web scraping script to ingest `include_keywords` and `exclude_keywords` dynamically rather than relying on a static query list.
- We upgraded the headless browser framework, fixing runtime and dependency issues between `Quart-CORS` and newer versions of Python (`<3.0` constraints).
- We resolved event-loop exceptions by ensuring the application boots completely synchronously via `app.run()`.

### 2. Containerization (Docker)
- We updated the local `Dockerfile` to accurately map to the new `channels:app` entrypoint.
- We pruned broken dependencies (`libgconf-2-4`) and prepared a streamlined, Debian-based Python image.
- We authenticated and pushed the local container up to the AWS Elastic Container Registry (ECR) under a brand new repository: `scrape/dork6`.

### 3. API & Controller Layer
- We created a brand new AWS Lambda function (`ECS-Service-Controller-MyLambdaFunction-dynamic`) that sits behind API Gateway.
- This Lambda captures both the dynamic keywords and the base query from the frontend and securely routes them to our backend AWS Elastic Load Balancers (ELB).
- *Crucially*, we attached the required `httpx` Lambda Layer and aligned the Python Runtime to `3.10` to ensure smooth serverless execution.

### 4. Infrastructure Isolation (CloudFormation)
We architected a "sandbox" deployment so the new scraper runs entirely on its own rails.
- **Task Definition:** We registered a new Fargate Task Definition (`Generic6`) that specifically points to the `scrape/dork6` container running on an `x86_64` CPU architecture.
- **`Generic6.json`:** We wrote a custom CloudFormation template that provisions a dedicated Application Load Balancer, Target Group, and ECS Service exclusively for this container.
- **Deployment Automation:** We created a brand new AWS Lambda script (`Deploy-Generic6-Infrastructure`) that automatically triggers the spin-up of this CloudFormation stack and dynamically injects the resulting ALB URL back into the Controller Lambda.
- **Teardown Automation:** We also created an equivalent `Delete-Generic6-Infrastructure` script so the Product Owner can cleanly destroy the sandbox and save costs instantly when the scraper is not needed.

## Result & Business Impact
1. **Flexibility:** Operators can now execute incredibly targeted, highly-specific Telegram channel searches directly through an API.
2. **Resilience:** The new infrastructure leverages AWS ECS Deployment Circuit Breakers to auto-rollback if the container fails, dramatically increasing systemic uptime.
3. **Isolation:** The `Generic6` pipeline is 100% decoupled from `Generic1-5`, meaning massive scale searches on the new system will never throttle or crash legacy traffic.

The entire end-to-end workflow—from API Gateway to Fargate Scraper—is now live, secure, and fully operational.
