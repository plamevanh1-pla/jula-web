require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const ws = require('ws'); 
const multer = require('multer');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// 🟢 Activation de CORS au bon endroit (APRES la création de app !)
app.use(cors());

const upload = multer({ storage: multer.memoryStorage() });

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

// 🌍 Routes d'affichage des formulaires
app.get('/', (req, res) => { res.render('index'); });
app.get('/register-seller', (req, res) => { res.render('register-seller'); });
app.get('/register-driver', (req, res) => { res.render('register-driver'); });
app.get('/register-station', (req, res) => { res.render('register-station'); });
app.get('/login', (req, res) => { res.render('login'); });

// 💾 1. Traitement des INSCRIPTIONS avec Redirection Graphique Immédiate
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
            
            if (business_type === 'boutique') {
                return res.render('dashboard', { email: email, userId: authData.user.id });
            } 
            else if (business_type === 'livreur') {
                return res.render('dashboard-driver', { email: email, userId: authData.user.id });
            } 
            else if (business_type === 'relais') {
                return res.render('dashboard-station', { email: email, userId: authData.user.id });
            } 
            else {
                return res.send("❌ Rôle inconnu.");
            }
        }
    } catch (err) { res.send(`❌ Erreur d'inscription : ${err.message}`); }
});

// 🔐 2. Traitement de la CONNEXION universelle des Partenaires (Aiguillage intelligent)
app.post('/login-partner', async (req, res) => {
    const { email, password } = req.body;
    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        if (data.user) {
            const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();
            
            if (!profile) {
                return res.send("❌ Erreur : Aucun profil associé à ce compte.");
            }

            if (profile.role === 'boutique') {
                return res.render('dashboard', { email: data.user.email, userId: data.user.id });
            } 
            else if (profile.role === 'livreur') {
                return res.render('dashboard-driver', { email: data.user.email, userId: data.user.id });
            } 
            else if (profile.role === 'relais') {
                return res.render('dashboard-station', { email: data.user.email, userId: data.user.id });
            } 
            else {
                return res.send("❌ Accès refusé : Les comptes clients doivent utiliser l'application mobile.");
            }
        }
    } catch (err) { res.send(`❌ Erreur d'authentification : ${err.message}`); }
});

// 🚀 3. Traitement des PUBLICATIONS avec Envoi de la Photo Directe
app.post('/publish-product', upload.single('product_photo'), async (req, res) => {
    const { title, description, price, category, vendedor_id } = req.body;
    try {
        if (!req.file) throw new Error("Veuillez sélectionner ou prendre une photo.");

        const fileExt = req.file.originalname.split('.').pop();
        const fileName = `${Date.now()}-${Math.floor(Math.random() * 1000)}.${fileExt}`;

        const { data: storageData, error: storageError } = await supabase.storage
            .from('product-images')
            .upload(fileName, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: false
            });

        if (storageError) throw storageError;

        const { data: publicUrlData } = supabase.storage
            .from('product-images')
            .getPublicUrl(fileName);

        const photoUrlFinale = publicUrlData.publicUrl;

        const { error: insertError } = await supabase.from('products').insert([
            {
                title,
                description,
                price: parseFloat(price),
                image_url: photoUrlFinale,
                category,
                vendedor_id,
                created_at: new Date()
            }
        ]);

        if (insertError) throw insertError;

        res.send("🎉 Succès ! Votre produit et votre photo ont été publiés en direct ! L'article est visible sur le Tecno de vos clients !");
    } catch (err) { res.send(`❌ Erreur lors de la publication : ${err.message}`); }
});

// 💳 4. TUNNEL DE PAIEMENT REEL PAYDUNYA MOBILE MONEY
app.post('/create-payment', async (req, res) => {
    const { product_title, price } = req.body;
    try {
        const response = await fetch('https://paydunya.com', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'PAYDUNYA-MASTER-KEY': process.env.PAYDUNYA_MASTER_KEY,
                'PAYDUNYA-PRIVATE-KEY': process.env.PAYDUNYA_PRIVATE_KEY,
                'PAYDUNYA-TOKEN': process.env.PAYDUNYA_TOKEN
            },
            body: JSON.stringify({
                invoice: {
                    total_amount: parseFloat(price),
                    description: `Achat de : ${product_title} sur Jula`
                },
                store: { name: "Jula E-Commerce" },
                actions: {
                    cancel_url: "https://jula-web.onrender.com",
                    return_url: "https://jula-web.onrender.com"
                }
            })
        });

        const data = await response.json();
        if (data.response_code === "00") {
            res.json({ payment_url: data.response_text });
        } else {
            res.status(400).json({ error: "Échec de l'initialisation du paiement PayDunya." });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => { console.log(`🚀 Serveur Jula actif sur le port ${PORT}`); });
