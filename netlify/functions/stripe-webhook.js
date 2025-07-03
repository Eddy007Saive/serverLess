const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const {supabase} = require('./supabaseClient');



exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Method Not Allowed' })
    };
  }

  try {
    const sig = event.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    // Vérification du webhook Stripe
    const stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      webhookSecret
    );

    console.log('Événement reçu:', stripeEvent.type);

    // Traitement des événements
    switch (stripeEvent.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(stripeEvent.data.object);
        break;
      
      case 'customer.subscription.created':
        await handleSubscriptionCreated(stripeEvent.data.object);
        break;
      
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(stripeEvent.data.object);
        break;
      
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(stripeEvent.data.object);
        break;
      
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(stripeEvent.data.object);
        break;
      
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(stripeEvent.data.object);
        break;
      
      default:
        console.log('Événement non géré:', stripeEvent.type);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ received: true })
    };
  } catch (error) {
    console.error('Erreur webhook:', error.message);
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
    
    if (customerEmail) {
      // Mettre à jour le statut de l'utilisateur dans Supabase
      const { data: profileData,error: profileError } = await supabase
        .from('profils')
        .update({ 
          subscription_status: 'active',
        })
        .eq('email', customerEmail)
        .select('id','email');

      if (profileError) {
        console.error('Erreur mise à jour profil Supabase:', profileError);
      } else {
        console.log('Profil utilisateur mis à jour avec succès');
      }

      const userId = profileData && profileData.length > 0 ? profileData[0].id : null;
      if (!userId) {
      // Insérer les détails de l'abonnement
      const { error: subscriptionError } = await supabase
        .from('abonnements')
        .insert({
          stripe_customer_id: fullSession.customer.id,
          status: 'active',
          stripe_subscription_id: fullSession.subscription?.id,
          start_date: new Date(fullSession.subscription?.start_date * 1000),
          end_date: new Date(fullSession.subscription?.current_period_end * 1000),
          user_id: userId
        });

      if (subscriptionError) {
        console.error('Erreur insertion abonnement Supabase:', subscriptionError);
      } else {
        console.log('Abonnement inséré avec succès');
      }
    }}
  } catch (error) {
    console.error('Erreur handleCheckoutSessionCompleted:', error);
  }
}

async function handleSubscriptionCreated(subscription) {
  try {
    console.log('Abonnement créé:', subscription.id);
    
    const customer = await stripe.customers.retrieve(subscription.customer);
    
    if (customer.email) {
       const { data: profileData,error: profileError } = await supabase
        .from('profils')
        .update({ 
          subscription_status: 'active',
        })
        .eq('email', customerEmail)
        .select('id','email');

      if (profileError) {
        console.error('Erreur mise à jour profil Supabase:', profileError);
      } else {
        console.log('Profil utilisateur mis à jour avec succès');
      }

       const userId = profileData && profileData.length > 0 ? profileData[0].id : null;
      if (!userId) {
      // Insérer les détails de l'abonnement
      const { error: subscriptionError } = await supabase
        .from('abonnements')
        .insert({
          stripe_customer_id: fullSession.customer.id,
          status: 'active',
          stripe_subscription_id: fullSession.subscription?.id,
          start_date: new Date(fullSession.subscription?.start_date * 1000),
          end_date: new Date(fullSession.subscription?.current_period_end * 1000),
          user_id: userId
        });

      if (subscriptionError) {
        console.error('Erreur insertion abonnement Supabase:', subscriptionError);
      } else {
        console.log('Abonnement inséré avec succès');
      }}
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
        .from('users')
        .update({
          subscription_status: subscription.status,
          subscription_current_period_end: new Date(subscription.current_period_end * 1000)
        })
        .eq('email', customer.email);
      
      if (error) {
        console.error('Erreur mise à jour abonnement:', error);
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
        .from('users')
        .update({
          subscription_status: 'cancelled',
          subscription_id: null,
          subscription_current_period_end: null
        })
        .eq('email', customer.email);
      
      if (error) {
        console.error('Erreur suppression abonnement:', error);
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