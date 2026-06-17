import { NextResponse } from 'next/server';

// Simple in-memory rate limiter (5 requests per minute per IP)
const rateLimitMap = new Map<string, { count: number, timestamp: number }>();

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const now = Date.now();
    
    if (ip !== "unknown") {
      const record = rateLimitMap.get(ip);
      if (record && now - record.timestamp < 60000) {
        if (record.count >= 5) {
          return NextResponse.json({ error: 'Rate limit exceeded. Try again in a minute.' }, { status: 429 });
        }
        record.count += 1;
      } else {
        rateLimitMap.set(ip, { count: 1, timestamp: now });
      }
    }

    const { message, history } = await req.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GROQ_API_KEY is missing' }, { status: 500 });
    }

    // Format history for Groq
    const messages = [
      {
        role: "system",
        content: "You are Groq AI, a highly capable, concise, and friendly AI assistant integrated into a real-time chat application. Help the users with their questions."
      },
      ...(history || []),
      {
        role: "user",
        content: message
      }
    ];

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant", // Updated model version
        messages: messages,
        temperature: 0.7,
        max_tokens: 1024,
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Groq API error:", errorText);
      return NextResponse.json({ error: "Failed to fetch from Groq API" }, { status: response.status });
    }

    const data = await response.json();
    const aiText = data.choices[0]?.message?.content || "I couldn't generate a response.";

    return NextResponse.json({ reply: aiText });
  } catch (error: any) {
    console.error("AI Route Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
