The Wall That Moved Every Time You Hit It
Rohan Sunwar
Rohan Sunwar
Product • Engineering • Execution | Building Scalable Products | Transitioning into Technical PM | Built products for Arohance · Flipkart · Intuit


May 22, 2026
How an infrastructure constraint became an architecture insight and cut API response time by 90% without a single security compromise.

CLIENT : Confidential — Law Enforcement 

STACK : AWS ECS · ALB · Docker · Node.js

OUTCOME : 39s → 3s · Active case resolved

STATUS : ✓ Production · Zero incidents

01. The Call
The Meeting Where I Said Yes 
I was still in undergrad. My world was built around CRUD operations: create, read, update, and delete. Build a form, wire it to a database, and deploy it as a single server. That was the full extent of my engineering reality, and honestly, it felt like enough.

Then came the meeting. As a law enforcement client, I can't disclose more than that they needed a data pipeline that could reliably extract information from an external source and surface it quickly. The kind of fast where minutes matter. They needed it built, deployed, and running in production. Microservices. Scraping. Cloud infrastructure.

I didn't know what half those words meant in that context.

"I answered every question in that meeting with confidence I had no business having. And then I walked out with the project.""
What I didn't say in the room was this: I had never touched AWS. I had never written a scraper. I didn't know what ECS stood for. The only "cloud" I understood was the metaphor.

That meeting was the last moment of comfort I'd have for weeks.

The User Problem: 

Officers were running searches mid-investigation, pulling records from an external data source as cases developed in real time. Every time the pipeline stalled, the data didn't arrive. In a time-sensitive investigation, that isn't a UX inconvenience. That's a failure of the tool at the moment it matters most. The system spec was unambiguous: sub-5-second responses, no exceptions. The product owner didn't negotiate on this. I understood why.
02. The Reckoning
Everything I Knew Was Step 0.5: 
The moment I sat down to actually understand the requirements, something became very clear: college had given me a foundation, but the real building hadn't started yet. Every new term in the spec sheet felt like a door I didn't have a key to. Microservices. Containerization. Load balancing. Task queues.

I didn't spiral. I researched.

For the first week or two, I did nothing but read documentation, Stack Overflow threads, and YouTube deep-dives at 2am. I mapped out the scraping libraries available in the ecosystem, understood how HTTP requests could be disguised, and studied what the target data source was likely doing to identify and block automated traffic.

"Somewhere in week two, something clicked. I thought: I think I can actually build this."
I was wrong about how easy the next part would be. But I wasn't wrong about the direction.

03. The First Build
It Worked. Until It Didn't.
I got the scraper running locally. Responses coming in, data flowing, everything behaving exactly as designed. I was genuinely proud; it was the first time I'd built something this far outside my comfort zone and had it actually function.

We deployed it to an EC2 instance. My first time doing that, too. Prayed the usual prayer every engineer prays in that moment: please don't let this be an "it works on my machine" situation.

For a few responses, production looked perfect.

Then it stopped.

After hours of debugging, reading logs, tracing requests, and eliminating variables, we found the problem. The data source had anti-scraping protection built in. It tracked IP addresses. When it detected repeated requests coming from the same machine, it served a CAPTCHA. My script had no way to solve or bypass it programmatically. The pipeline just... halted.

// What we were seeing in production logs: 
// Request 1 – 4: ✓ 200 OK — data returned cleanly
// Request 5: ✗ 403 — CAPTCHA challenge triggered
// Request 6 – ∞: ✗ 403 — blocked. Same IP. Same machine.

Root cause: Target system fingerprinting by origin IP
Scraper state: Not programmatically CAPTCHA-aware
Impact: Full pipeline failure after 4 requests
04. The Dead End
Every Door Was Locked:
I wasn't the first engineer to hit this wall. The internet had answers: third-party captcha-solving services, open-source bypass scripts, and clever browser automation tricks. I read all of it.

The Product Decision: 

I mapped out three options and brought them to the product owner.

Option A — Third-party captcha solvers (2Captcha, Anti-Captcha): available, well-documented, plug-and-play. Rejected immediately. Every service in this category took 15–30 seconds to resolve a challenge. The sub-5s requirement wasn't negotiable. Option A failed on the core constraint before it could fail on anything else.

Option B — Open-source bypass scripts and browser automation (Puppeteer-based fingerprint spoofing, cookie injection): more technical, more brittle, higher maintenance. Flagged as a compliance risk for a law enforcement context. Any technique that actively impersonated a browser to deceive the target system introduced legal ambiguity. Option B failed on compliance before it could fail on reliability.

Option C — Infrastructure-level IP rotation: no third-party dependency, no browser impersonation, no security compromise. The system would simply appear as many different legitimate machines, each making a single request. This was the only option that satisfied both the latency requirement and the compliance requirement simultaneously. I built Option C.
I talked to senior engineers. They'd never touched scraping infrastructure. Useful for morale, less useful for solutions.

I went back to the problem from first principles.

"The wall wasn't the captcha. The wall was that the target site only saw one face, one IP address making every request. What if it saw a different face every single time?"
05.  The Architecture
Don't Solve the Captcha. Become Someone New.
The insight came from understanding how the target site was making its detection decision. It wasn't tracking request signatures or behavioral patterns in any sophisticated way; it was doing something much simpler. It was watching the IP address.

Same IP, too many times, too fast: captcha.

Different IP every time: no pattern to detect.

The question became: how do you make every request appear to come from a different machine?

The core idea - IP rotation through real machines: Don't fake IPs - spin up real compute instances, each with a fresh address assigned by AWS on boot.
AWS ECS - containers on demand: Elastic Container Service launches containerized instances dynamically. Crucially, each new instance gets a new IP. My scraper code, containerized, runs on a fresh identity every time.
Application Load Balancer - the rotating door: The ALB sits in front of the ECS fleet. Incoming requests from the frontend hit the load balancer, which distributes them across the pool of containers, round-robin, no container serving consecutive requests from the same origin path.
Result - infinite fresh identities, per captcha triggers: From the target site's perspective, every request came from a different machine. No pattern. No accumulation. No captcha.

 Request Flow
        Frontend Client ──▶ AWS App Load Balancer
          ↙                 ↓                 ↘
    ECS Task            ECS Task            ECS Task
    IP: 18.x.x.1        IP: 52.x.x.7        IP: 34.x.x.4
          ↓                  ↓                  ↓
Target Data Source·New IP seen every request·No CAPTCHA triggered

Each ECS container boots with a fresh AWS-assigned IP. The ALB rotates requests across the fleet.
This was the architecture, simple in concept, genuinely novel in execution for someone who'd been working with single-server deployments two months earlier. No third-party services. No captcha solving. No security compromise. Just the infrastructure that made the problem structurally impossible to trigger.

06.  The Build
First Time Using AWS. In Production. For Law Enforcement.
I containerized the scraper. Built the ECS task definitions. Configured the Application Load Balancer, studying the documentation to understand health checks, target groups, and round-robin routing rules as I went. Set up the IAM roles. Connected the pieces.

This was not a side project. Every hour spent configuring was an hour the client was waiting. The case was active. The timeline was real.

What would have helped is irrelevant; what I had was the AWS documentation, Stack Overflow, and the architecture I'd sketched on paper at 1am. I built from that.

·ECS Task configuration — simplified
·Each task = isolated container = fresh public IP on every launch

networkMode:    "awsvpc"   // Task-level networking
assignPublicIp: "ENABLED"  // AWS assigns new IP on boot
desiredCount:   N          // Fleet scales with demand

·ALB target group — round-robin across healthy tasks
loadBalancingAlgorithm: "round_robin"
healthCheckPath:        "/health"
deregistrationDelay:    0  // Fast task cycling
The system went live. The load balancer started distributing requests. The ECS tasks started spinning up with fresh identities. The scrapers started pulling data.

No captchas.

I watched the logs for what felt like an hour. Clean responses. Every one of them.

07.  The Result
39 Seconds Became 3.
"What the numbers said when it was over" 
API Response Time Before: 39s (Bottlenecked by captcha failures and retry logic)

API Response Time After: 3s (Clean pipeline, no friction, no interruptions)

Latency Reduction: 90% (Without a single third-party dependency added) 

Security Incidents: Zero (No data exposed. No complicance breach. Clean record)

The data pipeline ran without interruption. The active case the client was working on, I don't know its outcome, and I'm not supposed to. They had the intelligence infrastructure it needed. The system held.

What had started as a scraping project became an IP-rotation architecture problem. What looked like a CAPTCHA challenge turned out to be a cloud infrastructure design question. And the solution came not from a deep well of expertise, but from a willingness to keep asking: what is this system actually doing to detect me, and what changes if I take that away?

Reflection
The most important product skill isn't knowing the answer; it's identifying which constraint, if removed, changes everything. The captcha was never the problem. The single IP address was the problem. Once I saw that, the architecture followed naturally. This is what I mean when I say the problem definition is the work.
08. What I'd Do Differently
Honest Retrospective.
Every project teaches you something you can only learn after it's over. Here's what this one taught me:

Instrument observability from day one, not after the first failure : I added proper logging and alerting after we hit the captcha wall in production. It should have been there before the first deployment. In a law enforcement context, especially, "it worked on my machine" is not a status update.
Challenge the constraint before building around it : The sub-5s requirement was given, not interrogated. I accepted it and built the architecture to match. In retrospect, I should have asked: Is 5 seconds a hard operational limit, or an assumption? Sometimes the constraint is real. Sometimes it's the first version of a requirement that hasn't been stress-tested yet. Knowing which one it is changes what you build
Document the decision trail, not just the outcome : I shipped the architecture. I didn't write down why Options A and B were rejected before Option C was chosen. When I handed off context to the team later, I had to reconstruct the reasoning from memory. A one-page decision log written the day the product owner said no to third-party solvers would have been worth more than any amount of code comments.
Staging environments aren't optional for law enforcement clients : We went from local → production with no intermediate environment. It worked, but it was a risk I didn't fully understand I was taking at the time. For any client where the stakes are real, and in this context, they were, you need a mirror of production to break things in before they break in the field.