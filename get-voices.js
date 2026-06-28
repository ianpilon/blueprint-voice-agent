const fetch = require('node-fetch');

async function getVoices() {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    console.error('❌ Error: ELEVENLABS_API_KEY environment variable not set');
    console.log('\nUsage:');
    console.log('  export ELEVENLABS_API_KEY=your_api_key_here');
    console.log('  node get-voices.js');
    console.log('\nOr:');
    console.log('  ELEVENLABS_API_KEY=your_api_key_here node get-voices.js');
    process.exit(1);
  }

  const response = await fetch('https://api.elevenlabs.io/v1/voices', {
    method: 'GET',
    headers: {
      'xi-api-key': apiKey
    }
  });

  const data = await response.json();

  console.log('\n=== Available ElevenLabs Voices ===\n');
  data.voices.forEach(voice => {
    console.log(`Name: ${voice.name}`);
    console.log(`Voice ID: ${voice.voice_id}`);
    console.log(`Category: ${voice.category || 'N/A'}`);
    console.log('---');
  });
}

getVoices().catch(console.error);
