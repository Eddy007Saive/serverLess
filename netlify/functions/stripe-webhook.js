const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const {supabase} = require('./supabaseClient');

exports.handler = async (event, context) => {
  console.log('=== WEBHOOK DEBUG ===');
  console.log('Method:', event.httpMethod);
  console.log('Headers:', event.headers);
  console.log('Body type:', typeof event.body);
  console.log('Is base64:', event.isBase64Encoded);
  
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Method Not Allowed' })
    };
  }

  try {
    const sig = event.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    console.log('Signature présente:', !!sig);
    console.log('Webhook secret présent:', !!webhookSecret);
    
    if (!sig) {
      console.log('❌ Pas de signature Stripe');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No Stripe signature' })
      };
    }
    
    if (!webhookSecret) {
      console.log('❌ Webhook secret manquant');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Webhook secret not configured' })
      };
    }
    
    // SOLUTION PRINCIPALE : Gérer le corps selon le contexte
    let body;
    
    // En développement local avec Netlify Dev
    if (process.env.NODE_ENV !== 'production' && typeof event.body === 'string') {
      // Netlify Dev peut parser le JSON, on essaie de le récupérer
      try {
        // Si c'est déjà un string JSON, on l'utilise directement
        body = event.body;
        console.log('Utilisation du body string directement');
      } catch (e) {
        console.log('Erreur parsing body:', e.message);
        body = event.body;
      }
    } else if (event.isBase64Encoded) {
      // En production, si c'est encodé en base64
      body = Buffer.from(event.body, 'base64').toString('utf8');
      console.log('Décodage base64 effectué');
    } else {
      // Utilisation directe
      body = event.body;
      console.log('Utilisation directe du body');
    }
    
    console.log('Body final length:', body?.length);
    
    // ALTERNATIVE : Désactiver la vérification en développement
    let stripeEvent;
    
    if (process.env.NODE_ENV === 'development' || process.env.NETLIFY_DEV === 'true') {
      console.log('🔧 Mode développement - Parsing direct du JSON');
      try {
        const parsedBody = JSON.parse(body);
        stripeEvent = parsedBody;
        console.log('✅ JSON parsé avec succès:', stripeEvent.type);
      } catch (e) {
        console.log('❌ Erreur parsing JSON:', e.message);
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Invalid JSON' })
        };
      }
    } else {
      // En production, vérification normale
      console.log('🔒 Mode production - Vérification signature');
      stripeEvent = stripe.webhooks.constructEvent(
        body,
        sig,
        webhookSecret
      );
    }

    console.log('✅ Événement traité:', stripeEvent.type);
    console.log('Event ID:', stripeEvent.id);

    // Traitement des événements
    switch (stripeEvent.type) {
      case 'checkout.session.completed':
        console.log('Traitement checkout.session.completed');
        await handleCheckoutSessionCompleted(stripeEvent.data.object);
        break;
      
      case 'customer.subscription.created':
        console.log('Traitement customer.subscription.created');
        await handleSubscriptionCreated(stripeEvent.data.object);
        break;
      
      case 'customer.subscription.updated':
        console.log('Traitement customer.subscription.updated');
        await handleSubscriptionUpdated(stripeEvent.data.object);
        break;
      
      case 'customer.subscription.deleted':
        console.log('Traitement customer.subscription.deleted');
        await handleSubscriptionDeleted(stripeEvent.data.object);
        break;
      
      case 'invoice.payment_succeeded':
        console.log('Traitement invoice.payment_succeeded');
        await handleInvoicePaymentSucceeded(stripeEvent.data.object);
        break;
      
      case 'invoice.payment_failed':
        console.log('Traitement invoice.payment_failed');
        await handleInvoicePaymentFailed(stripeEvent.data.object);
        break;
      
      default:
        console.log('Événement non géré:', stripeEvent.type);
    }

    console.log('✅ Webhook traité avec succès');
    return {
      statusCode: 200,
      body: JSON.stringify({ received: true })
    };
  } catch (error) {
    console.error('❌ Erreur webhook:', error.message);
    console.error('Stack:', error.stack);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: error.message })
    };
  }
};

async function handleCheckoutSessionCompleted(session) {
  try {
    console.log('Session checkout terminée:', session.id);
    
    // Récupérer les détails de la session
    const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ['subscription', 'customer']
    });
    
    const customerEmail = fullSession.customer_details?.email || fullSession.customer?.email;
    console.log('Customer email:', customerEmail);
    
    if (customerEmail) {
      // Mettre à jour le statut de l'utilisateur dans Supabase
      const { data: profileData, error: profileError } = await supabase
        .from('profils')
        .update({ 
          subscription_status: 'active',
        })
        .eq('email', customerEmail)
        .select('id', 'email');

      if (profileError) {
        console.error('Erreur mise à jour profil Supabase:', profileError);
        return;
      } else {
        console.log('Profil utilisateur mis à jour avec succès');
      }

      const userId = profileData && profileData.length > 0 ? profileData[0].id : null;
      console.log('User ID:', userId);
      
      if (userId && fullSession.subscription) {
        const { error: subscriptionError } = await supabase
          .from('abonnements')
          .insert({
            stripe_customer_id: fullSession.customer.id,
            status: 'active',
            stripe_subscription_id: fullSession.subscription.id,
            start_date: new Date(fullSession.subscription.start_date * 1000),
            end_date: new Date(fullSession.subscription.current_period_end * 1000),
            user_id: userId
          });

        if (subscriptionError) {
          console.error('Erreur insertion abonnement Supabase:', subscriptionError);
        } else {
          console.log('Abonnement inséré avec succès');
        }
      }
    }
  } catch (error) {
    console.error('Erreur handleCheckoutSessionCompleted:', error);
  }
}

async function handleSubscriptionCreated(subscription) {
  try {
    console.log('Abonnement créé:', subscription.id);
    
    const customer = await stripe.customers.retrieve(subscription.customer);
    
    if (customer.email) {
      const { data: profileData, error: profileError } = await supabase
        .from('profils')
        .update({ 
          subscription_status: 'active',
        })
        .eq('email', customer.email)
        .select('id', 'email');

      if (profileError) {
        console.error('Erreur mise à jour profil Supabase:', profileError);
        return;
      } else {
        console.log('Profil utilisateur mis à jour avec succès');
      }

      const userId = profileData && profileData.length > 0 ? profileData[0].id : null;
      
      if (userId) {
        const { error: subscriptionError } = await supabase
          .from('abonnements')
          .insert({
            stripe_customer_id: customer.id,
            status: 'active',
            stripe_subscription_id: subscription.id,
            start_date: new Date(subscription.start_date * 1000),
            end_date: new Date(subscription.current_period_end * 1000),
            user_id: userId
          });

        if (subscriptionError) {
          console.error('Erreur insertion abonnement Supabase:', subscriptionError);
        } else {
          console.log('Abonnement inséré avec succès');
        }
      }
    }
  } catch (error) {
    console.error('Erreur handleSubscriptionCreated:', error);
  }
}

async function handleSubscriptionUpdated(subscription) {
  try {
    console.log('Abonnement mis à jour:', subscription.id);
    
    const customer = await stripe.customers.retrieve(subscription.customer);
    
    if (customer.email) {
      const { error } = await supabase
        .from('profils')
        .update({
          subscription_status: subscription.status,
        })
        .eq('email', customer.email);
      
      if (error) {
        console.error('Erreur mise à jour abonnement:', error);
      } else {
        console.log('Abonnement mis à jour avec succès');
      }
    }
  } catch (error) {
    console.error('Erreur handleSubscriptionUpdated:', error);
  }
}

async function handleSubscriptionDeleted(subscription) {
  try {
    console.log('Abonnement supprimé:', subscription.id);
    
    const customer = await stripe.customers.retrieve(subscription.customer);
    
    if (customer.email) {
      const { error } = await supabase
        .from('profils')
        .update({
          subscription_status: 'cancelled',
        })
        .eq('email', customer.email);
      
      if (error) {
        console.error('Erreur suppression abonnement:', error);
      } else {
        console.log('Abonnement supprimé avec succès');
      }
    }
  } catch (error) {
    console.error('Erreur handleSubscriptionDeleted:', error);
  }
}

async function handleInvoicePaymentSucceeded(invoice) {
  try {
    console.log('Paiement facture réussi:', invoice.id);
    // Logique pour paiement réussi
  } catch (error) {
    console.error('Erreur handleInvoicePaymentSucceeded:', error);
  }
}

async function handleInvoicePaymentFailed(invoice) {
  try {
    console.log('Paiement facture échoué:', invoice.id);
    // Logique pour paiement échoué
  } catch (error) {
    console.error('Erreur handleInvoicePaymentFailed:', error);
  }
}