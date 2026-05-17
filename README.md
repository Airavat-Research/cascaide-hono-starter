[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)


![App Demo](assets/demo.gif)


This is a Cascaide starter project bootstrapped with `npx create-cascaide-app@latest`. 

- Vite + React frontend
- Hono backend

> Built with [Cascaide](https://www.cascaide-ts.com/docs/introduction) · cascaide-ts 

## Overview

This template demonstrates how to build full stack agents with cascaide-ts by modelling your application/agents as a directed graph. It covers example uses of all primitives.

- How to create UIs as nodes in an agent graph
- How to control and observe graph execution/agent execution using hooks
- How to write agents as nodes (streaming/non streaming) with parallel tool calling
- How to spawn sub agents or recursively invoke the same agent using `controller`
- Different ways of implementing HITL 
- How to write cascaide graphs and configurations and set up the application

## Setup

```bash
npx create-cascaide-app@latest
# select: 
Cascaide Engine -> Standard
Template -> React + Hono

```

Then:

```bash
cd your-project
cp .env.example .env
npm install
npm run dev
```

## Usage

- **ReAct Agent** — A simple search agent that uses tavily to search the web
- **Hotel Booking Agent** — A supervisor system with 3 agents(`hotelSupervisorAgent`, `availabilityAgent`, `bookingAgent`) and two HITL steps (Inline hotel selection and overlay OTP UI node). `bookingAgent` takes human approval without returning to supervisor.
- **Recursive ReAct Agent** — A search agent that can break down a complex query into subtasks and delegate to fresh instances of itself in parallel. Each child agent can further create their own children. Each agent instance at each depth are tracked on the UI via a tracker UI node(mini chat window) that streams real time.

## Config

| Variable | Description | Required |
|---|---|---|
| `GEMINI_API_KEY` | Your LLM provider key | ✓ |
| `TAVILY_API_KEY` | Tavily API key for the search tool | ✓ |
| `DATABASE_URL` | Postgres connection string, NOT REQUIRED FOR DEVELOPMENT | ✓ / — |


Get gemini api key [here](https://ai.google.dev/gemini-api/docs/api-key)
Get tavily api key [here](https://docs.tavily.com/documentation/quickstart)

## Modifying Agents

You can modify the agents at `@backend/src/bubbles/<name>Agent.ts`
All agent walkthroughs are available at [Tutorials](https://www.cascaide-ts.com/docs/Tutorial/ReAct)