// netlify/functions/create-checkout-session.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const {supabase} = require('./supabaseClient');

exports.handler = async (event, context) => {
  // En-têtes CORS pour toutes les réponses
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json'
  };

  // Gérer les requêtes preflight CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'CORS preflight successful' })
    };
  }

  // Vérifier la méthode HTTP
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ message: 'Method Not Allowed' })
    };
  }

  try {
    // Vérifier si le body existe
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Corps de requête manquant' })
      };
    }

    const { userEmail } = JSON.parse(event.body);




    if (!userEmail) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Email utilisateur requis' })
      };
    }

    // Créer la session Stripe Checkout
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Abonnement Premium',
              description: 'Accès complet à tous les services'
            },
            unit_amount: 1490,
            recurring: {
              interval: 'month'
            }
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      customer_email: userEmail,
      success_url: `${event.headers.origin }/fiches`,
      cancel_url: `${event.headers.origin}/cancel`,
      metadata: {
        userEmail: userEmail
      }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ id: session.id })
    };

  } catch (error) {
    console.error('Erreur création session checkout:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Erreur serveur lors de la création de la session',
        details: error.message 
      })
    };
  }
};