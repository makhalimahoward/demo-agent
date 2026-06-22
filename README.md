AI Inventory Demo

A minimal demo showing why **AI Agents + MCP** are the future of AI.

**[Live Demo](https://demo-agent.pages.dev)** • Built by [Howard Makhalima](https://howardmakhalima.pages.dev)


What this is

It is a demo AI agent that manages a live product inventory through natural language. You talk to the agent, and he executes real actions like adding products, checking stock, processing orders, all reflected instantly in the sidebar.


## How it works

```
User types a message
    → Howie (Groq LLaMA 3.3) reasons about the request
    → If an action is needed, it outputs: ACTION:{...}
    → Frontend parses the action and executes the real function
    → Inventory updates live
    → Response displayed in chat
```

The agent can never hallucinate product data, it always calls the actual function, which reads from the real in-memory store.


## Tech Stack

Frontend - Pure HTML, CSS, JavaScript (no frameworks)
AI Model - LLaMA 3.3 70B via Groq API 
Backend - Googlesheets


Built by [Howard Makhalima](https://github.com/makhalimahoward) · Zimbabwe 🇿🇼
