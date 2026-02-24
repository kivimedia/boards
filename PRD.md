Agency Board PRD v2.0 — Confidential 
Page 1 
 
 
 
 
 
PRODUCT REQUIREMENTS DOCUMENT 
Agency Board — Internal Project 
Management System 
 
Version 2.0  |  February 9, 2026  |  Status: Draft 
 
 
Confidential — Internal Use Only 
 
 
Agency Board PRD v2.0 — Confidential 
Page 2 
Table of Contents 
1. Executive Summary 
2. Problem Statement & Target Users 
3. Department Board Architecture 
4. AI-Powered Design Review System 
5. AI-Powered Dev QA System 
6. Core Platform Features 
7. Cross-Board Workflows & Dependencies 
8. User Personas 
9. Technology Architecture 
10. Views, Search & Customization 
11. Client Boards & Portal 
12. Time Tracking, Reporting & Productivity Analytics 
13. Integrations, Automation & WhatsApp 
14. Security & Permissions 
15. UX & Design Requirements 
16. Success Metrics 
17. Launch Strategy 
18. Pricing 
19. Risks & Mitigation 
20. Open Questions 
 
 
Agency Board PRD v2.0 — Confidential 
Page 3 
1. Executive Summary 
Agency Board is a purpose-built internal project management platform for a marketing agency 
with six specialized board types: Design, Copywriting & Account Management, Development, 
Video Editing, Executive Assistant, and Client Strategy Map. Unlike generic tools such as Trello, 
Asana, or Monday.com, Agency Board provides department-specific board types, each with 
tailored workflows, card fields, and automation rules. 
The platform’s signature differentiators include: AI Design Review for verifying revisions, AI Dev 
QA for automated website quality testing, AI-generated client status update emails with Google 
Calendar integration, AI Video Generation via Sora 2 and Veo 3, auto-generated Client Boards 
with real-time sync and client ticket creation, a Client Strategy Map Board for structured 
strategic planning with encrypted credential vaults, a context-aware AI Chatbot at 
ticket/board/all-boards levels, a per-client AI Brain that learns from all approved work and can 
generate new content in the client’s voice, Nano Banana integration for in-ticket image editing, 
AI cost profiling with model swapping, WhatsApp team messaging, productivity analytics, 
structured briefing templates, a digital asset library, automated client onboarding, an internal 
knowledge base, client satisfaction tracking, Trello migration, and automated backup and 
disaster recovery. 
 
Vision Statement 
To create the most efficient and department-aware project management experience for a multi-
discipline marketing agency, enabling each team to work within workflows built for their specific 
craft while maintaining clear visibility and handoffs across departments. 
 
 
Agency Board PRD v2.0 — Confidential 
Page 4 
2. Problem Statement & Target Users 
Current Pain Points 
1. Generic tools do not reflect department-specific workflows. A design ticket has different 
stages, fields, and review needs than a development ticket or copywriting brief. 
2. No AI-assisted quality control. Designers submit revisions and reviewers must manually 
re-check every requested change, leading to missed fixes and extra revision rounds. 
3. Cross-department handoffs are invisible. When design finishes, there is no structured 
way to spawn a linked ticket on the dev board or copywriting board. 
4. Client collaboration is clunky. Existing tools either give clients too much or too little 
visibility. 
5. Scattered information. Assets, conversations, time logs, and approvals live across 
multiple disconnected tools. 
6. No department-level resource visibility. Managers cannot easily see workload 
distribution within a single discipline. 
 
Target Users 
• 
Primary: Internal agency team members across all five departments 
• 
Secondary: Agency leadership and executives needing portfolio-level oversight 
• 
Tertiary: External clients interacting through the client portal 
 
 
Agency Board PRD v2.0 — Confidential 
Page 5 
3. Department Board Architecture 
Each board type is a first-class entity with its own default columns, card field schemas, 
automation rules, and permission logic. Boards are not interchangeable — they are purpose-
built for the discipline they serve. 
 
3.1 Design Board 
Purpose: Manage all graphic design, branding, web design, and creative production work. 
 
Default Workflow Columns 
Column 
Description 
Briefed 
New design requests with creative brief attached 
In Progress 
Designer actively working on the task 
Internal Review 
Submitted for creative director / peer review 
AI Review (optional) 
AI verification of requested changes (toggle per ticket) 
Revisions 
Changes requested; ticket returns here after review 
Client Review 
Deliverable sent to client for approval 
Approved 
Client approved; ready for handoff or delivery 
Delivered / Done 
Final files delivered, ticket closed 
 
Design-Specific Card Fields 
• 
Design file attachments (PSD, AI, Figma link, PNG/JPG exports) 
• 
Design type (Logo, Social Media, Web Page, Print, Brand Asset, etc.) 
• 
Dimensions / format specifications 
• 
Brand guidelines reference link 
• 
Revision round counter (auto-incremented) 
• 
AI Review toggle (on/off per ticket) 
• 
AI Review result log (pass/fail with detailed breakdown) 
• 
Export format requirements (file types, color profile, resolution) 
 
Design Board Automation Rules 
• 
When card moves to "Client Review" → notify client via portal and email 
• 
When card moves to "Revisions" → increment revision counter, notify designer 
• 
When AI Review toggle is ON and designer submits revision → trigger AI review pipeline 
• 
When revision counter exceeds threshold (e.g. 3) → flag for creative director attention 
 
3.2 Copywriting & Account Management Board 
Agency Board PRD v2.0 — Confidential 
Page 6 
Purpose: Manage content creation and client account management. This board is unique 
because it supports two card types: (1) standard copywriting task cards, and (2) client account 
cards where each ticket represents an ongoing client relationship with automated 
communication features. 
 
3.2.1 Copywriting Task Cards 
Standard task cards for content creation work. 
 
Default Workflow Columns (Copywriting) 
Column 
Description 
Briefed 
New content request with brief, tone, and audience defined 
Research / Outline 
Writer is researching and creating content outline 
Drafting 
Active writing in progress 
Internal Review 
Editor or account manager reviewing for quality and brand voice 
Client Review 
Content sent to client for approval 
Revisions 
Client requested changes 
Approved 
Content approved and ready for publishing or handoff 
Published / Done 
Content published or delivered 
 
Copywriting-Specific Card Fields 
• 
Content type (Blog post, Email, Social caption, Ad copy, Website copy, Press release, 
etc.) 
• 
Word count target and actual word count 
• 
Tone / voice guidelines 
• 
Target audience / persona 
• 
SEO keywords (if applicable) 
• 
Publishing platform / destination 
• 
Associated client account card (cross-link) 
• 
Associated campaign or project reference 
 
3.2.2 Client Account Cards 
Each client gets a dedicated account card that serves as the central hub for the client 
relationship. These are persistent, long-lived cards — not task cards that move to "Done." They 
stay in their column and accumulate context over time. 
 
Client Account Card Layout 
Column 
Description 
Agency Board PRD v2.0 — Confidential 
Page 7 
Active Clients 
Clients with current active projects 
On Hold 
Clients with paused engagements 
Onboarding 
New clients being set up 
Churned / Archived 
Former clients (archived but searchable) 
 
Client Account Card Fields 
• 
Client name and company 
• 
Primary contact name, email, and phone 
• 
Client tag (used to link all project tickets across all boards to this client) 
• 
Contract type and retainer details 
• 
Associated project cards across all boards (auto-linked via client tag) 
• 
Communication log (all emails sent and received) 
• 
Next meeting date and time (synced from Google Calendar) 
• 
Update cadence setting: daily, weekly, bi-weekly, or custom 
• 
Update send day and time (e.g., every Monday at 9:00 AM) 
• 
Auto-generated update email draft (AI-composed based on ticket data) 
• 
Email sending status (Draft, Approved to Send, Sent, Failed) 
 
3.2.3 AI-Powered Client Update Emails 
The Account Management board’s signature feature. The system automatically generates client 
status update emails by pulling real data from tickets tagged with that client across all boards. 
 
How It Works 
1. The account manager sets an update cadence on the client account card (e.g., weekly 
on Mondays at 9 AM). 
2. At the scheduled time, the system scans all tickets tagged with this client across all 
department boards (Design, Dev, Video, Copy). 
3. It collects: what was completed since last update, what is currently in progress, what is 
upcoming, and any blockers or items awaiting client input. 
4. The system connects to the account manager’s Google Calendar and identifies the next 
scheduled meeting with this client. 
5. AI composes a professional, branded status update email that includes: project progress 
summary, completed deliverables, items needing client attention/approval, and next 
meeting date/agenda preview. 
6. The draft is presented to the account manager in the client account card with a prompt: 
"Your weekly update for [Client Name] is ready. Would you like to review and send?" 
7. The account manager can edit the draft, approve it, or dismiss it. 
8. On approval, the email is sent via Resend.io from the agency’s branded email domain. 
 
Email Content Template (AI-Generated) 
• 
Greeting with client contact name 
• 
Summary of what was delivered/completed since the last update 
• 
Current work in progress with estimated completion dates 
Agency Board PRD v2.0 — Confidential 
Page 8 
• 
Items awaiting client action (pending approvals, feedback needed) 
• 
Upcoming milestones and deadlines 
• 
Next meeting: date, time, and suggested agenda points 
• 
Professional sign-off from the account manager 
 
Google Calendar Integration 
• 
OAuth connection to the account manager’s Google Calendar 
• 
Auto-detects meetings with the client (matched by client contact email or company name 
in calendar event) 
• 
Displays next meeting date and time on the client account card 
• 
Includes meeting info in the auto-generated update email 
• 
Can suggest rescheduling if no meeting is found within the expected cadence 
 
Email Delivery via Resend.io 
• 
Integration with Resend.io API for transactional email delivery 
• 
Custom sender domain (e.g., updates@youragency.com) 
• 
Email tracking: open rates, click tracking (optional) 
• 
Email history stored on the client account card 
• 
Fallback: account manager can copy the email text and send manually if preferred 
 
Account Manager Rules (Per Client Card) 
Each client account card has configurable rules that the account manager sets: 
Rule 
Options 
Default 
Update frequency 
Daily, Weekly, Bi-weekly, Monthly, Custom 
Weekly 
Send day 
Any day of the week 
Monday 
Send time 
Any time (in account manager’s timezone) 
9:00 AM 
Auto-send or approval 
required 
Send automatically or require AM review first 
Require review 
Include meeting info 
Yes / No 
Yes 
Include pending 
approvals 
Yes / No 
Yes 
Tone 
Formal, Friendly, Brief 
Friendly 
CC additional recipients 
List of email addresses 
None 
 
3.3 Development Board 
Purpose: Manage web development, app development, and technical implementation tasks. 
 
Default Workflow Columns 
Agency Board PRD v2.0 — Confidential 
Page 9 
Column 
Description 
Backlog 
Prioritized list of upcoming work 
Sprint Ready 
Groomed and ready for the current or next sprint 
In Progress 
Developer actively working 
Code Review 
Pull request submitted, awaiting peer review 
QA / Testing 
Manual testing against acceptance criteria 
AI QA Check (optional) 
AI-powered automated website quality check (toggle per ticket) 
Staging 
Deployed to staging environment for final review 
Client Review 
Client previewing on staging (if applicable) 
Deployed / Done 
Live in production, ticket closed 
 
Dev-Specific Card Fields 
• 
Ticket type (Feature, Bug, Enhancement, Tech Debt, Hotfix) 
• 
Repository and branch name 
• 
Pull request link 
• 
Staging / preview URL (triggers AI QA when submitted) 
• 
Production URL 
• 
Tech stack / language tags 
• 
Story points / complexity estimate 
• 
Related design card (cross-board link) 
• 
Browser / device testing checklist 
• 
AI QA toggle (on/off per ticket) 
• 
AI QA result log (pass/fail per checklist item with screenshots) 
 
Dev Board Automation Rules 
• 
When developer submits a staging/preview URL and AI QA toggle is ON → prompt 
"Would you like to run the quality check?" 
• 
When AI QA runs → card moves to "AI QA Check" column while processing 
• 
When AI QA passes all checks → card auto-moves to "Staging" or "Client Review" 
• 
When AI QA finds issues → card held with detailed report; developer notified 
• 
When card moves to "Deployed / Done" → final AI QA run on production URL (optional) 
 
3.4 Video Editing Board 
Purpose: Manage video production, editing, motion graphics, and post-production work. 
 
Default Workflow Columns 
Column 
Description 
Briefed 
Video request with creative direction and raw assets 
Agency Board PRD v2.0 — Confidential 
Page 10 
Footage Review 
Reviewing raw footage, selecting usable clips 
Rough Cut 
First assembly edit in progress or submitted 
Internal Review 
Creative director or producer reviewing the cut 
Fine Cut / Polish 
Refining transitions, color grading, audio mixing 
Client Review 
Sent to client for approval 
Revisions 
Client or internal changes requested 
Approved / Delivered 
Final render delivered, ticket closed 
 
Video-Specific Card Fields 
• 
Video type (Social clip, Commercial, Explainer, Event highlight, Tutorial, etc.) 
• 
Target duration / runtime 
• 
Aspect ratio (16:9, 9:16, 1:1, 4:5, etc.) 
• 
Raw footage link (cloud storage URL) 
• 
Music / audio track references 
• 
Export format and resolution (MP4 1080p, 4K, GIF, etc.) 
• 
Platform destination (YouTube, Instagram, TikTok, Website, etc.) 
• 
Subtitles / captions required (yes/no, language) 
• 
Revision round counter 
• 
AI Video Generation toggle (for AI-generated video content — Phase 2/3) 
 
AI Video Generation Widget (Phase 2/3) 
The Video Editing board includes an integrated AI video generation widget, powered by Sora 2 
and/or Veo 3 APIs. This allows video editors to generate AI-created video clips directly within a 
ticket, using them as raw material for edits or as standalone deliverables. 
 
Widget Capabilities 
• 
Text-to-video generation: Enter a text prompt describing the desired video clip, and the 
AI generates it 
• 
Image-to-video generation: Upload a single image and a prompt → AI animates it into a 
video clip 
• 
Start/end frame generation: Upload a start image and an end image → AI generates a 
video transition between them with a supporting prompt 
• 
Video with sound: Generate videos that include AI-generated audio, sound effects, or 
music (Veo 3 style) 
• 
Multiple generation options: Generate 2–4 variations from one prompt, editor picks the 
best 
 
Supported AI Providers 
Provider 
Capabilities 
API Key Config 
Agency Board PRD v2.0 — Confidential 
Page 11 
Sora 2 (OpenAI) 
Text-to-video, image-to-video, high visual quality 
Per-service API key set 
in agency settings 
Veo 3 (Google 
DeepMind) 
Text-to-video with native audio/sound generation 
Per-service API key set 
in agency settings 
 
How It Works 
1. Video editor opens the AI Generation widget within a video ticket. 
2. Editor selects generation mode: Text-to-Video, Image-to-Video, or Start/End Frame. 
3. Editor writes a prompt describing the desired output (e.g., "Aerial drone shot of a coastal 
city at sunset, cinematic, 4K"). 
4. If image-based: editor uploads the source image(s) via drag-and-drop or from the ticket’s 
attached files. 
5. Editor selects the AI provider (Sora 2 or Veo 3) and desired output settings (duration, 
aspect ratio, resolution, include audio). 
6. System sends the request to the selected API and shows a progress indicator. 
7. Generated video(s) appear in the widget as previews. Editor can play, compare, and 
select. 
8. Selected video is attached to the ticket as a file and can be used in the editing workflow. 
 
API Key Management 
• 
Each AI video provider requires its own API key 
• 
API keys are configured at the agency level in Settings → Integrations → AI Video 
Providers 
• 
Admin-only access to add, update, or revoke API keys 
• 
Usage tracking and cost monitoring per provider (monthly spend dashboard) 
• 
Rate limiting and budget caps per provider (e.g., max $500/month on Sora 2) 
 
Generation History 
• 
All AI-generated videos are logged with: prompt used, provider, settings, timestamp, and 
cost 
• 
Generation history is stored on the ticket for audit and re-generation 
• 
Previously generated clips can be re-used across tickets 
 
3.5 Executive Assistant Board 
Purpose: Manage administrative tasks, scheduling, travel, procurement, and operational 
support for agency leadership. 
 
Default Workflow Columns 
Column 
Description 
Inbox 
New requests and tasks submitted by executives 
Agency Board PRD v2.0 — Confidential 
Page 12 
Scheduled 
Task has a planned date/time or deadline 
In Progress 
EA actively working on the task 
Waiting on External 
Blocked on a vendor, client, or third party 
Follow-Up Needed 
Requires a check-in or reminder at a future date 
Done 
Task completed 
 
EA-Specific Card Fields 
• 
Task category (Scheduling, Travel, Procurement, Research, Event planning, Admin) 
• 
Requesting executive (who asked for this) 
• 
Urgency level (Today, This week, Whenever) 
• 
Calendar event link (if scheduling-related) 
• 
Vendor / contact information 
• 
Budget or cost (if procurement-related) 
• 
Recurring (yes/no, frequency) 
• 
Follow-up date 
 
3.6 Client Strategy Map Board 
Purpose: A strategic planning and coaching board where each client gets a living "map" — a 
structured, evolving document that tracks the client’s entire journey: their goals, project 
roadmap, credentials/passwords, resources, training progress, website visual brief, marketing 
assets needed, outreach plan, and ongoing whiteboard notes. This replaces the Google Doc 
currently used per client as a master strategy document. 
 
The Map Board is unique among all board types. It is not a task-management Kanban board. It 
is a structured-document board where each "card" is a section of the client’s strategy map, and 
the board itself is the map. 
 
How the Map Board Differs from Other Boards 
 
Department Boards (Design, Dev, 
etc.) 
Map Board 
Card =  
A task or deliverable 
A section of the client’s strategy 
document 
Columns =  
Workflow stages (Briefed → Done) 
Map sections (Onboarding, Projects, 
Resources, etc.) 
Lifecycle 
Cards move left to right and close 
Cards are persistent and continuously 
updated 
Who uses it 
Team members working on tasks 
Agency owner / strategist / super coach 
Client visibility 
Selected tickets visible to client 
Configurable: some sections visible, 
others internal only 
Agency Board PRD v2.0 — Confidential 
Page 13 
 
Map Board Default Sections (Columns) 
Section 
Description 
Content Type 
Expectations & 
Onboarding 
Client expectations, signed agreements, 
onboarding status, ground rules 
Rich text, links, 
checklists 
Credentials & Access 
Encrypted storage for client’s WordPress, 
hosting, registrar, CRM, and other platform 
credentials 
Encrypted key-value 
pairs (username, 
password, URL) 
Training & 
Assignments 
Structured coaching curriculum: video lessons, 
writing prompts, homework assignments with 
completion tracking 
Ordered cards with video 
embeds, prompts, and 
submission status 
Project Roadmap 
(Doors) 
The 10 Important Things / Doors: numbered 
strategic projects for the client, each with sub-
steps (Keys) 
Ordered project cards 
with nested key steps 
Visual Brief & 
Website Plan 
Website section map, color palette, photo 
directory plan, inspiration links, layout 
specifications 
Rich text, image 
galleries, link collections 
Marketing Assets 
What’s needed vs. not needed: logo, EPK, 
outreach materials, social media assets, business 
cards, etc. 
Checklists with status 
(Needed / Not Needed / 
Done) 
Outreach & Lead Gen 
Outreach strategy: scraping tools, email 
campaigns, follow-up scripts, A/B testing plans, 
weekly execution cadence 
Structured plans with W 
(Week) and K (Key step) 
hierarchy 
Resources & Tools 
Curated links: scheduling, stock photos, 
productivity tools, reference videos, templates 
Link library organized by 
category 
Whiteboard / Notes 
Freeform space for meeting notes, brainstorming, 
ad-hoc ideas, and discussion topics for upcoming 
calls 
Rich text, freeform 
 
3.6.1 Credentials Vault 
The Map Board includes a secure credentials section for storing client platform access. This 
replaces the current practice of storing passwords in a shared Google Doc. 
• 
Encrypted at rest using AES-256 encryption 
• 
Credentials visible only to authorized users (agency owner, assigned account manager) 
• 
Each credential entry: Platform name, URL, Username, Password (masked by default, 
click to reveal) 
• 
Audit log: who viewed or modified credentials and when 
• 
Common presets: WordPress, Hosting Provider, Domain Registrar, CRM, Email 
Marketing, Social Media, Analytics, Ad Platforms 
• 
Copy-to-clipboard functionality for quick use 
• 
Optional: integration with 1Password or Bitwarden via API for agencies that already use 
a password manager 
 
Agency Board PRD v2.0 — Confidential 
Page 14 
3.6.2 Training & Assignments Tracker 
For coaching-style client relationships, the Map Board tracks a structured curriculum of video 
lessons, writing prompts, and homework assignments. 
 
Assignment Card Structure 
Field 
Description 
Assignment title 
e.g., "Day 1 - Assignment 1A: Rules and Details" 
Video lesson link 
Embedded or linked video (Vimeo, YouTube, etc.) 
Video / Writing prompt 
The question or exercise the client needs to complete 
Time limit 
e.g., "< 2 Minutes" for video responses 
Homework instructions 
What the client should submit and where 
Completion status 
Not Started / In Progress / Submitted / Reviewed 
Client submission 
File upload or text response from the client 
Coach feedback 
Agency owner’s notes or feedback on the submission 
Due date 
When this assignment should be completed by 
 
• 
Assignments are ordered (Day 1, Day 2, etc.) and can have prerequisite dependencies 
("Cannot start 4b until 4a is complete") 
• 
Progress bar shows overall curriculum completion (e.g., "7 of 12 assignments complete") 
• 
Client can view and complete assignments through their Client Board (if enabled) 
• 
Notifications: remind the client when an assignment is overdue; notify the coach when a 
submission comes in 
 
3.6.3 Project Roadmap: Doors & Keys 
The Project Roadmap section uses the Doors and Keys framework from the current map 
template. Each "Door" is a major strategic project, and each "Key" is a concrete step within that 
project. 
 
Door Card Structure 
Field 
Description 
Door number 
D1, D2, D3... D10 (ordered priority) 
Door title 
e.g., "Website - Visual Plan", "Logo + Professional Email", "Outreach" 
Description 
What this project entails and why it matters 
Keys (sub-steps) 
K1, K2, K3, K4... ordered action items within the Door 
Status 
Not Started / In Progress / Completed 
Agency Board PRD v2.0 — Confidential 
Page 15 
Linked tickets 
Cross-board links to actual Design, Dev, or Copy tickets executing this 
work 
Notes & credentials 
Door-specific notes, URLs, username/password pairs (e.g., Wix 
credentials for Door 2) 
Dependencies 
Which Door must be completed before this one can start 
 
• 
Doors are displayed as an ordered, numbered list with progress indicators 
• 
Each Key within a Door can be checked off as completed 
• 
When a Door is completed, it visually marks as done but remains visible for reference 
• 
The overall roadmap shows a progress bar: "4 of 10 Doors completed" 
 
3.6.4 Outreach Planner: Weeks & Keys 
For clients running outreach campaigns, the Map Board includes a structured weekly planner 
using the W (Week) / K (Key step) framework. 
• 
W1: Marketing assets → K1: Plan copy, K2: Get pictures, K3: Optimize copy, K4: 
Schedule free shows 
• 
W2: Scraping and prep → K1: Create accounts, K2: Scrape leads, K3: Write intro email, 
K4: Setup sending tool 
• 
W3: Sending emails → K1: Test run, K2: Write follow-ups, K3: Send batches, K4: Send 
first follow-up 
• 
W4: Optimize → K1: Analyze response data, K2: Improve copy, K3: Improve targeting, 
K4: Compare tools 
• 
Each week is a card, each key step is a checklist item within the card 
• 
Progress tracked per week with completion percentages 
 
3.6.5 Visual Brief Section 
A dedicated space for website planning that mirrors the current map template’s visual brief 
format: 
• 
Section map: ordered list of website sections (S1: Hero/Topper, S2: Services, S3: About, 
S4: Testimonials, etc.) with descriptions 
• 
Color palette: embedded color swatches with hex codes, linked to tools like Coolors.co 
and Colorhunt.co 
• 
Photo directory plan: structured list of required photos by category (Logo, Studio shots, 
Stage shots, Customer photos, Atmosphere) 
• 
Inspiration board: saved links and screenshots of reference websites the client likes 
• 
Can be directly linked to Design Board tickets when the visual brief becomes a design 
task 
 
3.6.6 Map Board Features 
• 
One Map Board per client (auto-created alongside the Client Board when a new client is 
onboarded) 
• 
Map Board is accessible from the client account card on the AM board and from the 
cross-board dashboard 
Agency Board PRD v2.0 — Confidential 
Page 16 
• 
AI Chatbot is aware of the Map Board: "What’s the next Door for Acme Corp?" or "Show 
me the credentials for their hosting provider" 
• 
Sections can be toggled as client-visible (some sections like Resources and Training 
can be shared; Credentials stay internal) 
• 
Export: generate a PDF snapshot of the entire map for offline review or client 
presentations 
• 
Template system: create Map Board templates for different client types (coaching client, 
website project, marketing retainer) 
• 
Version history: the map is a living document; all changes are tracked with timestamps 
and author 
 
 
Agency Board PRD v2.0 — Confidential 
Page 17 
4. AI-Powered Design Review System 
This is Agency Board’s signature feature. It uses a vision-capable AI model to verify whether 
specific, articulated design revision requests have been addressed in a new submission, 
reducing missed fixes and unnecessary revision rounds. 
 
4.1 Scope & Positioning 
This feature is an AI Change Verification Assistant, not an AI design critic. It checks whether 
specific, concrete changes requested in comments and revision notes have been implemented 
in the updated design file. It is not intended to judge subjective quality, aesthetics, or creative 
direction. 
 
4.2 How It Works 
Trigger Mechanism 
1. A designer uploads a revised design file to a ticket that has the AI Review toggle 
enabled. 
2. The designer clicks a "Submit for AI Review" button (AI review does not fire on every 
upload — only on explicit submission, so designers can upload work-in-progress files 
without triggering the check). 
3. The card automatically moves to the "AI Review" column while processing. 
 
Processing Pipeline 
1. System collects: (a) the previous version of the design, (b) the newly submitted version, 
(c) all revision comments and change requests from the ticket’s comment thread and 
checklist items. 
2. Both images and the structured list of requested changes are sent to a vision-capable AI 
model (e.g. Claude Sonnet with vision, GPT-4o, or Gemini Pro Vision). 
3. The AI evaluates each requested change individually and returns a structured response: 
for each change request, a status of Verified, Not Verified, or Inconclusive, along with a 
brief explanation. 
4. Results are posted as a structured comment on the ticket and stored in the AI Review 
result log field. 
 
4.3 What AI Review Can Reliably Check 
Category 
Examples 
Reliability 
Color changes 
"Change headline to #FF5733", "Make background 
darker" 
High 
Text / content 
changes 
"Fix typo in tagline", "Update phone number" 
High 
Agency Board PRD v2.0 — Confidential 
Page 18 
Element add / 
remove 
"Add CTA button below hero", "Remove third 
image" 
High 
Layout / structural 
"Add more whitespace between sections", "Move 
logo to the left" 
Medium-High 
Size / proportion 
"Make the logo bigger", "Increase font size of 
heading" 
Medium 
Subjective / taste 
"Make it pop more", "Needs to feel premium" 
Low — AI will mark as 
Inconclusive 
Animation / 
interaction 
"Add hover effect", "Make it scroll-triggered" 
Not supported (static 
image review) 
 
4.4 Outcome Handling 
All Changes Verified 
• 
Card can proceed to the next column (Internal Review or Client Review depending on 
workflow) 
• 
AI posts a summary comment: "All 5 requested changes verified. Ready for review." 
 
Some Changes Not Verified 
• 
Card is held with a warning banner (does not auto-move forward) 
• 
AI posts a detailed comment listing which changes passed and which did not 
• 
Designer is notified and can either re-submit or override the AI check with a comment 
explaining why 
 
Designer Override 
• 
Designers can override AI results and move the card forward manually 
• 
Override requires a comment ("AI flagged X, but this was intentional because...") 
• 
Override is logged in the activity feed for transparency 
 
4.5 Toggle Mechanism 
• 
AI Review is a per-ticket toggle, defaulting to OFF 
• 
Can be turned on by the ticket creator, the assignee, or an admin 
• 
Board-level setting to default the toggle to ON for all new tickets (can still be disabled per 
ticket) 
• 
Intended to be disabled for: initial creative exploration, subjective feedback rounds, and 
simple tasks where review is unnecessary 
 
4.6 Technical Requirements for AI Review 
• 
Integration with a vision-capable AI API (Claude, GPT-4o, or Gemini) 
Agency Board PRD v2.0 — Confidential 
Page 19 
• 
Image comparison pipeline: system must store and retrieve previous and current 
versions 
• 
Structured prompt engineering to convert free-text comments into a verifiable change 
checklist 
• 
Response parsing to extract per-change verdicts from the AI response 
• 
Timeout handling: if AI does not respond within 30 seconds, card moves forward with a 
note that AI review timed out 
• 
Rate limiting and cost management: AI review is an API call with per-token costs 
• 
File format support: PNG, JPG, PDF (first page), and Figma export screenshots 
 
4.7 Future Enhancements (Post-MVP) 
• 
Extend AI review to Video Editing board (compare frames/thumbnails) 
• 
AI-generated revision checklists from unstructured client feedback 
• 
Confidence scoring and learning from designer overrides 
• 
Side-by-side visual diff overlay in the ticket UI 
 
 
Agency Board PRD v2.0 — Confidential 
Page 20 
5. AI-Powered Dev QA System 
The Development Board has its own AI-powered quality assurance tool, parallel to the Design 
Board’s AI Review. When a developer submits a new staging or preview URL, the system can 
automatically browse the live page, screenshot it across devices, and run it against a 
configurable QA checklist — reporting exactly what needs to be fixed before the page is ready 
for client review or deployment. 
 
5.1 How It Works 
Trigger Mechanism 
1. A developer adds or updates a staging/preview URL on a ticket that has the AI QA 
toggle enabled. 
2. The system prompts: "Would you like to run the quality check?" (AI QA never runs 
automatically without developer confirmation). 
3. Developer confirms → card moves to the "AI QA Check" column while processing. 
 
Processing Pipeline 
1. The AI agent launches a headless browser and navigates to the submitted URL. 
2. It captures screenshots at multiple viewport sizes: desktop (1440px), tablet (768px), and 
mobile (375px). 
3. It interacts with the page: scrolling, hovering over buttons, clicking navigation elements, 
testing scroll behavior. 
4. It evaluates each item on the QA checklist against what it observes in the screenshots 
and interactions. 
5. It generates a structured report: for each checklist item, a status of Pass, Fail, or 
Warning, with a screenshot annotation and explanation. 
6. The report is posted as a structured comment on the ticket and stored in the AI QA result 
log field. 
 
5.2 Default QA Checklist 
The QA checklist is fully configurable and teachable. The agency owner defines the master 
checklist, which can be extended per project. The default checks include: 
 
Page Sanity Checks 
Check 
What AI Verifies 
Detection Method 
Page loads 
successfully 
No 404, 500, or blank page errors 
HTTP status + visual 
confirmation 
No broken images 
All images render; no missing/broken image 
icons 
Screenshot analysis 
Agency Board PRD v2.0 — Confidential 
Page 21 
No placeholder 
content 
No lorem ipsum, TODO markers, or 
placeholder images 
Text and image analysis 
Favicon present 
Browser tab shows a favicon 
Page metadata check 
Page title is correct 
Title tag is meaningful, not default/generic 
Page metadata check 
No console errors 
Browser console has no critical JavaScript 
errors 
Console log capture 
SSL certificate valid 
Page loads over HTTPS without warnings 
Connection check 
 
Mobile & Responsive Checks 
Check 
What AI Verifies 
Detection Method 
No horizontal scroll on 
mobile 
Page does not allow left-to-right scrolling 
at mobile viewport 
Viewport overflow detection 
+ screenshot at 375px 
Touch targets are 
adequate 
Buttons and links are large enough to tap 
(min 44x44px) 
Element size analysis 
Text is readable on 
mobile 
Font sizes are not too small; no text 
overflow or truncation 
Screenshot analysis at 
mobile viewport 
Navigation is mobile-
friendly 
Hamburger menu or mobile nav is 
functional 
Interaction test 
Images scale properly 
No images overflowing their containers on 
small screens 
Screenshot comparison 
across viewports 
No content clipping 
No text or elements cut off at any viewport 
size 
Screenshot analysis 
 
Interaction & UI Checks 
Check 
What AI Verifies 
Detection Method 
All buttons have hover 
effects 
Every clickable button shows a visual 
change on hover (color, shadow, scale, 
etc.) 
Hover interaction + 
before/after screenshot 
comparison 
Links have hover states 
Text links show visual feedback on hover 
(underline, color change) 
Hover interaction test 
Forms are functional 
Input fields accept text, submit buttons are 
clickable 
Interaction test 
Focus states visible 
Keyboard-navigable elements show visible 
focus indicators 
Tab-through + screenshot 
Scroll behavior is smooth 
No janky or broken scroll on the page 
Scroll interaction analysis 
Animations function 
CSS animations and transitions play 
correctly 
Visual analysis of state 
changes 
 
Agency Board PRD v2.0 — Confidential 
Page 22 
Cross-Browser & Performance 
Check 
What AI Verifies 
Detection Method 
Consistent across 
viewports 
Layout does not break between desktop, 
tablet, and mobile 
Screenshot comparison 
across 3 viewports 
Page load speed 
Time to interactive under acceptable 
threshold 
Performance timing 
measurement 
Font loading 
Custom fonts load correctly; no 
FOUT/FOIT flash 
Screenshot timing analysis 
RTL layout correctness 
If applicable: right-to-left language layout 
renders correctly 
Screenshot analysis with 
RTL flag 
 
5.3 Custom Checklist Configuration 
The QA checklist is not fixed. The agency owner can: 
• 
Add custom check items with plain-language descriptions (e.g., "Verify the contact form 
sends to info@client.com") 
• 
Remove or disable default checks that are not relevant to a project 
• 
Create project-specific checklist templates (e.g., "Landing Page QA" vs. "E-commerce 
QA" vs. "WordPress Site QA") 
• 
Set severity levels per check: Critical (blocks deployment), Warning (flag but don’t 
block), Info (nice-to-have) 
• 
Teach the system by example: provide reference screenshots of "correct" 
implementations for the AI to compare against 
 
5.4 Outcome Handling 
All Checks Pass 
• 
Card can proceed to "Staging" or "Client Review" 
• 
AI posts a summary: "QA Check passed — 14/14 checks passed across 3 viewports. 
Ready for review." 
• 
Screenshots from all viewports are attached to the ticket as reference 
 
Failures Found 
• 
Card is held with a detailed report listing each failed check 
• 
Each failure includes: the check name, what was expected, what was found, and an 
annotated screenshot 
• 
Failures are categorized by severity: Critical failures block the card; Warnings allow 
override 
• 
Developer is notified and can fix issues and re-run the check 
 
Developer Override 
• 
Developers can override non-critical failures and move the card forward 
Agency Board PRD v2.0 — Confidential 
Page 23 
• 
Override requires a comment explaining why (e.g., "Hover effect on that button is 
intentionally disabled per client request") 
• 
Override is logged in the activity feed 
 
5.5 Technical Requirements for Dev QA 
• 
Headless browser integration (Puppeteer or Playwright) for page navigation, 
screenshotting, and interaction 
• 
Vision-capable AI model (same as Design Review: Claude, GPT-4o, or Gemini) for 
screenshot analysis 
• 
Multi-viewport rendering: 1440px (desktop), 768px (tablet), 375px (mobile) 
• 
Hover and click simulation for interaction checks 
• 
Console log capture for JavaScript error detection 
• 
Performance timing API access for load speed measurement 
• 
Timeout handling: if QA check does not complete within 60 seconds, report partial 
results and flag timeout 
• 
Rate limiting: prevent accidental repeated runs; cooldown of 2 minutes between runs on 
the same ticket 
• 
Cost management: each QA run involves multiple AI vision calls; budget alerts required 
 
5.6 Relationship to Design Board AI Review 
The Design Board AI Review and the Dev Board AI QA are parallel but distinct systems: 
 
 
Design Board AI Review 
Dev Board AI QA 
Purpose 
Verify revision changes were made to a 
static design 
Verify a live website meets quality 
standards 
Input 
Design image files (before/after) + 
revision comments 
Live URL + configurable QA checklist 
AI Capability 
Image comparison and change 
verification 
Browser automation + screenshot 
analysis + interaction testing 
Trigger 
Designer clicks "Submit for AI Review" 
Developer submits URL, confirms "Run 
quality check" 
Output 
Per-change verdict (Verified / Not 
Verified) 
Per-check verdict (Pass / Fail / 
Warning) with annotated screenshots 
 
5.7 Future Enhancements (Post-MVP) 
• 
Lighthouse integration for automated performance, SEO, and accessibility scoring 
• 
Accessibility audit (WCAG 2.1 AA compliance checking) 
• 
Visual regression testing: compare current deployment to previous version 
• 
Automated link checking (all internal/external links resolve) 
• 
Multi-browser testing (Chrome, Firefox, Safari rendering comparison) 
• 
Scheduled recurring QA runs on production URLs (monitoring mode) 
Agency Board PRD v2.0 — Confidential 
Page 24 
 
 
Agency Board PRD v2.0 — Confidential 
Page 25 
6. Core Platform Features 
These features apply across all board types. 
 
6.1 Board Management 
• 
Create boards from department-specific templates (Design, Copy, Dev, Video, EA) 
• 
Board cover images and color coding for visual identification 
• 
Board archiving, duplication, and starring/favoriting 
• 
Board-level permissions (who can view, edit, move cards) 
• 
Board search and filtering across all departments 
 
6.2 Card Management 
Universal Card Fields (all board types) 
• 
Title (required) and rich-text description 
• 
Assignee(s) — multiple assignees supported 
• 
Due date and time 
• 
Priority level (Low, Medium, High, Urgent) 
• 
Time estimate and actual time logged 
• 
Labels / tags (color-coded, customizable per board) 
• 
Checklist items with completion tracking 
• 
File attachments with drag-and-drop upload 
• 
Comments with @mentions and threaded replies 
• 
Activity log (full audit trail of all changes) 
• 
Dependencies (blocked by / blocking other cards, including cross-board) 
• 
Custom fields (text, number, dropdown, date) 
 
Card Interactions 
• 
Drag-and-drop between columns and within columns (60fps, smooth) 
• 
@mention notifications in comments 
• 
Card watchers / subscribers 
• 
Emoji reactions to comments 
• 
Card permalinks (shareable URLs) 
• 
Bulk card operations (multi-select, move, label, assign) 
• 
Card duplication within and across boards 
 
6.3 Real-Time Collaboration 
• 
Real-time card updates via Supabase Realtime (no page refresh needed) 
• 
Live presence indicators (who is viewing which board/card) 
• 
Typing indicators in comment threads 
• 
Optimistic UI updates for instant feedback 
• 
Conflict resolution for simultaneous edits 
 
Agency Board PRD v2.0 — Confidential 
Page 26 
6.4 Notifications 
• 
In-app notification center 
• 
Email notifications (configurable per event type) 
• 
Browser push notifications (opt-in) 
• 
Digest emails (daily/weekly summaries) 
• 
Notification types: assigned, @mentioned, due soon, overdue, card moved, file added, 
comment on watched card, board shared 
 
6.5 AI Chatbot (Context-Aware Assistant) 
Agency Board includes a built-in AI chatbot available at every level of the system. The chatbot is 
not a generic assistant — it is fully context-aware, meaning it has access to and can reason 
about the tickets, files, comments, and activity within its scope. 
 
Three Scope Levels 
Scope 
Context Available 
Accessed From 
Ticket-Level Chat 
Everything in the current ticket: title, description, all 
comments, all attached files (PDFs, images, docs), 
activity log, checklist items, linked tickets, assignees, 
and status history 
Chat icon within any 
ticket detail view 
Board-Level Chat 
Everything in the current board: all tickets, all 
comments, all files across all tickets on that board, 
board settings, column structure, and team 
assignments 
Chat icon in the board 
header 
All-Boards Chat 
Everything across all department boards: all tickets, all 
boards, all files, all comments, team workload, cross-
board links, client data, and project-level context 
Chat icon in the 
global nav / 
dashboard 
 
What the Chatbot Can Do 
Information Retrieval & Analysis 
• 
"Read this PDF and summarize it for me" 
• 
"Are there other PDFs in this ticket I should be aware of?" 
• 
"What were the revision requests on this ticket?" 
• 
"Show me all overdue tickets on the Design board" 
• 
"Which tickets for Acme Corp are still in progress across all boards?" 
• 
"What did the client say in their last comment?" 
 
Research & Web Lookup 
• 
"Find similar design examples for this style online" 
• 
"Double-check this information — look it up online" 
• 
"What are the brand guidelines for this company? Search their website" 
• 
"What’s the current best practice for mobile hero banner sizing?" 
Agency Board PRD v2.0 — Confidential 
Page 27 
 
Ticket Actions & Drafting 
• 
"Draft a comment summarizing the current status of this ticket for the client" 
• 
"Create a checklist for QA testing based on the requirements in this ticket" 
• 
"Move this ticket to Client Review and notify the account manager" 
• 
"Tag all open tickets from this client with the label ‘Q1 Campaign’" 
 
Cross-Context Intelligence 
• 
"Is there a design ticket linked to this dev ticket? What’s its status?" 
• 
"How many tickets has this designer completed this month?" 
• 
"Compare the current revision to what was originally requested" 
• 
"What’s blocking the Acme Corp website launch across all boards?" 
 
Technical Implementation 
• 
Powered by the same AI provider as Design Review and Dev QA (Claude, GPT-4o, or 
Gemini) 
• 
Context window includes: ticket metadata, comments, file contents (PDFs extracted, 
images described), and activity logs 
• 
At board and all-boards scope, the system uses retrieval-augmented generation (RAG) 
to search across large volumes of data efficiently 
• 
Web search capability for real-time information lookup when the user asks questions 
outside the ticket’s data 
• 
Conversation history maintained per session (user can start a new session anytime) 
• 
File processing: PDFs are text-extracted, images are sent to vision models for 
description, docs are parsed 
• 
Permissions-aware: the chatbot only surfaces information the current user has access to 
 
6.6 Nano Banana Integration (AI Image Editing) 
Agency Board integrates Nano Banana (Google’s Gemini-powered AI image generation and 
editing model) directly into the platform, allowing designers and team members to make quick 
visual modifications on the spot without leaving the ticket. 
 
What Nano Banana Does Inside Agency Board 
• 
Conversational image editing: describe what you want changed in natural language 
("change the background to blue", "remove the person on the left", "add a drop shadow 
to the logo") 
• 
Quick mockup generation: generate new visuals from text prompts directly within a ticket 
• 
Image-to-image editing: upload or select an attached image and make targeted edits 
while preserving the rest 
• 
Character and brand consistency: maintain visual identity across multiple edits 
• 
Text rendering in images: generate images with accurate text overlays for social media, 
posters, and ads 
 
Agency Board PRD v2.0 — Confidential 
Page 28 
Where It’s Available 
Location 
Use Case 
Design Board tickets 
Quick edits to design files: adjust colors, swap backgrounds, generate 
variations, mock up alternatives before committing to full revision 
Video Editing tickets 
Generate thumbnail options, create storyboard frames, edit still frames 
from video 
Any ticket with image 
attachments 
Quick cleanup, annotation, or modification of attached images 
AI Chatbot 
User can ask the chatbot to edit an image: "Take the hero image from this 
ticket and make the sky more dramatic" 
Client Board tickets 
Account managers can generate quick visual previews for client requests 
before assigning to design team 
 
How It Works 
1. User clicks the Nano Banana icon on any image attachment or in the ticket’s AI tools 
panel. 
2. The image loads into an inline editing canvas within the ticket. 
3. User types natural language instructions describing the desired edit. 
4. Nano Banana processes the edit and shows a preview. User can iterate with follow-up 
instructions. 
5. When satisfied, user saves the edited image as a new attachment on the ticket (original 
is preserved in version history). 
 
API & Configuration 
• 
Powered by Google Gemini 2.5 Flash Image (Nano Banana) or Gemini 3 Pro Image 
(Nano Banana Pro) 
• 
API key configured at the agency level in Settings → Integrations → AI Image Editing 
• 
Usage tracking and cost monitoring (per-edit cost is low but should be tracked) 
• 
Option to enable Nano Banana Pro for higher resolution output (up to 4K) for print-ready 
work 
• 
All generated images include SynthID watermark for AI transparency (can be noted in 
client deliverables) 
 
6.7 Client AI Brain (Per-Client Trained Assistant) 
Every client in Agency Board gets their own dedicated AI assistant — a "Client Brain" that is 
continuously trained on all approved work, copy, design decisions, brand preferences, and 
communication history for that client. It’s like having a custom GPT per client that knows 
everything about them and can produce new work in their established voice and style. 
 
What the Client Brain Knows 
Agency Board PRD v2.0 — Confidential 
Page 29 
The Client Brain automatically ingests and indexes the following data, scoped exclusively to the 
specific client: 
Data Source 
What’s Indexed 
Updated When 
Approved copy tickets 
All finalized blog posts, emails, ad copy, social 
captions, website copy, taglines, and CTAs that were 
approved by the client 
When a Copy/AM 
ticket moves to 
"Approved" or 
"Published" 
Design tickets 
Design briefs, revision notes, approved design 
descriptions, style preferences expressed in 
comments, color/font choices 
When a Design 
ticket moves to 
"Approved" or 
"Delivered" 
Client account card 
Client name, industry, target audience, contract 
details, communication tone preferences 
When the AM 
updates the client 
card 
Map Board 
Brand guidelines, visual brief, color palette, section 
map, project roadmap, all strategic notes 
Continuously as the 
Map Board is 
updated 
Client Board 
interactions 
Client’s own comments, feedback patterns, approval 
notes, revision requests, and satisfaction survey 
responses 
Real-time as client 
interacts 
Asset Library 
All approved assets: logos, brand photos, design files, 
templates tagged to this client 
When assets are 
added or updated 
AM email history 
All AI-generated status update emails sent to this 
client (tone, format, what resonated) 
When emails are 
sent via Resend.io 
Video tickets 
Video briefs, approved scripts, voiceover notes, style 
references, platform preferences 
When Video tickets 
move to "Approved" 
 
What You Can Ask the Client Brain 
Copy & Content Creation 
• 
"Write a new blog post for Acme Corp about winter maintenance tips — match the tone 
and style of their previous posts" 
• 
"Draft 5 Instagram captions for their new product launch, using their established voice" 
• 
"Write a follow-up email to their customers based on how we’ve written emails for them 
before" 
• 
"Create ad copy for a Facebook campaign — use the same messaging framework that 
performed well in their Q3 ads" 
 
Brand & Design Direction 
• 
"What are Acme Corp’s brand colors and fonts?" 
• 
"Show me the style direction we established for their website" 
• 
"What design feedback has this client given us most often?" (learns their preferences 
from revision patterns) 
Agency Board PRD v2.0 — Confidential 
Page 30 
• 
"Generate a design brief for a new landing page that matches their existing visual 
identity" 
 
Strategy & Knowledge 
• 
"What campaigns have we run for this client and what were the results?" 
• 
"Summarize everything we know about this client’s target audience" 
• 
"What’s still on their project roadmap that we haven’t started?" 
• 
"What has this client complained about or requested changes on most frequently?" 
 
How the Client Brain Works Technically 
• 
Each client has a dedicated vector embedding index (stored in Supabase with pgvector 
or a dedicated vector store like Pinecone) 
• 
When approved content is created or updated, it is chunked, embedded, and stored in 
the client’s vector index 
• 
When a user queries the Client Brain, the system performs retrieval-augmented 
generation (RAG): it searches the client’s vector index for relevant context, then sends 
that context + the user’s query to the AI model 
• 
The AI model generates a response that is grounded in the client’s actual approved 
work, not generic output 
• 
No data from other clients leaks into the response — strict client-level data isolation 
 
Where to Access the Client Brain 
Location 
How to Access 
Client account card (AM 
Board) 
"Client Brain" tab on the card — chat directly in context of this client 
Client’s Map Board 
Brain icon in the Map Board header — ask questions about strategy 
and roadmap 
Any ticket tagged with the 
client 
Switch the ticket-level chatbot to "Client Brain mode" to generate 
content in the client’s voice 
Global AI Chatbot (all-boards 
level) 
Prefix with the client name: "For Acme Corp: write a new homepage 
headline" 
Dedicated Client Brain page 
Settings → Clients → [Client Name] → Client Brain — full-screen 
chat interface 
 
Client Brain Learning & Quality 
• 
The Brain only learns from approved/delivered work — never from drafts, rejected 
revisions, or internal-only comments 
• 
When new work is approved, the Brain’s index updates automatically (no manual 
retraining needed) 
• 
Quality improves over time: the more approved work exists for a client, the more 
accurately the Brain captures their voice and preferences 
• 
Admin can manually exclude specific tickets or content from the Brain’s index if needed 
Agency Board PRD v2.0 — Confidential 
Page 31 
• 
Brain confidence indicator: when generating new content, the Brain shows how much 
relevant training data it has (e.g., "Based on 47 approved copy pieces and 23 design 
tickets") 
 
Client Brain vs. General Chatbot 
 
General AI Chatbot (Section 6.5) 
Client AI Brain 
Scope 
Ticket, board, or all-boards — general 
agency context 
Single client — everything about that 
client specifically 
Knowledge 
Reads current ticket/board data in real-
time 
Trained on all approved work, copy, 
designs, preferences, and history for 
one client 
Best for 
Answering questions, reading files, 
research, ticket actions 
Creating new content in the client’s 
voice, recalling brand preferences, 
strategic continuity 
Data source 
Live data from current context window 
Vector-indexed approved content via 
RAG 
Isolation 
Sees what the current user has 
permission to see 
Strictly isolated to one client’s data — 
no cross-client leakage 
 
6.8 Structured Briefing System 
Half of excessive revision cycles stem from unclear briefs, not bad execution. Agency Board 
enforces structured, department-specific briefing templates that ensure all required information 
is captured before work begins. 
 
How It Works 
• 
Each board type has configurable briefing templates mapped to deliverable types 
• 
When a new ticket is created, the creator selects the deliverable type and a structured 
brief form appears with required and optional fields 
• 
Tickets cannot move out of the "Briefed" column until all required brief fields are 
completed (enforced by the system) 
• 
Incomplete briefs show a visual warning with a list of missing fields 
• 
The AI Chatbot can help populate briefs: "Generate a brief for a landing page based on 
this client’s brand guidelines" 
 
Department Briefing Templates 
Board 
Example Template 
Required Fields 
Design 
Website Design Brief 
Objectives, target audience, brand guidelines link, reference 
sites/mood boards, page list, dimensions/formats, 
mandatory elements, deadline 
Agency Board PRD v2.0 — Confidential 
Page 32 
Design 
Social Media Asset Brief 
Platform(s), aspect ratios, campaign name, copy overlay 
text, brand colors/fonts, number of variations, deadline 
Design 
Logo / Branding Brief 
Company background, industry, target market, style 
preferences (modern/classic/playful), competitor logos to 
differentiate from, color preferences 
Dev 
Feature Request Brief 
User story, acceptance criteria, design mockup link, 
technical constraints, browser/device requirements, staging 
URL 
Dev 
Bug Report Brief 
Steps to reproduce, expected behavior, actual behavior, 
browser/device/OS, screenshot or screen recording, severity 
Copywriting 
Blog Post Brief 
Topic, target keyword, audience persona, tone, word count 
target, CTA, internal/external links to include, reference 
articles 
Copywriting 
Email Campaign Brief 
Campaign goal, audience segment, subject line 
suggestions, key message, CTA, send date, A/B testing 
requirements 
Video 
Video Production Brief 
Video type, objective, target duration, aspect ratio, key 
scenes/shot list, music direction, voiceover script or notes, 
footage sources, platform destination 
 
Brief Quality Scoring 
• 
Each brief receives a completeness score (percentage of fields filled) 
• 
AI can optionally review the brief and flag ambiguities: "The brief says ‘make it modern’ 
but doesn’t specify a reference. Consider adding example sites." 
• 
Revision rate analytics can be correlated with brief completeness scores to prove that 
better briefs lead to fewer revisions 
 
6.9 Digital Asset Library (DAM) 
A centralized, searchable repository for all agency and client assets. Instead of hunting through 
old tickets for "the latest Acme Corp logo," team members go to the asset library. 
 
How Assets Enter the Library 
• 
Auto-archive: when a ticket moves to "Approved" or "Delivered," attached deliverable 
files are automatically copied to the client’s asset library folder 
• 
Manual upload: team members can upload assets directly to the library (brand 
guidelines, logos, fonts, stock photos) 
• 
Bulk import: initial setup allows bulk upload of existing client assets 
 
Organization & Search 
• 
Organized by: Client → Asset Type → Project/Campaign 
• 
Asset types: Logos, Brand Guidelines, Fonts, Photography, Design Files, Videos, 
Documents, Templates 
Agency Board PRD v2.0 — Confidential 
Page 33 
• 
Taggable with custom labels (e.g., "Q1 Campaign", "Website Redesign", "Social") 
• 
Full-text search across file names, tags, and metadata 
• 
AI-powered search: ask the chatbot "Find me all Acme Corp logo files" and it searches 
the library 
• 
Preview: inline preview for images, PDFs, and videos without downloading 
• 
Version tracking: see the history of an asset (e.g., logo v1, v2, v3) with dates and source 
tickets 
 
Permissions 
• 
Team members can view and download all assets for clients they have access to 
• 
Clients can optionally access their own asset folder through the Client Board (toggle per 
client) 
• 
Upload/delete permissions restricted to department leads and admins 
 
Integration with Tickets 
• 
When creating a ticket, the brief form can pull assets from the library ("Select brand 
guidelines for this client") 
• 
Designers can browse the library from within a ticket to find reference materials 
• 
The AI Chatbot can query the library: "What’s the latest approved hero image for Acme 
Corp?" 
 
6.10 Internal Knowledge Base / Wiki 
Process documentation, SOPs, how-to guides, and onboarding materials live in a searchable 
wiki that is connected to the AI Chatbot. Instead of tribal knowledge living in people’s heads, it’s 
documented, searchable, and always up to date. 
 
What Lives in the Wiki 
• 
Agency processes and SOPs ("How to handle a rush request," "Client offboarding 
checklist," "QA process for web development") 
• 
Department-specific guides ("Design file naming conventions," "Git branching strategy," 
"Video export settings by platform") 
• 
New team member onboarding docs ("Your first week at the agency," "Tool access 
checklist," "Who to ask for what") 
• 
Client-specific notes ("Acme Corp prefers formal tone," "Beta Inc always needs Hebrew 
and English versions") 
• 
Tool and integration documentation ("How to connect Figma," "How to use the AI 
Review toggle") 
 
Wiki Structure 
• 
Organized by: department, topic, or client 
• 
Rich text pages with images, embedded files, and internal links 
• 
Version history with diff view (who changed what, when) 
Agency Board PRD v2.0 — Confidential 
Page 34 
• 
Pinned pages per board (e.g., the Design board sidebar can show pinned wiki pages for 
brand guidelines and file naming conventions) 
 
AI Chatbot Integration 
• 
The AI Chatbot indexes all wiki pages and can answer questions from them 
• 
Team members can ask: "What’s our process for handling rush requests?" and get the 
documented answer 
• 
If no wiki page exists for a question, the chatbot suggests creating one 
• 
Wiki pages can be auto-generated: "Create a wiki page from the notes in this ticket 
about our new QA process" 
 
Maintenance 
• 
Pages have an optional review cadence (e.g., "Review this page every 90 days") 
• 
Stale pages (not updated in 6+ months) are flagged for review 
• 
Ownership: each page has an assigned owner responsible for keeping it current 
 
 
Agency Board PRD v2.0 — Confidential 
Page 35 
7. Cross-Board Workflows & Dependencies 
A core differentiator of Agency Board is that work flows between departments. The system must 
support structured handoffs between board types. 
 
7.1 Cross-Board Card Linking 
• 
Any card can be linked to cards on other boards ("Related", "Blocked by", "Spawned 
from") 
• 
Linked cards show a visual indicator with the source board type and card status 
• 
When a linked card changes status, the dependent card’s watchers are notified 
 
7.2 Handoff Automation 
Configurable automation rules for inter-department handoffs: 
• 
When a Design card moves to "Approved" → auto-create a linked card on the Dev board 
in "Backlog" with design assets attached 
• 
When a Copywriting card moves to "Approved" → auto-create a linked card on the 
Design board (for layout integration) or Dev board (for implementation) 
• 
When a Design card moves to "Approved" → auto-create a linked Video Editing card if 
the project includes video deliverables 
• 
Handoff cards inherit: project name, client reference, deadline, and relevant attachments 
 
7.3 Cross-Board Dashboard 
• 
Executive view showing all department boards in a single dashboard 
• 
Filter by client, project, or team member across all boards 
• 
Visual pipeline showing a project’s progress across departments (e.g., Design → Dev → 
Done) 
• 
Bottleneck detection: highlight cards that have been in one column for too long 
 
7.4 Client Onboarding Workflow 
When the agency wins a new client, a predictable sequence of tasks must happen across 
multiple departments. Agency Board automates this with a structured onboarding workflow that 
auto-creates tickets across boards from a single trigger. 
 
How It Works 
1. Account manager creates a new client account card on the AM board and triggers "Start 
Client Onboarding." 
2. The system runs the onboarding template, which auto-creates linked tickets across 
departments: 
 
Agency Board PRD v2.0 — Confidential 
Page 36 
Board 
Auto-Created Ticket 
Pre-Filled Content 
AM Board 
Client account card 
(persistent) 
Client name, contact info, contract type, update 
cadence defaults 
AM Board 
Welcome email and kickoff 
meeting 
Email template, calendar scheduling task 
Design Board 
Brand asset collection and 
audit 
Checklist: logo files, brand guidelines, color palette, 
fonts, photography 
Design Board 
Initial mood board / style 
exploration 
Brief template for visual direction discovery 
Dev Board 
Staging environment setup 
Checklist: domain, hosting, CMS access, analytics 
setup 
Dev Board 
Technical requirements 
gathering 
Brief template for tech stack, integrations, 
performance requirements 
EA Board 
Schedule kickoff meeting 
Participants, preferred times, meeting agenda 
template 
EA Board 
Set up client access and 
permissions 
Checklist: portal access, file sharing, 
communication channels 
 
3. All auto-created tickets are pre-tagged with the client tag and linked to the client account 
card. 
4. A Client Board is auto-generated for the client. 
5. The account manager receives a checklist dashboard showing onboarding progress 
across all departments. 
 
Onboarding Template Customization 
• 
The default onboarding template is configurable by the agency owner 
• 
Multiple templates for different client types (e.g., "Website Project Onboarding" vs. 
"Retainer Client Onboarding" vs. "One-Off Project Onboarding") 
• 
Each template defines which tickets are created on which boards, with which brief 
templates and checklists 
• 
Templates can include conditional logic: "If client type is Retainer, also create a recurring 
monthly report ticket" 
 
 
Agency Board PRD v2.0 — Confidential 
Page 37 
8. User Personas 
 
8.1 Noa — Graphic Designer 
Role: Senior Designer, works primarily on the Design Board 
Goals: Clear briefs, fast feedback loops, minimal admin overhead 
Pain Points: Unclear revision requests, forgetting which fixes were asked for, re-work due to 
missed changes 
Relationship to AI Review: Loves it for concrete revision checks; disables it for exploratory 
creative work 
 
8.2 Yael — Copywriter & Account Manager 
Role: Handles client communication and content creation 
Goals: Manage client expectations, produce on-brand content, track all client interactions 
Pain Points: Juggling account management tasks with writing deadlines, losing context on 
client conversations 
 
8.3 Daniel — Web Developer 
Role: Full-stack developer, works primarily on the Dev Board 
Goals: Clear specs, access to design assets, uninterrupted coding time 
Pain Points: Receiving design handoffs without specs, hunting for the latest approved design 
file 
 
8.4 Lior — Video Editor 
Role: Video editor and motion graphics artist 
Goals: Quick access to raw footage, clear creative direction, efficient review cycles 
Pain Points: Large file transfers, vague feedback like "make it more dynamic", unclear export 
requirements 
 
8.5 Maya — Executive Assistant 
Role: Supports agency leadership with scheduling, travel, procurement, and admin 
Goals: Never drop a ball, track follow-ups, manage recurring tasks 
Pain Points: Tasks coming in from multiple channels (email, chat, verbal), no single source of 
truth 
Agency Board PRD v2.0 — Confidential 
Page 38 
 
8.6 Avi — Agency Owner / Creative Director 
Role: Oversees all departments, reviews creative work, manages client relationships 
Goals: Portfolio-level visibility, quality control, resource allocation, profitability tracking 
Pain Points: Context-switching between departments, late discovery of issues, no unified view 
 
8.7 Client Stakeholder 
Role: Marketing Director or decision-maker at client company 
Goals: Track project progress, approve deliverables, stay informed without being overwhelmed 
Pain Points: Too many emails, unclear status, feeling out of the loop 
 
 
Agency Board PRD v2.0 — Confidential 
Page 39 
9. Technology Architecture 
The technology stack has been finalized based on current implementation decisions. The PRD 
reflects what is actually in use, not aspirational choices. 
 
9.1 Frontend 
Technology 
Version / Details 
Status 
React 
18.3.1 
In place 
TypeScript 
5.3 
In place 
Tailwind CSS 
3.4 
In place 
@hello-pangea/dnd 
Maintained fork of react-beautiful-dnd 
In place 
Framer Motion 
To be installed for animations 
Planned 
React Query (TanStack 
Query) 
Server state management 
Planned 
Zustand 
Client state management 
Planned 
 
9.2 Backend 
Technology 
Version / Details 
Status 
Next.js 
14 (API routes replace Express) 
In place 
Supabase (PostgreSQL) 
Hosted Postgres with auth, storage, realtime 
In place 
Supabase Realtime 
Replaces Socket.io for live updates 
Available (setup needed) 
Supabase Storage 
Replaces AWS S3 for file storage 
In place 
Redis 
For caching and rate limiting 
Not set up (evaluate 
need) 
 
9.3 Infrastructure 
Technology 
Details 
Status 
Vercel 
Hosting (Next.js optimized) 
Ready to deploy 
CloudFlare CDN 
Asset delivery and edge caching 
Not set up 
Resend.io 
Client update emails and transactional 
notifications 
Not set up 
Sentry 
Error tracking and monitoring 
Not set up 
 
Agency Board PRD v2.0 — Confidential 
Page 40 
9.4 AI & External API Integration 
Technology 
Purpose 
Status 
Claude API (Anthropic) 
Primary AI for Design Review and Dev QA 
vision analysis 
Planned 
Fallback: GPT-4o / 
Gemini 
Alternative vision models for review systems 
Evaluated as backup 
Sora 2 API (OpenAI) 
AI video generation (text-to-video, image-to-
video) 
Phase 3 — requires API 
key 
Veo 3 API (Google 
DeepMind) 
AI video generation with native audio 
Phase 3 — requires API 
key 
Google Calendar API 
AM board: detect next client meetings 
Phase 2 — OAuth 
integration 
Resend.io API 
AM board: send branded client update emails 
Phase 2 — requires 
domain setup 
Puppeteer / Playwright 
Dev QA: headless browser for website testing 
Phase 2 
WhatsApp Business API 
Team messaging: department groups and 
individual notifications 
Phase 4 
Nano Banana (Gemini 
Image) 
In-app AI image editing and generation within 
tickets 
Phase 2 
pgvector / Pinecone 
Client AI Brain: vector embeddings for per-
client RAG retrieval 
Phase 2 
 
9.5 Architecture Decisions & Rationale 
• 
Next.js over Express: Next.js API routes provide the same server-side functionality with 
less infrastructure complexity and better integration with the React frontend. No separate 
backend server needed. 
• 
Supabase over raw PostgreSQL + S3: Supabase bundles auth, storage, realtime 
subscriptions, and a hosted Postgres database into a single platform, reducing DevOps 
overhead significantly for a small team. 
• 
@hello-pangea/dnd over react-beautiful-dnd: The original react-beautiful-dnd is no 
longer maintained. @hello-pangea/dnd is the actively maintained community fork with 
the same API. 
• 
Redis deferred: Redis adds operational complexity. Supabase handles real-time 
updates. Redis should be evaluated if caching or rate-limiting needs arise at scale. 
 
9.6 Performance Requirements 
• 
Initial page load: < 2 seconds 
• 
Time to interactive: < 3 seconds 
• 
Real-time updates: < 500ms latency via Supabase Realtime 
• 
Support 1000+ cards per board without performance degradation 
• 
Support 100 concurrent users per board 
Agency Board PRD v2.0 — Confidential 
Page 41 
• 
Drag-and-drop interactions at 60fps 
• 
AI Review response: < 30 seconds end-to-end 
• 
99.9% uptime target 
 
9.7 AI Cost Profiling & Model Management 
Agency Board uses AI across many features (Design Review, Dev QA, Chatbot, Nano Banana, 
Video Generation, AM email drafting, brief quality scoring). Each AI call has a cost. The AI Cost 
Profiling system tracks every AI API call, attributes it to the user and board that triggered it, and 
gives the agency owner full visibility into AI spend with the ability to swap models per activity 
based on real cost/quality data. 
 
9.7.1 AI Usage Logging 
Every AI API call is logged with the following metadata: 
Field 
Description 
Timestamp 
When the call was made 
User 
Which team member triggered the AI call 
Board 
Which board the call originated from (Design, Dev, Video, etc.) 
Ticket 
Which specific ticket triggered the call (if applicable) 
AI Feature 
Which feature: Design Review, Dev QA, Chatbot (ticket/board/all), Nano 
Banana, Video Gen, AM Email Draft, Brief Review 
Model used 
The specific model (e.g., claude-sonnet-4-5-20250929, gpt-4o-2024-11-
20, gemini-2.5-flash) 
Input tokens 
Number of input tokens sent to the model 
Output tokens 
Number of output tokens received 
Image/file inputs 
Number and size of images or files sent (for vision calls) 
Cost 
Calculated cost based on the model’s per-token pricing (maintained in a 
pricing config table) 
Latency 
Response time in milliseconds 
Outcome 
Result quality indicator: success, partial, failed, user-overridden 
 
9.7.2 AI Cost Dashboard 
A dedicated dashboard in Settings → AI → Cost Profiling, accessible to Admin users: 
 
Top-Level Metrics 
• 
Total AI spend: this month, last month, last 3 months, last 6 months, custom date range 
• 
Spend by feature: breakdown showing how much each AI feature costs (Design Review: 
$X, Dev QA: $Y, Chatbot: $Z, etc.) 
Agency Board PRD v2.0 — Confidential 
Page 42 
• 
Spend by model: breakdown per AI model (Claude: $X, GPT-4o: $Y, Gemini: $Z, Sora 2: 
$A, Veo 3: $B) 
• 
Spend trend: line chart showing daily/weekly/monthly spend over time 
 
User-Level Breakdown 
• 
AI usage per user: total calls, total cost, average cost per call 
• 
Leaderboard: which user triggered the most AI calls and at what cost 
• 
User trend: is a specific user’s AI usage increasing or decreasing over time? 
• 
Feature breakdown per user: e.g., Noa used Design Review 45 times ($12.30) and 
Chatbot 120 times ($8.50) 
 
Board-Level Breakdown 
• 
AI usage per board: total calls, total cost, average cost per call 
• 
Which board consumes the most AI resources 
• 
Board trend: track cost changes as team behavior evolves 
• 
Feature breakdown per board: e.g., Dev Board used Dev QA 30 times ($45.00) and 
Chatbot 80 times ($6.00) 
 
Client-Level Breakdown 
• 
AI cost attributable to each client (via client tags on tickets) 
• 
Useful for understanding if a specific client’s work is disproportionately AI-expensive 
 
9.7.3 Model Configuration per Activity 
The agency owner can configure which AI model is used for each AI-powered activity. This 
allows the agency to start with a powerful (expensive) model, evaluate results, and then switch 
to a cheaper model if quality is sufficient — or vice versa. 
 
AI Activity 
Default Model 
Alternatives 
Swap Rationale 
Design Review 
(vision) 
Claude Sonnet 
GPT-4o, Gemini 2.5 Pro 
Compare accuracy vs. 
cost; Claude may be 
more accurate but GPT-
4o cheaper 
Dev QA (vision + 
browser) 
Claude Sonnet 
GPT-4o, Gemini 2.5 Pro 
Same trade-off; Dev QA 
runs multiple 
screenshots so cost 
multiplies 
AI Chatbot (ticket-
level) 
Claude Sonnet 
Claude Haiku, GPT-4o-
mini, Gemini Flash 
Ticket chat is high-
volume; a 
smaller/cheaper model 
may suffice for simple 
queries 
AI Chatbot (board-
level) 
Claude Sonnet 
Claude Haiku, GPT-4o-
mini 
Medium context; balance 
cost vs. quality 
Agency Board PRD v2.0 — Confidential 
Page 43 
AI Chatbot (all-
boards) 
Claude Sonnet 
GPT-4o, Gemini 2.5 Pro 
Largest context; may 
need the most capable 
model 
Nano Banana (image 
edit) 
Gemini 2.5 Flash 
Image 
Gemini 3 Pro Image (Nano 
Banana Pro) 
Flash is cheaper; Pro for 
high-res/print work 
Video Generation 
Sora 2 / Veo 3 
Per-provider only 
No cross-provider swap; 
choose per ticket 
AM Email Drafting 
Claude Haiku 
Claude Sonnet, GPT-4o-
mini 
Email drafts are simple; 
smallest model likely 
sufficient 
Brief Quality Review 
Claude Haiku 
Claude Sonnet, GPT-4o-
mini 
Brief review is lightweight 
text analysis 
Client AI Brain (RAG) 
Claude Sonnet 
GPT-4o, Gemini 2.5 Pro 
Needs strong instruction-
following for voice 
matching; quality matters 
more than cost here 
 
How Model Swapping Works 
1. Admin goes to Settings → AI → Model Configuration. 
2. Each AI activity is listed with its current model, cost-per-call average (from profiling 
data), and accuracy/quality metrics (if available). 
3. Admin selects a different model for an activity from the dropdown of available models. 
4. System can optionally run an A/B test: route 50% of calls to the new model for a 
configurable period, then compare cost and quality side by side. 
5. Admin reviews the A/B comparison report and commits to the new model or reverts. 
 
9.7.4 Budget Controls 
• 
Monthly AI budget cap (total across all features): when reached, AI features degrade 
gracefully (e.g., chatbot switches to cheapest model, non-critical AI features pause) 
• 
Per-feature budget caps: e.g., max $200/month on Video Generation, max $50/month on 
Chatbot 
• 
Budget alerts: notify admin at 50%, 75%, and 90% of budget consumed 
• 
Cost projection: based on current usage trend, predict end-of-month spend 
• 
Emergency override: admin can temporarily lift caps for urgent work 
 
9.7.5 API Key Management 
• 
Centralized API key storage in Settings → AI → API Keys 
• 
Each AI provider has its own key: Anthropic (Claude), OpenAI (GPT-4o, Sora 2), Google 
(Gemini, Veo 3, Nano Banana) 
• 
Keys are encrypted at rest and never exposed in the UI after initial entry 
• 
Key rotation support: update a key without downtime 
• 
Key validation: test that a key is active and has sufficient permissions before saving 
• 
Usage attribution: each key’s spend is tracked separately for billing reconciliation 
 
 
Agency Board PRD v2.0 — Confidential 
Page 44 
10. Views, Search & Customization 
 
10.1 Board Views 
• 
Kanban board view (default for all board types) 
• 
Calendar view (cards plotted by due date) 
• 
List / table view (spreadsheet-style sortable table) 
• 
Timeline / Gantt view (for project scheduling) 
• 
My Tasks view (all cards assigned to current user, across all boards) 
• 
Team view (cards grouped by assignee within a board) 
• 
Cross-department dashboard (executive overview across all boards) 
 
10.2 Search & Filtering 
• 
Global search across all boards and departments 
• 
Search within a single board 
• 
Advanced filters: assignee, labels, due date, priority, board type, client, project 
• 
Search in card descriptions, comments, and file names 
• 
Saved filter views for repeated use 
• 
Search by card ID 
 
10.3 Customization 
• 
Custom fields per board type (in addition to department-specific defaults) 
• 
Custom labels and tag taxonomies 
• 
Card and board templates 
• 
White-label options for client portal (agency logo, colors) 
• 
Keyboard shortcuts 
• 
Dark mode 
 
 
Agency Board PRD v2.0 — Confidential 
Page 45 
11. Client Boards & Portal 
Client Boards are a new entity type in Agency Board. Unlike the five department boards 
(Design, Dev, Copy, Video, EA), Client Boards are auto-generated per client and serve as the 
client’s window into all work being done for them across every department. Clients can also use 
their board to submit new requests and report issues. 
 
11.1 How Client Boards Work 
Auto-Generation 
• 
A Client Board is automatically created when a client account card is created on the AM 
board 
• 
The Client Board name matches the client name (e.g., "Acme Corp — Client Board") 
• 
No manual setup required — the board exists as soon as the client does 
 
11.2 Client Tag System 
The client tag is the mechanism that connects work across all department boards to a specific 
client’s board. 
• 
Every ticket on the Design, Dev, Video Editing, or Copywriting board can be tagged with 
a client tag 
• 
Any tagged ticket can additionally be marked as "Allow client to see" (external visibility 
toggle) 
• 
When a ticket is tagged with a client and marked visible, it automatically appears on that 
client’s Client Board 
• 
The client sees a read-only mirror of the ticket — they can view status, comments 
marked as external, and attached deliverables 
• 
Internal comments, internal columns, and non-visible tickets remain hidden from the 
client 
 
What Clients See vs. What’s Hidden 
Visible to Client 
Hidden from Client 
Ticket title and description 
Internal comments and notes 
Current status (simplified: In Progress, Review, 
Done) 
Internal workflow columns (Code Review, AI 
Check, etc.) 
Deliverable files marked for client 
Draft files and work-in-progress uploads 
Comments marked as "external" 
Team @mentions and internal discussions 
Due dates and milestones 
Time tracking and cost data 
Approval buttons (Approve / Request Changes) 
AI Review results and override logs 
 
11.3 Client Board Layout 
Agency Board PRD v2.0 — Confidential 
Page 46 
The client sees their board organized by status, not by department: 
Column 
Description 
In Progress 
All tickets currently being worked on across any department 
Ready for Review 
Deliverables awaiting client approval 
Approved 
Client-approved items 
Delivered 
Completed and delivered work 
Client Requests 
Tickets created by the client (new requests, issues, feedback) 
 
11.4 Client-Created Tickets 
Clients can create new tickets on their Client Board. These tickets are visually differentiated 
based on their type: 
 
Ticket Type 
Visual Indicator 
Routed To 
Design Request 
Purple badge + design icon 
Design Board → "Briefed" column 
Bug Report 
Red badge + bug icon 
Dev Board → "Backlog" column (tagged 
as Bug) 
Development 
Request 
Blue badge + code icon 
Dev Board → "Backlog" column (tagged 
as Feature) 
Content Request 
Teal badge + text icon 
Copywriting Board → "Briefed" column 
Video Request 
Orange badge + video icon 
Video Editing Board → "Briefed" column 
General / Question 
Gray badge + question icon 
AM Board → appears on client account 
card 
 
Client Ticket Flow 
1. Client opens their Client Board and clicks "New Request." 
2. Client selects the ticket type (Design, Bug, Dev, Content, Video, or General). 
3. Client fills in: title, description, and attaches any reference files. 
4. Ticket appears in the "Client Requests" column on their Client Board. 
5. Ticket is simultaneously auto-routed to the appropriate department board with the client 
tag and external visibility already set. 
6. The relevant department lead and account manager are notified of the new client 
request. 
7. As the team works on it, status updates flow back to the client’s board automatically. 
 
11.5 Real-Time Sync Between Boards 
Client Boards are not static snapshots. They update in real time: 
Agency Board PRD v2.0 — Confidential 
Page 47 
• 
When a designer moves a client-visible ticket to "Client Review" → the ticket moves to 
"Ready for Review" on the Client Board 
• 
When a developer deploys a fix for a client-reported bug → the ticket moves to 
"Delivered" on the Client Board 
• 
When an account manager posts an external comment → the client sees it immediately 
• 
When the client approves a deliverable → the approval status syncs back to the 
department board 
• 
Powered by Supabase Realtime subscriptions filtered by client tag 
 
11.6 Client Access & Authentication 
• 
Magic-link email login (no password required) 
• 
Optional password-protected access 
• 
White-labeled portal: agency logo, colors, custom domain (e.g., portal.youragency.com) 
• 
Mobile-responsive web interface 
• 
Reduced notification frequency (configurable by AM per client) 
 
11.7 Approval Workflows 
• 
Approval status on cards: Pending Review, Approved, Changes Requested 
• 
Approval request notifications via email and in-app 
• 
Required approvals before card can move to the next stage on the department board 
• 
Approval history and audit trail 
• 
Automated approval reminders 
• 
Batch approval for multiple deliverables 
 
11.8 Client Satisfaction Tracking 
After major deliverables or project milestones, the system automatically sends a short 
satisfaction pulse to the client. This is not a lengthy survey — it’s a quick, frictionless check-in 
that tracks client happiness over time and surfaces problems before they become churn. 
 
How It Works 
1. When a ticket tagged as client-visible moves to "Delivered" or "Approved," the system 
checks if a satisfaction pulse is configured for this client. 
2. If enabled, the client receives a brief in-app prompt or email with 1–3 questions 
(configurable per client). 
3. Default questions: (1) "How satisfied are you with this deliverable?" (1–5 stars), (2) "Any 
feedback?" (optional free text). 
4. Responses are logged on the client account card and the originating ticket. 
5. Satisfaction scores are aggregated per client over time and displayed as a trend chart on 
the client account card. 
 
Satisfaction Analytics 
• 
Per-client satisfaction trend: 1–5 star average over 30/60/90 days 
Agency Board PRD v2.0 — Confidential 
Page 48 
• 
Per-department satisfaction: does this client rate Design work higher than Dev work? 
• 
Per-team-member correlation: is a specific team member’s work consistently rated 
higher or lower? 
• 
Declining satisfaction alert: if a client’s rolling average drops below a configurable 
threshold, notify the account manager and agency leadership 
• 
Correlation with revision rates: clients with high revision rates and low satisfaction scores 
are flagged as churn risks 
 
Configuration 
• 
Toggle on/off per client (some clients may not want to be surveyed) 
• 
Frequency cap: no more than one pulse per week per client (even if multiple deliverables 
ship) 
• 
Custom questions per client or globally 
• 
Pulse delivery method: in-app notification on Client Board, email, or both 
 
 
Agency Board PRD v2.0 — Confidential 
Page 49 
12. Time Tracking & Reporting 
 
12.1 Time Tracking 
• 
Manual time entry on any card 
• 
Start/stop timer functionality 
• 
Time estimates vs. actual time comparison 
• 
Billable vs. non-billable time classification 
• 
Time tracking by user, project, client, and department 
• 
Export time data for invoicing and billing 
 
12.2 Reporting & Analytics 
• 
Board progress overview (percentage complete) 
• 
Department-level workload and utilization reports 
• 
Burndown charts and velocity metrics 
• 
Cycle time analysis by column (identify bottlenecks) 
• 
Overdue cards report 
• 
Time tracked vs. estimated reports 
• 
AI Review effectiveness report (pass rate, override rate, time saved) 
• 
Client-facing project status reports (exportable PDF) 
• 
Custom report builder with export (PDF, CSV, Excel) 
• 
Scheduled automated report emails 
 
12.3 Team Productivity Analytics (Future Phase) 
A dedicated analytics module for agency leadership to track individual and team performance 
over time. This is not about surveillance — it’s about identifying bottlenecks, recognizing high 
performers, and improving team allocation. 
 
Core Productivity Metrics 
Metric 
Description 
Filters 
Tickets completed 
Total tickets moved to Done/Delivered/Deployed 
by each team member 
Date range, department, 
client, ticket type 
Tickets in progress 
Current open ticket count per member 
Department, priority 
Revision rate 
Average number of revision rounds per ticket per 
member (back-and-forth count) 
Date range, department, 
client 
Revision outliers 
Tickets that required more than the team average 
revisions — flagged for review 
Date range, threshold 
configurable 
Average cycle time 
Average time from ticket creation to completion 
per member 
Date range, department, 
ticket type 
Agency Board PRD v2.0 — Confidential 
Page 50 
Tickets requiring re-
review 
Tickets that were sent for review, rejected, and 
sent again — per member 
Date range, department 
On-time delivery rate 
Percentage of tickets completed by or before their 
due date 
Date range, department, 
client 
AI Review pass rate 
(Design) 
Percentage of AI checks passed on first 
submission per designer 
Date range 
AI QA pass rate (Dev) 
Percentage of QA checks passed on first run per 
developer 
Date range 
 
Date Range Filters 
• 
Preset ranges: Last 30 days, Last 3 months, Last 6 months, Year to date 
• 
Custom date range picker 
• 
Comparison mode: compare current period to previous period (e.g., this quarter vs. last 
quarter) 
 
Views & Reports 
• 
Individual member scorecard: all metrics for one person in a single dashboard 
• 
Team leaderboard: ranked by tickets completed, on-time rate, or revision efficiency 
• 
Department comparison: aggregate metrics per department 
• 
Trend charts: line graphs showing metric changes over time per member or team 
• 
Revision deep-dive: drill into specific tickets with high revision counts to identify patterns 
(unclear briefs? client indecisiveness? skill gap?) 
• 
Export: PDF report, CSV data export, scheduled email reports to leadership 
 
Back-and-Forth Analysis 
A key insight the system provides is identifying tickets that ping-pong between "In Progress" and 
"Revisions" (or equivalent columns) more than the team average. This surfaces: 
• 
Team members who consistently exceed the average revision count — may indicate a 
training need or unclear briefs 
• 
Clients who consistently request more revisions than average — may indicate scope 
creep or misaligned expectations 
• 
Ticket types that have higher revision rates — may indicate process gaps for certain 
deliverable types 
• 
The system calculates the team-wide average revision count and flags any member or 
ticket exceeding 1.5x the average 
 
 
Agency Board PRD v2.0 — Confidential 
Page 51 
13. Integrations & Automation 
 
13.1 File Management 
• 
Drag-and-drop file upload to cards 
• 
File preview for images, PDFs, and videos 
• 
File version history (critical for design review workflow) 
• 
Google Drive and Dropbox integration 
• 
Figma embed and link preview 
• 
Supabase Storage for file persistence 
 
13.2 Automation Rules 
Trigger-action automation system supporting: 
• 
Column-move triggers (when card enters X column, do Y) 
• 
Due date automations (overdue labeling, reminders) 
• 
Checklist completion triggers (all items checked → move card) 
• 
Cross-board card creation (handoff automations) 
• 
Email-to-card functionality 
• 
Scheduled recurring card creation 
• 
AI Review trigger (on submission when toggle is enabled) 
 
13.3 Third-Party Integrations 
• 
Slack (notifications, card creation from messages) 
• 
Email integration (forwarding emails to create cards) 
• 
Google Calendar and Outlook sync 
• 
GitHub (link PRs and issues to Dev board cards) 
• 
Figma (embed designs, sync status) 
• 
Zapier / Make for custom workflows 
• 
API and webhooks for custom integrations 
 
13.4 WhatsApp Integration (Future Phase) 
Agency Board will integrate with WhatsApp Business API to function as a project-management-
native messaging layer — like Slack, but through WhatsApp, where the team already 
communicates. 
 
Department Groups 
Auto-created WhatsApp groups mapped to department boards: 
WhatsApp Group 
Members 
Receives Updates For 
Agency Board PRD v2.0 — Confidential 
Page 52 
Designers 
All design team members 
Design Board: new tickets, status changes, AI 
Review results, client approvals 
Developers 
All dev team members 
Dev Board: new tickets, PR links, AI QA 
results, deployment notifications 
Account Managers 
All AM / copywriting team 
AM Board: client requests, approval 
notifications, update email status 
Video Editors 
All video team members 
Video Board: new briefs, review feedback, AI 
generation completions 
Leadership 
Agency owner + department 
leads 
Cross-board: escalations, overdue items, 
client complaints, weekly summaries 
 
Message Types 
• 
Push to group: Board-level notifications (new ticket assigned, status change, deadline 
approaching) 
• 
Push to individual: Personal notifications (@mentions, cards assigned to you, approval 
requests) 
• 
Quick actions from WhatsApp: Reply with predefined commands (e.g., reply "done" to 
mark a ticket complete, "approve" to approve a deliverable) 
• 
Daily digest: Morning summary of today’s priorities pushed to each team member 
 
How It Works 
1. Integration via WhatsApp Business API (requires Meta Business verification and 
approved message templates). 
2. Each team member links their WhatsApp number in their Agency Board profile settings. 
3. Department groups are auto-created and managed by Agency Board (members 
added/removed when team changes). 
4. Notification rules are configurable per board: which events trigger WhatsApp messages 
vs. in-app only. 
5. Messages are formatted with ticket title, board name, status, and a deep-link back to the 
ticket in Agency Board. 
 
Privacy & Controls 
• 
Team members can opt out of WhatsApp notifications (falls back to in-app + email) 
• 
Do-not-disturb hours: no WhatsApp messages outside configured work hours 
• 
Client-facing groups are NOT part of this feature — WhatsApp is internal team only 
• 
Message frequency caps to prevent notification fatigue 
 
13.5 Trello Migration & Import 
Agency Board must be able to import all existing data from Trello, preserving every ticket, 
comment, attachment, label, and assignment. The migration is not a one-time throwaway — the 
imported data must be fully searchable and integrated into the new system as if it were native. 
 
Agency Board PRD v2.0 — Confidential 
Page 53 
What Gets Migrated 
Trello Entity 
Maps To in Agency Board 
Data Preserved 
Trello Board 
Department Board (Design, Dev, 
etc.) 
Board name, description, background, 
settings 
Trello List 
Column 
List name, position, archived status 
Trello Card 
Ticket 
Title, description, position, due date, 
labels, cover image 
Card Comments 
Ticket Comments 
Full text, author, timestamp, @mentions 
Card Attachments 
Ticket Attachments 
All files migrated to Supabase Storage 
with original filenames and upload dates 
Card Checklists 
Ticket Checklists 
Checklist name, items, completion status 
Card Labels 
Ticket Labels 
Label name, color mapping to Agency 
Board palette 
Card Members 
Ticket Assignees 
Mapped to Agency Board users by email; 
unmatched members flagged for manual 
mapping 
Card Activity 
Ticket Activity Log 
Full activity history (moves, edits, 
assignments) with timestamps 
Archived Cards 
Archived Tickets 
Preserved and searchable, marked as 
imported/archived 
 
How Migration Works 
1. Admin goes to Settings → Import → Trello Migration and connects their Trello account 
via Trello API (OAuth). 
2. System fetches a list of all Trello boards. Admin maps each Trello board to an Agency 
Board department board (e.g., "Trello: Design Tasks" → "Agency Board: Design Board"). 
3. Admin maps Trello members to Agency Board users (auto-matched by email where 
possible). 
4. Admin reviews the mapping and clicks "Start Migration." 
5. System imports all data in the background. Progress bar shows percentage complete. 
6. All imported tickets are tagged with a "Migrated from Trello" label and the original Trello 
card URL is stored as metadata. 
7. Migration report is generated: total cards imported, attachments transferred, any items 
that failed or need manual attention. 
 
Post-Migration 
• 
All migrated tickets are fully searchable via global search, board search, and AI Chatbot 
• 
Migrated tickets participate in all analytics and reporting (cycle time, productivity, etc.) 
• 
Attachments are served from Supabase Storage (not linked to Trello — fully 
independent) 
• 
The original Trello board can remain active during a transition period; no data is deleted 
from Trello 
Agency Board PRD v2.0 — Confidential 
Page 54 
• 
Re-migration: if needed, the migration can be re-run to pull in changes made in Trello 
after the initial import 
 
Board Mapping Intelligence 
• 
AI can suggest board mappings based on Trello board names and card content (e.g., a 
board named "Web Dev" auto-suggests mapping to the Dev Board) 
• 
Cards with design file attachments (PSD, AI, Figma) can be auto-detected and routed to 
the Design Board 
• 
Client tags can be auto-applied based on Trello label patterns (e.g., all cards labeled 
"Acme" get the Acme Corp client tag) 
 
 
Agency Board PRD v2.0 — Confidential 
Page 55 
14. Security & Permissions 
 
14.1 Role-Based Access Control 
Role 
Description 
Permissions 
Admin 
Agency owner / leadership 
Full access, billing, user management, all 
boards 
Department Lead 
Head of a department 
Full access to own department board, read 
access to others, can configure board 
settings 
Member 
Team member 
Create/edit cards on assigned boards, full 
collaboration 
Guest / 
Freelancer 
External contributor 
Limited to specific assigned boards and 
cards 
Client 
External client stakeholder 
Read-only + approval access to designated 
boards, no internal columns visible 
Observer 
Read-only across all boards 
View access only, no editing 
 
14.2 Department-Level Permissions 
• 
Board-level permission settings control who can view, edit, and move cards 
• 
Column-move restrictions: e.g., only designers can move cards out of "In Progress"; only 
leads can move to "Approved" 
• 
Card creation permissions: account managers can create briefs on the Design board but 
cannot move cards past "Briefed" 
• 
AI Review override requires Member role or above 
 
14.3 Data Security 
• 
Supabase Row-Level Security (RLS) for data isolation 
• 
Data encryption at rest and in transit (SSL/TLS) 
• 
Two-factor authentication (2FA) 
• 
SSO integration (Enterprise) 
• 
Audit logging of all actions 
• 
GDPR compliance and data export/deletion capabilities 
• 
IP whitelisting (Enterprise) 
 
14.4 Backup & Disaster Recovery 
Agency Board includes a comprehensive backup system that ensures no data is ever 
permanently lost. Backups are complete snapshots of the entire system that can be used to 
restore to a previous state. 
Agency Board PRD v2.0 — Confidential 
Page 56 
 
Automatic Scheduled Backups 
Backup Type 
Frequency 
What’s Included 
Retention 
Daily incremental 
Every 24 hours 
(overnight) 
Changes since last backup: 
new/modified tickets, comments, 
attachments, settings 
30 days rolling 
Quarterly full 
snapshot 
Every 3 months 
Complete snapshot of every ticket, 
comment, attachment, user, board, 
setting, credential vault, wiki page, 
asset library, and activity log 
across the entire system 
Indefinite (kept 
forever) 
 
What’s Backed Up 
• 
All tickets across all board types (including archived and migrated tickets) 
• 
All comments, @mentions, and threaded replies 
• 
All file attachments (design files, documents, videos, images) 
• 
All board configurations, column structures, and automation rules 
• 
Credentials Vault data (encrypted in the backup as it is in the live system) 
• 
AI Review and AI QA result logs 
• 
Client Board data, client account cards, and satisfaction scores 
• 
Map Board data (all sections, Doors/Keys, training progress, visual briefs) 
• 
Wiki / Knowledge Base pages 
• 
Digital Asset Library contents 
• 
User accounts, roles, and permissions 
• 
Notification preferences and automation rules 
 
Backup Storage 
• 
Backups are uploaded to a separate cloud storage location (not the same as the primary 
Supabase instance) 
• 
Recommended: dedicated S3 bucket or Google Cloud Storage with versioning enabled 
• 
Backups are encrypted at rest (AES-256) and in transit 
• 
Geographic redundancy: backups stored in a different region than the primary database 
• 
Each backup includes a manifest file listing: timestamp, total tickets, total files, file sizes, 
and integrity checksums 
 
Manual Backup (On-Demand) 
• 
Admin can click "Create Backup Now" from Settings → Backups at any time 
• 
Useful before major changes: large migrations, bulk operations, or system updates 
• 
Manual backups are stored alongside automatic backups and follow the same 
encryption and retention rules 
• 
The system prevents more than one manual backup per hour to avoid storage abuse 
 
Restore from Backup 
Agency Board PRD v2.0 — Confidential 
Page 57 
If something goes wrong — accidental mass deletion, data corruption, or a bad migration — the 
admin can restore the system from any available backup. 
1. Admin goes to Settings → Backups → Restore. 
2. System displays a list of all available backups (daily and quarterly) with timestamps, 
sizes, and ticket counts. 
3. Admin selects a backup and clicks "Preview Restore" — the system shows what will 
change (tickets added, modified, or removed compared to current state). 
4. Admin confirms the restore. The current state is automatically backed up as a "pre-
restore snapshot" before the restore begins. 
5. System restores all data from the selected backup. Progress bar shows completion. 
6. Post-restore report: what was restored, what changed, and any items that could not be 
restored (e.g., if a user account no longer exists). 
 
Selective Restore 
• 
Full system restore: reverts everything to the backup state 
• 
Board-level restore: restore a single board to its backup state without affecting other 
boards 
• 
Ticket-level restore: recover a specific deleted or corrupted ticket from a backup 
• 
Attachment-level restore: recover a specific deleted file 
 
Backup Dashboard 
• 
Visual timeline showing all available backups (daily dots, quarterly milestones) 
• 
Storage usage: total backup size, cost, and retention status 
• 
Health check: verify backup integrity on demand (checksum validation) 
• 
Email alerts: notify admin if a scheduled backup fails 
 
 
Agency Board PRD v2.0 — Confidential 
Page 58 
15. UX & Design Requirements 
 
Design Principles 
1. Delightful: Every interaction should feel smooth and satisfying 
2. Clear: Information hierarchy should be immediately obvious 
3. Fast: Actions should feel instant (< 100ms perceived latency) 
4. Accessible: WCAG 2.1 AA compliance minimum 
5. Department-Aware: Visual cues (color, icons) should make board type instantly 
recognizable 
 
Visual Design 
Aesthetic: Modern minimalist with playful accents. Inspiration: Linear, Notion, Height. 
Primary Color: Deep navy (#1a1f36) 
Accent: Electric blue (#0066FF) 
Typography: DM Sans (headings), Inter (body), JetBrains Mono (code) 
Spacing: 8px base unit, consistent rhythm 
Borders: Soft rounded corners (8px default) 
 
Department Color Coding 
Department 
Color 
Purpose 
Design 
Purple (#8B5CF6) 
Board accent, card badges, nav indicator 
Copywriting / AM 
Teal (#14B8A6) 
Board accent, card badges, nav indicator 
Development 
Blue (#3B82F6) 
Board accent, card badges, nav indicator 
Video Editing 
Orange (#F97316) 
Board accent, card badges, nav indicator 
Executive Assistant 
Rose (#F43F5E) 
Board accent, card badges, nav indicator 
 
Accessibility 
• 
Full keyboard navigation 
• 
Screen reader support with ARIA labels 
• 
High contrast mode 
• 
Focus indicators and skip navigation 
• 
Color contrast ratio > 4.5:1 
 
 
Agency Board PRD v2.0 — Confidential 
Page 59 
16. Success Metrics 
 
North Star Metric 
Weekly Active Boards: Number of department boards with at least one card update per week 
across all five departments. 
 
Key Performance Indicators 
KPI 
Target 
Team adoption 
100% of team members actively using their department 
board within 2 weeks 
Revision cycle reduction (Design) 
AI Review reduces average revision rounds by 30% 
AI Review accuracy (Design) 
> 85% agreement between AI verdict and human 
reviewer judgment 
AI QA accuracy (Dev) 
> 90% of flagged issues confirmed as real by developer 
QA cycle reduction (Dev) 
AI QA catches 50%+ of issues before human QA review 
Cross-board handoff time 
< 1 hour from design approval to dev card creation 
Client approval turnaround 
< 48 hours from submission to client response 
Client Board engagement 
> 70% of clients log in to their Client Board at least 
weekly 
Revision rate visibility 
Leadership can identify revision outliers within 5 minutes 
Time to first value 
New team member creates their first card within 10 
minutes 
System uptime 
99.9% 
 
 
Agency Board PRD v2.0 — Confidential 
Page 60 
17. Launch Strategy 
 
Phase 1: Core MVP (Months 1–3) 
Goal: All six board types operational with core card management and briefing system. 
• 
Department boards (Design, Copy/AM, Dev, Video, EA) with specific columns and card 
fields 
• 
Client Strategy Map Board with sections: Credentials Vault, Training Tracker, 
Doors/Keys Roadmap, Visual Brief, Outreach Planner, Resources 
• 
Structured briefing templates per department and deliverable type (briefs enforced 
before work starts) 
• 
Drag-and-drop card management 
• 
Comments, @mentions, file attachments 
• 
Team invites and basic role-based permissions 
• 
Supabase Realtime for live updates 
• 
Trello Migration: full import of all existing Trello boards, tickets, comments, and 
attachments 
• 
Backup system: automatic daily incrementals, quarterly full snapshots, manual on-
demand backups, and restore capability 
• 
Basic mobile responsive web 
 
Phase 2: AI Systems & Client Boards (Months 4–6) 
Goal: AI systems, Client Boards, asset library, and client onboarding live. 
• 
AI-Powered Design Review system (toggle, pipeline, results) 
• 
AI-Powered Dev QA system (browser automation, checklist, results) 
• 
Account Management client cards with AI-generated update emails via Resend.io 
• 
Google Calendar integration for AM board (next meeting detection) 
• 
Client Boards: auto-generated per client with real-time sync from department boards 
• 
Client onboarding workflow: one-click multi-board ticket creation from onboarding 
templates 
• 
Digital Asset Library (DAM): centralized, searchable, auto-archiving from delivered 
tickets 
• 
AI Chatbot at ticket, board, and all-boards level (context-aware, file reading, web search) 
• 
Client AI Brain: per-client trained assistant that learns from all approved work and 
generates content in the client’s voice (vector index via RAG) 
• 
Nano Banana integration for in-ticket AI image editing 
• 
Client tag system and external visibility toggle on tickets 
• 
Client-created tickets with type-based routing to department boards 
• 
Approval workflows within Client Boards 
• 
Cross-board card linking and dependencies 
• 
Calendar and list views 
• 
Basic reporting and analytics 
• 
Email notifications and client update emails via Resend.io 
 
Agency Board PRD v2.0 — Confidential 
Page 61 
Phase 3: Power Features & AI Video (Months 7–9) 
Goal: Full automation, time tracking, integrations, AI video generation, knowledge base, and 
client satisfaction. 
• 
AI Video Generation widget on Video Editing board (Sora 2 and Veo 3 integration) 
• 
Internal Knowledge Base / Wiki with AI Chatbot integration 
• 
Client Satisfaction Tracking: post-deliverable pulse surveys, satisfaction trends, churn-
risk alerts 
• 
Time tracking with billable/non-billable classification 
• 
Automation rules (column triggers, handoff automations) 
• 
Slack and GitHub integrations 
• 
Advanced analytics and custom reports 
• 
White-labeling for client portal 
• 
Gantt / timeline view 
 
Phase 4: WhatsApp & Productivity (Months 10–12) 
Goal: WhatsApp messaging layer live. Team productivity analytics operational. 
• 
WhatsApp Business API integration: department groups, individual notifications, quick 
actions 
• 
Team Productivity Analytics dashboard: tickets completed, revision rates, cycle times 
• 
Back-and-forth analysis: flag tickets and members exceeding average revision counts 
• 
Individual member scorecards and team leaderboards 
• 
Productivity trend charts and comparison mode 
• 
Performance optimization and load testing 
 
Phase 5: Scale & Optimize (Months 13–15) 
Goal: Polish, enterprise features, evaluate external productization. 
• 
API and webhooks for custom integrations 
• 
AI Review enhancements (video board extension, confidence scoring) 
• 
Advanced enterprise features (SSO, IP whitelisting) 
• 
WhatsApp advanced: quick action commands, daily digest customization 
• 
Productivity analytics: exportable PDF reports, scheduled email summaries 
• 
Evaluate whether to offer Agency Board as a product to other agencies 
 
 
Agency Board PRD v2.0 — Confidential 
Page 62 
18. Pricing 
Note: Agency Board is initially an internal tool. The pricing model below applies only if the 
product is later offered externally. 
 
Plan 
Price 
Key Features 
Free 
Free (3 boards) 
Basic boards, unlimited cards, 100MB storage 
Pro 
$15/user/month 
Unlimited boards, client portal (5 clients), custom fields, 
10GB storage 
Business 
$25/user/month 
Unlimited clients, time tracking, automation, AI Review, 
white-label, 100GB storage, API 
Enterprise 
Custom 
SSO, advanced security, SLA, unlimited storage, custom 
integrations 
 
 
Agency Board PRD v2.0 — Confidential 
Page 63 
19. Risks & Mitigation 
 
Risk 
Impact 
Probability 
Mitigation 
AI Review inaccuracy 
— false 
positives/negatives 
erode trust 
High 
Medium 
Scope AI to concrete changes only; make override 
easy and visible; track accuracy metrics and retune 
prompts; allow per-ticket toggle off 
Dev QA reliability — 
dynamic sites may 
produce inconsistent 
screenshots 
Medium 
Medium 
Add wait-for-load logic; retry on flaky results; allow 
developers to set page-ready selectors; mark 
dynamic content checks as Warnings not Critical 
AI API costs — vision 
API calls can be 
expensive at scale 
Medium 
Medium 
Rate limit reviews; cache results; optimize image 
resolution sent to API; monitor cost per review and 
set budget alerts; Dev QA is multi-screenshot so 
costs more per run 
AI video generation 
costs — Sora 2 and 
Veo 3 API calls are 
expensive 
Medium 
High 
Per-provider monthly budget caps; usage 
dashboard; require approval for generations over 
cost threshold; generate lower resolution previews 
first 
Client email errors — 
AI-generated update 
sent with wrong info 
High 
Low 
Default to AM-review-before-send; never auto-send 
without explicit opt-in; show clear diff of what 
changed since last email; include disclaimer footer 
Google Calendar 
sync issues — 
meeting detection 
fails 
Low 
Medium 
Fuzzy matching on client name/email; allow AM to 
manually link calendar events; graceful fallback if 
no meeting found 
Client Board data 
leakage — internal 
info visible to client 
Critical 
Low 
Default all tickets to hidden from client; require 
explicit opt-in per ticket; audit log of visibility 
changes; automated tests for RLS policies 
WhatsApp API 
compliance — Meta 
policy restrictions on 
message types 
Medium 
Medium 
Use only approved message templates; respect 
24-hour messaging windows; provide in-app 
fallback for all WhatsApp features 
Productivity tracking 
morale — team feels 
surveilled 
Medium 
Medium 
Frame as team optimization not individual 
surveillance; share dashboards transparently; 
focus on identifying process issues not blaming 
individuals 
Team adoption — 
team resists 
switching from 
current tools 
High 
Medium 
Involve team in design; white-glove onboarding; 
import existing data; make it genuinely better than 
current workflow 
Cross-board 
complexity — linking 
and handoffs become 
confusing 
Medium 
Medium 
Start with simple manual linking; automate 
gradually; clear UI for dependency visualization 
Agency Board PRD v2.0 — Confidential 
Page 64 
Performance at scale 
— large boards with 
many cards slow 
down 
High 
Low 
Virtual scrolling for large boards; lazy loading; 
database indexing; Supabase query optimization 
Data security breach 
Critical 
Low 
Supabase RLS; encryption at rest and transit; 2FA; 
regular security audits; Sentry monitoring 
 
 
Agency Board PRD v2.0 — Confidential 
Page 65 
20. Open Questions & Decisions Needed 
 
Product Decisions 
1. Which AI provider should be primary for Design Review? Claude (vision), GPT-4o, or 
Gemini? Cost vs. accuracy trade-off. 
2. Should AI Review default to ON or OFF for new design tickets? 
3. Should cross-board handoffs be automated by default or require manual configuration 
per board? 
4. Is the EA board a shared board (one for the whole agency) or one per executive? 
5. Should the AM email system default to requiring review before send, or can some clients 
be set to auto-send? 
6. What is the preferred default tone for AI-generated client emails (Formal, Friendly, 
Brief)? 
7. Should Sora 2 or Veo 3 be the default video generation provider, or should it be per-
ticket? 
8. Should Client Boards allow clients to see revision count and cycle time, or only simplified 
status? 
9. Should WhatsApp groups be mandatory for team members or opt-in? 
10. Should productivity analytics be visible to all team members or leadership only? 
11. Should the AI Chatbot have the ability to take actions (move tickets, post comments) or 
be read-only by default? 
12. Should Nano Banana edits be watermarked when delivered to clients, or should 
watermarks be stripped for paid plans? 
 
Technical Decisions 
1. Redis: Is it needed for Phase 1, or can Supabase handle all caching and real-time 
needs? 
2. Should we install Framer Motion for Phase 1 MVP or defer animations to Phase 3? 
3. Supabase Realtime vs. a dedicated WebSocket layer: which approach for live presence 
indicators? 
4. Image optimization pipeline for AI Review: resize/compress before sending to API, or 
send full resolution? 
5. Google Calendar OAuth: use service account (agency-wide) or per-user OAuth tokens? 
6. Resend.io: custom sending domain setup and DNS verification process? 
7. Sora 2 / Veo 3 API: how to handle long generation times (webhook callback vs. polling)? 
8. WhatsApp Business API: Meta verification timeline and message template approval 
process? 
9. Client Board RLS: should visibility be computed at query time or cached/materialized? 
10. Productivity analytics: real-time dashboard or batch-processed nightly? 
11. AI Chatbot: what is the maximum context window for board-level and all-boards-level 
chat? RAG vs. full context? 
12. Nano Banana: Gemini 2.5 Flash (fast/cheap) vs. Gemini 3 Pro (high-quality) — default 
model per use case? 
 
Agency Board PRD v2.0 — Confidential 
Page 66 
Business Decisions 
1. Is Agency Board purely internal, or is external productization a goal? 
2. If productized: annual discount structure and trial period length? 
3. Budget allocation for AI API costs per system: Design Review, Dev QA, AM emails, 
Video Gen (monthly caps)? 
4. Sora 2 and Veo 3 cost sharing: does the agency absorb video generation costs or pass 
them to clients? 
 
 
 
 
End of Document 
