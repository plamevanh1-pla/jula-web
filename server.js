require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const ws = require('ws'); 

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_ANON_KEY,
    {
        auth: { persistSession: false },
        realtime: { transport: ws }
    }
);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 🌍 Routes d'affichage des formulaires et écrans
app.get('/', (req, res) => { res.render('index'); });
app.get('/register-seller', (req, res) => { res.render('register-seller'); });
app.get('/register-driver', (req, res) => { res.render('register-driver'); });
app.get('/register-station', (req, res) => { res.render('register-station'); });
app.get('/login', (req, res) => { res.render('login'); }); // 🟢 Écran de connexion connecté !

// 💾 1. Traitement des INSCRIPTIONS (Vendeurs, Livreurs, Points Relais)
app.post('/submit-partner', async (req, res) => {
    const { email, password, full_name, phone, country, business_type, shop_name, vehicle_plate } = req.body;
    try {
        const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
        if (authError) throw authError;

        if (authData.user) {
            const { error: profileError } = await supabase.from('profiles').insert([
                {
                    id: authData.user.id,
                    email: email,
                    role: business_type,
                    country: country,
                    full_name: full_name,
                    phone: phone,
                    shop_name: shop_name || null,
                    vehicle_plate: vehicle_plate || null,
                    is_verified: true
                }
            ]);
            if (profileError) throw profileError;
            
            let roleTexte = "relais";
            if (business_type === 'boutique') roleTexte = "boutique";
            if (business_type === 'livreur') roleTexte = "livreur";

            res.render('success', { name: full_name, role: roleTexte });
        }
    } catch (err) { res.send(`❌ Erreur d'inscription : ${err.message}`); }
});

// 🔐 2. Traitement de la CONNEXION des vendeurs
app.post('/login-partner', async (req, res) => {
    const { email, password } = req.body;
    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        if (data.user) {
            // Vérification que c'est bien un profil boutique/vendeur
            const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();
            
            if (profile && profile.role === 'boutique') {
                // Redirection directe vers son tableau de bord avec ses accès 🟢
                res.render('dashboard', { email: data.user.email, userId: data.user.id });
            } else {
                res.send("❌ Accès refusé : Cet espace est réservé uniquement aux comptes vendeurs.");
            }
        }
    } catch (err) { res.send(`❌ Erreur d'authentification : ${err.message}`); }
});

// 🚀 3. Traitement des PUBLICATIONS de nouveaux produits
app.post('/publish-product', async (req, res) => {
    const { title, description, price, image_url, category, vendedor_id } = req.body;
    try {
        // Envoi direct de l'article dans la table des produits de Supabase 🟢
        const { error } = await supabase.from('products').insert([
            {
                title,
                description,
                price: parseFloat(price),
                image_url,
                category,
                vendedor_id, // L'identifiant unique du grossiste Jula
                created_at: new Date()
            }
        ]);

        if (error) throw error;

        res.send("🎉 Succès ! Votre produit est maintenant publié en direct et visible sur l'application mobile Jula de vos clients !");
    } catch (err) { res.send(`❌ Erreur lors de la publication : ${err.message}`); }
});

app.listen(PORT, () => { console.log(`🚀 Serveur Jula actif sur le port ${PORT}`); });

