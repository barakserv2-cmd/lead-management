# Project: Barak Services – AI Recruitment Agent
## Phase 1: Core Architecture, Database & Deterministic State Machine

### Context & Role
You are an expert Full-Stack AI Engineer. We are building a structured AI Recruitment Agent that replaces 70% of a human recruitment coordinator's operational workload.
**Crucial Rule:** This system must operate as a STRICT STATE MACHINE, not a free chatbot. Every transition must be controlled and deterministic.

### Current Tech Stack
* Framework: Next.js (App Router)
* Database: Supabase (PostgreSQL)
* Styling: Tailwind CSS + shadcn/ui
* Language: TypeScript

### Objective for Phase 1
Establish the foundational Database Schema, the strict State Machine logic for leads, and the Status History tracking. Do not build the AI agents yet. We must first build the deterministic rails they will run on.

### Task 1: Database Schema Updates (Supabase SQL)
Analyze the current `leads` table and prepare the SQL commands to achieve the following:
1. **Strict Statuses:** Update the `status` column to ONLY accept: NEW_LEAD, CONTACTED, SCREENING_IN_PROGRESS, FIT_FOR_INTERVIEW, INTERVIEW_BOOKED, ARRIVED, HIRED, STARTED, NO_SHOW, REJECTED, LOST_CONTACT.
2. **Deduplication Baseline:** Ensure the `phone` column is UNIQUE.
3. **Status History Table:** Create a new table `lead_status_history` to log EVERY status change (`id`, `lead_id`, `previous_status`, `new_status`, `changed_by`, `notes`, `created_at`).
*Action needed:* Show me the SQL and ask for my permission before running it.

### Task 2: State Machine Logic (TypeScript)
Create a centralized state machine utility (`lib/stateMachine.ts` or similar).
1. Define the Types/Enums for the new statuses.
2. Define Transition Rules (Guardrails): e.g., CANNOT move to FIT_FOR_INTERVIEW without a `screening_score`. CANNOT move to HIRED without a human approval flag.
3. Create the Server Action `changeLeadStatus(leadId, newStatus, userId, notes)` that validates rules, updates the `leads` table, and inserts into `lead_status_history`. Throw errors if illegal.

### Task 3: UI Adaptation
1. Update the Kanban Board and Leads Table to use the new strict statuses.
2. Ensure drag-and-drop utilizes the new `changeLeadStatus` function. If a user makes an illegal move (e.g., NEW_LEAD directly to HIRED), block the UI and show a toast error based on the State Machine rules.
