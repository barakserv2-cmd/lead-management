# Project: Barak Services – AI Recruitment Agent
## Phase 2: Chat Infrastructure & AI Evaluation Service

### Context & Objective
With the deterministic State Machine in place from Phase 1, we now need to build the infrastructure for the AI to communicate with the leads. We will set up the chat history database and the core AI evaluation logic.

### Task 1: Database Schema for Messages (Supabase SQL)
We need a place to store the conversation history. Create a new table `messages`:
1. Columns: `id` (UUID), `lead_id` (Foreign Key to leads), `role` (enum: 'user', 'assistant', 'system'), `content` (text), `created_at` (timestamp).
2. Enable RLS (Row Level Security) if needed.
*Action needed:* Show me the SQL and ask for my permission before running it.

### Task 2: AI Evaluation Utility (TypeScript)
Create a new utility `lib/aiService.ts` to handle the LLM logic (assuming OpenAI/Anthropic SDK will be used later, mock the exact API call for now but build the structure).
1. Define a strict System Prompt: "You are an AI Recruiter for Barak Services. Evaluate the candidate based on their answers. Return a structured JSON with 'action' (CONTINUE, ADVANCE_TO_FIT, or REJECT), 'reply' (your text message to the user), and 'screening_score'."
2. Create a function `processIncomingMessage(leadId, messageText)` that:
   - Fetches the lead's status and chat history from the DB.
   - Saves the new user message to the `messages` table.
   - Passes the history to the AI.
   - Saves the AI's reply to the `messages` table.
   - **Crucial:** If the AI's action is ADVANCE_TO_FIT or REJECT, the function MUST use the `changeLeadStatus` Server Action from Phase 1 to legally transition the lead.

### Task 3: UI Updates (Chat Interface)
Create a new component `ChatHistory.tsx` to be displayed inside the Lead Details page (`/leads/[id]`).
1. It should fetch and display all messages for the specific lead in a familiar chat bubble format (WhatsApp style).
2. Add a simple text input to simulate sending a message to the bot for testing purposes.
