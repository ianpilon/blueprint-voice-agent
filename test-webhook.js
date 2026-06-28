const fetch = require('node-fetch');

async function test() {
  const response = await fetch('http://localhost:3000/webhook/assistant-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        type: 'assistant-request',
        call: {
          id: 'test-call-verification',
          customer: {
            number: '+15192770970'
          }
        }
      }
    })
  });

  const data = await response.json();
  const systemPrompt = data.assistant.model.messages[0].content;

  console.log('System prompt length:', systemPrompt.length, 'characters');
  console.log('\nFirst 300 chars:');
  console.log(systemPrompt.substring(0, 300));
  console.log('\n...\n');
  console.log('Last 150 chars:');
  console.log(systemPrompt.substring(systemPrompt.length - 150));
}

test().catch(console.error);
