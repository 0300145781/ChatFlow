fetch("http://localhost:3000/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: "Hello AI", history: [] })
}).then(r => r.json()).then(console.log).catch(console.error);
