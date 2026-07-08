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

app.use(cors());

// 📸 CONFIGURATION MULTI-PHOTOS : Autorise jusqu'à 3 images par inscription
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // Limite à 5 Mo par photo smartphone
});

const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_ANON_KEY,
    { auth: { persistSession: false }, realtime: { transport: ws } }
);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 🌍 Routes d'affichage des formulaires graphiques
app.get('/', (req, res) => { res.render('index'); });
app.get('/register-seller', (req, res) => { res.render('register-seller'); });
app.get('/register-driver', (req, res) => { res.render('register-driver'); });
app.get('/register-station', (req, res) => { res.render('register-station'); });
app.get('/login', (req, res) => { res.render('login'); });

// 🛠️ FONCTION INTERNE : Robot d'envoi automatique vers Supabase Storage
async function uploadToSupabase(file, folder) {
    if (!file) return null;
    const fileExt = file.originalname.split('.').pop();
    const fileName = `${folder}/${Date.now()}-${Math.floor(Math.random() * 1000)}.${fileExt}`;
    
    const { data, error } = await supabase.storage
        .from('product-image') // Utilisation de ton bucket existant
        .upload(fileName, file.buffer, { contentType: file.mimetype, upsert: false });
        
    if (error) throw error;
    
    const { data: publicUrlData } = supabase.storage.from('product-image').getPublicUrl(fileName);
    return publicUrlData.publicUrl;
}
// 💾 1. MOTEUR D'INSCRIPTION ULTRA-SÉCURISÉ (MULTI-PHOTOS)
app.post('/submit-partner', upload.fields([
    { name: 'cni_recto', maxCount: 1 },
    { name: 'cni_verso', maxCount: 1 },
    { name: 'photo_boutique', maxCount: 1 },
    { name: 'photo_vehicule', maxCount: 1 }
]), async (req, res) => {
    const { email, password, full_name, phone, country, business_type, shop_name, vehicle_plate } = req.body;
    try {
        // Crée d'abord le compte dans l'authentification Supabase
        const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
        if (authError) throw authError;

        if (authData.user) {
            // Extraction sécurisée des fichiers photo envoyés depuis le formulaire
            const cniRectoFile = req.files['cni_recto'] ? req.files['cni_recto'][0] : null;
            const cniVersoFile = req.files['cni_verso'] ? req.files['cni_verso'][0] : null;
            const shopFile = req.files['photo_boutique'] ? req.files['photo_boutique'][0] : null;
            const vehicleFile = req.files['photo_vehicule'] ? req.files['photo_vehicule'][0] : null;

            // Propulsion des fichiers vers ton Bucket Supabase Storage
            const urlCniRecto = await uploadToSupabase(cniRectoFile, 'cni');
            const urlCniVerso = await uploadToSupabase(cniVersoFile, 'cni');
            const urlBoutique = await uploadToSupabase(shopFile, 'boutiques');
            const urlVehicule = await uploadToSupabase(vehicleFile, 'vehicules');

            // Insertion complète du profil vérifié avec TOUTES ses pièces justificatives
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
                    is_verified: false, // 🛑 Attente de validation manuelle par Jacky
                    cni_recto_url: urlCniRecto,
                    cni_verso_url: urlCniVerso,
                    photo_boutique_url: urlBoutique,
                    photo_vehicule_url: urlVehicule,
                    created_at: new Date()
                }
            ]);
            if (profileError) throw profileError;
            
            // Aiguillage visuel selon le métier vers l'espace de travail
            if (business_type === 'boutique') return res.render('dashboard', { email, userId: authData.user.id });
            if (business_type === 'livreur') return res.render('dashboard-driver', { email, userId: authData.user.id });
            if (business_type === 'relais') return res.render('dashboard-station', { email, userId: authData.user.id });
            
            return res.send("❌ Rôle inconnu.");
        }
    } catch (err) { res.send(`❌ Erreur d'inscription sécurisée : ${err.message}`); }
});

// 🔐 2. CONNEXION DES PARTENAIRES
app.post('/login-partner', async (req, res) => {
    const { email, password } = req.body;
    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        if (data.user) {
            const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();
            if (!profile) return res.send("❌ Erreur : Aucun profil associé à ce compte.");

            if (profile.role === 'boutique') return res.render('dashboard', { email: data.user.email, userId: data.user.id });
            if (profile.role === 'livreur') return res.render('dashboard-driver', { email: data.user.email, userId: data.user.id });
            if (profile.role === 'relais') return res.render('dashboard-station', { email: data.user.email, userId: data.user.id });
            
            return res.send("❌ Accès refusé : Les clients doivent utiliser l'application mobile.");
        }
    } catch (err) { res.send(`❌ Erreur d'authentification : ${err.message}`); }
});

 // 🚀 PUBLICATION DE PRODUITS DEPUIS LA BOUTIQUE WEB AVEC GESTION DES STOCKS
app.post('/publish-product', upload.single('product_photo'), async (req, res) => {
    const { title, description, price, category, vendedor_id, stock_quantity } = req.body;
    try {
        if (!req.file) throw new Error("Veuillez sélectionner ou prendre une photo.");
        const photoUrlFinale = await uploadToSupabase(req.file, 'products');

        const { error: insertError } = await supabase.from('products').insert([
            {
                title, 
                description, 
                price: parseFloat(price),
                image_url: photoUrlFinale, 
                category, 
                vendedor_id, 
                stock_quantity: parseInt(stock_quantity) || 10, // Récupère le stock ou met 10 par défaut
                created_at: new Date()
            }
        ]);
        if (insertError) throw insertError;

        res.send("🎉 Succès ! Produit publié en direct avec ses stocks !");
    } catch (err) { res.send(`❌ Erreur lors de la publication : ${err.message}`); }
});


// 💳 4. TUNNEL PAYDUNYA MOBILE MONEY
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
                invoice: { total_amount: parseFloat(price), description: `Achat : ${product_title}` },
                store: { name: "Jula E-Commerce" },
                actions: { cancel_url: "https://jula-web.onrender.com", return_url: "https://jula-web.onrender.com" }
            })
        });
        const data = await response.json();
        if (data.response_code === "00") res.json({ payment_url: data.response_text });
        else res.status(400).json({ error: "Échec PayDunya." });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
// 🕵️ ROUTE DE CONTRÔLE SÉCRÈTE DE JACKY - AFFICHAGE DES CNI ET PHOTOS
app.get('/admin-control-jula-secret', async (req, res) => {
    try {
        // Récupère tous les profils enregistrés dans l'ordre du plus récent au plus ancien
        const { data: profiles, error } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Envoie les données à ton interface graphique ejs
        res.render('admin-control', { profiles: profiles || [] });
    } catch (err) {
        res.status(500).send(`❌ Erreur du centre de contrôle : ${err.message}`);
    }
});

// ✅ ACTION DE VALIDATION DEPUIS LE PANNEAU DE CONTRÔLE
app.post('/verify-partner', async (req, res) => {
    const { id } = req.body;
    try {
        // Passe l'état de "is_verified" à TRUE dans ton Supabase
        const { error } = await supabase
            .from('profiles')
            .update({ is_verified: true })
            .eq('id', id);

        if (error) throw error;

        // Recharge la page secrète pour voir le badge vert s'allumer
        res.redirect('/admin-control-jula-secret');
    } catch (err) {
        res.status(500).send(`❌ Erreur lors de la validation du partenaire : ${err.message}`);
    }
});

app.listen(PORT, () => { console.log(`🚀 Serveur Jula actif sur le port ${PORT}`); });
