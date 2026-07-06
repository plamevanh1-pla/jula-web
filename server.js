require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const ws = require('ws'); 
const multer = require('multer'); // 📸 Appel du décodeur d'images Multer

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration du coffre-fort d'images en mémoire tampon temporaire
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

// 🌍 Routes d'affichage des écrans
app.get('/', (req, res) => { res.render('index'); });
app.get('/register-seller', (req, res) => { res.render('register-seller'); });
app.get('/register-driver', (req, res) => { res.render('register-driver'); });
app.get('/register-station', (req, res) => { res.render('register-station'); });
app.get('/login', (req, res) => { res.render('login'); });

// 💾 Traitement des INSCRIPTIONS
 // 💾 Traitement des INSCRIPTIONS avec Redirection Automatique vers le Tableau de Bord !
app.post('/submit-partner', async (req, res) => {
    const { email, password, full_name, phone, country, business_type, shop_name, vehicle_plate } = req.body;
    try {
        // 1. Création du compte de sécurité Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
        if (authError) throw authError;

        if (authData.user) {
            // 2. Création du profil professionnel dans la base de données
            const { error: profileError } = await supabase.from('profiles').insert([
                {
                    id: authData.user.id,
                    email: email,
                    role: business_type, // 'boutique', 'livreur' ou 'relais'
                    country: country,
                    full_name: full_name,
                    phone: phone,
                    shop_name: shop_name || null,
                    vehicle_plate: vehicle_plate || null,
                    is_verified: true
                }
            ]);
            if (profileError) throw profileError;
            
            // 3. 🚀 REDIRECTION AUTOMATIQUE EN DIRECT SELON LE MÉTIER !
            if (business_type === 'boutique') {
                // Si c'est un vendeur, on l'envoie direct sur son outil de publication avec sa photo ! 🟢
                return res.render('dashboard', { email: email, userId: authData.user.id });
            } 
            else if (business_type === 'livreur') {
                // Si c'est un livreur, on l'enverra sur son futur tableau de bord coursier 🟢
                return res.send(`🎉 Bienvenue ${full_name} ! Votre compte coursier livreur est créé avec succès. Connectez-vous sur l'application mobile Jula avec vos identifiants pour recevoir vos courses !`);
            } 
            else {
                // Si c'est un point relais, on l'enverra sur son espace de dépôt 🟢
                return res.send(`🎉 Bienvenue ${full_name} ! Votre Point Relais Jula a été enregistré avec succès. Notre équipe logistique va valider votre emplacement physique sous 24h.`);
            }
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
            const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();
            
            if (profile && profile.role === 'boutique') {
                res.render('dashboard', { email: data.user.email, userId: data.user.id });
            } else {
                res.send("❌ Accès refusé : Cet espace est réservé uniquement aux comptes vendeurs.");
            }
        }
    } catch (err) { res.send(`❌ Erreur d'authentification : ${err.message}`); }
});

// 🚀 3. Traitement des PUBLICATIONS avec Envoi de la Photo Directe
// 🟢 upload.single('product_photo') intercepte l'image du smartphone
app.post('/publish-product', upload.single('product_photo'), async (req, res) => {
    const { title, description, price, category, vendedor_id } = req.body;
    try {
        if (!req.file) throw new Error("Veuillez sélectionner ou prendre une photo.");

        // Génération d'un nom de fichier unique pour éviter les doublons
        const fileExt = req.file.originalname.split('.').pop();
        const fileName = `${Date.now()}-${Math.floor(Math.random() * 1000)}.${fileExt}`;

        // 📸 Envoi physique du fichier binaire vers ton Bucket Supabase Storage
        const { data: storageData, error: storageError } = await supabase.storage
            .from('product-images')
            .upload(fileName, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: false
            });

        if (storageError) throw storageError;

        // Récupération de l'adresse URL publique officielle de la photo stockée
        const { data: publicUrlData } = supabase.storage
            .from('product-images')
            .getPublicUrl(fileName);

        const photoUrlFinale = publicUrlData.publicUrl;

        // 💾 Injection de l'article avec la VRAIE URL de sa photo dans la table products
        const { error: insertError } = await supabase.from('products').insert([
            {
                title,
                description,
                price: parseFloat(price),
                image_url: photoUrlFinale, // L'adresse de la photo prise par le vendeur
                category,
                vendedor_id,
                created_at: new Date()
            }
        ]);

        if (insertError) throw insertError;

        res.send("🎉 Succès ! Votre produit et votre photo ont été publiés en direct ! L'article est visible sur le Tecno de vos clients !");
    } catch (err) { res.send(`❌ Erreur lors de la publication : ${err.message}`); }
});

app.listen(PORT, () => { console.log(`🚀 Serveur Jula actif sur le port ${PORT}`); });



