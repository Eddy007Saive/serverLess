// Créez un fichier test-webhook.js dans netlify/functions/
exports.handler = async (event, context) => {
  console.log('Test webhook appelé:', {
    method: event.httpMethod,
    headers: Object.keys(event.headers),
    body: event.body ? 'Body présent' : 'Pas de body',
    path: event.path
  });

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 
      message: 'Test webhook fonctionne',
      timestamp: new Date().toISOString()
    })
  };
};